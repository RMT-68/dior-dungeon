const express = require("express");
const router = express.Router();
const { generateDungeon } = require("../ai/dungeonGenerator");
const { generateCharacter } = require("../ai/characterGenerator");
const { generateNPCEvent } = require("../ai/npcEventGenerator");
const { generateBattleNarration } = require("../ai/battleNarrationGenerator");
const {
  generateNodeTransition,
  generateStoryThusFar,
  generateAfterBattleSummary,
  generateFinalGameSummary,
} = require("../ai/storyGenerator");

/**
 * How to use test routes in postman:
 * 1. Set header "X-API-Key" to the value of TEST_API_KEY in your .env file
 * 2. Get /api/dungeon/template to see expected request body for dungeon generation
 * 3. Post to /api/dungeon/generate with JSON body to test dungeon generation
 */

/**
 * Middleware: Validate API key from X-API-Key header
 * Protects test routes from unauthorized AI generation calls
 */

const authenticateTestKey = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  const validKey = process.env.TEST_API_KEY;

  if (!validKey) {
    console.warn("TEST_API_KEY not set in environment");
    return res.status(503).json({
      success: false,
      error: "API key not configured on server",
    });
  }

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: "Missing X-API-Key header",
    });
  }

  if (apiKey !== validKey) {
    return res.status(403).json({
      success: false,
      error: "Invalid API key",
    });
  }

  next();
};

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
router.post("/api/dungeon/generate", authenticateTestKey, async (req, res) => {
  /**
   * Expected Response (200):
   * {
   *   success: true,
   *   data: {
   *     dungeonName: string,
   *     description: string,
   *     difficulty: "easy"|"medium"|"hard",
   *     theme: string,
   *     nodes: [
   *       { id: number, name: string, type: "enemy"|"npc", enemyId: string|null }
   *     ],
   *     enemies: [
   *       {
   *         id: string,
   *         name: string,
   *         role: "minion"|"elite"|"boss",
   *         hp: number, maxHP: number,
   *         stamina: number, maxStamina: number,
   *         skillPower: number,
   *         archetype: string,
   *         skills: [{ name: string, description: string, type: "damage"|"healing", amount: number }]
   *       }
   *     ]
   *   }
   * }
   * Error (4xx/5xx): { success: false, error: string }
   */
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
router.get("/api/dungeon/template", (req, res) => {
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
router.post("/api/character/generate", authenticateTestKey, async (req, res) => {
  /**
   * Expected Response (200):
   * {
   *   success: true,
   *   data: {
   *     id: string,
   *     name: string,
   *     role: "Warrior"|"Mage"|"Rogue"|"Paladin"|"Ranger"|"Cleric",
   *     theme: string,
   *     hp: number, maxHP: number,
   *     stamina: number, maxStamina: number,
   *     skillPower: number,
   *     skills: [{ name: string, description: string, type: "damage"|"healing", amount: number }]
   *   }
   * }
   * Error (4xx/5xx): { success: false, error: string }
   */
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
router.get("/api/character/template", (req, res) => {
  res.json({
    id: "character-1",
    name: "Theron Sunblade",
    role: "Warrior",
    theme: "Vampire Castle",
    hp: 130,
    maxHP: 130,
    stamina: 70,
    maxStamina: 70,
    skillPower: 1.8,
    skills: [
      {
        name: "Slash",
        description: "A powerful sword strike",
        type: "damage",
        amount: 28,
      },
    ],
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
router.post("/api/npc/generate", authenticateTestKey, async (req, res) => {
  /**
   * Expected Response (200):
   * {
   *   success: true,
   *   data: {
   *     npcName: string,
   *     description: string,
   *     choices: [
   *       {
   *         id: "positive"|"negative",
   *         label: string,
   *         outcome: {
   *           narrative: string,
   *           effects: { hpBonus: number, staminaBonus: number, skillPowerBonus: number }
   *         }
   *       }
   *     ]
   *   }
   * }
   * Error (4xx/5xx): { success: false, error: string }
   */
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
router.get("/api/npc/template", (req, res) => {
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
router.post("/api/battle/narrate", authenticateTestKey, async (req, res) => {
  /**
   * Expected Response (200):
   * {
   *   success: true,
   *   data: {
   *     success: true,
   *     round: number,
   *     playerActions: [
   *       {
   *         playerId: string,
   *         playerName: string,
   *         actionType: "attack"|"heal"|"defend",
   *         skillName: string,
   *         diceRoll: number,
   *         // if attack: { finalDamage: number, isCritical: boolean, isMiss: boolean }
   *         // if heal: { finalHeal: number }
   *         // if defend: { defenseBonus: number }
   *       }
   *     ],
   *     narrative: string,
   *     playerNarratives: [{ playerId: string, narrative: string }],
   *     enemyAction: null | {
   *       type: "attack"|"heal",
   *       skillName: string,
   *       diceRoll: number,
   *       finalDamage?: number,
   *       healAmount?: number,
   *       narrative: string,
   *       targetName?: string
   *     },
   *     enemyHP: { previous: number, current: number, damage: number },
   *     enemyDefeated: boolean,
   *     battleState: { currentRound: number }
   *   }
   * }
   * Error (4xx/5xx): { success: false, error: string }
   */
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
router.get("/api/battle/template", (req, res) => {
  res.json({
    theme: "Vampire Castle",
    enemy: {
      id: "enemy-1",
      name: "Vampire Lord",
      role: "boss",
      hp: 200,
      maxHP: 200,
      stamina: 90,
      maxStamina: 90,
      skillPower: 2.5,
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

/**
 * Endpoint to test node transition story generation
 * POST /api/story/transition
 * Body: {
 *   "theme": "string",
 *   "currentNode": { "name": "string", "type": "enemy|npc" },
 *   "nextNode": { "name": "string", "type": "enemy|npc" },
 *   "partyState": { "playerCount": number, "averageHP": number },
 *   "language": "string" (optional, default: "en")
 * }
 */
router.post("/api/story/transition", authenticateTestKey, async (req, res) => {
  /**
   * Expected Response (200):
   * {
   *   success: true,
   *   data: { narrative: string, mood: "tense"|"hopeful"|"mysterious"|"triumphant"|"neutral" }
   * }
   * Error (4xx/5xx): { success: false, error: string }
   */
  try {
    const { theme, currentNode, nextNode, partyState, language = "en" } = req.body;

    if (!theme || !currentNode || !nextNode || !partyState) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: theme, currentNode, nextNode, partyState",
      });
    }

    const story = await generateNodeTransition({
      theme,
      currentNode,
      nextNode,
      partyState,
      language,
    });

    return res.status(200).json({
      success: true,
      data: story,
    });
  } catch (error) {
    console.error("Error in /api/story/transition:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate transition story",
    });
  }
});

/**
 * Endpoint to get transition story template
 * GET /api/story/transition/template
 */
router.get("/api/story/transition/template", (req, res) => {
  res.json({
    theme: "Vampire Castle",
    currentNode: {
      name: "Grand Hall",
      type: "npc",
    },
    nextNode: {
      name: "Throne Room",
      type: "enemy",
    },
    partyState: {
      playerCount: 3,
      averageHP: 75,
    },
    language: "en",
  });
});

/**
 * Endpoint to test story-thus-far generation
 * POST /api/story/thus-far
 * Body: {
 *   "theme": "string",
 *   "dungeonName": "string",
 *   "gameLog": [{ "event": "string", "details": "string" }],
 *   "partyState": { "players": [{ "name": "string", "hp": number }], "defeatedEnemies": number },
 *   "currentNode": number,
 *   "totalNodes": number,
 *   "language": "string" (optional, default: "en")
 * }
 */
router.post("/api/story/thus-far", authenticateTestKey, async (req, res) => {
  /**
   * Expected Response (200):
   * {
   *   success: true,
   *   data: {
   *     summary: string,
   *     keyMoments: string[],
   *     outlook: "promising"|"challenging"|"desperate"|"victorious"
   *   }
   * }
   * Error (4xx/5xx): { success: false, error: string }
   */
  try {
    const { theme, dungeonName, gameLog, partyState, currentNode, totalNodes, language = "en" } = req.body;

    if (!theme || !dungeonName || !gameLog || !partyState || !currentNode || !totalNodes) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: theme, dungeonName, gameLog, partyState, currentNode, totalNodes",
      });
    }

    const story = await generateStoryThusFar({
      theme,
      dungeonName,
      gameLog,
      partyState,
      currentNode,
      totalNodes,
      language,
    });

    return res.status(200).json({
      success: true,
      data: story,
    });
  } catch (error) {
    console.error("Error in /api/story/thus-far:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate story thus far",
    });
  }
});

/**
 * Endpoint to get story-thus-far template
 * GET /api/story/thus-far/template
 */
router.get("/api/story/thus-far/template", (req, res) => {
  res.json({
    theme: "Vampire Castle",
    dungeonName: "Castle Dracul",
    gameLog: [
      { event: "battle", details: "Defeated 2 Vampire Spawn" },
      { event: "npc", details: "Helped a trapped merchant" },
      { event: "transition", details: "Moved to Grand Hall" },
    ],
    partyState: {
      players: [
        { name: "Alice", hp: 85 },
        { name: "Bob", hp: 60 },
        { name: "Charlie", hp: 90 },
      ],
      defeatedEnemies: 3,
    },
    currentNode: 3,
    totalNodes: 5,
    language: "en",
  });
});

/**
 * Endpoint to test after-battle summary generation
 * POST /api/story/after-battle
 * Body: {
 *   "theme": "string",
 *   "enemy": { "name": "string", "role": "string" },
 *   "battleLog": [{ "round": number, "action": "string", "result": "string" }],
 *   "partyState": { "players": [{ "name": "string", "hp": number }], "survived": boolean },
 *   "rewards": { "experience": number, "items": [string] },
 *   "language": "string" (optional, default: "en")
 * }
 */
router.post("/api/story/after-battle", authenticateTestKey, async (req, res) => {
  /**
   * Expected Response (200):
   * {
   *   success: true,
   *   data: {
   *     summary: string,
   *     tone: "triumphant"|"bittersweet"|"hard-won"|"costly",
   *     quote: string|null
   *   }
   * }
   * Error (4xx/5xx): { success: false, error: string }
   */
  try {
    const { theme, enemy, battleLog, partyState, rewards, language = "en" } = req.body;

    if (!theme || !enemy || !battleLog || !partyState) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: theme, enemy, battleLog, partyState",
      });
    }

    const story = await generateAfterBattleSummary({
      theme,
      enemy,
      battleLog,
      partyState,
      rewards,
      language,
    });

    return res.status(200).json({
      success: true,
      data: story,
    });
  } catch (error) {
    console.error("Error in /api/story/after-battle:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate after-battle summary",
    });
  }
});

/**
 * Endpoint to get after-battle summary template
 * GET /api/story/after-battle/template
 */
router.get("/api/story/after-battle/template", (req, res) => {
  res.json({
    theme: "Vampire Castle",
    enemy: {
      name: "Vampire Lord",
      role: "boss",
    },
    battleLog: [
      { round: 1, action: "Alice cast Fireball", result: "Hit for 45 damage" },
      {
        round: 1,
        action: "Vampire Lord used Blood Drain",
        result: "Hit Bob for 30 damage",
      },
      {
        round: 2,
        action: "Bob used Holy Strike",
        result: "Critical hit for 80 damage",
      },
    ],
    partyState: {
      players: [
        { name: "Alice", hp: 85 },
        { name: "Bob", hp: 40 },
        { name: "Charlie", hp: 70 },
      ],
      survived: true,
    },
    rewards: {
      experience: 500,
      items: ["Vampire Fang", "Blood Ruby"],
    },
    language: "en",
  });
});

/**
 * Endpoint to test final game summary generation
 * POST /api/story/final-summary
 * Body: {
 *   "theme": "string",
 *   "dungeonName": "string",
 *   "completeGameLog": [{ "timestamp": "string", "event": "string", "details": object }],
 *   "finalStats": { "totalDamage": number, "totalHealing": number, "battlesWon": number, "criticalHits": number },
 *   "outcome": "victory | defeat",
 *   "language": "string" (optional, default: "en")
 * }
 */
router.post("/api/story/final-summary", authenticateTestKey, async (req, res) => {
  /**
   * Expected Response (200):
   * {
   *   success: true,
   *   data: {
   *     summary: string,
   *     highlights: string[],
   *     legendStatus: "legendary"|"heroic"|"valiant"|"tragic",
   *     epitaph: string
   *   }
   * }
   * Error (4xx/5xx): { success: false, error: string }
   */
  try {
    const { theme, dungeonName, completeGameLog, finalStats, outcome, language = "en" } = req.body;

    if (!theme || !dungeonName || !completeGameLog || !finalStats || !outcome) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: theme, dungeonName, completeGameLog, finalStats, outcome",
      });
    }

    const story = await generateFinalGameSummary({
      theme,
      dungeonName,
      completeGameLog,
      finalStats,
      outcome,
      language,
    });

    return res.status(200).json({
      success: true,
      data: story,
    });
  } catch (error) {
    console.error("Error in /api/story/final-summary:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to generate final summary",
    });
  }
});

/**
 * Endpoint to get final summary template
 * GET /api/story/final-summary/template
 */
router.get("/api/story/final-summary/template", (req, res) => {
  res.json({
    theme: "Vampire Castle",
    dungeonName: "Castle Dracul",
    completeGameLog: [
      {
        timestamp: "2026-01-27T10:00:00Z",
        event: "gameStart",
        details: { players: 3 },
      },
      {
        timestamp: "2026-01-27T10:05:00Z",
        event: "battleWon",
        details: { enemy: "Vampire Spawn", rounds: 3 },
      },
      {
        timestamp: "2026-01-27T10:15:00Z",
        event: "npcEvent",
        details: { npc: "Merchant", choice: "positive" },
      },
      {
        timestamp: "2026-01-27T10:25:00Z",
        event: "battleWon",
        details: { enemy: "Vampire Lord", rounds: 5 },
      },
    ],
    finalStats: {
      totalDamage: 1250,
      totalHealing: 300,
      battlesWon: 4,
      criticalHits: 7,
    },
    outcome: "victory",
    language: "en",
  });
});

module.exports = router;
