const socket = io();

let localStream = null;
let peers = new Map();
let currentRoomId = null;
let userName = '';
let isVideoEnabled = true;
let isAudioEnabled = true;

const joinScreen = document.getElementById('join-screen');
const chatScreen = document.getElementById('chat-screen');
const userNameInput = document.getElementById('user-name');
const roomIdInput = document.getElementById('room-id');
const joinBtn = document.getElementById('join-btn');
const leaveBtn = document.getElementById('leave-btn');
const roomDisplay = document.getElementById('room-display');
const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('local-video');
const localName = document.getElementById('local-name');
const toggleVideoBtn = document.getElementById('toggle-video');
const toggleAudioBtn = document.getElementById('toggle-audio');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');

// Generate random room ID if not provided
function generateRoomId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Join room
joinBtn.addEventListener('click', async () => {
    userName = userNameInput.value.trim();
    if (!userName) {
        alert('Please enter your name');
        return;
    }

    currentRoomId = roomIdInput.value.trim() || generateRoomId();
    roomDisplay.textContent = currentRoomId;
    localName.textContent = userName;

    try {
        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localVideo.srcObject = localStream;
        joinScreen.classList.add('hidden');
        chatScreen.classList.remove('hidden');

        // Join room via socket
        socket.emit('join-room', currentRoomId, userName);
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Error accessing camera/microphone. Please allow permissions.');
    }
});

// Leave room
leaveBtn.addEventListener('click', () => {
    leaveRoom();
});

function leaveRoom() {
    // Stop local stream
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Close all peer connections
    peers.forEach(peer => {
        peer.close();
    });
    peers.clear();

    // Clear video grid (except local video)
    const remoteVideos = videoGrid.querySelectorAll('.video-container:not(:first-child)');
    remoteVideos.forEach(video => video.remove());

    // Leave socket room
    socket.disconnect();
    socket.connect();

    // Return to join screen
    chatScreen.classList.add('hidden');
    joinScreen.classList.remove('hidden');
    chatMessages.innerHTML = '';
    currentRoomId = null;
    userName = '';
    roomIdInput.value = '';
    userNameInput.value = '';
}

// Toggle video
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

// Toggle audio
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

// Send chat message
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

function sendMessage() {
    const message = chatInput.value.trim();
    if (message && userName) {
        socket.emit('chat-message', {
            userName: userName,
            message: message
        });
        chatInput.value = '';
    }
}

// Socket event handlers
socket.on('existing-users', (users) => {
    users.forEach(user => {
        createPeerConnection(user.id, user.name, true);
    });
});

socket.on('user-joined', async (data) => {
    createPeerConnection(data.userId, data.userName, false);
});

socket.on('user-left', (userId) => {
    if (peers.has(userId)) {
        peers.get(userId).close();
        peers.delete(userId);
        removeVideoElement(userId);
    }
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
        await peerConnection.addIceCandidate(data.candidate);
    }
});

socket.on('chat-message', (data) => {
    addChatMessage(data.userName, data.message, data.userId === socket.id, data.timestamp);
});

socket.on('user-media-toggle', (data) => {
    // Handle remote user media toggle if needed
    console.log('User media toggle:', data);
});

// WebRTC functions
function createPeerConnection(userId, userName, isInitiator) {
    const configuration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    const peerConnection = new RTCPeerConnection(configuration);

    // Add local stream tracks
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
        const remoteStream = event.streams[0];
        addVideoElement(userId, remoteStream, userName);
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                target: userId
            });
        }
    };

    peers.set(userId, peerConnection);

    // Create and send offer if initiator
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
    // Remove existing video if any
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

function addChatMessage(userName, message, isOwn, timestamp) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;

    const header = document.createElement('div');
    header.className = 'message-header';
    header.textContent = userName;

    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = message;

    const time = document.createElement('div');
    time.className = 'message-time';
    const date = new Date(timestamp);
    time.textContent = date.toLocaleTimeString();

    messageDiv.appendChild(header);
    messageDiv.appendChild(content);
    messageDiv.appendChild(time);

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

