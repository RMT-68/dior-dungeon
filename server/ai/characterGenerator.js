const gemini = require("../helpers/gemini");

/**
 * Generate a character based on dungeon theme
 * @param {Object} params - Generation parameters
 * @param {string} params.theme - Theme from the dungeon (e.g., "Vampire Castle")
 * @param {string} params.language - Language for character content (e.g., "en", "id", "es")
 * @returns {Promise<Object>} Generated character object
 */
async function generateCharacter({ theme, language = "en" }) {
  // Validate input
  if (!theme || typeof theme !== "string") {
    throw new Error("Theme is required and must be a string");
  }

  if (!language || typeof language !== "string") {
    throw new Error("Language is required and must be a string");
  }

  // Randomly select a character role
  const availableRoles = ["Warrior", "Mage", "Rogue", "Paladin", "Ranger", "Cleric"];
  const selectedRole = availableRoles[Math.floor(Math.random() * availableRoles.length)];

  // Design the prompt for AI
  const prompt = `You are a character generator for a fantasy RPG game. Generate a unique and thematic character that fits the dungeon theme provided.

IMPORTANT: This character will fight against enemies from the ${theme} dungeon theme.
Design the character to be effective against ${theme}-themed enemies and obstacles.

Theme: ${theme}
Language: ${language} (Generate ALL text content in this language)

IMPORTANT RULES:
1. Character should thematically fit the dungeon theme
2. Character role MUST be: "${selectedRole}" (do not deviate from this role)
3. Attributes:
   - HP: 80-150 (depends on role)
   - Stamina: 1-10 (depends on role)
   - Skill Power: 1.5-3.5 multiplier (higher for magic users, lower for physical users)
4. Skills array should contain 3-4 unique skills that match the character role and theme
5. Each skill should have a type: "damage" (offensive) or "healing" (supportive)
6. Each skill should have an amount: damage skills (5-40), healing skills (5-30)
7. Each skill should have a staminaCost: 1-3 stamina points required to use the skill
8. Each skill should be thematically appropriate and match the character's abilities
9. ALL text (name, role, skills) must be in ${language} language

Character Role HP ranges:
- Warrior: 120-150 HP, 4-6 Stamina, 1.5-2.0 Skill Power
- Mage: 80-110 HP, 8-10 Stamina, 2.5-3.5 Skill Power
- Rogue: 90-120 HP, 6-9 Stamina, 2.0-2.8 Skill Power
- Paladin: 110-140 HP, 4-6 Stamina, 2.0-2.5 Skill Power
- Ranger: 100-130 HP, 6-9 Stamina, 2.0-2.8 Skill Power
- Cleric: 95-125 HP, 7-9 Stamina, 2.0-2.8 Skill Power

Generate ONLY valid JSON with this EXACT structure (no markdown, no code blocks, just pure JSON):

{
  "id": "character-1",
  "name": "Creative character name fitting the theme",
  "role": "Warrior | Mage | Rogue | Paladin | Ranger | Cleric",
  "theme": "${theme}",
  "hp": 100,
  "maxHP": 100,
  "stamina": 6,
  "maxStamina": 6,
  "skillPower": 2.0,
  "skills": [
    {
      "name": "Skill name",
      "description": "Brief skill description",
      "type": "damage | healing",
      "amount": 25,
      "staminaCost": 2
    }
  ]
}

Remember: Generate exactly 3-4 skills. All values must be numbers for HP, Stamina, and Skill Power. Character should fit the ${theme} theme.`;

  try {
    // Call Gemini AI
    const aiResponse = await gemini("gemini-3-flash-preview", prompt);

    // Clean the response (remove markdown code blocks if present)
    let cleanedResponse = aiResponse.trim();
    cleanedResponse = cleanedResponse.replace(/```json\n?/g, "");
    cleanedResponse = cleanedResponse.replace(/```\n?/g, "");
    cleanedResponse = cleanedResponse.trim();

    // Parse JSON response
    const character = JSON.parse(cleanedResponse);

    // Validate the response structure
    validateCharacterStructure(character);

    return character;
  } catch (error) {
    console.error("Error generating character:", error);

    // If AI fails, return a fallback character
    if (error instanceof SyntaxError) {
      console.error("Failed to parse AI response, using fallback character");
      return createFallbackCharacter({ theme, language });
    }

    throw error;
  }
}

/**
 * Validate the character structure matches requirements
 */
function validateCharacterStructure(character) {
  if (!character.name || !character.role) {
    throw new Error("Missing required character properties: name, role");
  }

  if (
    typeof character.hp !== "number" ||
    typeof character.stamina !== "number" ||
    typeof character.skillPower !== "number"
  ) {
    throw new Error("HP, Stamina, and Skill Power must be numbers");
  }

  if (!Array.isArray(character.skills) || character.skills.length < 3) {
    throw new Error("Character must have at least 3 skills");
  }

  const validRoles = ["Warrior", "Mage", "Rogue", "Paladin", "Ranger", "Cleric"];
  if (!validRoles.includes(character.role)) {
    throw new Error(`Invalid character role. Must be one of: ${validRoles.join(", ")}`);
  }

  if (character.hp < 50 || character.hp > 200) {
    throw new Error("HP must be between 50 and 200");
  }

  if (character.stamina < 1 || character.stamina > 20) {
    throw new Error("Stamina must be between 1 and 20");
  }

  if (character.skillPower < 1.0 || character.skillPower > 4.0) {
    throw new Error("Skill Power must be between 1.0 and 4.0");
  }

  return true;
}

