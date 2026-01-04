const socket = io();

let localStream = null;
let screenStream = null;
let peers = new Map();
let currentRoomId = null;
let userName = '';
let isVideoEnabled = true;
let isAudioEnabled = true;
let isScreenSharing = false;
let isBackgroundBlurred = false;
let messageIdCounter = 0;
let chatMessagesMap = new Map();
let blockedUsers = new Set();
let typingTimeout = null;
let connectionQuality = 'connecting';
let videoConstraints = { width: 1280, height: 720 };
let audioConstraints = { echoCancellation: true, noiseSuppression: true };

// DOM Elements
const joinScreen = document.getElementById('join-screen');
const chatScreen = document.getElementById('chat-screen');
const userNameInput = document.getElementById('user-name');
const roomIdInput = document.getElementById('room-id');
const roomPasswordInput = document.getElementById('room-password');
const startWithVideoCheck = document.getElementById('start-with-video');
const startWithAudioCheck = document.getElementById('start-with-audio');
const joinBtn = document.getElementById('join-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const leaveBtn = document.getElementById('leave-btn');
const roomDisplay = document.getElementById('room-display');
const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('local-video');
const localName = document.getElementById('local-name');
const toggleVideoBtn = document.getElementById('toggle-video');
const toggleAudioBtn = document.getElementById('toggle-audio');
const screenShareBtn = document.getElementById('screen-share-btn');
const backgroundBlurBtn = document.getElementById('background-blur-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const emojiBtn = document.getElementById('emoji-btn');
const fileBtn = document.getElementById('file-btn');
const fileInput = document.getElementById('file-input');
const emojiPicker = document.getElementById('emoji-picker');
const closeEmojiBtn = document.getElementById('close-emoji');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const copyRoomIdBtn = document.getElementById('copy-room-id');
const connectionStatus = document.getElementById('connection-status');
const searchChatBtn = document.getElementById('search-chat-btn');
const searchModal = document.getElementById('search-modal');
const closeSearchBtn = document.getElementById('close-search');
const searchInput = document.getElementById('search-input');
const sidebarTabs = document.querySelectorAll('.sidebar-tab');
const chatPanel = document.getElementById('chat-panel');
const usersPanel = document.getElementById('users-panel');
const privatePanel = document.getElementById('private-panel');
const usersList = document.getElementById('users-list');
const userCount = document.getElementById('user-count');
const typingIndicators = document.getElementById('typing-indicators');
const pinnedMessage = document.getElementById('pinned-message');
const videoQualitySelect = document.getElementById('video-quality');
const audioQualitySelect = document.getElementById('audio-quality');
const cameraSelect = document.getElementById('camera-select');
const microphoneSelect = document.getElementById('microphone-select');
const notificationsEnabledCheck = document.getElementById('notifications-enabled');

// Utility Functions
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    const container = document.getElementById('toast-container');
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function sanitizeInput(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function detectLinks(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function formatMessage(text) {
    let formatted = sanitizeInput(text);
    formatted = detectLinks(formatted);
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
}

function updateConnectionStatus(status) {
    connectionQuality = status;
    const indicator = connectionStatus.querySelector('.status-indicator');
    const text = connectionStatus.querySelector('.status-text');
    
    indicator.className = 'status-indicator';
    if (status === 'connected') {
        indicator.classList.add('connected');
        text.textContent = 'Connected';
    } else if (status === 'poor') {
        indicator.classList.add('poor');
        text.textContent = 'Poor Connection';
    } else {
        text.textContent = 'Connecting...';
    }
}

// Screen Sharing
async function startScreenShare() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        isScreenSharing = true;
        
        screenStream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
        };
        
        // Replace video track in all peer connections
        peers.forEach((peer, userId) => {
            const videoTrack = screenStream.getVideoTracks()[0];
            const sender = peer.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(videoTrack);
            }
        });
        
        localVideo.srcObject = screenStream;
        screenShareBtn.classList.add('active');
        document.querySelector('.screen-share-indicator').classList.remove('hidden');
        socket.emit('screen-share-status', { isSharing: true });
        showToast('Screen sharing started', 'success');
    } catch (error) {
        console.error('Error starting screen share:', error);
        showToast('Failed to start screen sharing', 'error');
    }
}

