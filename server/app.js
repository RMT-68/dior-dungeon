require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createServer } = require("node:http");
const { join } = require("node:path");
const { Server } = require("socket.io");
const testRoutes = require("./routes/testRoutes");

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// Middleware
app.use(cors());
app.use(express.json());

const RoomController = require("./controllers/roomController");
const GameHandler = require("./socket/gameHandler");
const characterRoutes = require("./routes/characterRoutes");

// Routes
app.get("/health", (req, res) => {
  res.json({ status: "Server is running" });
});

// Use test routes
app.use(testRoutes);

app.post("/api/rooms", RoomController.createRoom);
app.get("/api/rooms", RoomController.getRooms);
app.get("/api/rooms/:id", RoomController.getRoomDetails);

// Character generation routes
app.use("/api/characters", characterRoutes);
app.get("/api/rooms/:roomCode/characters-status", characterRoutes);

// Socket.io Connection
io.on("connection", (socket) => {
  new GameHandler(io, socket);
});

if (require.main === module) {
  server.listen(3000, () => {
    console.log("server running at http://localhost:3000");
  });
}

module.exports = { app, server, io };
