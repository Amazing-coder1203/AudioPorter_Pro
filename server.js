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

wss.on('connection', (ws, req) => {
    const publicIp = getPublicIp(req);
    const socketId = `node_${nextId++}_${Math.random().toString(36).substr(2, 5)}`;

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

                case 'accept_request':
                    // PC accepted phone's request
                    if (networkGroups.has(publicIp)) {
                        const phoneWs = [...wss.clients].find(c => c.readyState === WebSocket.OPEN && !c.isPC); // Simple find for now
                        // In a real app, we'd map this properly. For now, we pair the requester.
                        // For simplicity, we'll just signal back to the specific requester ID
                        const pcGroup = networkGroups.get(publicIp);
                        // We need the phone's socket. Since we don't store phones in the map yet, 
                        // we'll send a global "start_signal" to the specific target if we had its socket.
                        // Let's optimize: Store everyone in networkGroups but only PCs are discoverable.
                    }
                    break;

                case 'signal':
                    // Relay WebRTC signals between paired nodes
                    // Find the partner and send
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
                    // Silent keep-alive
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
