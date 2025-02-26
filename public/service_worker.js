self.addEventListener('push', event => {
    const data = event.data.json();
    console.log('Push received:', data);
    
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon.png',
      badge: '/badge.png',
      data: data.data || {}
    });
  });
  
  self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    // This looks to see if the current is already open and focuses it
    event.waitUntil(
      clients.matchAll({
        type: 'window'
      }).then(clientList => {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  });
  
  // Add this to your main client JavaScript file (public/script.js or whatever your main JS file is)
  // This should be the file that handles your chat functionality
  
  // Function to register service worker and subscribe to push notifications
  async function registerForPushNotifications(username) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push notifications not supported in this browser');
      return;
    }
    
    try {
      // Register service worker
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('Service Worker registered');
      
      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();
      
      // If no subscription exists, create one
      if (!subscription) {
        // Get the server's public key
        const publicVapidKey = 'BLG7-_eDSQ1dvP_nL1atFQvgRgxaLE_v7Ny1HyQNlPUEPXalExW3MmzN6SNdYkm6B8GtuIPqrXIl5qXvnv6ocVY';
        
        // Subscribe the user
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
        });
        
        console.log('Push Notification subscription created');
      }
      
      // Send the subscription to your server
      await fetch('/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          subscription: subscription,
          username: username
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Push notification subscription sent to server');
      return true;
      
    } catch (error) {
      console.error('Error registering for push notifications:', error);
      return false;
    }
  }
  
  // Convert base64 string to Uint8Array
  // This is needed for the applicationServerKey
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
  
  // Add this code to your join success handler
  socket.on('join success', (data) => {
    // Your existing join success code
    
    // After successful login, register for push notifications
    registerForPushNotifications(data.username)
      .then(success => {
        if (success) {
          console.log('Successfully registered for push notifications');
        } else {
          console.log('Failed to register for push notifications');
        }
      });
  });