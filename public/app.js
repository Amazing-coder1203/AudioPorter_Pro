/**
 * AudioPorter - Core Logic
 */

const state = {
    role: null, // 'pc' or 'phone'
    roomCode: null,
    socket: null,
    peerConnection: null,
    stream: null,
    audioElement: null,
    audioCtx: null,
    gainNode: null,
    heartbeatInterval: null,
};

// UI Elements
const screens = {
    selection: document.getElementById('selection-screen'),
    pc: document.getElementById('pc-screen'),
    phone: document.getElementById('phone-screen'),
    active: document.getElementById('active-screen'),
};

const pcCodeDisplay = document.getElementById('pc-code');
const pcStatusLed = document.getElementById('pc-status-led');
const pcStatusText = document.getElementById('pc-status-text');
const startBtn = document.getElementById('start-stream');
const changeSourceBtn = document.getElementById('change-source');

const phoneStatusLed = document.getElementById('phone-status-led');
const phoneStatusText = document.getElementById('phone-status-text');
const connectPhoneBtn = document.getElementById('connect-phone');
const codeInputs = document.querySelectorAll('.code-input');
const audioSourceSelect = document.getElementById('audio-source');
const volumeSlider = document.getElementById('volume-slider');
const volumeContainer = document.querySelector('.volume-container');

// Initialize WebSocket
function initSocket() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    // NOTE: When deploying, replace 'window.location.host' with your actual backend URL
    // e.g., 'audioporter-backend.onrender.com'
    let socketUrl = `${protocol}//${window.location.host}`;

    state.socket = new WebSocket(socketUrl);

    state.socket.onopen = () => {
        console.log('Server connection established');
        if (state.role && state.roomCode) {
            joinRoom();
        }
    };

    state.socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'ready':
                handlePartnerJoined();
                break;
            case 'signal':
                handleSignal(data.data);
                break;
            case 'partner_disconnected':
                handlePartnerLeft();
                break;
            case 'error':
                alert(data.message);
                updateStatus(data.message, 'error');
                break;
        }
    };

    state.socket.onclose = () => {
        updateStatus('Disconnected', 'error');
        stopHeartbeat();
        setTimeout(initSocket, 3000); // Try to reconnect
    };
}

function startHeartbeat() {
    if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
    state.heartbeatInterval = setInterval(() => {
        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
            state.socket.send(JSON.stringify({ type: 'ping' }));
        }
    }, 20000); // Ping every 20 seconds
}

function stopHeartbeat() {
    if (state.heartbeatInterval) {
        clearInterval(state.heartbeatInterval);
        state.heartbeatInterval = null;
    }
}

// Navigation
function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');

    // Show/hide 'Change Source' button and Volume based on role and screen
    if (screenId === 'active') {
        if (state.role === 'pc') {
            changeSourceBtn.style.display = 'block';
            volumeContainer.style.display = 'none';
        } else {
            changeSourceBtn.style.display = 'none';
            volumeContainer.style.display = 'flex';
        }
    } else {
        changeSourceBtn.style.display = 'none';
        volumeContainer.style.display = 'none';
    }
}

// Room Logic
function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function joinRoom() {
    state.socket.send(JSON.stringify({
        type: 'join',
        room: state.roomCode,
        role: state.role
    }));
    startHeartbeat();
}

// PC Side Logic
async function setupPC() {
    state.role = 'pc';
    state.roomCode = generateRoomCode();
    pcCodeDisplay.textContent = state.roomCode;

    showScreen('pc');
    updateStatus('Waiting for phone...', 'waiting');

    // Request permission early to get device labels, then populate list
    initDeviceList();

    if (!state.socket) initSocket();
    else joinRoom();
}