async function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    
    if (localStream) {
        // Replace with camera stream
        const videoTrack = localStream.getVideoTracks()[0];
        peers.forEach((peer, userId) => {
            const sender = peer.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(videoTrack);
            }
        });
        localVideo.srcObject = localStream;
    }
    
    isScreenSharing = false;
    screenShareBtn.classList.remove('active');
    document.querySelector('.screen-share-indicator').classList.add('hidden');
    socket.emit('screen-share-status', { isSharing: false });
    showToast('Screen sharing stopped', 'info');
}

// Background Blur (simplified - would need ML model for real blur)
function toggleBackgroundBlur() {
    isBackgroundBlurred = !isBackgroundBlurred;
    backgroundBlurBtn.classList.toggle('active', isBackgroundBlurred);
    // In a real implementation, you'd use a library like TensorFlow.js or MediaPipe
    showToast(isBackgroundBlurred ? 'Background blur enabled (simulated)' : 'Background blur disabled', 'info');
}

// Join Room
joinBtn.addEventListener('click', async () => {
    await joinRoom();
});

createRoomBtn.addEventListener('click', () => {
    const roomName = prompt('Enter room name (optional):');
    socket.emit('create-room', roomName || 'New Room', roomPasswordInput.value.trim());
});

socket.on('room-created', (data) => {
    roomIdInput.value = data.roomId;
    showToast(`Room created: ${data.roomId}`, 'success');
});

async function joinRoom() {
    userName = userNameInput.value.trim();
    if (!userName) {
        showToast('Please enter your name', 'error');
        return;
    }

    currentRoomId = roomIdInput.value.trim() || generateRoomId();
    const password = roomPasswordInput.value.trim();
    const startWithVideo = startWithVideoCheck.checked;
    const startWithAudio = startWithAudioCheck.checked;
    
    roomDisplay.textContent = currentRoomId;
    localName.textContent = userName;

    try {
        if (startWithVideo || startWithAudio) {
            const constraints = {
                video: startWithVideo ? videoConstraints : false,
                audio: startWithAudio ? audioConstraints : false
            };
            
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            localVideo.srcObject = localStream;
            isVideoEnabled = startWithVideo;
            isAudioEnabled = startWithAudio;
        } else {
            // Join without media
            localStream = null;
        }

        joinScreen.classList.add('hidden');
        chatScreen.classList.remove('hidden');
        updateConnectionStatus('connecting');

        socket.emit('join-room', currentRoomId, userName, password, startWithVideo, startWithAudio);
        showToast('Joining room...', 'info');
    } catch (error) {
        console.error('Error accessing media devices:', error);
        showToast('Error accessing camera/microphone. Please allow permissions.', 'error');
    }
}

socket.on('join-error', (message) => {
    showToast(message, 'error');
    chatScreen.classList.add('hidden');
    joinScreen.classList.remove('hidden');
});

// Leave Room
leaveBtn.addEventListener('click', () => {
    leaveRoom();
});

function leaveRoom() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }

    peers.forEach(peer => peer.close());
    peers.clear();

    const remoteVideos = videoGrid.querySelectorAll('.video-container:not(:first-child)');
    remoteVideos.forEach(video => video.remove());

    socket.disconnect();
    socket.connect();

    chatScreen.classList.add('hidden');
    joinScreen.classList.remove('hidden');
    chatMessages.innerHTML = '';
    typingIndicators.innerHTML = '';
    pinnedMessage.classList.add('hidden');
    currentRoomId = null;
    userName = '';
    roomIdInput.value = '';
    roomPasswordInput.value = '';
    userNameInput.value = '';
    chatMessagesMap.clear();
}

// Media Controls
toggleVideoBtn.addEventListener('click', () => {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            isVideoEnabled = videoTrack.enabled;
            toggleVideoBtn.classList.toggle('muted', !isVideoEnabled);
            socket.emit('toggle-media', { video: isVideoEnabled, audio: isAudioEnabled });
        }
    }
});

toggleAudioBtn.addEventListener('click', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            isAudioEnabled = audioTrack.enabled;
            toggleAudioBtn.classList.toggle('muted', !isAudioEnabled);
            socket.emit('toggle-media', { video: isVideoEnabled, audio: isAudioEnabled });
        }
    }
});