/**
 * Create a fallback character if AI generation fails
 * Character is designed to fight against theme-based enemies
 */
function createFallbackCharacter({ theme = "Fantasy", language = "en" }) {
  const roles = ["Warrior", "Mage", "Rogue", "Paladin", "Ranger", "Cleric"];
  const selectedRole = roles[Math.floor(Math.random() * roles.length)];

  // Determine stats based on role
  let hp, stamina, skillPower;
  let skillsDefault = [];

  switch (selectedRole) {
    case "Warrior":
      hp = 120 + Math.floor(Math.random() * 30);
      stamina = 4 + Math.floor(Math.random() * 3);
      skillPower = 1.5 + Math.random() * 0.5;
      skillsDefault = [
        { name: "Slash", description: "A basic melee attack", type: "damage", amount: 20, staminaCost: 1 },
        { name: "Power Strike", description: "A powerful charging attack", type: "damage", amount: 40, staminaCost: 2 },
        { name: "Defend", description: "Take a defensive stance", type: "healing", amount: 15, staminaCost: 1 },
        { name: "Whirlwind", description: "Attack all enemies at once", type: "damage", amount: 50, staminaCost: 3 },
      ];
      break;
    case "Mage":
      hp = 80 + Math.floor(Math.random() * 30);
      stamina = 8 + Math.floor(Math.random() * 3);
      skillPower = 2.5 + Math.random() * 1.0;
      skillsDefault = [
        { name: "Fireball", description: "Hurl a ball of fire at enemies", type: "damage", amount: 60, staminaCost: 2 },
        {
          name: "Ice Storm",
          description: "Freeze enemies with magical ice",
          type: "damage",
          amount: 55,
          staminaCost: 2,
        },
        { name: "Mana Shield", description: "Create a magical barrier", type: "healing", amount: 35, staminaCost: 3 },
        { name: "Lightning Bolt", description: "Strike with electricity", type: "damage", amount: 70, staminaCost: 3 },
      ];
      break;
    case "Rogue":
      hp = 90 + Math.floor(Math.random() * 30);
      stamina = 6 + Math.floor(Math.random() * 4);
      skillPower = 2.0 + Math.random() * 0.8;
      skillsDefault = [
        { name: "Backstab", description: "Strike from the shadows", type: "damage", amount: 55, staminaCost: 2 },
        { name: "Shadow Clone", description: "Create a decoy", type: "damage", amount: 30, staminaCost: 2 },
        { name: "Evasion", description: "Dodge incoming attacks", type: "healing", amount: 25, staminaCost: 1 },
        { name: "Poison Strike", description: "Poison your blade", type: "damage", amount: 45, staminaCost: 2 },
      ];
      break;
    case "Paladin":
      hp = 110 + Math.floor(Math.random() * 30);
      stamina = 4 + Math.floor(Math.random() * 3);
      skillPower = 2.0 + Math.random() * 0.5;
      skillsDefault = [
        { name: "Holy Strike", description: "Strike with divine power", type: "damage", amount: 45, staminaCost: 2 },
        { name: "Protection Aura", description: "Protect nearby allies", type: "healing", amount: 40, staminaCost: 2 },
        { name: "Divine Shield", description: "Block all damage", type: "healing", amount: 50, staminaCost: 3 },
        { name: "Healing Light", description: "Heal yourself or an ally", type: "healing", amount: 45, staminaCost: 2 },
      ];
      break;
    case "Ranger":
      hp = 100 + Math.floor(Math.random() * 30);
      stamina = 6 + Math.floor(Math.random() * 4);
      skillPower = 2.0 + Math.random() * 0.8;
      skillsDefault = [
        { name: "Arrow Shot", description: "Fire an accurate arrow", type: "damage", amount: 35, staminaCost: 1 },
        { name: "Multi-Shot", description: "Fire multiple arrows", type: "damage", amount: 50, staminaCost: 2 },
        { name: "Trap", description: "Set a trap for enemies", type: "damage", amount: 40, staminaCost: 2 },
        {
          name: "Beast Companion",
          description: "Summon a helpful animal",
          type: "healing",
          amount: 30,
          staminaCost: 2,
        },
      ];
      break;
    case "Cleric":
      hp = 95 + Math.floor(Math.random() * 30);
      stamina = 7 + Math.floor(Math.random() * 3);
      skillPower = 2.0 + Math.random() * 0.8;
      skillsDefault = [
        { name: "Heal", description: "Restore HP to self or ally", type: "healing", amount: 50, staminaCost: 2 },
        { name: "Holy Smite", description: "Deal holy damage", type: "damage", amount: 40, staminaCost: 2 },
        { name: "Blessing", description: "Increase ally stats", type: "healing", amount: 35, staminaCost: 2 },
        { name: "Resurrection", description: "Bring an ally back", type: "healing", amount: 60, staminaCost: 3 },
      ];
      break;
  }

  return {
    id: "character-1",
    name: `${selectedRole} of the ${theme}`,
    role: selectedRole,
    theme: theme,
    hp: Math.round(hp),
    maxHP: Math.round(hp),
    stamina: Math.round(stamina),
    maxStamina: Math.round(stamina),
    skillPower: Math.round(skillPower * 100) / 100,
    skills: skillsDefault.slice(0, 3 + Math.floor(Math.random() * 2)),
  };
}

module.exports = {
  generateCharacter,
};
