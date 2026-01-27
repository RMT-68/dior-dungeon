const express = require("express");
const cors = require("cors");
const { createServer } = require("node:http");
const { join } = require("node:path");
const { Server } = require("socket.io");

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// Move into separate file
io.on("connection", (socket) => {});

server.listen(3000, () => {
  console.log("server running at http://localhost:3000");
});

module.exports = app;
