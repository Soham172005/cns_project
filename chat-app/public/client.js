// ============================================
// CHAT APPLICATION - CLIENT (public/client.js)
// ============================================
// Complete client-side JavaScript with RSA encryption
// ============================================

let socket;
let currentUser = null;
let rsaKeyPair = null;
let onlineUsers = new Map();
let typingTimeouts = new Map();
let messageBuffer = [];

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkExistingSession();
});

function setupEventListeners() {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
  document.getElementById('messageInput').addEventListener('input', handleTyping);
  document.getElementById('messageInput').addEventListener('blur', handleStoppedTyping);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
}

function handleLogin(e) {
  e.preventDefault();
  
  const username = document.getElementById('usernameInput').value.trim();
  
  if (!username || username.length < 2) {
    showAlert('Username must be at least 2 characters long', 'error');
    return;
  }

  if (username.length > 30) {
    showAlert('Username must be less than 30 characters', 'error');
    return;
  }

  generateRSAKeys().then(() => {
    initializeSocket();
    socket.emit('user_login', {
      username: username,
      publicKey: rsaKeyPair.publicKey
    });
    currentUser = { username };
    
    setTimeout(() => {
      document.getElementById('loginSection').classList.add('hidden');
      document.getElementById('chatSection').classList.remove('hidden');
      document.getElementById('currentUserBadge').innerHTML = 
        `<span class="user-badge">You: ${username}</span>`;
      document.getElementById('messageInput').focus();
    }, 500);
  }).catch(error => {
    console.error('Failed to generate RSA keys:', error);
    showAlert('Failed to initialize encryption', 'error');
  });
}

