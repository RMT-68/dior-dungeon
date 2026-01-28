const gemini = require("../helpers/gemini");

/**
 * Generate an NPC event with choices based on dungeon context
 * @param {Object} params - Generation parameters
 * @param {string} params.theme - Theme from the dungeon (e.g., "Vampire Castle")
 * @param {number} params.nodeId - Current node ID
 * @param {Object} params.playerState - Current player state (hp, stamina, etc)
 * @param {string} params.language - Language for event content (e.g., "en", "id", "es")
 * @returns {Promise<Object>} Generated NPC event object
 */
async function generateNPCEvent({ theme, nodeId, playerState, language = "en" }) {
  // Validate input
  if (!theme || typeof theme !== "string") {
    throw new Error("Theme is required and must be a string");
  }

  if (!nodeId || typeof nodeId !== "number") {
    throw new Error("NodeId is required and must be a number");
  }

  if (!playerState || typeof playerState !== "object") {
    throw new Error("PlayerState is required and must be an object");
  }

  if (!language || typeof language !== "string") {
    throw new Error("Language is required and must be a string");
  }

  // Design the prompt for AI
  const prompt = `You are an NPC event generator for a fantasy RPG dungeon game. Generate a thematic NPC encounter that fits the dungeon theme.

Theme: ${theme}
Node ID: ${nodeId}
Current Player State:
- HP: ${playerState.hp}/${playerState.maxHP}
- Stamina: ${playerState.stamina}/${playerState.maxStamina}
Language: ${language} (Generate ALL text content in this language)

IMPORTANT RULES:
1. Create an engaging NPC encounter that fits the ${theme} theme
2. Generate exactly 2 choices:
   - POSITIVE choice: Higher risk/reward - larger bonuses but may have small penalties
   - NEGATIVE choice: Lower risk/reward - smaller bonuses or minor mixed effects
3. Consider player's current state:
   - If HP is low, offer healing opportunities
   - If stamina is low, offer stamina recovery
   - Balance the rewards appropriately
4. Effects ranges:
   - HP bonus: -10 to +30
   - Stamina bonus: -3 to +6
   - Skill Power bonus: -0.3 to +0.5
5. Make choices meaningful and thematic
6. ALL text must be in ${language} language

Generate ONLY valid JSON with this EXACT structure (no markdown, no code blocks, just pure JSON):

{
  "npcName": "Creative NPC name fitting the theme",
  "description": "Engaging description of the encounter and NPC appearance/situation",
  "choices": [
    {
      "id": "positive",
      "label": "Description of the positive choice action",
      "outcome": {
        "narrative": "What happens when this choice is selected",
        "effects": {
          "hpBonus": 20,
          "staminaBonus": 5,
          "skillPowerBonus": 0.3
        }
      }
    },
    {
      "id": "negative",
      "label": "Description of the negative choice action",
      "outcome": {
        "narrative": "What happens when this choice is selected",
        "effects": {
          "hpBonus": 10,
          "staminaBonus": 2,
          "skillPowerBonus": 0.1
        }
      }
    }
  ]
}

Remember: Generate exactly 2 choices (positive and negative). All effect values must be numbers. Make the narrative engaging and thematic.`;

  try {
    // Call Gemini AI
    const aiResponse = await gemini("gemini-3-flash-preview", prompt);

    // Clean the response (remove markdown code blocks if present)
    let cleanedResponse = aiResponse.trim();
    cleanedResponse = cleanedResponse.replace(/```json\n?/g, "");
    cleanedResponse = cleanedResponse.replace(/```\n?/g, "");
    cleanedResponse = cleanedResponse.trim();

    // Parse JSON response
    const npcEvent = JSON.parse(cleanedResponse);

    // Validate the response structure
    validateNPCEventStructure(npcEvent);

    return npcEvent;
  } catch (error) {
    console.error("Error generating NPC event:", error);

    // If AI fails, return a fallback event
    if (error instanceof SyntaxError) {
      console.error("Failed to parse AI response, using fallback NPC event");
      return createFallbackNPCEvent({ theme, nodeId, playerState, language });
    }

    throw error;
  }
}

/**
 * Validate the NPC event structure matches requirements
 */
