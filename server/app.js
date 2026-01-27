require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createServer } = require("node:http");
const { join } = require("node:path");
const { Server } = require("socket.io");
const { generateDungeon } = require("./ai/dungeonGenerator");
const { generateCharacter } = require("./ai/characterGenerator");
const { generateNPCEvent } = require("./ai/npcEventGenerator");
const { generateBattleNarration } = require("./ai/battleNarrationGenerator");

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

/**
 * Endpoint to test character generation
 * POST /api/character/generate
 * Body: {
 *   "theme": "string",
 *   "language": "string" (optional, default: "en")
 * }
 */
app.post("/api/character/generate", async (req, res) => {
  try {
    const { theme, language = "en" } = req.body;

    // Validate required fields
    if (!theme) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: theme",
      });
    }

    // Generate character
    const character = await generateCharacter({
      theme,
      language,
    });

    return res.status(200).json({
      success: true,
      data: character,
    });
  } catch (error) {
    console.error("Error in /api/character/generate:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate character",
    });
  }
});

/**
 * Endpoint to get character generation template
 * GET /api/character/template
 */
app.get("/api/character/template", (req, res) => {
  res.json({
    theme: "Vampire Castle",
    language: "en",
  });
});

/**
 * Endpoint to test NPC event generation
 * POST /api/npc/generate
 * Body: {
 *   "theme": "string",
 *   "nodeId": number,
 *   "playerState": { "hp": number, "maxHP": number, "stamina": number, "maxStamina": number },
 *   "language": "string" (optional, default: "en")
 * }
 */
app.post("/api/npc/generate", async (req, res) => {
  try {
    const { theme, nodeId, playerState, language = "en" } = req.body;

    // Validate required fields
    if (!theme || !nodeId || !playerState) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: theme, nodeId, playerState",
      });
    }

    // Validate playerState structure
    if (
      typeof playerState.hp !== "number" ||
      typeof playerState.maxHP !== "number" ||
      typeof playerState.stamina !== "number" ||
      typeof playerState.maxStamina !== "number"
    ) {
      return res.status(400).json({
        success: false,
        error: "playerState must have hp, maxHP, stamina, maxStamina as numbers",
      });
    }

    // Generate NPC event
    const npcEvent = await generateNPCEvent({
      theme,
      nodeId,
      playerState,
      language,
    });

    return res.status(200).json({
      success: true,
      data: npcEvent,
    });
  } catch (error) {
    console.error("Error in /api/npc/generate:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate NPC event",
    });
  }
});

/**
 * Endpoint to get NPC event generation template
 * GET /api/npc/template
 */
app.get("/api/npc/template", (req, res) => {
  res.json({
    theme: "Vampire Castle",
    nodeId: 2,
    playerState: {
      hp: 45,
      maxHP: 120,
      stamina: 30,
      maxStamina: 80,
    },
    language: "en",
  });
});

/**
 * Endpoint to test battle narration generation
 * POST /api/battle/narrate
 * Body: {
 *   "theme": "string",
 *   "enemy": { "name": "string", "role": "string", "hp": number, "archetype": "string", "skills": [...] },
 *   "playerActions": [{ "playerId": "string", "playerName": "string", "type": "attack|heal|defend", "skillName": "string", "skillAmount": number, "skillPower": number }],
 *   "battleState": { "currentRound": number },
 *   "language": "string" (optional, default: "en")
 * }
 */
app.post("/api/battle/narrate", async (req, res) => {
  try {
    const { theme, enemy, playerActions, battleState, language = "en" } = req.body;

    // Validate required fields
    if (!theme || !enemy || !playerActions || !battleState) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: theme, enemy, playerActions, battleState",
      });
    }

    if (!Array.isArray(playerActions) || playerActions.length === 0) {
      return res.status(400).json({
        success: false,
        error: "playerActions must be a non-empty array",
      });
    }

    // Generate battle narration
    const battleResult = await generateBattleNarration({
      theme,
      enemy,
      playerActions,
      battleState,
      language,
    });

    return res.status(200).json({
      success: true,
      data: battleResult,
    });
  } catch (error) {
    console.error("Error in /api/battle/narrate:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate battle narration",
    });
  }
});

/**
 * Endpoint to get battle narration template
 * GET /api/battle/template
 */
app.get("/api/battle/template", (req, res) => {
  res.json({
    theme: "Vampire Castle",
    enemy: {
      name: "Vampire Lord",
      role: "boss",
      hp: 200,
      archetype: "mage",
      skills: [
        {
          name: "Blood Drain",
          description: "Drains life from enemies",
          type: "damage",
          amount: 35,
        },
        {
          name: "Dark Regeneration",
          description: "Regenerates health",
          type: "healing",
          amount: 25,
        },
      ],
    },
    playerActions: [
      {
        playerId: "player-1",
        playerName: "Alice",
        type: "attack",
        skillName: "Fireball",
        skillAmount: 60,
        skillPower: 2.5,
      },
    ],
    battleState: {
      currentRound: 1,
    },
    language: "en",
  });
});

// Move into separate file
io.on("connection", (socket) => {});

server.listen(3000, () => {
  console.log("server running at http://localhost:3000");
});

module.exports = app;
