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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create or join a room
  socket.on('join-room', (roomId, userName) => {
    socket.join(roomId);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: [] });
    }
    
    const room = rooms.get(roomId);
    room.users.push({ id: socket.id, name: userName });
    
    // Notify others in the room
    socket.to(roomId).emit('user-joined', { userId: socket.id, userName });
    
    // Send list of existing users to the new user
    const otherUsers = room.users.filter(user => user.id !== socket.id);
    socket.emit('existing-users', otherUsers);
    
    // Broadcast updated user list
    io.to(roomId).emit('users-updated', room.users);
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
    const room = Array.from(socket.rooms).find(room => room !== socket.id);
    if (room) {
      io.to(room).emit('chat-message', {
        userId: socket.id,
        userName: data.userName,
        message: data.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Toggle video/audio
  socket.on('toggle-media', (data) => {
    const room = Array.from(socket.rooms).find(room => room !== socket.id);
    if (room) {
      socket.to(room).emit('user-media-toggle', {
        userId: socket.id,
        video: data.video,
        audio: data.audio
      });
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove user from all rooms
    rooms.forEach((room, roomId) => {
      room.users = room.users.filter(user => user.id !== socket.id);
      
      if (room.users.length === 0) {
        rooms.delete(roomId);
      } else {
        io.to(roomId).emit('user-left', socket.id);
        io.to(roomId).emit('users-updated', room.users);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