screenShareBtn.addEventListener('click', () => {
    if (isScreenSharing) {
        stopScreenShare();
    } else {
        startScreenShare();
    }
});

backgroundBlurBtn.addEventListener('click', toggleBackgroundBlur);

// Copy Room ID
copyRoomIdBtn.addEventListener('click', () => {
    const roomLink = `${window.location.origin}?room=${currentRoomId}`;
    navigator.clipboard.writeText(roomLink).then(() => {
        showToast('Room link copied to clipboard!', 'success');
    }).catch(() => {
        navigator.clipboard.writeText(currentRoomId).then(() => {
            showToast('Room ID copied to clipboard!', 'success');
        });
    });
});

// Chat Functions
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

chatInput.addEventListener('input', () => {
    socket.emit('typing', true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('typing', false);
    }, 1000);
});

function sendMessage() {
    const message = chatInput.value.trim();
    if (message && userName) {
        socket.emit('chat-message', {
            userName: userName,
            message: message,
            type: 'text'
        });
        chatInput.value = '';
        socket.emit('typing', false);
    }
}

// File Upload
fileBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const fileData = {
                name: file.name,
                type: file.type,
                size: file.size,
                data: event.target.result
            };
            
            socket.emit('chat-message', {
                userName: userName,
                message: file.name,
                type: file.type.startsWith('image/') ? 'image' : 'file',
                fileData: fileData
            });
        };
        
        if (file.type.startsWith('image/')) {
            reader.readAsDataURL(file);
        } else {
            reader.readAsText(file);
        }
    }
});

// Emoji Picker
emojiBtn.addEventListener('click', () => {
    emojiPicker.classList.toggle('hidden');
});

closeEmojiBtn.addEventListener('click', () => {
    emojiPicker.classList.add('hidden');
});

emojiPicker.querySelector('.emoji-grid').addEventListener('click', (e) => {
    if (e.target.tagName === 'SPAN') {
        chatInput.value += e.target.textContent;
        chatInput.focus();
        emojiPicker.classList.add('hidden');
    }
});

// Settings
settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    loadDevices();
});

closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
});

settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.classList.add('hidden');
    }
});

videoQualitySelect.addEventListener('change', (e) => {
    const quality = e.target.value;
    if (quality === 'high') {
        videoConstraints = { width: 1920, height: 1080 };
    } else if (quality === 'medium') {
        videoConstraints = { width: 1280, height: 720 };
    } else {
        videoConstraints = { width: 640, height: 480 };
    }
    
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.applyConstraints(videoConstraints);
        }
    }
});

audioQualitySelect.addEventListener('change', (e) => {
    const quality = e.target.value;
    if (quality === 'high') {
        audioConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    } else if (quality === 'medium') {
        audioConstraints = { echoCancellation: true, noiseSuppression: true };
    } else {
        audioConstraints = {};
    }
    
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.applyConstraints(audioConstraints);
        }
    }
});

async function loadDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        const audioDevices = devices.filter(d => d.kind === 'audioinput');
        
        cameraSelect.innerHTML = '<option value="">Default Camera</option>';
        videoDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Camera ${videoDevices.indexOf(device) + 1}`;
            cameraSelect.appendChild(option);
        });
        
        microphoneSelect.innerHTML = '<option value="">Default Microphone</option>';
        audioDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${audioDevices.indexOf(device) + 1}`;
            microphoneSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading devices:', error);
    }
}

// Sidebar Tabs
sidebarTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        sidebarTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        document.querySelectorAll('.sidebar-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        
        if (targetTab === 'chat') {
            chatPanel.classList.add('active');
        } else if (targetTab === 'users') {
            usersPanel.classList.add('active');
        } else if (targetTab === 'private') {
            privatePanel.classList.add('active');
        }
    });
});

// Search
searchChatBtn.addEventListener('click', () => {
    searchModal.classList.remove('hidden');
    searchInput.focus();
});

