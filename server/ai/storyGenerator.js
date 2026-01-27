const gemini = require("../helpers/gemini");

/**
 * Generate story transition between nodes
 * @param {Object} params - Story parameters
 * @param {string} params.theme - Dungeon theme
 * @param {Object} params.currentNode - Current node info
 * @param {Object} params.nextNode - Next node info
 * @param {Object} params.partyState - Current party state
 * @param {string} params.language - Language for narrative
 * @returns {Promise<Object>} Story transition
 */
async function generateNodeTransition({ theme, currentNode, nextNode, partyState, language = "en" }) {
  const prompt = `You are a storyteller for a ${theme} themed dungeon adventure. Generate a brief narrative transition as the party moves from one location to another.

Current Location: ${currentNode.name} (${currentNode.type})
Next Location: ${nextNode.name} (${nextNode.type})
Party Size: ${partyState.playerCount} adventurers
Average HP: ${partyState.averageHP}%

Generate a 2-3 sentence narrative in ${language} describing:
1. The party leaving the current location
2. What they encounter or see along the way
3. Their arrival at the next location

Create atmosphere and build tension if they're heading to combat.

Generate ONLY valid JSON:
{
  "narrative": "Engaging transition narrative",
  "mood": "tense | hopeful | mysterious | triumphant"
}`;

  try {
    const aiResponse = await gemini("gemini-3-flash-preview", prompt);
    let cleaned = aiResponse
      .trim()
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Error generating node transition:", error);
    return {
      narrative: `The party moves from ${currentNode.name} toward ${nextNode.name}.`,
      mood: "neutral",
    };
  }
}

/**
 * Generate "story thus far" summary
 * @param {Object} params - Story parameters
 * @param {string} params.theme - Dungeon theme
 * @param {string} params.dungeonName - Dungeon name
 * @param {Array} params.gameLog - Array of game events
 * @param {Object} params.partyState - Current party state
 * @param {number} params.currentNode - Current node number
 * @param {number} params.totalNodes - Total nodes in dungeon
 * @param {string} params.language - Language for narrative
 * @returns {Promise<Object>} Story summary
 */
async function generateStoryThusFar({
  theme,
  dungeonName,
  gameLog,
  partyState,
  currentNode,
  totalNodes,
  language = "en",
}) {
  // Summarize key events from game log
  const battles = gameLog.filter((e) => e.type === "battle").length;
  const npcEvents = gameLog.filter((e) => e.type === "npc_event").length;
  const defeatedEnemies = gameLog.filter((e) => e.type === "battle" && e.result === "victory").length;

  const prompt = `You are a storyteller for ${dungeonName}, a ${theme} themed dungeon. Generate an engaging "story thus far" summary.

Journey Progress:
- Current Location: Node ${currentNode} of ${totalNodes}
- Battles Fought: ${battles}
- Enemies Defeated: ${defeatedEnemies}
- NPCs Encountered: ${npcEvents}
- Party Members: ${partyState.playerCount}
- Party Status: ${partyState.aliveCount} alive, ${partyState.averageHP}% average HP

Generate a compelling 3-4 sentence summary in ${language} that:
1. Recalls how the adventure began
2. Highlights key victories or challenges
3. Notes the current situation
4. Hints at what lies ahead

Make it dramatic and engaging!

Generate ONLY valid JSON:
{
  "summary": "Epic story summary",
  "keyMoments": ["moment 1", "moment 2", "moment 3"],
  "outlook": "promising | challenging | desperate | victorious"
}`;

  try {
    const aiResponse = await gemini("gemini-3-flash-preview", prompt);
    let cleaned = aiResponse
      .trim()
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Error generating story thus far:", error);
    return {
      summary: `The party has progressed through ${currentNode} of ${totalNodes} locations in ${dungeonName}, defeating ${defeatedEnemies} enemies along the way.`,
      keyMoments: [`Entered ${dungeonName}`, `Fought ${battles} battles`, `Currently at node ${currentNode}`],
      outlook: "challenging",
    };
  }
}

/**
 * Generate after-battle summary
 * @param {Object} params - Battle summary parameters
 * @param {string} params.theme - Dungeon theme
 * @param {Object} params.enemy - Defeated enemy info
 * @param {Array} params.battleLog - Battle events from this fight
 * @param {Object} params.partyState - Party state after battle
 * @param {Object} params.rewards - Rewards earned
 * @param {string} params.language - Language for narrative
 * @returns {Promise<Object>} Battle summary
 */
