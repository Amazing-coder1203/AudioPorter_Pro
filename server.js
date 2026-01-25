const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// Store discoverable PCs by Public IP
// Map(publicIP -> Map(socketId -> { ws, identity }))
const networkGroups = new Map();

function getPublicIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    let ip = forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress;
    if (ip === '::1') ip = '127.0.0.1';

    // For local discovery, treat all private IPs as one group
    const isPrivate = ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.');
    return isPrivate ? 'local-network' : ip;
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

const localIP = getLocalIP();
const hostname = os.hostname();
let nextId = 1;

// Keep-alive: Ping itself every 10 minutes to prevent Render hibernation
const APP_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
if (process.env.RENDER_EXTERNAL_URL) {
    setInterval(() => {
        const https = require('https');
        https.get(APP_URL, (res) => {
            console.log(`Self-ping to ${APP_URL}: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error('Self-ping failed:', err.message);
        });
    }, 600000); // 10 minutes
}

wss.on('connection', (ws, req) => {
    const publicIp = getPublicIp(req);
    const socketId = `node_${nextId++}_${Math.random().toString(36).substr(2, 5)}`;
    ws.isAlive = true;

    let currentRole = null;
    let partnerId = null;

    console.log(`New connection: ${socketId} from ${publicIp}`);

    // Immediately send server info to the new connection
    ws.send(JSON.stringify({
        type: 'server_info',
        ip: localIP,
        hostname: hostname,
        port: PORT
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'register_pc':
                    currentRole = 'pc';
                    if (!networkGroups.has(publicIp)) networkGroups.set(publicIp, new Map());

                    networkGroups.get(publicIp).set(socketId, {
                        ws,
                        identity: data.identity || 'Unknown PC'
                    });

                    console.log(`PC Registered: ${socketId} on ${publicIp}`);
                    broadcastDiscovery(publicIp);
                    break;

                case 'request_discovery':
                    currentRole = 'phone';
                    sendDiscoveryUpdate(ws, publicIp);
                    break;

                case 'connect_request':
                    // Phone wants to connect to a specific PC
                    if (networkGroups.has(publicIp)) {
                        const pc = networkGroups.get(publicIp).get(data.targetId);
                        if (pc) {
                            partnerId = data.targetId;
                            pc.ws.send(JSON.stringify({
                                type: 'connection_request',
                                fromId: socketId
                            }));
                        }
                    }
                    break;

                case 'signal':
                    // Relay WebRTC signals between paired nodes
                    const targetWs = [...wss.clients].find(c => c.socketId === data.targetId);
                    if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                        targetWs.send(JSON.stringify({
                            type: 'signal',
                            data: data.data,
                            fromId: socketId
                        }));
                    }
                    break;
                case 'heartbeat':
                    ws.isAlive = true;
                    // Respond to heartbeat to confirm round-trip
                    ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
                    break;
            }
        } catch (e) {
            console.error(e);
        }
    });

    ws.socketId = socketId;

    ws.on('close', () => {
        if (currentRole === 'pc' && networkGroups.has(publicIp)) {
            networkGroups.get(publicIp).delete(socketId);
            broadcastDiscovery(publicIp);
        }
    });

    ws.on('pong', () => {
        ws.isAlive = true;
    });
});

// Passive Ping (Server to Client) to keep proxies open
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

function sendDiscoveryUpdate(ws, publicIp) {
    const pcs = [];
    if (networkGroups.has(publicIp)) {
        networkGroups.get(publicIp).forEach((val, id) => {
            pcs.push({ id, identity: val.identity });
        });
    }
    ws.send(JSON.stringify({ type: 'discovery_update', pcs }));
}

function broadcastDiscovery(publicIp) {
    const pcs = [];
    if (networkGroups.has(publicIp)) {
        networkGroups.get(publicIp).forEach((val, id) => {
            pcs.push({ id, identity: val.identity });
        });
    }
    const msg = JSON.stringify({ type: 'discovery_update', pcs });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Discovery Server running on http://${localIP}:${PORT}`);
});
