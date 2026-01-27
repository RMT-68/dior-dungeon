require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createServer } = require("node:http");
const { join } = require("node:path");
const { Server } = require("socket.io");
const { generateDungeon } = require("./ai/dungeonGenerator");

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

// Routes
app.get("/health", (req, res) => {
  res.json({ status: "Server is running" });
});

/**
 * Endpoint to test dungeon generation
 * POST /api/dungeon/generate
 * Body: {
 *   "theme": "string",
 *   "difficulty": "easy | medium | hard",
 *   "maxNode": number,
 *   "language": "string" (optional, default: "en")
 * }
 */

app.post("/api/dungeon/generate", async (req, res) => {
  try {
    const { theme, difficulty, maxNode, language = "en" } = req.body;

    // Validate required fields
    if (!theme || !difficulty || !maxNode) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: theme, difficulty, maxNode",
      });
    }

    // Generate dungeon
    const dungeon = await generateDungeon({
      theme,
      difficulty,
      maxNode,
      language,
    });

    return res.status(200).json({
      success: true,
      data: dungeon,
    });
  } catch (error) {
    console.error("Error in /api/dungeon/generate:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate dungeon",
    });
  }
});

/**
 * Endpoint to get dungeon generation template
 * GET /api/dungeon/template
 */
app.get("/api/dungeon/template", (req, res) => {
  res.json({
    theme: "Vampire Castle",
    difficulty: "medium",
    maxNode: 5,
    language: "en",
  });
});

// Move into separate file
io.on("connection", (socket) => {});

server.listen(3000, () => {
  console.log("server running at http://localhost:3000");
});

module.exports = app;