async function initDeviceList() {
    try {
        // Trigger a temporary stream to get permission and labels
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach(t => t.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(device => device.kind === 'audioinput');

        audioSourceSelect.innerHTML = '';
        audioDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Microphone ${audioSourceSelect.length + 1}`;
            audioSourceSelect.appendChild(option);
        });
    } catch (err) {
        console.error("Error listing devices:", err);
    }
}

async function startCapture() {
    try {
        const selectedDeviceId = audioSourceSelect.value;
        const constraints = {
            audio: {
                deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            }
        };

        state.stream = await navigator.mediaDevices.getUserMedia(constraints);

        const audioTrack = state.stream.getAudioTracks()[0];
        if (!audioTrack) {
            alert("No audio track found.");
            return;
        }

        setupWebRTC();

        // Add track to peer connection
        state.peerConnection.addTrack(audioTrack, state.stream);

        // Create Offer
        const offer = await state.peerConnection.createOffer();
        await state.peerConnection.setLocalDescription(offer);

        state.socket.send(JSON.stringify({
            type: 'signal',
            data: offer
        }));

        showScreen('active');
        document.getElementById('stream-status').textContent = "Broadcasting Audio";

    } catch (err) {
        console.error("Error capturing audio:", err);
        alert("Failed to capture system audio. Ensure you use a desktop browser and grant permissions.");
    }
}

async function changeSource() {
    try {
        const selectedDeviceId = audioSourceSelect.value;
        const constraints = {
            audio: {
                deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        };

        const newStream = await navigator.mediaDevices.getUserMedia(constraints);

        const newAudioTrack = newStream.getAudioTracks()[0];
        if (!newAudioTrack) {
            alert("No audio track found.");
            return;
        }

        // Find the audio sender and replace the track
        if (state.peerConnection) {
            const senders = state.peerConnection.getSenders();
            const audioSender = senders.find(s => s.track && s.track.kind === 'audio');

            if (audioSender) {
                await audioSender.replaceTrack(newAudioTrack);

                // Stop old tracks to clean up
                if (state.stream) {
                    state.stream.getTracks().forEach(track => track.stop());
                }
                state.stream = newStream;
                console.log("Audio source successfully changed");
            }
        }
    } catch (err) {
        if (err.name === 'NotAllowedError') {
            console.log("User cancelled source selection");
        } else {
            console.error("Error changing source:", err);
            alert("Failed to change audio source.");
        }
    }
}

// Phone Side Logic
function setupPhone() {
    state.role = 'phone';
    showScreen('phone');
    if (!state.socket) initSocket();
}

function getEnteredCode() {
    let code = '';
    codeInputs.forEach(input => code += input.value);
    return code;
}

function connectPhone() {
    const code = getEnteredCode();
    if (code.length !== 4) return;

    state.roomCode = code;
    joinRoom();
    updateStatus('Connecting to room...', 'waiting');
}

// WebRTC Logic
function setupWebRTC() {
    const config = {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };

    state.peerConnection = new RTCPeerConnection(config);

    state.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            state.socket.send(JSON.stringify({
                type: 'signal',
                data: event.candidate
            }));
        }
    };

    state.peerConnection.ontrack = (event) => {
        console.log('Received track');

        if (!state.audioElement) {
            state.audioElement = document.createElement('audio');
            state.audioElement.id = 'remote-audio';
            state.audioElement.autoplay = true;
            state.audioElement.playsInline = true;
            state.audioElement.muted = true; // Mute to prevent echo (AudioContext handles output)
            state.audioElement.style.display = 'none';
            document.body.appendChild(state.audioElement);
        }

        state.audioElement.srcObject = event.streams[0];

        // Setup Web Audio API for volume boosting (more bandwidth/gain)
        if (!state.audioCtx) {
            state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            state.gainNode = state.audioCtx.createGain();

            const source = state.audioCtx.createMediaStreamSource(event.streams[0]);
            source.connect(state.gainNode);
            state.gainNode.connect(state.audioCtx.destination);

            // Set initial volume from slider
            state.gainNode.gain.value = volumeSlider.value;
        }

        // Start playback and initialize background session
        state.audioElement.play().then(() => {
            if (state.audioCtx.state === 'suspended') {
                state.audioCtx.resume();
            }
            console.log("Playback started successfully");
            setupMediaSession();
            requestWakeLock();
            startSilentAnchor(); // Keep context alive
        }).catch(e => {
            console.error("Playback failed:", e);
            updateStatus('Tap to enable audio', 'error');
            // Adding a manual resume for browsers that block autoplay
            window.addEventListener('click', () => state.audioElement.play(), { once: true });
        });

        showScreen('active');
        document.getElementById('stream-status').textContent = "Receiving Audio";
        document.getElementById('stream-info').textContent = "Background streaming active";
    };
}

// Silent Audio Anchor - Prevents mobile browsers from killing the audio context
function startSilentAnchor() {
    if (state.silentInterval) return;

    // Resume context on user interaction if needed
    const resume = () => {
        if (state.audioCtx && state.audioCtx.state === 'suspended') {
            state.audioCtx.resume();
        }
    };
    window.addEventListener('click', resume, { once: true });
    window.addEventListener('touchstart', resume, { once: true });

    // Create a tiny silent oscillator to keep the audio pipeline warm
    const audioCtx = state.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    gainNode.gain.value = 0.001; // Silent but not zero to keep it active
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();

    console.log("Silent anchor active");
}

// Keep the audio playing when screen locks
function setupMediaSession() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: 'AudioPorter Live',
            artist: 'Streaming from PC',
            album: 'Real-time Audio',
            artwork: [
                { src: 'https://cdn-icons-png.flaticon.com/512/3659/3659899.png', sizes: '512x512', type: 'image/png' }
            ]
        });

        navigator.mediaSession.playbackState = 'playing';

        const actionHandlers = [
            ['play', () => state.audioElement && state.audioElement.play()],
            ['pause', () => {
                // We don't actually pause the stream to avoid desync
                console.log("Pause requested but ignored to maintain sync");
            }],
            ['stop', () => location.reload()],
        ];

        for (const [action, handler] of actionHandlers) {
            try {
                navigator.mediaSession.setActionHandler(action, handler);
            } catch (error) {
                console.log(`Action ${action} not supported`);
            }
        }
    }
}

// Request Screen Wake Lock to prevent sleep
let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock is active');

            wakeLock.addEventListener('release', () => {
                console.log('Wake Lock was released');
            });
        }
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
    }
}

async function handleSignal(signal) {
    if (!state.peerConnection) setupWebRTC();

    try {
        if (signal.type === 'offer') {
            await state.peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
            const answer = await state.peerConnection.createAnswer();
            await state.peerConnection.setLocalDescription(answer);
            state.socket.send(JSON.stringify({
                type: 'signal',
                data: answer
            }));
        } else if (signal.type === 'answer') {
            await state.peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
        } else if (signal.candidate) {
            await state.peerConnection.addIceCandidate(new RTCIceCandidate(signal));
        }
    } catch (e) {
        console.error("Signal handling error:", e);
    }
}

// UI Helpers
function updateStatus(text, ledClass) {
    const statusLed = state.role === 'pc' ? pcStatusLed : phoneStatusLed;
    const statusText = state.role === 'pc' ? pcStatusText : phoneStatusText;

    if (statusLed) {
        statusLed.className = 'status-indicator ' + ledClass;
    }
    if (statusText) {
        statusText.textContent = text;
    }

    if (state.role === 'pc' && ledClass === 'connected') {
        startBtn.disabled = false;
    }
}

function handlePartnerJoined() {
    updateStatus('Partner Connected', 'ready');
    if (state.role === 'pc') {
        startBtn.disabled = false;
    }
}

function handlePartnerLeft() {
    updateStatus('Partner disconnected', 'waiting');
    if (state.role === 'pc') {
        startBtn.disabled = true;
    }
    // If we were in active screen, go back
    if (screens.active.classList.contains('active')) {
        showScreen(state.role === 'pc' ? 'pc' : 'phone');
    }
}

// Event Listeners
document.getElementById('select-pc').addEventListener('click', setupPC);
document.getElementById('select-phone').addEventListener('click', setupPhone);

document.querySelectorAll('.back-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        state.role = null;
        state.roomCode = null;
        showScreen('selection');
    });
});

startBtn.addEventListener('click', startCapture);
changeSourceBtn.addEventListener('click', changeSource);
connectPhoneBtn.addEventListener('click', connectPhone);

volumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (state.gainNode) {
        state.gainNode.gain.value = val;
    }

    // Update visual feedback for boosting
    if (val > 1) {
        volumeContainer.style.borderColor = `rgba(99, 102, 241, ${0.1 + (val - 1) / 2})`;
        volumeContainer.style.boxShadow = `0 0 ${10 + (val - 1) * 10}px rgba(99, 102, 241, ${(val - 1) / 4})`;
    } else {
        volumeContainer.style.borderColor = '';
        volumeContainer.style.boxShadow = '';
    }
});

document.getElementById('stop-stream').addEventListener('click', () => {
    location.reload(); // Simple reset
});

// Auto-focus code inputs
codeInputs.forEach((input, idx) => {
    input.addEventListener('input', (e) => {
        if (e.target.value.length === 1 && idx < 3) {
            codeInputs[idx + 1].focus();
        }
        if (getEnteredCode().length === 4) {
            connectPhoneBtn.focus();
        }
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && idx > 0) {
            codeInputs[idx - 1].focus();
        }
    });
});
