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
    activeConnections: [], // WebSocket connections to different networks
    isForegroundServiceActive: false
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
const audioSourceSelect = document.getElementById('audio-source');
const activeAudioSourceSelect = document.getElementById('active-audio-source');
const sourceSelectorContainer = document.getElementById('source-selector-container');
const volumeSlider = document.getElementById('volume-slider');
const volumeContainer = document.querySelector('.volume-container');

// Global error logger for APK
window.onerror = function (msg, url, lineNo, columnNo, error) {
    const debugStatus = document.getElementById('debug-status');
    if (debugStatus) debugStatus.textContent = 'ERROR: ' + msg;
    return false;
};

window.onunhandledrejection = function (event) {
    const debugStatus = document.getElementById('debug-status');
    if (debugStatus) debugStatus.textContent = 'PROMISE ERROR: ' + event.reason;
};

async function startForegroundService() {
    if (window.Capacitor && window.Capacitor.isNativePlatform() && !state.isForegroundServiceActive) {
        try {
            // Request notification permission for Android 13+
            if (Capacitor.Plugins.LocalNotifications) {
                const perm = await Capacitor.Plugins.LocalNotifications.requestPermissions();
                if (perm.display !== 'granted') {
                    console.warn("Notification permission not granted, foreground service might not be visible.");
                }
            }

            const { AndroidForegroundService } = Capacitor.Plugins;
            if (AndroidForegroundService) {
                await AndroidForegroundService.start({
                    id: 12345,
                    title: 'AudioPorter Live',
                    body: 'Streaming high-quality audio in background',
                    smallIcon: 'ic_launcher',
                    importance: 4, // IMPORTANCE_HIGH
                    notificationChannelId: 'audioporter_v1'
                });
                state.isForegroundServiceActive = true;
                console.log("Foreground service started with high priority");

                // Initialize Media Session API
                setupMediaSession();
            }
        } catch (e) {
            console.error("Foreground service failed", e);
        }
    }
}

function setupMediaSession() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: 'AudioPorter Stream',
            artist: state.pcName || 'Remote PC',
            album: 'Live Audio',
            artwork: [
                { src: 'favicon.ico', sizes: '96x96', type: 'image/png' }
            ]
        });

        navigator.mediaSession.setActionHandler('play', () => {
            if (state.audioCtx && state.audioCtx.state === 'suspended') {
                state.audioCtx.resume();
            }
        });

        // This tells Android that we are actively playing media
        navigator.mediaSession.playbackState = 'playing';
    }
}

// Keep AudioContext alive even when tab is hidden
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        console.log("App moved to background, ensuring audio continues...");
    } else {
        if (state.audioCtx && state.audioCtx.state === 'suspended') {
            state.audioCtx.resume();
        }
    }
});

async function stopForegroundService() {
    if (window.Capacitor && window.Capacitor.isNativePlatform() && state.isForegroundServiceActive) {
        try {
            const { AndroidForegroundService } = Capacitor.Plugins;
            if (AndroidForegroundService) {
                await AndroidForegroundService.stop();
                state.isForegroundServiceActive = false;
                console.log("Foreground service stopped");
            }
        } catch (e) {
            console.error("Foreground service stop failed", e);
        }
    }
}

const DEFAULT_SERVER = 'audioporter-pro.onrender.com';

