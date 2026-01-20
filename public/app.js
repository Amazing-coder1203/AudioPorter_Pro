/**
 * AudioPorter - Discovery Logic
 */

const state = {
    role: null,
    socket: null,
    peerConnection: null,
    stream: null,
    audioElement: null,
    audioCtx: null,
    gainNode: null,
    heartbeatInterval: null,
    myId: null,
    partnerId: null,
    pcName: 'My Computer',
    serverUrl: null,
    savedNetworks: [], // Array of {ip, name} objects
    activeConnections: [] // WebSocket connections to different networks
};

const screens = {
    selection: document.getElementById('selection-screen'),
    pc: document.getElementById('pc-screen'),
    phone: document.getElementById('phone-screen'),
    active: document.getElementById('active-screen'),
};

const pcIdentity = document.getElementById('pc-identity');
const pcListContainer = document.getElementById('pc-list');
const startBtn = document.getElementById('start-stream');
const changeSourceBtn = document.getElementById('change-source');
const audioSourceSelect = document.getElementById('audio-source');
const volumeSlider = document.getElementById('volume-slider');
const volumeContainer = document.querySelector('.volume-container');

const DEFAULT_SERVER = 'audioporter-pro.onrender.com';

function initSocket(customUrl) {
    let socketUrl;
    if (customUrl) {
        socketUrl = customUrl;
    } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        if (window.location.protocol === 'file:') {
            // For APK: You'll still need to scan or enter IP if not using a global server
            // But for this "No Code" version, we use the local network discovery
            // We'll try to find the server via a broadcast-like check or manual input if it fails
            socketUrl = `wss://${DEFAULT_SERVER}`;
        } else {
            socketUrl = `${protocol}//${window.location.host}`;
        }
    }

    state.socket = new WebSocket(socketUrl);

    state.socket.onopen = () => {
        console.log('Connected to signaling server');
        if (state.role === 'pc') {
            state.socket.send(JSON.stringify({
                type: 'register_pc',
                identity: `${state.pcName} (${window.location.hostname})`
            }));
        } else if (state.role === 'phone') {
            state.socket.send(JSON.stringify({ type: 'request_discovery' }));
        }
    };

    state.socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'discovery_update':
                if (state.role === 'phone') updatePCList(data.pcs);
                break;
            case 'server_info':
                if (state.role === 'pc') {
                    state.pcName = data.hostname;
                    pcIdentity.textContent = `${state.pcName} [${data.ip}]`;
                    // Re-register with the real hostname
                    state.socket.send(JSON.stringify({
                        type: 'register_pc',
                        identity: state.pcName
                    }));
                }
                break;
            case 'connection_request':
                handleConnectionRequest(data.fromId);
                break;
            case 'connection_accepted':
                state.partnerId = data.fromId;
                startWebRTC(true); // Phone starts as initiator
                break;
            case 'signal':
                handleSignal(data.data, data.fromId);
                break;
            case 'partner_disconnected':
                handlePartnerLeft();
                break;
        }
    };
}

function updatePCList(pcs) {
    pcListContainer.innerHTML = '';
    if (pcs.length === 0) {
        pcListContainer.innerHTML = '<p class="hint">No PCs found on your network. Make sure AudioPorter is open on your PC.</p>';
        return;
    }

    pcs.forEach(pc => {
        const item = document.createElement('div');
        item.className = 'pc-item';
        item.innerHTML = `
            <div class="pc-icon">💻</div>
            <div class="pc-info">
                <h4>${pc.identity}</h4>
                <p>Ready to stream</p>
            </div>
        `;

        // Single click to connect
        item.onclick = () => requestConnection(pc.id);

        // Long press to show forget option
        let pressTimer;
        item.onmousedown = item.ontouchstart = () => {
            pressTimer = setTimeout(() => {
                if (confirm(`Forget this network?`)) {
                    forgetCurrentNetwork();
                }
            }, 800);
        };
        item.onmouseup = item.ontouchend = () => clearTimeout(pressTimer);

        pcListContainer.appendChild(item);
    });
}

