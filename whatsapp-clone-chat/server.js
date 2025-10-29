const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const users = new Map();

io.on("connection", socket => {
    socket.on("join", username => {
        users.set(socket.id, username);
        socket.broadcast.emit("user_joined", {
            username,
            message: `${username} has joined the chat`
        });
        io.emit("user_count", users.size);
    });

    socket.on("send_encrypted_message", data => {
        io.emit("receive_encrypted_message", {
            username: users.get(socket.id),
            encryptedMessage: data.encryptedMessage,
            timestamp: new Date().toLocaleTimeString()
        });
    });

    socket.on("disconnect", () => {
        const username = users.get(socket.id);
        if (username) {
            users.delete(socket.id);
            io.emit("user_left", {
                username,
                message: `${username} has left the chat`
            });
            io.emit("user_count", users.size);
        }
    });

    socket.on("typing", () => {
        const username = users.get(socket.id);
        if (username) socket.broadcast.emit("user_typing", username);
    });
    socket.on("stop_typing", () => {
        socket.broadcast.emit("user_stop_typing");
    });
});

const PORT = 3000;
server.listen(PORT, () => console.log("http://localhost:" + PORT));