function initSocket(customUrl) {
    let socketUrl;
    const isHttps = window.location.protocol === 'https:';

    if (customUrl) {
        // Force upgrade to wss if we are on https, regardless of anything
        if (isHttps) {
            socketUrl = customUrl.replace('ws://', 'wss://');

            // Check if it's a local address - strictly forbidden on HTTPS anyway
            const isLocal = socketUrl.includes('192.168.') || socketUrl.includes('10.') || socketUrl.includes('172.') || socketUrl.includes('127.0.0.1') || socketUrl.includes('localhost');
            if (isLocal && !socketUrl.includes(window.location.host)) {
                console.warn("Security: Cannot connect to local IP from HTTPS page.");
                showNotification("⚠️ Security Error: Browser blocks local connections on secure public URLs. Please connect both devices to the same public URL.", "error");
                return; // Guard against SecurityError
            }
        } else {
            socketUrl = customUrl;
        }
    } else {
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
        const isLocalPC = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        if (isNative) {
            // Always use production server for Native APKs
            socketUrl = `wss://${DEFAULT_SERVER}`;
        } else if (window.location.protocol === 'file:') {
            socketUrl = `wss://${DEFAULT_SERVER}`;
        } else if (isHttps) {
            socketUrl = `wss://${window.location.host}`;
        } else if (isLocalPC) {
            // Local PC development (e.g., http://localhost:3000)
            socketUrl = `ws://${window.location.host}`;
        } else {
            // Default fallback
            socketUrl = `ws://${window.location.host}`;
        }
    }

    console.log("Attempting to connect to:", socketUrl);
    state.serverUrl = socketUrl;

    const serverEl = document.getElementById('debug-server');
    const statusEl = document.getElementById('debug-status');

    // Mask IP in debug info for cleaner look
    if (serverEl) {
        let displayUrl = socketUrl;
        if (displayUrl.includes('192.168.') || displayUrl.includes('10.') || displayUrl.includes('172.')) {
            displayUrl = "Local Network Server";
        }
        serverEl.textContent = displayUrl;
    }
    if (statusEl) statusEl.textContent = 'Connecting...';

    state.socket = new WebSocket(socketUrl);

    state.socket.onopen = () => {
        console.log('Connected to signaling server');
        if (statusEl) statusEl.textContent = 'Connected ✅';

        // Heartbeat to prevent Render hibernation and keep mobile radio active (every 30s)
        if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
        state.heartbeatInterval = setInterval(() => {
            if (state.socket && state.socket.readyState === WebSocket.OPEN) {
                state.socket.send(JSON.stringify({ type: 'heartbeat' }));
            }
        }, 30000);

        if (state.role === 'pc') {
            state.socket.send(JSON.stringify({
                type: 'register_pc',
                identity: `${state.pcName}`
            }));
        } else if (state.role === 'phone') {
            state.socket.send(JSON.stringify({ type: 'request_discovery' }));
        }
    };

    state.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (statusEl) statusEl.textContent = 'Error ❌';
        updateStatus('Connection failed', 'error');
    };

    state.socket.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        if (statusEl) statusEl.textContent = `Closed (${event.code})`;
        updateStatus('Disconnected', 'error');

        // Stop heartbeat on close
        if (state.heartbeatInterval) {
            clearInterval(state.heartbeatInterval);
            state.heartbeatInterval = null;
        }
    };

    state.socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'discovery_update':
                console.log('Received discovery_update:', data);
                const countEl = document.getElementById('debug-pc-count');
                if (countEl) countEl.textContent = data.pcs?.length || 0;
                if (state.role === 'phone') updatePCList(data.pcs);
                break;
            case 'server_info':
                if (state.role === 'pc') {
                    // If hostname is a Render internal ID, use a friendly name
                    let displayName = data.hostname;
                    if (displayName.startsWith('srv-') || displayName.length > 20) {
                        displayName = "AudioPorter PC";
                    }
                    state.pcName = displayName;
                    pcIdentity.textContent = state.pcName;
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
    // Show modal instead of confirm dialog
    const modal = document.getElementById('connection-modal');
    const acceptBtn = document.getElementById('accept-connection');
    const declineBtn = document.getElementById('decline-connection');

    modal.classList.add('active');

    // Remove old listeners
    const newAcceptBtn = acceptBtn.cloneNode(true);
    const newDeclineBtn = declineBtn.cloneNode(true);
    acceptBtn.parentNode.replaceChild(newAcceptBtn, acceptBtn);
    declineBtn.parentNode.replaceChild(newDeclineBtn, declineBtn);

    // Accept connection
    newAcceptBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        state.partnerId = fromId;
        state.socket.send(JSON.stringify({
            type: 'connection_accepted',
            targetId: fromId
        }));
        updateStatus('Phone Linked', 'connected');
        showNotification('Phone connected successfully!', 'success');

        // Initialize WebRTC for PC side
        startWebRTC(false);

        // Enable the start button and init device list
        startBtn.disabled = false;
        initDeviceList();
    });

    // Decline connection
    newDeclineBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        showNotification('Connection request declined', 'error');
    });
}

// UI Navigation
function showScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');

    if (screenId === 'active') {
        volumeContainer.style.display = state.role === 'phone' ? 'flex' : 'none';
        sourceSelectorContainer.style.display = state.role === 'pc' ? 'flex' : 'none';

        // Populate active audio source dropdown for PC
        if (state.role === 'pc') {
            populateActiveAudioSources();
        }
    }
}

