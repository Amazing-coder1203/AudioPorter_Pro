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
    pcName: 'My Computer'
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
        item.onclick = () => requestConnection(pc.id);
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
    // For "No Code" version, PC accepts automatically for now, or shows a prompt
    // Let's show a simple confirm for security
    if (confirm("A phone wants to connect to your audio. Accept?")) {
        state.partnerId = fromId;
        state.socket.send(JSON.stringify({
            type: 'connection_accepted',
            targetId: fromId
        }));
        updateStatus('Phone Linked', 'connected');
        startBtn.disabled = false;
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
    // If in APK, we need user to input the PC's IP if discovery fails
    // But for local web use, it works automatically
    initSocket();
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
    const selectedDeviceId = audioSourceSelect.value;
    state.stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined }
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
volumeSlider.addEventListener('input', (e) => {
    if (state.gainNode) state.gainNode.gain.value = e.target.value;
});
document.getElementById('stop-stream').addEventListener('click', () => location.reload());
document.getElementById('refresh-discovery').addEventListener('click', () => {
    if (state.socket) state.socket.send(JSON.stringify({ type: 'request_discovery' }));
});
