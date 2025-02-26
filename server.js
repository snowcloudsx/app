// server.js
const notificationapi = require('notificationapi-node-server-sdk').default;
const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const webpush = require('web-push'); // Add web-push package
const bodyParser = require('body-parser');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Body parser middleware
app.use(bodyParser.json());

// VAPID keys for web push - you should generate your own
const publicVapidKey = 'BLYzhJqi5ClM66GnrFhmZ1gbkyZgPnDdYiIbcfBfKutlo0fbkOKDhLCovwLviD2hS3sA4TMMoYyfPGIOQVzG5dk';
const privateVapidKey = 'ejXGbsD_v84bwfxZCb-RuDKTHJWpGDzLaYuIDVTtm90'; // Replace with your private key

// Set VAPID details
webpush.setVapidDetails(
  'mailto:peregrine.asbell@rsu35.org',
  publicVapidKey,
  privateVapidKey
);

// Store user push subscriptions
const userSubscriptions = {};

function initNoti() {
  notificationapi.init(
    '7ek7cs4sow9pqewmd2rmu976ez', // clientId
    'qjxstjec3cp03nynqygywer6gf9assg52uyae2iwh0xh1tr7gi0a8q7ut5' // clientSecret
  )
  
  notificationapi.send({
    notificationId: 'you_ve_received_a_message_',
    user: {
      id: "peregrine.asbell@rsu35.org",
      email: "peregrine.asbell@rsu35.org",
      number: "+15005550006" // Replace with your phone number, use format [+][country code][area code][local number]
    },
    mergeTags: {
      "Message": "testMessage",
      "commentId": "testCommentId"
    }
  })
}

initNoti();

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Route for the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to subscribe to push notifications
app.post('/subscribe', (req, res) => {
  const subscription = req.body.subscription;
  const username = req.body.username;
  
  // Store the subscription with the username
  userSubscriptions[username] = subscription;
  
  console.log(`User ${username} subscribed to push notifications`);
  res.status(201).json({});
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
        
        // Send push notification for mention if user has subscribed
        if (userSubscriptions[mention]) {
          const payload = JSON.stringify({
            title: 'You were mentioned!',
            body: `${socket.username} mentioned you: ${data.content.substring(0, 50)}${data.content.length > 50 ? '...' : ''}`,
            icon: '/icon.png',
            url: '/'
          });
          
          webpush.sendNotification(userSubscriptions[mention], payload)
            .catch(err => console.error(`Error sending push notification to ${mention}:`, err));
        }
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
      io.to(recipientSocketId).emit('private message', {
        ...message,
        from: socket.username
      });
      console.log(`Private message from ${socket.username} to ${data.to}: ${data.content}`);

      // Send NotificationAPI notification
      notificationapi.send({
        notificationId: 'private_message_received',
        user: {
          id: data.to,
          email: `peregrine.asbell@rsu35.org`, // Replace with actual recipient email or make dynamic
        },
        mergeTags: {
          "Sender": socket.username,
          "Message": data.content
        }
      });
      
      // Send push notification if user has subscribed
      if (userSubscriptions[data.to]) {
        const payload = JSON.stringify({
          title: `New message from ${socket.username}`,
          body: `${data.content.substring(0, 50)}${data.content.length > 50 ? '...' : ''}`,
          icon: '/icon.png',
          url: '/',
          data: {
            sender: socket.username,
            messagePreview: data.content
          }
        });
        
        webpush.sendNotification(userSubscriptions[data.to], payload)
          .catch(err => console.error(`Error sending push notification to ${data.to}:`, err));
      }
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