async function setupPC() {
    state.role = 'pc';
    showScreen('pc');
    pcIdentity.textContent = "Your PC";
    initSocket();

    // Check if we are in a secure context (localhost or https)
    // Browsers block microphone on http://192.168.x.x
    const isIP = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(window.location.hostname);
    if (!window.isSecureContext && isIP) {
        showNotification("⚠️ Browser blocks Mic on IP. Use 'http://localhost:3000'", "error");
        // Update instruction text to be more helpful
        if (pcIdentity) {
            pcIdentity.style.borderColor = "#ef4444";
            pcIdentity.innerHTML = `🚨 Please use 'localhost' to enable Mic`;
        }
    }

    // Trigger device list initialization which will handle permissions
    initDeviceList();
}

function setupPhone() {
    state.role = 'phone';
    showScreen('phone');

    // Load saved networks
    const savedNetworksJson = localStorage.getItem('audioporter_networks');
    state.savedNetworks = savedNetworksJson ? JSON.parse(savedNetworksJson) : [];

    // On Render/HTTPS/APK, we should always connect to the public host first
    initSocket();

    // If we have saved networks and we are in pure LOCAL mode (HTTP + NOT APK)
    const isPublic = window.location.protocol === 'https:' || window.location.protocol === 'file:';
    if (state.savedNetworks.length > 0 && !isPublic) {
        connectToSavedNetworks();
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
                // Use interactive latency hint for lowest delay
                state.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
                state.gainNode = state.audioCtx.createGain();
                const source = state.audioCtx.createMediaStreamSource(event.streams[0]);
                source.connect(state.gainNode);
                state.gainNode.connect(state.audioCtx.destination);
            }

            state.audioElement.play().then(() => {
                showScreen('active');
                startForegroundService(); // Start background service when audio starts
            });
        };
    }

    if (isInitiator) {
        let offer = await state.peerConnection.createOffer();
        // Modify SDP for low latency
        offer.sdp = setOpusParameters(offer.sdp);
        await state.peerConnection.setLocalDescription(offer);
        state.socket.send(JSON.stringify({
            type: 'signal',
            targetId: state.partnerId,
            data: offer
        }));
    }
}

// Low latency audio tweaks
function setOpusParameters(sdp) {
    if (sdp.indexOf('opus') === -1) return sdp;
    // Force specific audio parameters:
    // 1. useinbandfec=1: Error correction
    // 2. minptime=10: 10ms packet size (lowest possible)
    // 3. ptime=10: Preferred 10ms packets
    // 4. maxaveragebitrate=128000: Cap bitrate to prevent congestion lag
    let modifiedSdp = sdp.replace('useinbandfec=1', 'useinbandfec=1; minptime=10; ptime=10; maxaveragebitrate=128000');
    return modifiedSdp;
}

async function handleSignal(signal, fromId) {
    if (!state.peerConnection) await startWebRTC(false);

    if (signal.type === 'offer') {
        await state.peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
        let answer = await state.peerConnection.createAnswer();
        // Modify SDP for low latency
        answer.sdp = setOpusParameters(answer.sdp);
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
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showNotification("❌ Microphone access is blocked on IP addresses. Use 'http://localhost:3000' instead!", "error");
        return;
    }

    try {
        const selectedDeviceId = audioSourceSelect.value;
        state.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                // Add explicit sample rate and channel count to avoid high-cpu resampling
                sampleRate: 48000,
                channelCount: 2,
                // Request lowest possible latency from the driver
                latency: 0
            }
        });

        state.stream.getTracks().forEach(track => {
            // Signal to browser that this is high-priority content
            if (track.contentHint) track.contentHint = 'speech';
            state.peerConnection.addTrack(track, state.stream);
        });

        const offer = await state.peerConnection.createOffer();
        // Modify SDP for low latency
        offer.sdp = setOpusParameters(offer.sdp);
        await state.peerConnection.setLocalDescription(offer);
        state.socket.send(JSON.stringify({
            type: 'signal',
            targetId: state.partnerId,
            data: offer
        }));

        showScreen('active');
        document.getElementById('stream-status').textContent = "Broadcasting Audio";
        showNotification("Audio streaming started!", "success");
    } catch (err) {
        console.error("Error capturing audio:", err);

        // Handle different error types
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            showNotification("Microphone permission denied. Click 'Start Audio Stream' again to grant permission.", "error");
        } else if (err.name === 'NotFoundError') {
            showNotification("No microphone found. Please connect a microphone and try again.", "error");
        } else if (err.name === 'NotReadableError') {
            showNotification("Microphone is being used by another application. Please close it and try again.", "error");
        } else {
            showNotification("Failed to capture audio. Please check your microphone permissions.", "error");
        }
    }
}

