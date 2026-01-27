const gemini = require("../helpers/gemini");

/**
 * Generate a dungeon using AI based on theme, difficulty, and max nodes
 * @param {Object} params - Generation parameters
 * @param {string} params.theme - Theme of the dungeon (e.g., "Vampire Castle")
 * @param {string} params.difficulty - Difficulty level: "easy", "medium", or "hard"
 * @param {number} params.maxNode - Number of nodes in the dungeon (minimum 3)
 * @param {string} params.language - Language for the dungeon content (e.g., "en", "id", "es")
 * @returns {Promise<Object>} Generated dungeon object
 */
async function generateDungeon({ theme, difficulty, maxNode, language = "en" }) {
  // Validate input
  if (!theme || typeof theme !== "string") {
    throw new Error("Theme is required and must be a string");
  }

  if (!["easy", "medium", "hard"].includes(difficulty)) {
    throw new Error('Difficulty must be "easy", "medium", or "hard"');
  }

  if (!maxNode || maxNode < 3) {
    throw new Error("maxNode must be at least 3");
  }

  if (!language || typeof language !== "string") {
    throw new Error("Language is required and must be a string");
  }

  // Design the prompt for AI
  const prompt = `You are a dungeon generator for a fantasy RPG game. Generate a dungeon with the following specifications:

Theme: ${theme}
Difficulty: ${difficulty}
Number of Nodes: ${maxNode}
Language: ${language} (Generate ALL text content in this language)

IMPORTANT RULES:
1. The LAST node (node ${maxNode}) MUST be a boss enemy
2. Create a mix of enemy and npc nodes (but last must be enemy with boss)
3. For ${difficulty} difficulty:
   - easy: More NPC nodes, weaker enemies, basic skills
   - medium: Balanced mix, moderate enemies, varied skills
   - hard: More enemy nodes, stronger enemies, complex skills
4. Enemy roles: "minion" (weak, 30-60 HP), "elite" (strong, 80-120 HP), "boss" (final enemy, 150-250 HP)
5. Each enemy should have 2-4 skills that match their archetype
6. NPC nodes provide story moments or choices (not battles)
7. ALL text (names, descriptions, skills) must be in ${language} language
8. HP values must be numeric integers appropriate for the role

Generate ONLY valid JSON with this EXACT structure (no markdown, no code blocks, just pure JSON):

{
  "dungeonName": "Creative name for the dungeon",
  "description": "Engaging description of the dungeon atmosphere and story",
  "difficulty": "${difficulty}",
  "nodes": [
    {
      "id": 1,
      "name": "Node name",
      "type": "enemy",
      "enemyId": "enemy-1"
    },
    {
      "id": 2,
      "name": "Node name",
      "type": "npc",
      "enemyId": null
    }
  ],
  "enemies": [
    {
      "id": "enemy-1",
      "name": "Enemy name",
      "role": "minion",
      "hp": 50,
      "archetype": "warrior/mage/assassin/tank/support",
      "skills": ["Skill 1", "Skill 2"]
    }
  ]
}

Remember: Node ${maxNode} must be type "enemy" with a "boss" role enemy. Create ${maxNode} nodes total.`;

  try {
    // Call Gemini AI
    const aiResponse = await gemini("gemini-3-flash-preview", prompt);

    // Clean the response (remove markdown code blocks if present)
    let cleanedResponse = aiResponse.trim();
    cleanedResponse = cleanedResponse.replace(/```json\n?/g, "");
    cleanedResponse = cleanedResponse.replace(/```\n?/g, "");
    cleanedResponse = cleanedResponse.trim();

    // Parse JSON response
    const dungeon = JSON.parse(cleanedResponse);

    // Validate the response structure
    validateDungeonStructure(dungeon, maxNode);

    return dungeon;
  } catch (error) {
    console.error("Error generating dungeon:", error);

    // If AI fails, return a fallback dungeon
    if (error instanceof SyntaxError) {
      console.error("Failed to parse AI response, using fallback dungeon");
      return createFallbackDungeon({ theme, difficulty, maxNode, language });
    }

    throw error;
  }
}

/**
 * Validate the dungeon structure matches requirements
 */
function validateDungeonStructure(dungeon, maxNode) {
  if (!dungeon.dungeonName || !dungeon.description || !dungeon.difficulty) {
    throw new Error("Missing required dungeon properties");
  }

  if (!Array.isArray(dungeon.nodes) || dungeon.nodes.length !== maxNode) {
    throw new Error(`Dungeon must have exactly ${maxNode} nodes`);
  }

  if (!Array.isArray(dungeon.enemies) || dungeon.enemies.length === 0) {
    throw new Error("Dungeon must have at least one enemy");
  }

  // Validate last node is a boss
  const lastNode = dungeon.nodes[dungeon.nodes.length - 1];
  if (lastNode.type !== "enemy") {
    throw new Error("Last node must be an enemy type");
  }

  // Find the boss enemy
  const lastEnemy = dungeon.enemies.find((e) => e.id === lastNode.enemyId);
  if (!lastEnemy || lastEnemy.role !== "boss") {
    throw new Error("Last node must contain a boss enemy");
  }

  return true;
}

/**
 * Create a fallback dungeon if AI generation fails
 */
function createFallbackDungeon({ theme, difficulty, maxNode, language = "en" }) {
  const nodes = [];
  const enemies = [];

  // Create nodes
  for (let i = 1; i <= maxNode; i++) {
    const isLastNode = i === maxNode;
    const isEnemyNode = isLastNode || Math.random() > 0.3;

    if (isEnemyNode) {
      const enemyId = `enemy-${i}`;
      const role = isLastNode ? "boss" : Math.random() > 0.5 ? "minion" : "elite";

      nodes.push({
        id: i,
        name: isLastNode ? "Final Confrontation" : `Combat Zone ${i}`,
        type: "enemy",
        enemyId: enemyId,
      });

      enemies.push({
        id: enemyId,
        name: isLastNode ? `${theme} Lord` : `${theme} ${role === "elite" ? "Champion" : "Guardian"}`,
        role: role,
        hp:
          role === "boss"
            ? 150 + Math.floor(Math.random() * 100)
            : role === "elite"
              ? 80 + Math.floor(Math.random() * 40)
              : 30 + Math.floor(Math.random() * 30),
        archetype: ["warrior", "mage", "assassin"][Math.floor(Math.random() * 3)],
        skills: ["Basic Attack", "Power Strike", "Dark Magic", "Shadow Step"].slice(0, isLastNode ? 4 : 2),
      });
    } else {
      nodes.push({
        id: i,
        name: `Mysterious Encounter ${i}`,
        type: "npc",
        enemyId: null,
      });
    }
  }

  return {
    dungeonName: `The ${theme}`,
    description: `A mysterious ${theme.toLowerCase()} filled with danger and adventure.`,
    difficulty: difficulty,
    nodes: nodes,
    enemies: enemies,
  };
}

module.exports = {
  generateDungeon,
};