function requestConnection(pcId) {
    state.partnerId = pcId;
    state.socket.send(JSON.stringify({
        type: 'connect_request',
        targetId: pcId
    }));
    updateStatus('Requesting connection...', 'waiting');
}

function handleConnectionRequest(fromId) {
    if (confirm("A phone wants to connect to your audio. Accept?")) {
        state.partnerId = fromId;
        state.socket.send(JSON.stringify({
            type: 'connection_accepted',
            targetId: fromId
        }));
        updateStatus('Phone Linked', 'connected');

        // Initialize WebRTC for PC side
        startWebRTC(false);

        // Enable the start button and init device list
        startBtn.disabled = false;
        initDeviceList();
    }
}

// UI Navigation
function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');

    if (screenId === 'active') {
        volumeContainer.style.display = state.role === 'phone' ? 'flex' : 'none';
        changeSourceBtn.style.display = state.role === 'pc' ? 'block' : 'none';
    }
}

async function setupPC() {
    state.role = 'pc';
    showScreen('pc');
    pcIdentity.textContent = "Your PC";
    initSocket();
    initDeviceList();
}

function setupPhone() {
    state.role = 'phone';
    showScreen('phone');

    // Load saved networks
    const savedNetworksJson = localStorage.getItem('audioporter_networks');
    state.savedNetworks = savedNetworksJson ? JSON.parse(savedNetworksJson) : [];

    // If we have saved networks, connect to all of them to discover PCs
    if (state.savedNetworks.length > 0) {
        connectToSavedNetworks();
    } else {
        // First time user - prompt for IP
        promptForNewNetwork();
    }
}

function connectToSavedNetworks() {
    // For simplicity, we'll connect to the first saved network
    // In a more advanced version, we could maintain multiple WebSocket connections
    const network = state.savedNetworks[0];
    initSocket(`ws://${network.ip}:3000`);
}

function promptForNewNetwork() {
    const ip = prompt("Enter your PC's IP address (e.g., 192.168.1.5):");
    if (ip) {
        const name = prompt("Give this network a name (e.g., Home, Office):") || ip;
        addNetwork(ip, name);
        initSocket(`ws://${ip}:3000`);
    }
}

function addNetwork(ip, name) {
    state.savedNetworks.push({ ip, name });
    localStorage.setItem('audioporter_networks', JSON.stringify(state.savedNetworks));
}

function forgetCurrentNetwork() {
    // Remove the currently connected network
    const currentIp = state.serverUrl?.split('//')[1]?.split(':')[0];
    state.savedNetworks = state.savedNetworks.filter(n => n.ip !== currentIp);
    localStorage.setItem('audioporter_networks', JSON.stringify(state.savedNetworks));
    location.reload();
}

// WebRTC Logic
async function startWebRTC(isInitiator) {
    const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    state.peerConnection = new RTCPeerConnection(config);

    state.peerConnection.onicecandidate = (event) => {
        if (event.candidate && state.partnerId) {
            state.socket.send(JSON.stringify({
                type: 'signal',
                targetId: state.partnerId,
                data: event.candidate
            }));
        }
    };

    if (state.role === 'phone') {
        state.peerConnection.ontrack = (event) => {
            if (!state.audioElement) {
                state.audioElement = document.createElement('audio');
                state.audioElement.autoplay = true;
                state.audioElement.playsInline = true;
                state.audioElement.muted = true;
                document.body.appendChild(state.audioElement);
            }
            state.audioElement.srcObject = event.streams[0];

            // Setup Gain Node
            if (!state.audioCtx) {
                state.audioCtx = new AudioContext();
                state.gainNode = state.audioCtx.createGain();
                const source = state.audioCtx.createMediaStreamSource(event.streams[0]);
                source.connect(state.gainNode);
                state.gainNode.connect(state.audioCtx.destination);
            }

            state.audioElement.play().then(() => {
                showScreen('active');
            });
        };
    }

    if (isInitiator) {
        const offer = await state.peerConnection.createOffer();
        await state.peerConnection.setLocalDescription(offer);
        state.socket.send(JSON.stringify({
            type: 'signal',
            targetId: state.partnerId,
            data: offer
        }));
    }
}

