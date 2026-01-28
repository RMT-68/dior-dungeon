const gemini = require("../helpers/gemini");

/**
 * Generate battle narration and enemy AI response
 * @param {Object} params - Battle parameters
 * @param {string} params.theme - Dungeon theme
 * @param {Object} params.enemy - Current enemy state
 * @param {Array} params.playerActions - Array of player actions this round
 * @param {Object} params.battleState - Current battle state
 * @param {string} params.language - Language for narration
 * @returns {Promise<Object>} Battle result with narration and enemy action
 */
async function generateBattleNarration({ theme, enemy, playerActions, battleState, language = "en" }) {
  // Validate input
  if (!theme || !enemy || !playerActions || !battleState) {
    throw new Error("Missing required battle parameters");
  }

  // Calculate player action results with dice rolls
  const processedActions = playerActions.map((action) => {
    // REST actions already have their D6 diceRoll, don't generate a new one
    const diceRoll = action.type === "rest" ? action.diceRoll : rollD20();
    let result;

    if (action.type === "attack") {
      result = calculateDamage(action, diceRoll);
    } else if (action.type === "heal") {
      result = calculateHealing(action, diceRoll);
    } else if (action.type === "defend") {
      result = { type: "defend", defenseBonus: 0.4, diceRoll };
    } else if (action.type === "rest") {
      result = { type: "rest" };
    }

    return {
      playerId: action.playerId,
      playerName: action.playerName,
      actionType: action.type,
      skillName: action.skillName,
      diceRoll: diceRoll,
      ...result,
    };
  });

  // Calculate total damage to enemy
  const totalDamageToEnemy = processedActions
    .filter((a) => a.actionType === "attack")
    .reduce((sum, a) => sum + (a.finalDamage || 0), 0);

  const newEnemyHP = Math.max(0, enemy.hp - totalDamageToEnemy);
  const enemyDefeated = newEnemyHP <= 0;

  // Design the AI prompt for narration
  const prompt = `You are a Game Master for a ${theme} themed dungeon battle. Generate an engaging narrative description of the battle round.

Current Battle State:
- Enemy: ${enemy.name} (${enemy.role})
- Enemy HP: ${enemy.hp} → ${newEnemyHP}
- Round: ${battleState.currentRound}

Player Actions This Round:
${processedActions
  .map((a) => {
    if (a.actionType === "rest") {
      return `- ${a.playerName}: Took a rest and regained stamina (Dice: ${a.diceRoll}, Stamina Regained: ${a.staminaRegained})`;
    }
    return `- ${a.playerName}: ${a.actionType === "attack" ? `Attacked with ${a.skillName}` : a.actionType === "heal" ? `Healed with ${a.skillName}` : "Defended"} (Dice: ${a.diceRoll}${a.isCritical ? " CRITICAL!" : ""}${a.isMiss ? " MISS!" : ""})`;
  })
  .join("\n")}

Results:
- Total Damage Dealt: ${totalDamageToEnemy}
- Enemy Status: ${enemyDefeated ? "DEFEATED" : "Still Fighting"}

IMPORTANT:
1. Generate engaging narrative in ${language} language
2. Describe each player action dramatically
3. Include dice roll outcomes (critical hits, misses)
4. Describe enemy reactions and condition
5. ${
    !enemyDefeated
      ? `Decide enemy's next action strategically based on:
   - Enemy HP: ${((newEnemyHP / enemy.hp) * 100).toFixed(0)}% remaining
   - Enemy archetype: ${enemy.archetype}
   - Available skills: ${enemy.skills.map((s) => s.name).join(", ")}
   - Choose wisely: attack if healthy, heal if HP < 40%, use powerful skills if desperate`
      : "Describe the enemy's defeat dramatically"
  }

Generate ONLY valid JSON:
{
  "narrative": "Engaging 2-3 sentence description of the entire round",
  "playerNarratives": [
    {
      "playerId": "player-id",
      "narrative": "Specific description of this player's action and result"
    }
  ],
  "enemyAction": ${
    !enemyDefeated
      ? `{
    "skillUsed": "skill name from enemy's available skills",
    "narrative": "Description of enemy's action"
  }`
      : "null"
  }
}`;

  try {
    // Call Gemini AI
    const aiResponse = await gemini("gemini-3-flash-preview", prompt);

    // Clean and parse response
    let cleaned = aiResponse
      .trim()
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const narration = JSON.parse(cleaned);

    // Process enemy action if not defeated
    let enemyActionResult = null;
    if (!enemyDefeated && narration.enemyAction) {
      const enemySkill = enemy.skills.find((s) => s.name === narration.enemyAction.skillUsed);
      if (enemySkill) {
        const enemyDiceRoll = rollD20();

        if (enemySkill.type === "damage") {
          enemyActionResult = {
            type: "attack",
            skillName: enemySkill.name,
            baseDamage: enemySkill.amount,
            diceRoll: enemyDiceRoll,
            ...calculateEnemyDamage(enemySkill, enemyDiceRoll, enemy.skillPower),
            narrative: narration.enemyAction.narrative,
          };
        } else if (enemySkill.type === "healing") {
          enemyActionResult = {
            type: "heal",
            skillName: enemySkill.name,
            baseHeal: enemySkill.amount,
            diceRoll: enemyDiceRoll,
            healAmount: enemySkill.amount + Math.floor(enemyDiceRoll / 2),
            narrative: narration.enemyAction.narrative,
          };
        }
      }
    }

    return {
      success: true,
      round: battleState.currentRound,
      playerActions: processedActions,
      narrative: narration.narrative,
      playerNarratives: narration.playerNarratives,
      enemyAction: enemyActionResult,
      enemyHP: {
        previous: enemy.hp,
        current: newEnemyHP,
        damage: totalDamageToEnemy,
      },
      enemyDefeated: enemyDefeated,
      battleState: {
        ...battleState,
        currentRound: battleState.currentRound + 1,
      },
    };
  } catch (error) {
    console.error("Error generating battle narration:", error);

    // Fallback narration
    return createFallbackBattleResult({
      processedActions,
      enemy,
      newEnemyHP,
      totalDamageToEnemy,
      enemyDefeated,
      battleState,
    });
  }
}

