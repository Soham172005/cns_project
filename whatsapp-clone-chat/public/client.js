const socket = io();

// KEY: Exactly 32 ASCII characters, SAME everywhere
const ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz123456'; // 32 chars

let currentUsername = '', typingTimer, isTyping = false;

function encryptMessage(message) {
    const key = CryptoJS.enc.Utf8.parse(ENCRYPTION_KEY);
    const iv = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(message, key, { iv: iv, mode: CryptoJS.mode.CBC });
    return JSON.stringify({
        iv: CryptoJS.enc.Base64.stringify(iv),
        ct: encrypted.ciphertext.toString(CryptoJS.enc.Base64)
    });
}
function decryptMessage(encPayload) {
    try {
        const payload = JSON.parse(encPayload);
        const key = CryptoJS.enc.Utf8.parse(ENCRYPTION_KEY);
        const iv = CryptoJS.enc.Base64.parse(payload.iv);
        const ciphertext = CryptoJS.enc.Base64.parse(payload.ct);
        const decrypted = CryptoJS.AES.decrypt({ ciphertext }, key, { iv, mode: CryptoJS.mode.CBC });
        const result = decrypted.toString(CryptoJS.enc.Utf8);
        return result || '[Decryption Failed - Empty Result]';
    } catch(err) {
        return '[Decryption Failed]';
    }
}

// Event bindings
document.getElementById('joinButton').onclick = joinChat;
document.getElementById('usernameInput').onkeyup = e => { if (e.key === 'Enter') joinChat(); };
document.getElementById('sendButton').onclick = sendMessage;
document.getElementById('messageInput').onkeyup = e => { if (e.key === 'Enter') sendMessage(); };
document.getElementById('messageInput').oninput = function () {
    if (!isTyping) { socket.emit('typing'); isTyping = true; }
    clearTimeout(typingTimer); typingTimer = setTimeout(() =>
        { socket.emit('stop_typing'); isTyping = false; }, 1200);
};

function joinChat() {
    const username = document.getElementById('usernameInput').value.trim();
    if (!username) return;
    currentUsername = username;
    socket.emit('join', username);
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('chatScreen').style.display = 'block';
    document.getElementById('messageInput').focus();
}
function sendMessage() {
    const input = document.getElementById('messageInput');
    const msg = input.value.trim();
    if (!msg) return;
    const enc = encryptMessage(msg);
    socket.emit('send_encrypted_message', { encryptedMessage: enc });
    input.value = '';
    socket.emit('stop_typing');
    isTyping = false;
}
function displayMessage(data) {
    const div = document.createElement('div');
    div.className = (data.username === currentUsername ? 'own-message' : 'other-message') + ' message';
    div.innerHTML = `<b>${escapeHtml(data.username)}</b> <span style="float:right;color:#888">${data.timestamp}</span><br>
    <span>${escapeHtml(decryptMessage(data.encryptedMessage))}</span>`;
    document.getElementById('messages').appendChild(div);
    document.getElementById('messages').scrollTop = 1e9;
}
function displaySystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.innerText = text;
    document.getElementById('messages').appendChild(div);
}
function updateUserCount(c) { document.getElementById('userCount').innerText = `${c} user${c !== 1 ? 's' : ''} online`; }
function escapeHtml(text) {
    return text ? text.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])) : '';
}

socket.on('receive_encrypted_message', displayMessage);
socket.on('user_joined', d => displaySystemMessage(d.message));
socket.on('user_left', d => displaySystemMessage(d.message));
socket.on('user_count', updateUserCount);
socket.on('user_typing', name => { document.getElementById('typingIndicator').textContent=`${name} is typing...`; document.getElementById('typingIndicator').style.display='block'; });
socket.on('user_stop_typing', () => { document.getElementById('typingIndicator').style.display='none'; });