function generateRSAKeys() {
  return new Promise((resolve, reject) => {
    try {
      const encryptor = new JSEncrypt({ default_key_size: 2048 });
      
      rsaKeyPair = {
        publicKey: encryptor.getPublicKey(),
        privateKey: encryptor.getPrivateKey(),
        encryptor: encryptor
      };

      console.log('✓ RSA-2048 key pair generated successfully');
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function initializeSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('✓ Connected to server:', socket.id);
    showAlert('Connected to chat server', 'success');
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    showAlert('Connection error: ' + error, 'error');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
    showAlert('Disconnected from server', 'warning');
  });

  socket.on('user_connected', (data) => {
    const { userId, username, totalUsers } = data;
    if (userId !== socket.id) {
      showAlert(`${username} joined the chat`, 'info');
    }
    document.getElementById('totalUsers').textContent = totalUsers;
  });

  socket.on('user_disconnected', (data) => {
    const { username, totalUsers } = data;
    showAlert(`${username} left the chat`, 'info');
    onlineUsers.delete(data.userId);
    updateUsersList();
    document.getElementById('totalUsers').textContent = totalUsers;
  });

  socket.on('online_users', (data) => {
    onlineUsers.clear();
    data.users.forEach(user => {
      onlineUsers.set(user.id, user);
    });
    updateUsersList();
  });

  socket.on('receive_message', (data) => {
    const { sender, encryptedMessage, timestamp } = data;
    decryptAndDisplayMessage(sender.username, encryptedMessage, timestamp, true);
  });

  socket.on('message_history', (data) => {
    const { messages } = data;
    messages.forEach(msg => {
      const { sender, encryptedMessage, timestamp } = msg;
      decryptAndDisplayMessage(sender.username, encryptedMessage, timestamp, true);
    });
  });

  socket.on('message_sent', (data) => {
    console.log('✓ Message delivered:', data.messageId);
  });

  socket.on('user_typing', (data) => {
    const { username, userId } = data;
    showTypingIndicator(username);
  });

  socket.on('user_stopped_typing', (data) => {
    hideTypingIndicator();
  });

  socket.on('error', (data) => {
    console.error('Socket error:', data);
    showAlert('Error: ' + data.message, 'error');
  });

  setInterval(() => {
    if (socket.connected) {
      socket.emit('ping');
    }
  }, 30000);
}

function sendMessage() {
  const messageInput = document.getElementById('messageInput');
  const message = messageInput.value.trim();
  const recipientSelect = document.getElementById('recipientSelect');
  const recipientId = recipientSelect.value || null;

  if (!message) {
    showAlert('Please enter a message', 'warning');
    return;
  }

  if (!socket || !socket.connected) {
    showAlert('Not connected to server', 'error');
    return;
  }

  try {
    const encryptedMessage = encryptMessage(message);
    
    if (!encryptedMessage) {
      showAlert('Failed to encrypt message', 'error');
      return;
    }

    socket.emit('send_message', {
      encryptedMessage: encryptedMessage,
      recipientId: recipientId,
      senderUsername: currentUser.username,
      timestamp: new Date().toISOString()
    });

    displaySentMessage(message);
    messageInput.value = '';
    messageInput.focus();
    handleStoppedTyping();
  } catch (error) {
    console.error('Error sending message:', error);
    showAlert('Failed to send message', 'error');
  }
}

function encryptMessage(message) {
  try {
    if (!onlineUsers.size) {
      console.warn('No recipients available');
      return message;
    }

    const recipient = Array.from(onlineUsers.values())[0];
    if (!recipient || !recipient.publicKey) {
      return message;
    }

    const encryptor = new JSEncrypt();
    encryptor.setPublicKey(recipient.publicKey);
    const encrypted = encryptor.encrypt(message);
    
    console.log('✓ Message encrypted with RSA-2048');
    return encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    return null;
  }
}

function decryptMessage(encryptedMessage) {
  try {
    if (!rsaKeyPair || !rsaKeyPair.privateKey) {
      console.error('Private key not available');
      return null;
    }

    const decryptor = new JSEncrypt();
    decryptor.setPrivateKey(rsaKeyPair.privateKey);
    const decrypted = decryptor.decrypt(encryptedMessage);
    
    if (!decrypted) {
      console.warn('Decryption resulted in empty message');
      return null;
    }

    console.log('✓ Message decrypted successfully');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

function displaySentMessage(message) {
  const container = document.getElementById('messagesContainer');
  const time = formatTime(new Date());
  
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message-bubble sent-message rounded-lg p-3';
  messageDiv.innerHTML = `
    <div class="flex justify-between items-end gap-2">
      <span>${escapeHtml(message)}</span>
      <span class="text-xs opacity-70">${time}</span>
    </div>
  `;
  
  container.appendChild(messageDiv);
  container.scrollTop = container.scrollHeight;
}

function decryptAndDisplayMessage(senderName, encryptedMessage, timestamp, isReceived = false) {
  const decrypted = decryptMessage(encryptedMessage);
  
  if (!decrypted && isReceived) {
    console.warn('Failed to decrypt message');
    return;
  }

  const container = document.getElementById('messagesContainer');
  const time = formatTime(new Date(timestamp));
  const displayMessage = decrypted || '[Unable to decrypt]';

  const messageDiv = document.createElement('div');
  messageDiv.className = 'message-bubble rounded-lg p-3 ' + 
    (isReceived ? 'received-message' : 'sent-message');
  
  messageDiv.innerHTML = `
    <div class="flex justify-between items-start gap-2 mb-1">
      <span class="font-semibold text-sm">${escapeHtml(senderName)}</span>
      <span class="text-xs opacity-70">${time}</span>
    </div>
    <div>${escapeHtml(displayMessage)}</div>
  `;
  
  container.appendChild(messageDiv);
  container.scrollTop = container.scrollHeight;
}

function handleTyping() {
  if (!socket || !socket.connected) return;
  socket.emit('user_typing', {});
}

function handleStoppedTyping() {
  if (!socket || !socket.connected) return;
  socket.emit('user_stopped_typing', {});
}

function showTypingIndicator(username) {
  const indicator = document.getElementById('typingIndicator');
  const typingText = document.getElementById('typingText');
  
  typingText.textContent = `${username} is typing...`;
  indicator.classList.remove('hidden');
  
  if (typingTimeouts.has(username)) {
    clearTimeout(typingTimeouts.get(username));
  }
  
  const timeout = setTimeout(() => {
    hideTypingIndicator();
  }, 3000);
  
  typingTimeouts.set(username, timeout);
}

function hideTypingIndicator() {
  document.getElementById('typingIndicator').classList.add('hidden');
}

function updateUsersList() {
  const usersList = document.getElementById('usersList');
  const recipientSelect = document.getElementById('recipientSelect');
  
  usersList.innerHTML = '';
  recipientSelect.innerHTML = '<option value="">Everyone (Group Message)</option>';
  
  if (onlineUsers.size === 0) {
    usersList.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">No other users online</p>';
    return;
  }

  onlineUsers.forEach((user, userId) => {
    if (userId !== socket.id) {
      const userDiv = document.createElement('div');
      userDiv.className = 'p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg cursor-pointer hover:shadow-md transition';
      userDiv.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="status-indicator status-online"></span>
          <span class="font-semibold text-gray-800">${escapeHtml(user.username)}</span>
        </div>
      `;
      usersList.appendChild(userDiv);

      const option = document.createElement('option');
      option.value = userId;
      option.textContent = user.username;
      recipientSelect.appendChild(option);
    }
  });

  document.getElementById('totalUsers').textContent = onlineUsers.size;
}

function handleLogout() {
  if (socket) {
    socket.disconnect();
  }
  
  currentUser = null;
  rsaKeyPair = null;
  onlineUsers.clear();
  messageBuffer = [];
  
  document.getElementById('chatSection').classList.add('hidden');
  document.getElementById('loginSection').classList.remove('hidden');
  document.getElementById('messagesContainer').innerHTML = '';
  document.getElementById('usernameInput').value = '';
  document.getElementById('messageInput').value = '';
  document.getElementById('usernameInput').focus();
  
  showAlert('Logged out successfully', 'info');
}

function checkExistingSession() {
  if (sessionStorage.getItem('chatUsername')) {
  }
}

function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showAlert(message, type = 'info') {
  const alert = document.createElement('div');
  const bgColor = type === 'error' ? 'bg-red-500' : 
                  type === 'success' ? 'bg-green-500' : 
                  type === 'warning' ? 'bg-yellow-500' : 'bg-blue-500';
  
  alert.className = `fixed top-4 right-4 text-white px-6 py-3 rounded-lg shadow-lg ${bgColor} z-50 animate-pulse`;
  alert.textContent = message;
  
  document.body.appendChild(alert);
  
  setTimeout(() => {
    alert.remove();
  }, 4000);
}

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});