/**
 * Roll a 20-sided die
 */
function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Calculate damage with dice roll and critical/miss logic
 */
function calculateDamage(action, diceRoll) {
  const isCritical = diceRoll >= 18;
  const isMiss = diceRoll <= 2;

  if (isMiss) {
    return {
      type: "attack",
      baseDamage: action.skillAmount,
      diceRoll: diceRoll,
      finalDamage: 0,
      isCritical: false,
      isMiss: true,
    };
  }

  // Base damage = skill amount × skill power + dice bonus
  let damage = action.skillAmount * action.skillPower + diceRoll / 10;

  if (isCritical) {
    damage *= 2;
  }

  return {
    type: "attack",
    baseDamage: action.skillAmount,
    diceRoll: diceRoll,
    finalDamage: Math.round(damage * 10) / 10,
    isCritical: isCritical,
    isMiss: false,
  };
}

/**
 * Calculate healing with dice roll
 */
function calculateHealing(action, diceRoll) {
  const baseHeal = action.skillAmount * action.skillPower;
  const diceBonus = diceRoll / 10;
  const finalHeal = Math.round((baseHeal + diceBonus) * 10) / 10;

  return {
    type: "heal",
    baseHeal: action.skillAmount,
    diceRoll: diceRoll,
    finalHeal: finalHeal,
  };
}

/**
 * Calculate enemy damage with skillPower multiplier
 */
function calculateEnemyDamage(skill, diceRoll, skillPower = 2.0) {
  const isCritical = diceRoll >= 18;
  const isMiss = diceRoll <= 2;

  if (isMiss) {
    return {
      finalDamage: 0,
      isCritical: false,
      isMiss: true,
    };
  }

  let damage = skill.amount * skillPower + diceRoll / 10;
  if (isCritical) {
    damage *= 2;
  }

  return {
    finalDamage: Math.round(damage * 10) / 10,
    isCritical: isCritical,
    isMiss: false,
  };
}

/**
 * Create fallback battle result if AI fails
 */
function createFallbackBattleResult({
  processedActions,
  enemy,
  newEnemyHP,
  totalDamageToEnemy,
  enemyDefeated,
  battleState,
}) {
  let narrative = `The battle rages on! `;

  processedActions.forEach((action) => {
    if (action.actionType === "attack") {
      if (action.isMiss) {
        narrative += `${action.playerName}'s attack misses! `;
      } else if (action.isCritical) {
        narrative += `${action.playerName} lands a CRITICAL HIT for ${action.finalDamage} damage! `;
      } else {
        narrative += `${action.playerName} deals ${action.finalDamage} damage. `;
      }
    } else if (action.actionType === "heal") {
      narrative += `${action.playerName} heals for ${action.finalHeal}. `;
    } else {
      narrative += `${action.playerName} takes a defensive stance. `;
    }
  });

  if (enemyDefeated) {
    narrative += `The ${enemy.name} has been defeated!`;
  } else {
    narrative += `The ${enemy.name} prepares to strike back!`;
  }

  // Simple enemy AI: heal if low HP, otherwise attack
  let enemyAction = null;
  if (!enemyDefeated) {
    const lowHP = newEnemyHP / enemy.hp < 0.4;
    const healSkill = enemy.skills.find((s) => s.type === "healing");
    const attackSkill = enemy.skills.find((s) => s.type === "damage");

    if (lowHP && healSkill) {
      const diceRoll = rollD20();
      enemyAction = {
        type: "heal",
        skillName: healSkill.name,
        baseHeal: healSkill.amount,
        diceRoll: diceRoll,
        healAmount: healSkill.amount + Math.floor(diceRoll / 2),
        narrative: `The ${enemy.name} uses ${healSkill.name}!`,
      };
    } else if (attackSkill) {
      const diceRoll = rollD20();
      enemyAction = {
        type: "attack",
        skillName: attackSkill.name,
        baseDamage: attackSkill.amount,
        diceRoll: diceRoll,
        ...calculateEnemyDamage(attackSkill, diceRoll, enemy.skillPower),
        narrative: `The ${enemy.name} attacks with ${attackSkill.name}!`,
      };
    }
  }

  return {
    success: true,
    round: battleState.currentRound,
    playerActions: processedActions,
    narrative: narrative,
    playerNarratives: processedActions.map((a) => ({
      playerId: a.playerId,
      narrative: `${a.playerName}'s action: ${a.actionType}`,
    })),
    enemyAction: enemyAction,
    enemyHP: {
      previous: enemy.hp,
      current: newEnemyHP,
      damage: totalDamageToEnemy,
    },
    enemyDefeated: enemyDefeated,
    battleState: {
      ...battleState,
      currentRound: battleState.currentRound + 1,
    },
  };
}

module.exports = {
  generateBattleNarration,
  rollD20,
};
