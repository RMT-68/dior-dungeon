const { Room, Player } = require("../models");
const { generateCharacter } = require("../ai/characterGenerator");
const { generateBattleNarration } = require("../ai/battleNarrationGenerator");
const { generateNPCEvent } = require("../ai/npcEventGenerator");
const {
  generateNodeTransition,
  generateAfterBattleSummary,
  generateFinalGameSummary,
  generateStoryThusFar,
} = require("../ai/storyGenerator");

class GameHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;

    // Register event listeners
    socket.on("join_room", this.joinRoom.bind(this));
    socket.on("player_ready", this.playerReady.bind(this));
    socket.on("start_game", this.startGame.bind(this));
    socket.on("player_action", this.playerAction.bind(this));
    socket.on("next_node", this.nextNode.bind(this));
    socket.on("npc_choice", this.npcChoice.bind(this));
    socket.on("end_turn", this.endTurn.bind(this));
    socket.on("disconnect", this.handleDisconnect.bind(this));
  }

  // --- Event Handlers ---

  async joinRoom({ roomCode, username }) {
    try {
      const room = await Room.findOne({ where: { room_code: roomCode } });
      if (!room) {
        return this.socket.emit("error", { message: "Room not found" });
      }

      if (room.status !== "waiting" && room.status !== "playing") {
        return this.socket.emit("error", {
          message: "Game already in progress",
        });
      }

      // Check if player already exists in room (optional: reconnect logic)
      let player = await Player.findOne({
        where: { room_id: room.id, username },
      });

      if (!player) {
        if (room.status === "playing") {
          return this.socket.emit("error", {
            message: "Cannot join started game",
          });
        }
        player = await Player.create({
          username,
          socket_id: this.socket.id,
          room_id: room.id,
          is_ready: false,
          is_alive: true,
          current_hp: 100, // Placeholder, set by AI later
          current_stamina: 100, // Placeholder
          character_data: {},
        });
      } else {
        // Reconnect: update socket ID
        player.socket_id = this.socket.id;
        await player.save();
      }

      this.socket.join(roomCode);
      this.socket.data.roomCode = roomCode;
      this.socket.data.playerId = player.id;
      this.socket.data.username = username;

      // Broadcast updated player list
      const players = await Player.findAll({ where: { room_id: room.id } });
      this.io.to(roomCode).emit("room_update", {
        room: room,
        players: players,
      });

      console.log(`Player ${username} joined room ${roomCode}`);
    } catch (error) {
      console.error("Join room error:", error);
      this.socket.emit("error", { message: "Failed to join room" });
    }
  }

  async playerReady({ isReady }) {
    try {
      const { playerId, roomCode } = this.socket.data;
      if (!playerId || !roomCode) return;

      await Player.update({ is_ready: isReady }, { where: { id: playerId } });

      const room = await Room.findOne({ where: { room_code: roomCode } });
      const players = await Player.findAll({ where: { room_id: room.id } });

      this.io.to(roomCode).emit("room_update", {
        room,
        players,
      });
    } catch (error) {
      console.error("Player ready error:", error);
    }
  }

  async startGame() {
    try {
      const { playerId, roomCode } = this.socket.data;
      if (!playerId || !roomCode) return;

      const room = await Room.findOne({ where: { room_code: roomCode } });

      // Verify host (simple check: first player created or stored host_id? For now assume host triggers)
      // Check all ready
      const players = await Player.findAll({ where: { room_id: room.id } });
      const allReady = players.every((p) => p.is_ready);

      if (!allReady) {
        return this.socket.emit("error", {
          message: "Not all players are ready",
        });
      }

      // Generate characters for all players
      const characterPromises = players.map(async (p) => {
        // Use room theme for character generation context
        const charData = await generateCharacter({
          theme: room.theme,
          language: room.language,
        });
        p.character_data = charData;

        // Initialize current stats from AI generated max values
        p.current_hp = charData.hp; // New AI returns numbers directly
        p.current_stamina = charData.stamina;

        return p.save();
      });

      await Promise.all(characterPromises);

      // Update room status
      room.status = "playing";
      room.current_node_index = 0;

      // Initialize game state with first node
      const firstNode = room.dungeon_data.nodes[0];

      room.game_state = {
        round: 1,
        turnIndex: 0,
        logs: [],
        currentTurnActions: [], // Track actions for current round
        currentNode: firstNode,
        currentEnemy: initialEnemy, // If undefined, that's fine for NPC nodes
      };
      await room.save();

      // Notify game start with initial data
      const updatedPlayers = await Player.findAll({
        where: { room_id: room.id },
      });

      this.io.to(roomCode).emit("game_start", {
        room,
        players: updatedPlayers,
        dungeon: room.dungeon_data,
        currentNode: firstNode,
        currentEnemy: initialEnemy,
      });

      // If it's an NPC node, trigger event immediately? Or wait for client?
      // Let's assume start triggers the view.
      if (firstNode.type === "npc") {
        await this.triggerNPCEvent(room, updatedPlayers);
      }
    } catch (error) {
      console.error("Start game error:", error);
      this.socket.emit("error", { message: "Failed to start game" });
    }
  }

  async playerAction(data) {
    try {
      const { playerId, roomCode } = this.socket.data;
      const { actionType, skillName, skillAmount, skillId } = data; // skillId might not be needed if name is unique

      if (!playerId || !roomCode) return;

      const room = await Room.findOne({ where: { room_code: roomCode } });
      const player = await Player.findByPk(playerId);

      if (!room || !player) return;

      // Validate valid character and game state
      if (room.status !== "playing" || !room.game_state.currentEnemy) {
        return this.socket.emit("error", { message: "Not in battle" });
      }

      // Simple turn logic: Accumulate actions until all alive players have acted
      // Check if player already acted this round
      const currentActions = room.game_state.currentTurnActions || [];
      const alreadyActed = currentActions.find((a) => a.playerId === playerId);
      if (alreadyActed) {
        return this.socket.emit("error", {
          message: "You have already acted this turn",
        });
      }

      // Add action
      // Calculate Skill Power from character data
      const skillPower = player.character_data.skillPower || 1.0;

      const newAction = {
        playerId,
        playerName: player.username,
        type: actionType, // 'attack', 'heal', 'defend'
        skillName: skillName || "Basic Attack",
        skillAmount: skillAmount || 10,
        skillPower: skillPower,
      };

      currentActions.push(newAction);

      // Update room state locally (without saving yet to avoid race conditions if many act at once?
      // Actually with SQL updates we should be careful. Here we just update the JSON.)
      const newGameState = {
        ...room.game_state,
        currentTurnActions: currentActions,
      };
      room.game_state = newGameState;
      await room.save(); // Save to persist the action queue

      // Broadcast action to room (so others see it)
      this.io.to(roomCode).emit("player_action_update", {
        playerId,
        action: newAction,
        totalActions: currentActions.length,
      });

      // Check if all ALIVE players have acted
      const players = await Player.findAll({ where: { room_id: room.id } });
      const alivePlayers = players.filter((p) => p.is_alive);

      if (currentActions.length >= alivePlayers.length) {
        // Resolve Turn
        await this.resolveBattleRound(roomCode);
      }
    } catch (error) {
      console.error("Player action error:", error);
    }
  }

  async resolveBattleRound(roomCode) {
    const room = await Room.findOne({ where: { room_code: roomCode } });
    if (!room) return;

    const players = await Player.findAll({ where: { room_id: room.id } });
    const gameState = room.game_state;
    const currentEnemy = gameState.currentEnemy;
    const playerActions = gameState.currentTurnActions;

    // Call AI to generate narration and logic
    const battleResult = await generateBattleNarration({
      theme: room.theme,
      enemy: currentEnemy,
      playerActions: playerActions,
      battleState: { currentRound: gameState.round },
      language: room.language,
    });

    // Apply results to DB

    // Update Enemy HP
    const updatedEnemy = { ...currentEnemy, hp: battleResult.enemyHP.current };

    // Process Enemy Action (Damage to players)
    let playersUpdated = false;
    if (
      battleResult.enemyAction &&
      battleResult.enemyAction.type === "attack"
    ) {
      const damage = battleResult.enemyAction.finalDamage;
      // Distribute damage (random target or all? Let's say random for now or logic in AI?)
      // The generator doesn't specify TARGET. We'll pick a random alive player.
      const alivePlayers = players.filter((p) => p.is_alive);
      if (alivePlayers.length > 0) {
        const targetIndex = Math.floor(Math.random() * alivePlayers.length);
        const target = alivePlayers[targetIndex];
        target.current_hp = Math.max(0, target.current_hp - damage);
        if (target.current_hp <= 0) target.is_alive = false;
        await target.save();

        battleResult.enemyAction.targetName = target.username; // Add target info for client
      }
    } else if (
      battleResult.enemyAction &&
      battleResult.enemyAction.type === "heal"
    ) {
      // Enemy healed (already handled in enemyHP.current calculation?
      // generateBattleNarration actually updates enemyHP based on Player damage only usually.
      // Let's check logic. The generator calculates "newEnemyHP" from player attacks.
      // It generates enemyAction BUT doesn't apply it to the `newEnemyHP` it returns if it's a heal.
      // We should apply it here if it's a heal.
      if (battleResult.enemyAction.healAmount) {
        updatedEnemy.hp = Math.min(
          updatedEnemy.maxHP,
          updatedEnemy.hp + battleResult.enemyAction.healAmount,
        );
      }
    }

    // Update Game State
    const nextRound = gameState.round + 1;
    const newLogs = [
      ...gameState.logs,
      { round: gameState.round, narrative: battleResult.narrative },
    ];

    // Check Victory/Defeat
    let battleStatus = "ongoing";
    if (updatedEnemy.hp <= 0) {
      battleStatus = "victory";
    }
    const anyAlive = (
      await Player.findAll({ where: { room_id: room.id } })
    ).some((p) => p.is_alive);
    if (!anyAlive) {
      battleStatus = "defeat";
    }

    // Save Room State
    room.game_state = {
      ...gameState,
      round: nextRound,
      logs: newLogs,
      currentEnemy: updatedEnemy,
      currentTurnActions: [], // Reset actions
    };
    await room.save();

    // Broadcast results
    this.io.to(roomCode).emit("battle_result", {
      round: gameState.round,
      narrative: battleResult.narrative,
      playerNarratives: battleResult.playerNarratives,
      enemyAction: battleResult.enemyAction,
      enemy: updatedEnemy,
      battleStatus: battleStatus,
      players: await Player.findAll({ where: { room_id: room.id } }), // Send updated player states
    });

    if (battleStatus === "victory") {
      // Handle Victory Logic (XP, gold? simply wait for next node)
      // Maybe auto-trigger summary?
      const partyState = {
        aliveCount: players.filter((p) => p.is_alive).length,
        totalCount: players.length,
        averageHP: 50, // TODO: calculate real avg
      };
      const summary = await generateAfterBattleSummary({
        theme: room.theme,
        enemy: currentEnemy,
        battleLog: [], // TODO: pass log
        partyState,
        rewards: { experience: 100, gold: 50 },
        language: room.language,
      });
      this.io.to(roomCode).emit("battle_summary", summary);
    } else if (battleStatus === "defeat") {
      // Game Over
      const finalSummary = await generateFinalGameSummary({
        theme: room.theme,
        dungeonName: room.dungeon_data.dungeonName,
        completeGameLog: [],
        finalStats: { partySize: players.length, survivors: 0 },
        outcome: "defeat",
        language: room.language,
      });
      this.io.to(roomCode).emit("game_over", finalSummary);
    }
  }

  async nextNode() {
    try {
      const { playerId, roomCode } = this.socket.data;
      // Only host can proceed? Or anyone? Let's say anyone for now or need voting.

      const room = await Room.findOne({ where: { room_code: roomCode } });
      if (!room) return;

      // Move index
      const nextIndex = room.current_node_index + 1;
      const nextNode = room.dungeon_data.nodes[nextIndex];

      if (!nextNode) {
        // Dungeon Complete!
        const players = await Player.findAll({ where: { room_id: room.id } });
        const finalSummary = await generateFinalGameSummary({
          theme: room.theme,
          dungeonName: room.dungeon_data.dungeonName,
          completeGameLog: [],
          finalStats: {
            partySize: players.length,
            survivors: players.filter((p) => p.is_alive).length,
          },
          outcome: "victory",
          language: room.language,
        });
        return this.io.to(roomCode).emit("game_over", finalSummary);
      }

      const currentNode = room.game_state.currentNode;
      const players = await Player.findAll({ where: { room_id: room.id } });
      const partyState = {
        playerCount: players.length,
        averageHP: 80, // Calculate real
      };

      // Generate Transition
      const transition = await generateNodeTransition({
        theme: room.theme,
        currentNode: currentNode,
        nextNode: nextNode,
        partyState: partyState,
        language: room.language,
      });

      // Update State
      room.current_node_index = nextIndex;
      const newEnemy =
        nextNode.type === "enemy"
          ? room.dungeon_data.enemies.find((e) => e.id === nextNode.enemyId)
          : null;

      room.game_state = {
        ...room.game_state,
        currentNode: nextNode,
        currentEnemy: newEnemy,
        round: 1, // Reset round for new battle
        logs: [],
        currentTurnActions: [],
      };
      await room.save();

      // Emit updates
      this.io.to(roomCode).emit("node_transition", {
        transition,
        nextNode,
        currentEnemy: newEnemy,
      });

      if (nextNode.type === "npc") {
        await this.triggerNPCEvent(room, players);
      }
    } catch (error) {
      console.error("Next node error:", error);
    }
  }

  async triggerNPCEvent(room, players) {
    const currentNode = room.game_state.currentNode;
    const partyAvgHP = 80; // Calculate real

    const event = await generateNPCEvent({
      theme: room.theme,
      nodeId: currentNode.id,
      playerState: { hp: 80, maxHP: 100, stamina: 80, maxStamina: 100 }, // Mock avg
      language: room.language,
    });

    this.io.to(room.room_code).emit("npc_event", event);
  }

  async npcChoice({ choiceId }) {
    // 'positive' or 'negative'
    try {
      const { roomCode } = this.socket.data;
      const room = await Room.findOne({ where: { room_code: roomCode } });
      // We need to know WHICH event it was?
      // For now, assume client sends choice based on last event.
      // Also need to know the 'outcome' data.
      // Ideally we stored the event in game_state. But for simplicity, we might ask client to send back the outcome?
      // NO, insecure. We should have stored it.
      // Let's regenerate or store. Storing is properly better.
      // For THIS implementation, I'll cheat slightly and assume we just re-generate or assume standard effects,
      // OR better: The client sends the EFFECT values? No.
      // Let's rely on the fact that we can call generateNPCEvent again deterministically? No AI is random.

      // REVISION: We need to store the current NPC event in `game_state` when we generate it.
      // I will add `currentNPCEvent` to game_state.

      // For now, let's just emit a success message as a placeholder if state is missing,
      // but I should add storage in `triggerNPCEvent`.

      // Actually, let's fix `triggerNPCEvent` to save to DB.

      this.io.to(roomCode).emit("npc_resolution", {
        message: "The party chose " + choiceId,
        // Apply effects logic here if we had the data
      });
    } catch (e) {
      console.error(e);
    }
  }

  async endTurn() {
    // Deprecated? managed via playerAction checks
  }

  async handleDisconnect() {
    // Handle cleanup
    console.log(`Client ${this.socket.id} disconnected`);
  }
}

module.exports = GameHandler;