async function generateAfterBattleSummary({ theme, enemy, battleLog, partyState, rewards, language = "en" }) {
  const totalRounds = battleLog.length;
  const totalDamageDealt = battleLog.reduce((sum, round) => sum + (round.totalDamage || 0), 0);
  const criticalHits = battleLog.filter((round) => round.hasCritical).length;

  const prompt = `You are a storyteller for a ${theme} themed dungeon. Generate an epic after-battle summary.

Battle Details:
- Enemy: ${enemy.name} (${enemy.role})
- Battle Duration: ${totalRounds} rounds
- Total Damage Dealt: ${totalDamageDealt}
- Critical Hits: ${criticalHits}
- Survivors: ${partyState.aliveCount} of ${partyState.totalCount}
- Average HP Remaining: ${partyState.averageHP}%

Rewards:
- Experience: ${rewards.experience || 0}
- Gold: ${rewards.gold || 0}

Generate a dramatic 2-3 sentence summary in ${language} that:
1. Describes the final moments of the battle
2. Acknowledges the party's victory and any sacrifices
3. Mentions the rewards or what they found

Make it feel like an epic achievement!

Generate ONLY valid JSON:
{
  "summary": "Epic battle conclusion narrative",
  "tone": "triumphant | bittersweet | hard-won | costly",
  "quote": "Optional memorable quote from the battle"
}`;

  try {
    const aiResponse = await gemini("gemini-3-flash-preview", prompt);
    let cleaned = aiResponse
      .trim()
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Error generating after-battle summary:", error);
    return {
      summary: `After ${totalRounds} rounds of fierce combat, the ${enemy.name} falls. The party stands victorious but weary.`,
      tone: "triumphant",
      quote: null,
    };
  }
}

/**
 * Generate final game summary (after completing or failing dungeon)
 * @param {Object} params - Final summary parameters
 * @param {string} params.theme - Dungeon theme
 * @param {string} params.dungeonName - Dungeon name
 * @param {Array} params.completeGameLog - Complete game event log
 * @param {Object} params.finalStats - Final party statistics
 * @param {string} params.outcome - "victory" | "defeat"
 * @param {string} params.language - Language for narrative
 * @returns {Promise<Object>} Final game summary
 */
async function generateFinalGameSummary({ theme, dungeonName, completeGameLog, finalStats, outcome, language = "en" }) {
  const battles = completeGameLog.filter((e) => e.type === "battle").length;
  const victories = completeGameLog.filter((e) => e.type === "battle" && e.result === "victory").length;
  const npcEvents = completeGameLog.filter((e) => e.type === "npc_event").length;

  const prompt = `You are a master storyteller concluding an epic ${theme} adventure in ${dungeonName}. Generate a memorable final summary.

Adventure Statistics:
- Outcome: ${outcome.toUpperCase()}
- Total Battles: ${battles}
- Victories: ${victories}
- NPC Encounters: ${npcEvents}
- Total Damage Dealt: ${finalStats.totalDamage || 0}
- Total Healing: ${finalStats.totalHealing || 0}
- Critical Hits: ${finalStats.criticalHits || 0}
- Party Size: ${finalStats.partySize}
- Survivors: ${finalStats.survivors}

Generate an epic conclusion in ${language} (3-4 sentences) that:
1. Summarizes the entire journey
2. Highlights the most memorable moments
3. Acknowledges the ${outcome === "victory" ? "triumph" : "valiant effort"}
4. Provides closure to the story

Make it legendary!

Generate ONLY valid JSON:
{
  "summary": "Epic final summary narrative",
  "highlights": ["highlight 1", "highlight 2", "highlight 3"],
  "legendStatus": "legendary | heroic | valiant | tragic",
  "epitaph": "One sentence to remember this adventure by"
}`;

  try {
    const aiResponse = await gemini("gemini-3-flash-preview", prompt);
    let cleaned = aiResponse
      .trim()
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Error generating final game summary:", error);
    return {
      summary: `The adventure in ${dungeonName} has come to an end. Through ${battles} battles and ${npcEvents} encounters, the party's ${outcome === "victory" ? "courage led them to victory" : "bravery will be remembered"}.`,
      highlights: [`${victories} enemies defeated`, `${npcEvents} allies met`, `${outcome} achieved`],
      legendStatus: outcome === "victory" ? "heroic" : "valiant",
      epitaph: `Heroes who braved the ${theme}.`,
    };
  }
}

module.exports = {
  generateNodeTransition,
  generateStoryThusFar,
  generateAfterBattleSummary,
  generateFinalGameSummary,
};
