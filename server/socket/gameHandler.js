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
    this.actionTimers = new Map(); // Track timers: "roomCode:playerId" -> timeoutId

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

      if (room.status === "playing") {
        // Generate Story Thus Far for joining player
        try {
          const history = room.game_state.adventure_log || [];
          const playersInRoom = await Player.findAll({
            where: { room_id: room.id },
          });
          const avgHP = Math.round(playersInRoom.reduce((sum, p) => sum + p.current_hp, 0) / playersInRoom.length);
          const partyState = {
            playerCount: playersInRoom.length,
            aliveCount: playersInRoom.filter((p) => p.is_alive).length,
            averageHP: avgHP,
          };

          const summary = await generateStoryThusFar({
            theme: room.theme,
            dungeonName: room.dungeon_data.dungeonName,
            gameLog: history,
            partyState: partyState,
            currentNode: room.current_node_index + 1,
            totalNodes: room.dungeon_data.nodes.length,
            language: room.language,
          });

          this.socket.emit("story_summary", summary);
        } catch (e) {
          console.error("Error generating summary on join:", e);
        }

        // Reconnection: Sync Game State to the user
        const updatedPlayers = await Player.findAll({
          where: { room_id: room.id },
        });

        this.socket.emit("game_start", {
          room,
          players: updatedPlayers,
          dungeon: room.dungeon_data,
          currentNode: room.game_state.currentNode,
          currentEnemy: room.game_state.currentEnemy,
        });

        // Restore specific scene state
        if (room.game_state.currentNPCEvent) {
          const choosingPlayer = updatedPlayers.find((p) => p.id === room.game_state.npcChoosingPlayerId);
          this.socket.emit("npc_event", {
            event: room.game_state.currentNPCEvent,
            choosingPlayerId: room.game_state.npcChoosingPlayerId,
            choosingPlayerName: choosingPlayer ? choosingPlayer.username : "Unknown",
          });
        } else if (room.game_state.currentEnemy) {
          this.socket.emit("round_started", {
            round: room.game_state.round,
            narrative: "Resuming battle...",
          });

          const currentActions = room.game_state.currentTurnActions || [];
          const alivePlayers = updatedPlayers.filter((p) => p.is_alive);
          const playersWhoActed = currentActions.map((a) => a.playerId);
          const playersStillWaiting = alivePlayers.filter((p) => !playersWhoActed.includes(p.id));

          this.socket.emit("waiting_for_players", {
            actedCount: currentActions.length,
            totalCount: alivePlayers.length,
            waitingFor: playersStillWaiting.map((p) => ({
              id: p.id,
              username: p.username,
            })),
          });
        }
      }

      console.log(`Player ${username} joined room ${roomCode}`);
    } catch (error) {
      console.error("Join room error:", error);
      this.socket.emit("error", { message: "Failed to join room" });
    }
  }

  async playerReady({ isReady }) {
    try {
      const { playerId, roomCode } = this.socket.data;
      if (!playerId || !roomCode) {
        return this.socket.emit("error", { message: "Invalid session" });
      }

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
        p.current_hp = parseInt(charData.hp) || 100;
        p.current_stamina = parseInt(charData.stamina) || 100;

        return p.save();
      });

      await Promise.all(characterPromises);

      // Update room status
      room.status = "playing";
      room.current_node_index = 0;

      // Initialize game state with first node
      const firstNode = room.dungeon_data.nodes[0];
      const initialEnemy =
        firstNode.type === "enemy" ? room.dungeon_data.enemies.find((e) => e.id === firstNode.enemyId) : null;

      room.game_state = {
        round: 1,
        turnIndex: 0,
        logs: [], // Current battle logs
        adventure_log: [], // Global history: { type: 'battle'|'npc_event', result: 'victory'|..., details: ... }
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

      // Clear action timer for this player
      const timerKey = `${roomCode}:${playerId}`;
      if (this.actionTimers.has(timerKey)) {
        clearTimeout(this.actionTimers.get(timerKey));
        this.actionTimers.delete(timerKey);
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

      // If this is the first action in this round, start action timers for all players
      if (currentActions.length === 0) {
        this.startActionTimers(roomCode, 30000);
      }

      // Handle REST action
      if (actionType === "rest") {
        const diceRoll = Math.floor(Math.random() * 6) + 1; // 1d6 for stamina regen
        const staminaRegained = diceRoll;
        player.current_stamina = Math.min(player.character_data.maxStamina, player.current_stamina + staminaRegained);
        await player.save();

        const newAction = {
          playerId,
          playerName: player.username,
          type: "rest",
          skillName: "Rest",
          staminaRegained: staminaRegained,
          diceRoll: diceRoll,
          skillPower: 0,
        };

        currentActions.push(newAction);
        const newGameState = {
          ...room.game_state,
          currentTurnActions: currentActions,
        };
        room.game_state = newGameState;
        await room.save();

        this.io.to(roomCode).emit("player_action_update", {
          playerId,
          action: newAction,
          totalActions: currentActions.length,
        });

        const playersCheck = await Player.findAll({
          where: { room_id: room.id },
        });
        const alivePlayers = playersCheck.filter((p) => p.is_alive);

        if (currentActions.length >= alivePlayers.length) {
          await this.resolveBattleRound(roomCode);
        }
        return;
      }

      // Find the skill in character data
      const skill = player.character_data?.skills?.find((s) => s.name === (skillName || "Basic Attack"));
      if (!skill) {
        return this.socket.emit("error", { message: "Skill not found" });
      }
      const staminaCost = skill.staminaCost;

      // Check if player has enough stamina
      if (player.current_stamina < staminaCost) {
        return this.socket.emit("error", {
          message: `Not enough stamina. Required: ${staminaCost}, Have: ${player.current_stamina}`,
        });
      }

      // Deduct stamina cost
      player.current_stamina = Math.max(0, player.current_stamina - staminaCost);
      await player.save();

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
        staminaCost: staminaCost,
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
      } else {
        // Emit waiting state - show who has acted and who hasn't
        const playersWhoActed = currentActions.map((a) => a.playerId);
        const playersStillWaiting = alivePlayers.filter((p) => !playersWhoActed.includes(p.id));

        this.io.to(roomCode).emit("waiting_for_players", {
          actedCount: currentActions.length,
          totalCount: alivePlayers.length,
          waitingFor: playersStillWaiting.map((p) => ({
            id: p.id,
            username: p.username,
          })),
        });
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
    if (battleResult.enemyAction && battleResult.enemyAction.type === "attack") {
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
    } else if (battleResult.enemyAction && battleResult.enemyAction.type === "heal") {
      // Enemy healed (already handled in enemyHP.current calculation?
      // generateBattleNarration actually updates enemyHP based on Player damage only usually.
      // Let's check logic. The generator calculates "newEnemyHP" from player attacks.
      // It generates enemyAction BUT doesn't apply it to the `newEnemyHP` it returns if it's a heal.
      // We should apply it here if it's a heal.
      if (battleResult.enemyAction.healAmount) {
        updatedEnemy.hp = Math.min(updatedEnemy.maxHP, updatedEnemy.hp + battleResult.enemyAction.healAmount);
      }
    }

    // Regenerate stamina for all alive players (+1 per round)
    players.forEach((p) => {
      if (p.is_alive) {
        p.current_stamina = Math.min(p.character_data.maxStamina, p.current_stamina + 1);
      }
    });
    await Promise.all(players.map((p) => p.save()));

    // Calculate round stats from actual player actions
    const totalDamage = battleResult.playerActions
      .filter((action) => action.actionType === "attack")
      .reduce((sum, action) => sum + (action.finalDamage || 0), 0);

    const hasCritical = battleResult.playerActions.some((action) => action.isCritical === true);

    // Update Game State
    const nextRound = gameState.round + 1;
    const roundLog = {
      round: gameState.round,
      narrative: battleResult.narrative,
      totalDamage: Math.round(totalDamage * 10) / 10, // Round to 1 decimal
      hasCritical: hasCritical,
    };

    const newLogs = [...gameState.logs, roundLog];

    // Check Victory/Defeat
    let battleStatus = "ongoing";
    let adventureLogObj = null;

    if (updatedEnemy.hp <= 0) {
      battleStatus = "victory";
      adventureLogObj = {
        type: "battle",
        result: "victory",
        enemy: currentEnemy.name,
        round: gameState.round,
      };
    }
    const anyAlive = players.some((p) => p.is_alive);
    if (!anyAlive) {
      battleStatus = "defeat";
      adventureLogObj = {
        type: "battle",
        result: "defeat",
        enemy: currentEnemy.name,
        round: gameState.round,
      };
    }

    // Save Room State
    room.game_state = {
      ...gameState,
      round: nextRound,
      logs: newLogs,
      currentEnemy: updatedEnemy,
      adventure_log: adventureLogObj
        ? [...(gameState.adventure_log || []), adventureLogObj]
        : gameState.adventure_log || [],
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
      players: players, // Send updated player states
    });

    // Clear all action timers for this room
    const players_db = players;
    players_db.forEach((p) => {
      const timerKey = `${roomCode}:${p.id}`;
      if (this.actionTimers.has(timerKey)) {
        clearTimeout(this.actionTimers.get(timerKey));
        this.actionTimers.delete(timerKey);
      }
    });
    // Note: Timers will be restarted when first player acts in next round

    // Emit round start event for ongoing battles (clients will show "Round X started")
    if (battleStatus === "ongoing") {
      this.io.to(roomCode).emit("round_started", {
        round: nextRound,
        narrative: "A new round begins. Prepare your actions!",
      });
    }

    if (battleStatus === "victory") {
      // Handle Victory Logic (XP, gold? simply wait for next node)
      // Maybe auto-trigger summary?
      const avgHP = Math.round(players.reduce((sum, p) => sum + p.current_hp, 0) / players.length);
      const partyState = {
        aliveCount: players.filter((p) => p.is_alive).length,
        totalCount: players.length,
        averageHP: avgHP,
      };

      // Dynamic Rewards Calculation
      const baseXP = 50;
      const xpBonus = currentEnemy.maxHP ? Math.floor(currentEnemy.maxHP / 5) : 10;
      const goldReward = Math.floor(Math.random() * 50) + 20;

      const summary = await generateAfterBattleSummary({
        theme: room.theme,
        enemy: currentEnemy,
        battleLog: newLogs,
        partyState,
        rewards: { experience: baseXP + xpBonus, gold: goldReward },
        language: room.language,
      });
      this.io.to(roomCode).emit("battle_summary", summary);
    } else if (battleStatus === "defeat") {
      // Game Over
      const finalSummary = await generateFinalGameSummary({
        theme: room.theme,
        dungeonName: room.dungeon_data.dungeonName,
        completeGameLog: room.game_state.adventure_log || [],
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
          completeGameLog: room.game_state.adventure_log || [],
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
      const avgHP = Math.round(players.reduce((sum, p) => sum + p.current_hp, 0) / players.length);
      const partyState = {
        playerCount: players.length,
        averageHP: avgHP,
      };

      // Generate Transition
      const transition = await generateNodeTransition({
        theme: room.theme,
        currentNode: currentNode,
        nextNode: nextNode,
        partyState: partyState,
        language: room.language,
      });

      // Regenerate half stamina for all players on node transition
      await Promise.all(
        players.map(async (p) => {
          const staminaRegen = Math.ceil(p.character_data.maxStamina / 2);
          p.current_stamina = Math.min(p.character_data.maxStamina, p.current_stamina + staminaRegen);
          return p.save();
        }),
      );

      // Update State
      room.current_node_index = nextIndex;
      const newEnemy =
        nextNode.type === "enemy" ? room.dungeon_data.enemies.find((e) => e.id === nextNode.enemyId) : null;

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

    // Calculate actual party averages
    const avgHP = Math.round(players.reduce((sum, p) => sum + p.current_hp, 0) / players.length);
    const avgMaxHP = Math.round(players.reduce((sum, p) => sum + p.character_data.maxHP, 0) / players.length);
    const avgStamina = Math.round(players.reduce((sum, p) => sum + p.current_stamina, 0) / players.length);
    const avgMaxStamina = Math.round(players.reduce((sum, p) => sum + p.character_data.maxStamina, 0) / players.length);

    const event = await generateNPCEvent({
      theme: room.theme,
      nodeId: currentNode.id,
      playerState: {
        hp: avgHP,
        maxHP: avgMaxHP,
        stamina: avgStamina,
        maxStamina: avgMaxStamina,
      },
      language: room.language,
    });

    // Select a random player to make the choice
    const choosingPlayerIndex = Math.floor(Math.random() * players.length);
    const choosingPlayer = players[choosingPlayerIndex];

    // Store event in game_state with choosing player info
    room.game_state = {
      ...room.game_state,
      currentNPCEvent: event,
      npcChoosingPlayerId: choosingPlayer.id,
      adventure_log: [...(room.game_state.adventure_log || []), { type: "npc_event", npc: event.npcName }],
    };
    await room.save();

    // Emit event to all players, but indicate who gets to choose
    // Use room.room_code from DB or fallback to stored roomCode
    const roomCodeForEmit = room.room_code || room.room_code;
    this.io.to(roomCodeForEmit).emit("npc_event", {
      event: event,
      choosingPlayerId: choosingPlayer.id,
      choosingPlayerName: choosingPlayer.username,
    });
  }

  async npcChoice({ choiceId }) {
    try {
      const { roomCode, playerId } = this.socket.data;
      const room = await Room.findOne({ where: { room_code: roomCode } });
      const players = await Player.findAll({ where: { room_id: room.id } });

      if (!room || !room.game_state.currentNPCEvent) {
        return this.socket.emit("error", { message: "No active NPC event" });
      }

      // Verify the choosing player made the choice
      if (room.game_state.npcChoosingPlayerId !== playerId) {
        return this.socket.emit("error", {
          message: "Only the chosen player can make this decision",
        });
      }

      // Get the event and find the chosen outcome
      const currentEvent = room.game_state.currentNPCEvent;
      const choice = currentEvent.choices.find((c) => c.id === choiceId);

      if (!choice) {
        return this.socket.emit("error", { message: "Invalid choice" });
      }

      const effects = choice.outcome.effects;

      // Apply effects to all players
      await Promise.all(
        players.map(async (p) => {
          // Apply HP bonus (both current and max)
          if (effects.hpBonus) {
            p.current_hp = Math.max(0, p.current_hp + effects.hpBonus);
            p.character_data.maxHP = Math.max(1, p.character_data.maxHP + effects.hpBonus);
          }

          // Apply Stamina bonus (both current and max)
          if (effects.staminaBonus) {
            p.current_stamina = Math.max(
              0,
              Math.min(p.character_data.maxStamina, p.current_stamina + effects.staminaBonus),
            );
            p.character_data.maxStamina = Math.max(1, p.character_data.maxStamina + effects.staminaBonus);
          }

          // Apply Skill Power bonus
          if (effects.skillPowerBonus) {
            p.character_data.skillPower = (p.character_data.skillPower || 1.0) + effects.skillPowerBonus;
          }

          return p.save();
        }),
      );

      // Log the NPC choice result to adventure log
      const choosingPlayer = players.find((p) => p.id === room.game_state.npcChoosingPlayerId);
      if (!choosingPlayer) {
        console.error("Choosing player not found");
        return this.socket.emit("error", { message: "Invalid game state" });
      }
      room.game_state = {
        ...room.game_state,
        adventure_log: [
          ...(room.game_state.adventure_log || []),
          {
            type: "npc_choice",
            npc: currentEvent.npcName,
            chooser: choosingPlayer.username,
            choiceId: choiceId,
            outcome: choice.outcome.narrative,
            effects: effects,
          },
        ],
        currentNPCEvent: null,
        npcChoosingPlayerId: null,
      };
      await room.save();

      // Broadcast resolution
      const updatedPlayers = await Player.findAll({
        where: { room_id: room.id },
      });
      this.io.to(roomCode).emit("npc_resolution", {
        narrative: choice.outcome.narrative,
        effects: effects,
        players: updatedPlayers,
      });
    } catch (e) {
      console.error("NPC choice error:", e);
      this.socket.emit("error", { message: "Failed to process NPC choice" });
    }
  }

  async endTurn() {
    // Deprecated? managed via playerAction checks
  }

  async handleDisconnect() {
    // Handle cleanup
    console.log(`Client ${this.socket.id} disconnected`);
  }

  // --- Helper Methods ---

  startActionTimers(roomCode, timeoutMs) {
    // Set timer for each player to auto-submit rest action if they don't act
    Room.findOne({ where: { room_code: roomCode } }).then((room) => {
      Player.findAll({ where: { room_id: room.id } }).then((players) => {
        players.forEach((player) => {
          const timerKey = `${roomCode}:${player.id}`;
          const timeoutId = setTimeout(async () => {
            // Auto-submit rest action for this player
            await this.autoSubmitRestAction(roomCode, player.id);
          }, timeoutMs);
          this.actionTimers.set(timerKey, timeoutId);
        });

        // Notify clients that action timers have started
        this.io.to(roomCode).emit("timer_started", {
          timeoutMs: timeoutMs,
          timeoutSeconds: Math.floor(timeoutMs / 1000),
          players: players.map((p) => ({ id: p.id, username: p.username })),
        });
      });
    });
  }

  async autoSubmitRestAction(roomCode, playerId) {
    try {
      const room = await Room.findOne({ where: { room_code: roomCode } });
      if (!room || room.status !== "playing") return;

      const player = await Player.findByPk(playerId);
      if (!player) return;

      // Check if player already acted
      const currentActions = room.game_state.currentTurnActions || [];
      const alreadyActed = currentActions.find((a) => a.playerId === playerId);
      if (alreadyActed) return;

      // Auto-submit rest action
      const diceRoll = Math.floor(Math.random() * 6) + 1;
      const staminaRegained = diceRoll;
      player.current_stamina = Math.min(player.character_data.maxStamina, player.current_stamina + staminaRegained);
      await player.save();

      const newAction = {
        playerId,
        playerName: player.username,
        type: "rest",
        skillName: "Rest",
        staminaRegained: staminaRegained,
        diceRoll: diceRoll,
        skillPower: 0,
        auto: true, // Flag to indicate auto-submitted action
      };

      currentActions.push(newAction);
      room.game_state = {
        ...room.game_state,
        currentTurnActions: currentActions,
      };
      await room.save();

      // Broadcast auto action
      this.io.to(roomCode).emit("player_action_update", {
        playerId,
        action: newAction,
        totalActions: currentActions.length,
        auto: true,
      });

      // Notify room that player action timed out
      this.io.to(roomCode).emit("action_timeout", {
        playerId,
        playerName: player.username,
        autoAction: "rest",
        staminaRegained: staminaRegained,
        diceRoll: diceRoll,
      });

      // Check if all alive players have acted
      const players = await Player.findAll({ where: { room_id: room.id } });
      const alivePlayers = players.filter((p) => p.is_alive);

      if (currentActions.length >= alivePlayers.length) {
        // Resolve the battle round
        await this.resolveBattleRound(roomCode);
      }
    } catch (error) {
      console.error("Auto-submit rest action error:", error);
    }
  }
}

module.exports = GameHandler;