function validateNPCEventStructure(npcEvent) {
  if (!npcEvent.npcName || !npcEvent.description) {
    throw new Error("Missing required NPC event properties: npcName, description");
  }

  if (!Array.isArray(npcEvent.choices) || npcEvent.choices.length !== 2) {
    throw new Error("NPC event must have exactly 2 choices");
  }

  // Validate each choice
  npcEvent.choices.forEach((choice, index) => {
    if (!choice.id || !choice.label || !choice.outcome) {
      throw new Error(`Choice ${index + 1} is missing required properties`);
    }

    if (!["positive", "negative"].includes(choice.id)) {
      throw new Error(`Choice ${index + 1} must have id "positive" or "negative"`);
    }

    if (!choice.outcome.narrative || !choice.outcome.effects) {
      throw new Error(`Choice ${index + 1} outcome is missing narrative or effects`);
    }

    const effects = choice.outcome.effects;
    if (
      typeof effects.hpBonus !== "number" ||
      typeof effects.staminaBonus !== "number" ||
      typeof effects.skillPowerBonus !== "number"
    ) {
      throw new Error(`Choice ${index + 1} effects must be numbers`);
    }
  });

  return true;
}

/**
 * Create a fallback NPC event if AI generation fails
 */
function createFallbackNPCEvent({ theme, nodeId, playerState, language = "en" }) {
  const lowHP = playerState.hp < playerState.maxHP * 0.5;
  const lowStamina = playerState.stamina < playerState.maxStamina * 0.5;

  // Generate contextual events based on player state
  let eventTemplate;

  if (lowHP && lowStamina) {
    eventTemplate = {
      npcName: "Mysterious Healer",
      description: `A hooded figure emerges from the shadows of the ${theme.toLowerCase()}. They offer aid, but at what cost?`,
      choices: [
        {
          id: "positive",
          label: "Accept the powerful healing ritual",
          outcome: {
            narrative: "The healer channels mysterious energy. You feel rejuvenated but exhausted.",
            effects: {
              hpBonus: 30,
              staminaBonus: -2,
              skillPowerBonus: 0.2,
            },
          },
        },
        {
          id: "negative",
          label: "Take only the basic healing herbs",
          outcome: {
            narrative: "You accept some healing herbs and rest briefly.",
            effects: {
              hpBonus: 15,
              staminaBonus: 3,
              skillPowerBonus: 0,
            },
          },
        },
      ],
    };
  } else if (lowHP) {
    eventTemplate = {
      npcName: "Wounded Warrior",
      description: `A injured warrior rests against the wall. They offer medical supplies in exchange for your help.`,
      choices: [
        {
          id: "positive",
          label: "Help them and share supplies",
          outcome: {
            narrative: "Working together, you both patch your wounds more effectively.",
            effects: {
              hpBonus: 25,
              staminaBonus: 2,
              skillPowerBonus: 0.3,
            },
          },
        },
        {
          id: "negative",
          label: "Politely decline and move on",
          outcome: {
            narrative: "They toss you a basic healing potion before you leave.",
            effects: {
              hpBonus: 12,
              staminaBonus: 0,
              skillPowerBonus: 0,
            },
          },
        },
      ],
    };
  } else if (lowStamina) {
    eventTemplate = {
      npcName: "Resting Merchant",
      description: `A traveling merchant is taking a break. They offer energy-restoring items.`,
      choices: [
        {
          id: "positive",
          label: "Buy the premium energy elixir",
          outcome: {
            narrative: "The elixir courses through you, restoring your vigor significantly.",
            effects: {
              hpBonus: 5,
              staminaBonus: 6,
              skillPowerBonus: 0.2,
            },
          },
        },
        {
          id: "negative",
          label: "Take the free water and rest",
          outcome: {
            narrative: "A brief rest and some water restore your energy partially.",
            effects: {
              hpBonus: 8,
              staminaBonus: 4,
              skillPowerBonus: 0,
            },
          },
        },
      ],
    };
  } else {
    eventTemplate = {
      npcName: "Wise Sage",
      description: `An old sage sits meditating. They offer to share ancient knowledge or blessings.`,
      choices: [
        {
          id: "positive",
          label: "Receive the powerful blessing",
          outcome: {
            narrative: "Ancient power flows through you. Your abilities are enhanced!",
            effects: {
              hpBonus: 10,
              staminaBonus: 4,
              skillPowerBonus: 0.5,
            },
          },
        },
        {
          id: "negative",
          label: "Listen to their wisdom",
          outcome: {
            narrative: "The sage's words inspire you, granting modest benefits.",
            effects: {
              hpBonus: 15,
              staminaBonus: 3,
              skillPowerBonus: 0.2,
            },
          },
        },
      ],
    };
  }

  return eventTemplate;
}

module.exports = {
  generateNPCEvent,
};
