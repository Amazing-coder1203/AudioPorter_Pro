const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

// Store rooms: key = publicIP, value = Map(code -> { pc: ws, phone: ws })
const networkGroups = new Map();

function getPublicIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    let ip = forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress;

    // Normalize IPv6 loopback to IPv4
    if (ip === '::1') ip = '127.0.0.1';

    // For local development: Treat all local/private IPs as a single group 'local'
    // This allows localhost (PC) and 192.168.x.x (Phone) to pair on the same local server
    const isPrivate = ip === '127.0.0.1' ||
        ip.startsWith('192.168.') ||
        ip.startsWith('10.') ||
        ip.startsWith('172.');

    return isPrivate ? 'local-network' : ip;
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

const localIP = getLocalIP();

wss.on('connection', (ws, req) => {
    const publicIp = getPublicIp(req);

    // Immediately send server info to the new connection
    ws.send(JSON.stringify({
        type: 'server_info',
        ip: localIP,
        port: PORT
    }));
    let currentRoom = null;
    let currentRole = null;

    console.log(`Connection attempt from IP: ${publicIp}`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            switch (data.type) {
                case 'join':
                    const roomCode = data.room;
                    const role = data.role; // 'pc' or 'phone'

                    if (!networkGroups.has(publicIp)) {
                        networkGroups.set(publicIp, new Map());
                    }

                    const roomsInNetwork = networkGroups.get(publicIp);

                    // If phone tries to join a non-existent room on this IP
                    if (role === 'phone' && !roomsInNetwork.has(roomCode)) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Room not found on this network' }));
                        return;
                    }

                    if (!roomsInNetwork.has(roomCode)) {
                        roomsInNetwork.set(roomCode, { pc: null, phone: null });
                    }

                    const room = roomsInNetwork.get(roomCode);

                    room[role] = ws;
                    currentRoom = roomCode;
                    currentRole = role;

                    console.log(`${role} joined room ${roomCode} on IP ${publicIp}`);

                    if (room.pc && room.phone) {
                        const readyMsg = JSON.stringify({ type: 'ready' });
                        room.pc.send(readyMsg);
                        room.phone.send(readyMsg);
                    }
                    break;

                case 'signal':
                    if (currentRoom && networkGroups.has(publicIp)) {
                        const roomsInNetwork = networkGroups.get(publicIp);
                        const room = roomsInNetwork.get(currentRoom);
                        if (room) {
                            const targetRole = currentRole === 'pc' ? 'phone' : 'pc';
                            const targetWs = room[targetRole];

                            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                                targetWs.send(JSON.stringify({
                                    type: 'signal',
                                    data: data.data,
                                    from: currentRole
                                }));
                            }
                        }
                    }
                    break;

                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
            }
        } catch (e) {
            console.error("Error parsing message:", e);
        }
    });

    ws.on('close', () => {
        if (currentRoom && networkGroups.has(publicIp)) {
            const roomsInNetwork = networkGroups.get(publicIp);
            const room = roomsInNetwork.get(currentRoom);
            if (room) {
                room[currentRole] = null;
                const otherRole = currentRole === 'pc' ? 'phone' : 'pc';
                const otherWs = room[otherRole];
                if (otherWs && otherWs.readyState === WebSocket.OPEN) {
                    otherWs.send(JSON.stringify({ type: 'partner_disconnected' }));
                }

                if (!room.pc && !room.phone) {
                    roomsInNetwork.delete(currentRoom);
                    if (roomsInNetwork.size === 0) {
                        networkGroups.delete(publicIp);
                    }
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
// Use 0.0.0.0 to allow access from local network (phone)
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Access from phone using your PC's IP address.`);
});