async function populateActiveAudioSources() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(device => device.kind === 'audioinput');

        activeAudioSourceSelect.innerHTML = '';
        audioDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || 'Unknown Device';
            // Select the currently active device
            if (state.stream && state.stream.getAudioTracks()[0]) {
                const currentTrack = state.stream.getAudioTracks()[0];
                if (currentTrack.getSettings().deviceId === device.deviceId) {
                    option.selected = true;
                }
            }
            activeAudioSourceSelect.appendChild(option);
        });
    } catch (err) {
        console.error("Error listing devices:", err);
    }
}

async function changeActiveSource() {
    try {
        const selectedDeviceId = activeAudioSourceSelect.value;
        if (!selectedDeviceId) return;

        const newStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: { exact: selectedDeviceId },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });

        const newAudioTrack = newStream.getAudioTracks()[0];
        if (!newAudioTrack) return;

        // Replace the track
        const senders = state.peerConnection.getSenders();
        const audioSender = senders.find(s => s.track && s.track.kind === 'audio');

        if (audioSender) {
            await audioSender.replaceTrack(newAudioTrack);
            if (state.stream) {
                state.stream.getTracks().forEach(track => track.stop());
            }
            state.stream = newStream;
            console.log("Audio source changed successfully");
        }
    } catch (err) {
        console.error("Error changing source:", err);
        alert("Failed to change audio source: " + err.message);
    }
}

async function initDeviceList() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        audioSourceSelect.innerHTML = '<option value="">Capture Not Supported</option>';
        return;
    }

    try {
        // This getUserMedia call will trigger the browser's permission dialog
        // like Google Meet does.
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        // Once permission is granted, we stop the temporary stream
        tempStream.getTracks().forEach(t => t.stop());

        // Now we can accurately list the available devices with their real names
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(device => device.kind === 'audioinput');

        audioSourceSelect.innerHTML = '';
        if (audioDevices.length === 0) {
            audioSourceSelect.innerHTML = '<option value="">No Microphones Found</option>';
        } else {
            audioDevices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || 'Microphone ' + (audioSourceSelect.options.length + 1);
                audioSourceSelect.appendChild(option);
            });
            showNotification("Microphone access granted!", "success");
        }
    } catch (err) {
        console.warn("Permission denied or error listing devices:", err);
        audioSourceSelect.innerHTML = '<option value="">Default Microphone (No Permission)</option>';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            showNotification("Microphone permission denied. Please allow access in your browser settings.", "error");
        }
    }
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
activeAudioSourceSelect.addEventListener('change', changeActiveSource);
volumeSlider.addEventListener('input', (e) => {
    if (state.gainNode) state.gainNode.gain.value = e.target.value;
});
document.getElementById('stop-stream').addEventListener('click', () => {
    stopForegroundService();
    location.reload();
});
document.getElementById('reset-app-btn')?.addEventListener('click', () => {
    if (confirm("This will clear all saved PCs and settings. Continue?")) {
        localStorage.clear();
        location.reload();
    }
});

document.getElementById('add-network').addEventListener('click', () => {
    // This is now "Refresh Saved"
    location.reload();
});

document.getElementById('search-ip-btn')?.addEventListener('click', () => {
    const ipInput = document.getElementById('manual-ip-input');
    const ip = ipInput?.value.trim();
    if (ip) {
        addNetwork(ip, ip);
        initSocket(`ws://${ip}:3000`);
        showNotification(`Connecting to ${ip}...`, 'success');
    } else {
        showNotification("Please enter a valid IP address", "error");
    }
});

// Help section toggles
document.getElementById('pc-help-toggle')?.addEventListener('click', function () {
    this.classList.toggle('active');
    const content = document.getElementById('pc-help-content');
    content.classList.toggle('active');
});

document.getElementById('phone-help-toggle')?.addEventListener('click', function () {
    this.classList.toggle('active');
    const content = document.getElementById('phone-help-content');
    content.classList.toggle('active');
});

// Auto-expand help sections on first visit (optional)
window.addEventListener('load', () => {
    const isFirstVisit = !localStorage.getItem('audioporter_visited');
    if (isFirstVisit) {
        localStorage.setItem('audioporter_visited', 'true');
        // Auto-expand help sections for first-time users
        setTimeout(() => {
            document.getElementById('pc-help-toggle')?.click();
            document.getElementById('phone-help-toggle')?.click();
        }, 500);
    }
});

// Notification Toast Function
function showNotification(message, type = 'info') {
    const toast = document.getElementById('notification-toast');
    toast.textContent = message;
    toast.className = 'notification-toast show ' + type;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