closeSearchBtn.addEventListener('click', () => {
    searchModal.classList.add('hidden');
});

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const resultsDiv = document.getElementById('search-results');
    resultsDiv.innerHTML = '';
    
    if (query) {
        Array.from(chatMessagesMap.values()).forEach(msg => {
            if (msg.message.toLowerCase().includes(query) || msg.userName.toLowerCase().includes(query)) {
                const resultItem = document.createElement('div');
                resultItem.className = 'search-result-item';
                resultItem.innerHTML = `
                    <strong>${msg.userName}</strong>: ${msg.message.substring(0, 100)}...
                    <div style="font-size: 0.8rem; color: #666;">${formatTime(msg.timestamp)}</div>
                `;
                resultItem.addEventListener('click', () => {
                    const messageElement = document.querySelector(`[data-message-id="${msg.id}"]`);
                    if (messageElement) {
                        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        messageElement.style.backgroundColor = '#fff3cd';
                        setTimeout(() => {
                            messageElement.style.backgroundColor = '';
                        }, 2000);
                    }
                    searchModal.classList.add('hidden');
                });
                resultsDiv.appendChild(resultItem);
            }
        });
    }
});

// Socket Event Handlers
socket.on('existing-users', (users) => {
    users.forEach(user => {
        createPeerConnection(user.id, user.name, true);
    });
    updateConnectionStatus('connected');
});

socket.on('user-joined', async (data) => {
    createPeerConnection(data.userId, data.userName, false);
    showToast(`${data.userName} joined the room`, 'info');
});

socket.on('user-left', (userId) => {
    if (peers.has(userId)) {
        peers.get(userId).close();
        peers.delete(userId);
        removeVideoElement(userId);
    }
    updateUsersList();
});

socket.on('users-updated', (users) => {
    updateUsersList(users);
});

socket.on('offer', async (data) => {
    const peerConnection = peers.get(data.sender);
    if (peerConnection) {
        await peerConnection.setRemoteDescription(data.offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', {
            answer: answer,
            target: data.sender
        });
    }
});

socket.on('answer', async (data) => {
    const peerConnection = peers.get(data.sender);
    if (peerConnection) {
        await peerConnection.setRemoteDescription(data.answer);
    }
});

socket.on('ice-candidate', async (data) => {
    const peerConnection = peers.get(data.sender);
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(data.candidate);
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    }
});

socket.on('chat-history', (history) => {
    history.forEach(msg => {
        addChatMessage(msg.userName, msg.message, msg.userId === socket.id, msg.timestamp, msg.id, msg.type, msg.fileData, msg.edited);
    });
});

socket.on('chat-message', (data) => {
    if (blockedUsers.has(data.userId)) return;
    addChatMessage(data.userName, data.message, data.userId === socket.id, data.timestamp, data.id, data.type, data.fileData, data.edited);
    
    if (data.userId !== socket.id && notificationsEnabledCheck.checked) {
        if (Notification.permission === 'granted') {
            new Notification(`${data.userName}`, {
                body: data.message,
                icon: '/favicon.ico'
            });
        }
    }
});

socket.on('user-typing', (data) => {
    if (data.userId === socket.id) return;
    
    const existing = typingIndicators.querySelector(`[data-user-id="${data.userId}"]`);
    if (data.isTyping) {
        if (!existing) {
            const indicator = document.createElement('div');
            indicator.dataset.userId = data.userId;
            indicator.textContent = `${data.userName} is typing...`;
            typingIndicators.appendChild(indicator);
        }
    } else {
        if (existing) {
            existing.remove();
        }
    }
});

socket.on('message-reaction', (data) => {
    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        const reactionsDiv = messageElement.querySelector('.message-reactions') || createReactionsDiv(messageElement);
        addReaction(reactionsDiv, data.reaction, data.userName);
    }
});

socket.on('message-edited', (data) => {
    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        const content = messageElement.querySelector('.message-content');
        content.innerHTML = formatMessage(data.newMessage);
        const edited = messageElement.querySelector('.message-edited') || document.createElement('div');
        edited.className = 'message-edited';
        edited.textContent = '(edited)';
        if (!messageElement.querySelector('.message-edited')) {
            messageElement.querySelector('.message-time').appendChild(edited);
        }
    }
});

socket.on('message-deleted', (data) => {
    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        messageElement.style.opacity = '0.5';
        messageElement.querySelector('.message-content').textContent = '(Message deleted)';
        messageElement.querySelector('.message-actions').remove();
    }
});

socket.on('message-pinned', (data) => {
    const messageElement = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageElement) {
        const msg = chatMessagesMap.get(data.messageId);
        if (msg) {
            pinnedMessage.innerHTML = `<strong>${msg.userName}:</strong> ${msg.message}`;
            pinnedMessage.classList.remove('hidden');
        }
    }
});

