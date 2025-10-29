// ============================================
// CHAT APPLICATION - SERVER (server.js)
// ============================================
// Complete production-ready Node.js Express Server
// with Socket.IO for real-time messaging
// ============================================

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(express.static('public'));
app.use(express.json());
app.use(cors());

// ===== IN-MEMORY DATA STORAGE =====
const users = new Map(); // Store active users
const userSessions = new Map(); // Map socketId to userId
const messageHistory = []; // Store message history

// ===== ROUTES =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to get message history
app.get('/api/messages', (req, res) => {
  res.json(messageHistory.slice(-50)); // Send last 50 messages
});

// API endpoint to get online users
app.get('/api/users', (req, res) => {
  const userList = Array.from(users.values()).map(user => ({
    id: user.id,
    username: user.username,
    status: 'online'
  }));
  res.json(userList);
});

// ===== SOCKET.IO EVENT HANDLERS =====
io.on('connection', (socket) => {
  console.log(`[${new Date().toLocaleTimeString()}] New client connected: ${socket.id}`);

  // ===== USER REGISTRATION =====
  socket.on('user_login', (data) => {
    const { username, publicKey } = data;
    
    if (!username || !publicKey) {
      socket.emit('error', { message: 'Username and public key required' });
      return;
    }

    const userId = socket.id;
    const user = {
      id: userId,
      username: username.trim(),
      publicKey: publicKey,
      socketId: socket.id,
      connectedAt: new Date()
    };

    users.set(userId, user);
    userSessions.set(socket.id, userId);

    console.log(`[${new Date().toLocaleTimeString()}] User logged in: ${username} (${userId})`);

    // Notify all clients about new user
    io.emit('user_connected', {
      userId: userId,
      username: username,
      timestamp: new Date().toISOString(),
      totalUsers: users.size
    });

    // Send current online users to the new user
    socket.emit('online_users', {
      users: Array.from(users.values()).map(u => ({
        id: u.id,
        username: u.username,
        publicKey: u.publicKey
      }))
    });

    // Send message history to new user
    socket.emit('message_history', {
      messages: messageHistory.slice(-30) // Last 30 messages
    });
  });

  // ===== MESSAGE SENDING =====
  socket.on('send_message', (data) => {
    const { encryptedMessage, recipientId, senderUsername } = data;
    const senderId = userSessions.get(socket.id);

    if (!senderId) {
      socket.emit('error', { message: 'User not authenticated' });
      return;
    }

    const sender = users.get(senderId);
    if (!sender) {
      socket.emit('error', { message: 'Sender not found' });
      return;
    }

    const messageObj = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sender: {
        id: senderId,
        username: senderUsername || sender.username
      },
      encryptedMessage: encryptedMessage,
      timestamp: new Date().toISOString(),
      type: 'direct'
    };

    // Store message history
    messageHistory.push(messageObj);
    if (messageHistory.length > 100) {
      messageHistory.shift(); // Keep only last 100 messages
    }

    // Send to specific recipient if direct message
    if (recipientId) {
      const recipient = users.get(recipientId);
      if (recipient) {
        io.to(recipient.socketId).emit('receive_message', messageObj);
        socket.emit('message_sent', {
          messageId: messageObj.id,
          timestamp: messageObj.timestamp
        });
      } else {
        socket.emit('error', { message: 'Recipient not found' });
      }
    } else {
      // Broadcast to all users (group message)
      io.emit('receive_message', messageObj);
      socket.emit('message_sent', {
        messageId: messageObj.id,
        timestamp: messageObj.timestamp
      });
    }

    console.log(`[${new Date().toLocaleTimeString()}] Message from ${sender.username}: ${encryptedMessage.substring(0, 20)}...`);
  });

  // ===== TYPING INDICATOR =====
  socket.on('user_typing', (data) => {
    const senderId = userSessions.get(socket.id);
    if (senderId) {
      const sender = users.get(senderId);
      socket.broadcast.emit('user_typing', {
        userId: senderId,
        username: sender.username
      });
    }
  });

  socket.on('user_stopped_typing', (data) => {
    const senderId = userSessions.get(socket.id);
    if (senderId) {
      socket.broadcast.emit('user_stopped_typing', {
        userId: senderId
      });
    }
  });

  // ===== DISCONNECT HANDLER =====
  socket.on('disconnect', () => {
    const userId = userSessions.get(socket.id);
    if (userId) {
      const user = users.get(userId);
      if (user) {
        console.log(`[${new Date().toLocaleTimeString()}] User disconnected: ${user.username} (${userId})`);
        users.delete(userId);
        
        // Notify all clients about user disconnection
        io.emit('user_disconnected', {
          userId: userId,
          username: user.username,
          timestamp: new Date().toISOString(),
          totalUsers: users.size
        });
      }
      userSessions.delete(socket.id);
    }
  });

  // ===== ERROR HANDLING =====
  socket.on('error', (error) => {
    console.error(`[${new Date().toLocaleTimeString()}] Socket error: ${error}`);
  });

  // ===== PING HANDLER (Keep-alive) =====
  socket.on('ping', () => {
    socket.emit('pong');
  });
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

// ===== START SERVER =====
server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║  CHAT APPLICATION SERVER STARTED        ║`);
  console.log(`║  Port: ${PORT}${' '.repeat(32 - PORT.toString().length)}║`);
  console.log(`║  URL: http://localhost:${PORT}${' '.repeat(28 - PORT.toString().length)}║`);
  console.log(`║  WebSocket: ws://localhost:${PORT}${' '.repeat(22 - PORT.toString().length)}║`);
  console.log(`╚══════════════════════════════════════════╝\n`);
  console.log(`Server is ready for connections...`);
  console.log(`Press Ctrl+C to stop the server\n`);
});

// ===== UNHANDLED ERROR HANDLER =====
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
