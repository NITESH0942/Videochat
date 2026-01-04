const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store rooms and users
const rooms = new Map();
const userMessageRates = new Map(); // Rate limiting
const blockedUsers = new Map(); // User blocking
const chatHistory = new Map(); // Chat history per room
const pinnedMessages = new Map(); // Pinned messages per room

// Input sanitization
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim()
    .substring(0, 500); // Max length
}

// Rate limiting
function checkRateLimit(socketId) {
  const now = Date.now();
  const window = 60000; // 1 minute
  const maxMessages = 30; // 30 messages per minute

  if (!userMessageRates.has(socketId)) {
    userMessageRates.set(socketId, []);
  }

  const messages = userMessageRates.get(socketId);
  const recentMessages = messages.filter(time => now - time < window);

  if (recentMessages.length >= maxMessages) {
    return false;
  }

  recentMessages.push(now);
  userMessageRates.set(socketId, recentMessages);
  return true;
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.data.isTyping = false;

  // Create or join a room
  socket.on('join-room', (roomId, userName, password, startWithVideo, startWithAudio) => {
    const sanitizedRoomId = sanitizeInput(roomId);
    const sanitizedUserName = sanitizeInput(userName);

    if (!rooms.has(sanitizedRoomId)) {
      // Create new room
      rooms.set(sanitizedRoomId, {
        users: [],
        password: password ? sanitizeInput(password) : null,
        host: socket.id,
        createdAt: Date.now()
      });
      chatHistory.set(sanitizedRoomId, []);
      pinnedMessages.set(sanitizedRoomId, null);
    }

    const room = rooms.get(sanitizedRoomId);
    
    // Check password
    if (room.password && room.password !== sanitizeInput(password)) {
      socket.emit('join-error', 'Invalid room password');
      return;
    }

    socket.join(sanitizedRoomId);
    socket.data.roomId = sanitizedRoomId;
    socket.data.userName = sanitizedUserName;
    socket.data.isHost = room.host === socket.id;
    socket.data.startWithVideo = startWithVideo;
    socket.data.startWithAudio = startWithAudio;
    
    room.users.push({ id: socket.id, name: sanitizedUserName });
    
    // Send chat history
    if (chatHistory.has(sanitizedRoomId)) {
      socket.emit('chat-history', chatHistory.get(sanitizedRoomId));
      if (pinnedMessages.has(sanitizedRoomId) && pinnedMessages.get(sanitizedRoomId)) {
        socket.emit('pinned-message', pinnedMessages.get(sanitizedRoomId));
      }
    }
    
    // Notify others in the room
    socket.to(sanitizedRoomId).emit('user-joined', { userId: socket.id, userName: sanitizedUserName });
    
    // Send list of existing users to the new user
    const otherUsers = room.users.filter(user => user.id !== socket.id);
    socket.emit('existing-users', otherUsers);
    
    // Broadcast updated user list
    io.to(sanitizedRoomId).emit('users-updated', room.users);
  });

  // Create room with password
  socket.on('create-room', (roomName, password) => {
    const roomId = uuidv4().substring(0, 8);
    const sanitizedRoomName = sanitizeInput(roomName);
    rooms.set(roomId, {
      users: [],
      password: password ? sanitizeInput(password) : null,
      host: socket.id,
      name: sanitizedRoomName,
      createdAt: Date.now()
    });
    chatHistory.set(roomId, []);
    pinnedMessages.set(roomId, null);
    socket.emit('room-created', { roomId, roomName: sanitizedRoomName });
  });

  // WebRTC signaling - offer
  socket.on('offer', (data) => {
    socket.to(data.target).emit('offer', {
      offer: data.offer,
      sender: socket.id
    });
  });

  // WebRTC signaling - answer
  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      sender: socket.id
    });
  });

  // WebRTC signaling - ICE candidate
  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: socket.id
    });
  });

  // Live chat message
  socket.on('chat-message', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    // Rate limiting
    if (!checkRateLimit(socket.id)) {
      socket.emit('error', 'Message rate limit exceeded. Please slow down.');
      return;
    }

    const sanitizedMessage = sanitizeInput(data.message);
    if (!sanitizedMessage) return;

    const messageData = {
      id: uuidv4(),
      userId: socket.id,
      userName: socket.data.userName || sanitizeInput(data.userName),
      message: sanitizedMessage,
      timestamp: new Date().toISOString(),
      type: data.type || 'text',
      fileData: data.fileData || null,
      edited: false
    };

    // Store in history
    if (!chatHistory.has(roomId)) {
      chatHistory.set(roomId, []);
    }
    const history = chatHistory.get(roomId);
    history.push(messageData);
    if (history.length > 1000) history.shift(); // Limit history

    io.to(roomId).emit('chat-message', messageData);
  });

  // Typing indicator
  socket.on('typing', (isTyping) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.data.isTyping = isTyping;
    socket.to(roomId).emit('user-typing', {
      userId: socket.id,
      userName: socket.data.userName,
      isTyping
    });
  });

  // Message reactions
  socket.on('message-reaction', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    io.to(roomId).emit('message-reaction', {
      messageId: data.messageId,
      userId: socket.id,
      userName: socket.data.userName,
      reaction: data.reaction
    });
  });

  // Edit message
  socket.on('edit-message', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId || !chatHistory.has(roomId)) return;

    const history = chatHistory.get(roomId);
    const message = history.find(m => m.id === data.messageId && m.userId === socket.id);
    
    if (message) {
      message.message = sanitizeInput(data.newMessage);
      message.edited = true;
      io.to(roomId).emit('message-edited', {
        messageId: data.messageId,
        newMessage: message.message
      });
    }
  });

  // Delete message
  socket.on('delete-message', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId || !chatHistory.has(roomId)) return;

    const history = chatHistory.get(roomId);
    const messageIndex = history.findIndex(m => m.id === data.messageId && m.userId === socket.id);
    
    if (messageIndex !== -1) {
      history.splice(messageIndex, 1);
      io.to(roomId).emit('message-deleted', { messageId: data.messageId });
    }
  });

  // Pin message (host only)
  socket.on('pin-message', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId || !socket.data.isHost) return;

    pinnedMessages.set(roomId, data.messageId);
    io.to(roomId).emit('message-pinned', { messageId: data.messageId });
  });

  // Unpin message (host only)
  socket.on('unpin-message', () => {
    const roomId = socket.data.roomId;
    if (!roomId || !socket.data.isHost) return;

    pinnedMessages.set(roomId, null);
    io.to(roomId).emit('message-unpinned');
  });

  // Private message
  socket.on('private-message', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const sanitizedMessage = sanitizeInput(data.message);
    if (!sanitizedMessage) return;

    // Check if blocked
    if (blockedUsers.has(data.targetUserId) && blockedUsers.get(data.targetUserId).has(socket.id)) {
      return;
    }

    socket.to(data.targetUserId).emit('private-message', {
      fromUserId: socket.id,
      fromUserName: socket.data.userName,
      message: sanitizedMessage,
      timestamp: new Date().toISOString()
    });
  });

  // Block user
  socket.on('block-user', (targetUserId) => {
    if (!blockedUsers.has(socket.id)) {
      blockedUsers.set(socket.id, new Set());
    }
    blockedUsers.get(socket.id).add(targetUserId);
    socket.emit('user-blocked', { userId: targetUserId });
  });

  // Unblock user
  socket.on('unblock-user', (targetUserId) => {
    if (blockedUsers.has(socket.id)) {
      blockedUsers.get(socket.id).delete(targetUserId);
      socket.emit('user-unblocked', { userId: targetUserId });
    }
  });

  // Report user
  socket.on('report-user', (data) => {
    const roomId = socket.data.roomId;
    console.log(`User ${socket.id} reported ${data.userId} in room ${roomId}: ${data.reason}`);
    // In production, save to database or send notification
    socket.emit('user-reported', { userId: data.userId });
  });

  // Kick user (host only)
  socket.on('kick-user', (targetUserId) => {
    const roomId = socket.data.roomId;
    if (!roomId || !socket.data.isHost) return;

    const room = rooms.get(roomId);
    if (room) {
      room.users = room.users.filter(user => user.id !== targetUserId);
      io.to(targetUserId).emit('kicked');
      socket.to(roomId).emit('user-kicked', { userId: targetUserId });
      io.to(roomId).emit('users-updated', room.users);
    }
  });

  // Mute user (host only)
  socket.on('mute-user', (targetUserId) => {
    const roomId = socket.data.roomId;
    if (!roomId || !socket.data.isHost) return;
    io.to(targetUserId).emit('force-mute');
  });

  // Toggle video/audio
  socket.on('toggle-media', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('user-media-toggle', {
      userId: socket.id,
      video: data.video,
      audio: data.audio
    });
  });

  // Screen sharing status
  socket.on('screen-share-status', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('screen-share-status', {
      userId: socket.id,
      isSharing: data.isSharing
    });
  });

  // Connection status
  socket.on('connection-status', (data) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    socket.to(roomId).emit('user-connection-status', {
      userId: socket.id,
      status: data.status
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    const roomId = socket.data.roomId;
    
    // Remove user from all rooms
    rooms.forEach((room, roomIdKey) => {
      room.users = room.users.filter(user => user.id !== socket.id);
      
      // Transfer host if host left
      if (room.host === socket.id && room.users.length > 0) {
        room.host = room.users[0].id;
        io.to(room.host).emit('made-host');
      }
      
      if (room.users.length === 0) {
        rooms.delete(roomIdKey);
        chatHistory.delete(roomIdKey);
        pinnedMessages.delete(roomIdKey);
      } else {
        io.to(roomIdKey).emit('user-left', socket.id);
        io.to(roomIdKey).emit('users-updated', room.users);
      }
    });

    // Cleanup
    userMessageRates.delete(socket.id);
    blockedUsers.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