socket.on('message-unpinned', () => {
    pinnedMessage.classList.add('hidden');
});

socket.on('pinned-message', (messageId) => {
    socket.emit('get-pinned-message', messageId);
});

socket.on('private-message', (data) => {
    if (blockedUsers.has(data.fromUserId)) return;
    showToast(`Private message from ${data.fromUserName}`, 'info');
    // Add to private messages panel
    const privateMessages = document.getElementById('private-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.innerHTML = `
        <div class="message-header">${data.fromUserName}</div>
        <div class="message-content">${formatMessage(data.message)}</div>
        <div class="message-time">${formatTime(data.timestamp)}</div>
    `;
    privateMessages.appendChild(messageDiv);
    privateMessages.scrollTop = privateMessages.scrollHeight;
});

socket.on('error', (message) => {
    showToast(message, 'error');
});

socket.on('kicked', () => {
    showToast('You have been kicked from the room', 'error');
    leaveRoom();
});

socket.on('force-mute', () => {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = false;
            isAudioEnabled = false;
            toggleAudioBtn.classList.add('muted');
        }
    }
    showToast('You have been muted by the host', 'warning');
});

socket.on('user-connection-status', (data) => {
    // Update connection status for remote users if needed
});

// WebRTC Functions
function createPeerConnection(userId, userName, isInitiator) {
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    const peerConnection = new RTCPeerConnection(configuration);

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.ontrack = (event) => {
        const remoteStream = event.streams[0];
        addVideoElement(userId, remoteStream, userName);
        updateConnectionStatus('connected');
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                target: userId
            });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'connected') {
            updateConnectionStatus('connected');
        } else if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            updateConnectionStatus('poor');
        }
    };

    peers.set(userId, peerConnection);

    if (isInitiator) {
        peerConnection.createOffer()
            .then(offer => peerConnection.setLocalDescription(offer))
            .then(() => {
                socket.emit('offer', {
                    offer: peerConnection.localDescription,
                    target: userId
                });
            })
            .catch(error => console.error('Error creating offer:', error));
    }
}

function addVideoElement(userId, stream, userName) {
    removeVideoElement(userId);

    const videoContainer = document.createElement('div');
    videoContainer.className = 'video-container';
    videoContainer.id = `video-${userId}`;

    const video = document.createElement('video');
    video.srcObject = stream;
    video.autoplay = true;
    video.playsInline = true;

    const label = document.createElement('div');
    label.className = 'video-label';
    label.innerHTML = `<span>${userName}</span>`;

    videoContainer.appendChild(video);
    videoContainer.appendChild(label);
    videoGrid.appendChild(videoContainer);
}

function removeVideoElement(userId) {
    const videoElement = document.getElementById(`video-${userId}`);
    if (videoElement) {
        videoElement.remove();
    }
}

function addChatMessage(userName, message, isOwn, timestamp, messageId, type = 'text', fileData = null, edited = false) {
    const id = messageId || `msg-${Date.now()}-${messageIdCounter++}`;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    messageDiv.dataset.messageId = id;

    const header = document.createElement('div');
    header.className = 'message-header';
    header.innerHTML = `<span>${sanitizeInput(userName)}</span>`;

    const actions = document.createElement('div');
    actions.className = 'message-actions';
    if (isOwn) {
        actions.innerHTML = `
            <button class="message-action-btn" onclick="editMessage('${id}')" title="Edit">✏️</button>
            <button class="message-action-btn" onclick="deleteMessage('${id}')" title="Delete">🗑️</button>
            <button class="message-action-btn" onclick="copyMessage('${id}')" title="Copy">📋</button>
        `;
    } else {
        actions.innerHTML = `
            <button class="message-action-btn" onclick="reactToMessage('${id}', '👍')" title="Like">👍</button>
            <button class="message-action-btn" onclick="reactToMessage('${id}', '❤️')" title="Love">❤️</button>
            <button class="message-action-btn" onclick="reactToMessage('${id}', '😂')" title="Laugh">😂</button>
            <button class="message-action-btn" onclick="copyMessage('${id}')" title="Copy">📋</button>
        `;
    }
    header.appendChild(actions);

    const content = document.createElement('div');
    content.className = 'message-content';
    
    if (type === 'image' && fileData) {
        content.innerHTML = `<img src="${fileData.data}" alt="${fileData.name}">`;
    } else if (type === 'file' && fileData) {
        content.innerHTML = `📎 ${sanitizeInput(fileData.name)} (${(fileData.size / 1024).toFixed(2)} KB)`;
    } else {
        content.innerHTML = formatMessage(message);
    }

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.innerHTML = `<span>${formatTime(timestamp)}</span>`;
    if (edited) {
        const editedSpan = document.createElement('span');
        editedSpan.className = 'message-edited';
        editedSpan.textContent = '(edited)';
        timeDiv.appendChild(editedSpan);
    }

    const reactionsDiv = document.createElement('div');
    reactionsDiv.className = 'message-reactions';

    messageDiv.appendChild(header);
    messageDiv.appendChild(content);
    messageDiv.appendChild(timeDiv);
    messageDiv.appendChild(reactionsDiv);

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    chatMessagesMap.set(id, { id, userName, message, timestamp, type, fileData, edited });
}

function createReactionsDiv(messageElement) {
    let reactionsDiv = messageElement.querySelector('.message-reactions');
    if (!reactionsDiv) {
        reactionsDiv = document.createElement('div');
        reactionsDiv.className = 'message-reactions';
        messageElement.appendChild(reactionsDiv);
    }
    return reactionsDiv;
}

function addReaction(reactionsDiv, reaction, userName) {
    const reactionBtn = document.createElement('button');
    reactionBtn.className = 'reaction';
    reactionBtn.textContent = `${reaction} ${userName}`;
    reactionsDiv.appendChild(reactionBtn);
}

// Message Actions (global functions for onclick handlers)
window.editMessage = function(messageId) {
    const msg = chatMessagesMap.get(messageId);
    if (msg) {
        const newMessage = prompt('Edit message:', msg.message);
        if (newMessage && newMessage.trim()) {
            socket.emit('edit-message', { messageId, newMessage: newMessage.trim() });
        }
    }
};

window.deleteMessage = function(messageId) {
    if (confirm('Delete this message?')) {
        socket.emit('delete-message', { messageId });
    }
};

window.copyMessage = function(messageId) {
    const msg = chatMessagesMap.get(messageId);
    if (msg) {
        navigator.clipboard.writeText(msg.message).then(() => {
            showToast('Message copied to clipboard', 'success');
        });
    }
};

window.reactToMessage = function(messageId, reaction) {
    socket.emit('message-reaction', { messageId, reaction });
};

function updateUsersList(users = null) {
    if (!users) {
        // Get from server
        return;
    }
    
    userCount.textContent = users.length;
    usersList.innerHTML = '';
    
    users.forEach(user => {
        if (blockedUsers.has(user.id)) return;
        
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.innerHTML = `
            <div class="user-item-info">
                <div class="user-status"></div>
                <span>${sanitizeInput(user.name)}</span>
            </div>
            <div class="user-actions">
                ${user.id !== socket.id ? `
                    <button class="user-action-btn" onclick="sendPrivateMessage('${user.id}', '${sanitizeInput(user.name)}')" title="Private Message">💬</button>
                    <button class="user-action-btn" onclick="blockUser('${user.id}')" title="Block">🚫</button>
                    <button class="user-action-btn" onclick="reportUser('${user.id}')" title="Report">⚠️</button>
                ` : ''}
            </div>
        `;
        usersList.appendChild(userItem);
    });
}

window.sendPrivateMessage = function(userId, userName) {
    const message = prompt(`Send private message to ${userName}:`);
    if (message && message.trim()) {
        socket.emit('private-message', { targetUserId: userId, message: message.trim() });
    }
};

window.blockUser = function(userId) {
    if (confirm('Block this user?')) {
        blockedUsers.add(userId);
        socket.emit('block-user', userId);
        showToast('User blocked', 'info');
        updateUsersList();
    }
};

window.reportUser = function(userId) {
    const reason = prompt('Reason for reporting:');
    if (reason && reason.trim()) {
        socket.emit('report-user', { userId, reason: reason.trim() });
        showToast('User reported', 'info');
    }
};

// Notifications
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Handle room from URL
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId) {
        roomIdInput.value = roomId;
    }
});
