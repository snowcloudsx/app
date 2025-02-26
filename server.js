const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Route for the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Store users and messages
let users = [];
const publicMessages = [];
const userSockets = {};

io.on('connection', (socket) => {
  console.log('New client connected');
  
  // Handle user joining
  socket.on('join', (username) => {
    // Check if username is taken
    if (users.includes(username)) {
      // Send error to client
      socket.emit('join error', { message: 'Username is already taken' });
      return;
    }
    
    // Add user to users array
    users.push(username);
    userSockets[username] = socket.id;
    
    // Join success
    socket.emit('join success', { 
      username, 
      users,
      publicMessages: publicMessages.slice(-50) // Send last 50 messages
    });
    
    // Notify other users
    socket.broadcast.emit('user joined', { username, users });
    
    // Store username in socket session
    socket.username = username;
    
    console.log(`${username} joined the chat`);
  });
  
  // Handle public messages
  socket.on('public message', (data) => {
    if (!socket.username) return;
    
    // Check for @mentions for notifications
    const mentionRegex = /@(\w+)/g;
    const mentions = [...data.content.matchAll(mentionRegex)].map(match => match[1]);
    
    const message = {
      sender: socket.username,
      content: data.content,
      timestamp: new Date().toISOString()
    };
    
    // Store message
    publicMessages.push(message);
    
    // Broadcast message to all clients
    io.emit('public message', message);
    
    // If there are mentions, send notifications
    mentions.forEach(mention => {
      const mentionSocketId = userSockets[mention];
      if (mentionSocketId) {
        io.to(mentionSocketId).emit('mention', {
          sender: socket.username,
          content: data.content
        });
      }
    });
    
    console.log(`Public message from ${socket.username}: ${data.content}`);
  });
  
  // Handle private messages
  socket.on('private message', (data) => {
    if (!socket.username) return;
    
    const message = {
      sender: socket.username,
      content: data.content,
      timestamp: new Date().toISOString()
    };
    
    // Get recipient's socket id
    const recipientSocketId = userSockets[data.to];
    
    // Send message to recipient
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('private message', message);
      console.log(`Private message from ${socket.username} to ${data.to}: ${data.content}`);
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    if (socket.username) {
      // Remove user from users array
      users = users.filter(user => user !== socket.username);
      delete userSockets[socket.username];
      
      // Notify other users
      socket.broadcast.emit('user left', { username: socket.username, users });
      
      console.log(`${socket.username} left the chat`);
    }
    
    console.log('Client disconnected');
  });
});

// Start server
const PORT = process.env.PORT || 1337;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});