async function handleSignal(signal, fromId) {
    if (!state.peerConnection) await startWebRTC(false);

    if (signal.type === 'offer') {
        await state.peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await state.peerConnection.createAnswer();
        await state.peerConnection.setLocalDescription(answer);
        state.socket.send(JSON.stringify({
            type: 'signal',
            targetId: fromId,
            data: answer
        }));
    } else if (signal.type === 'answer') {
        await state.peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
    } else if (signal.candidate) {
        await state.peerConnection.addIceCandidate(new RTCIceCandidate(signal));
    }
}

// Capture Logic
async function startCapture() {
    try {
        const selectedDeviceId = audioSourceSelect.value;
        state.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });

        state.stream.getTracks().forEach(track => {
            state.peerConnection.addTrack(track, state.stream);
        });

        const offer = await state.peerConnection.createOffer();
        await state.peerConnection.setLocalDescription(offer);
        state.socket.send(JSON.stringify({
            type: 'signal',
            targetId: state.partnerId,
            data: offer
        }));

        showScreen('active');
        document.getElementById('stream-status').textContent = "Broadcasting Audio";
    } catch (err) {
        console.error("Error capturing audio:", err);
        alert("Failed to capture audio. Please check your microphone permissions.");
    }
}

async function changeSource() {
    try {
        // Get available devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(device => device.kind === 'audioinput');

        // Create a simple selection prompt
        let deviceList = "Available audio sources:\n\n";
        audioDevices.forEach((device, index) => {
            deviceList += `${index + 1}. ${device.label || 'Unknown Device'}\n`;
        });
        deviceList += `\nEnter the number of the device you want to use (1-${audioDevices.length}):`;

        const selection = prompt(deviceList);
        if (!selection) return;

        const deviceIndex = parseInt(selection) - 1;
        if (deviceIndex < 0 || deviceIndex >= audioDevices.length) {
            alert("Invalid selection");
            return;
        }

        const selectedDevice = audioDevices[deviceIndex];
        const newStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: { exact: selectedDevice.deviceId },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });

        const newAudioTrack = newStream.getAudioTracks()[0];
        if (!newAudioTrack) {
            alert("No audio track found.");
            return;
        }

        // Replace the track
        const senders = state.peerConnection.getSenders();
        const audioSender = senders.find(s => s.track && s.track.kind === 'audio');

        if (audioSender) {
            await audioSender.replaceTrack(newAudioTrack);
            if (state.stream) {
                state.stream.getTracks().forEach(track => track.stop());
            }
            state.stream = newStream;
            alert(`Switched to: ${selectedDevice.label || 'Selected Device'}`);
        }
    } catch (err) {
        console.error("Error changing source:", err);
        alert("Failed to change audio source: " + err.message);
    }
}

async function initDeviceList() {
    try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach(t => t.stop());
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(device => device.kind === 'audioinput');
        audioSourceSelect.innerHTML = '';
        audioDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || 'Default';
            audioSourceSelect.appendChild(option);
        });
    } catch (e) { }
}

function updateStatus(text, ledClass) {
    const statusLed = state.role === 'pc' ? document.getElementById('pc-status-led') : document.getElementById('phone-status-led');
    const statusText = state.role === 'pc' ? document.getElementById('pc-status-text') : document.getElementById('phone-status-text');
    if (statusLed) statusLed.className = 'status-indicator ' + ledClass;
    if (statusText) statusText.textContent = text;
}

function handlePartnerLeft() {
    location.reload();
}

// Listeners
document.getElementById('select-pc').addEventListener('click', setupPC);
document.getElementById('select-phone').addEventListener('click', setupPhone);
startBtn.addEventListener('click', startCapture);
changeSourceBtn.addEventListener('click', changeSource);
volumeSlider.addEventListener('input', (e) => {
    if (state.gainNode) state.gainNode.gain.value = e.target.value;
});
document.getElementById('stop-stream').addEventListener('click', () => location.reload());
document.getElementById('add-network').addEventListener('click', () => {
    promptForNewNetwork();
});
