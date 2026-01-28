const { Room, Player } = require("../models");
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
      // Prevent double join from same socket
      if (
        this.socket.data.roomCode === roomCode &&
        this.socket.data.username === username
      ) {
        console.log(
          `[JOIN] Player ${username} already in room ${roomCode}, ignoring duplicate join`,
        );
        return; // Already joined, ignore
      }

      const room = await Room.findOne({ where: { room_code: roomCode } });
      if (!room) {
        return this.socket.emit("error", { message: "Room not found" });
      }

      // Only allow joining if room is waiting or playing
      // Reject if finished
      if (room.status === "finished") {
        return this.socket.emit("error", {
          message: "This game has already finished",
        });
      }

      // Check if player already exists in room (for reconnection)
      let player = await Player.findOne({
        where: { room_id: room.id, username },
      });

      if (!player) {
        // New player joining
        if (room.status === "playing") {
          return this.socket.emit("error", {
            message:
              "Cannot join a game already in progress. Wait for it to finish.",
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

        // Set first player as host if not already set
        if (!room.host_id) {
          room.host_id = player.id;
          await room.save();
        }
      } else {
        // Player reconnecting: update socket ID
        player.socket_id = this.socket.id;
        await player.save();
      }

      this.socket.join(roomCode);
      this.socket.data.roomCode = roomCode;
      this.socket.data.playerId = player.id;
      this.socket.data.username = username;

      // Emit player ID back to client
      this.socket.emit("join_room_success", {
        playerId: player.id,
        roomCode: roomCode,
        username: username,
        isHost: room.host_id === player.id,
      });

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
          const avgHP =
            playersInRoom.length > 0
              ? Math.round(
                  playersInRoom.reduce((sum, p) => sum + p.current_hp, 0) /
                    playersInRoom.length,
                )
              : 0;
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
          const choosingPlayer = updatedPlayers.find(
            (p) => p.id === room.game_state.npcChoosingPlayerId,
          );
          this.socket.emit("npc_event", {
            event: room.game_state.currentNPCEvent,
            choosingPlayerId: room.game_state.npcChoosingPlayerId,
            choosingPlayerName: choosingPlayer
              ? choosingPlayer.username
              : "Unknown",
          });
        } else if (room.game_state.currentEnemy) {
          this.socket.emit("round_started", {
            round: room.game_state.round,
            narrative: "Resuming battle...",
          });

          const currentActions = room.game_state.currentTurnActions || [];
          const alivePlayers = updatedPlayers.filter((p) => p.is_alive);
          const playersWhoActed = currentActions.map((a) => a.playerId);
          const playersStillWaiting = alivePlayers.filter(
            (p) => !playersWhoActed.includes(p.id),
          );

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
      if (!room) {
        return this.socket.emit("error", { message: "Room not found" });
      }
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
      if (!room) {
        return this.socket.emit("error", { message: "Room not found" });
      }

      // Verify only host can start the game
      if (room.host_id !== playerId) {
        return this.socket.emit("error", {
          message: "Only the host can start the game",
        });
      }

      // Check all ready
      const players = await Player.findAll({ where: { room_id: room.id } });
      const allReady = players.every((p) => p.is_ready);

      if (!allReady) {
        return this.socket.emit("error", {
          message: "Not all players are ready",
        });
      }

      // Check all players have generated characters
      const allHaveCharacters = players.every(
        (p) => p.character_data && Object.keys(p.character_data).length > 0,
      );

      if (!allHaveCharacters) {
        return this.socket.emit("error", {
          message:
            "All players must generate a character before starting the game",
        });
      }

      // Update room status
      room.status = "playing";
      room.current_node_index = 0;

      // Initialize game state with first node
      const firstNode = room.dungeon_data.nodes[0];
      const initialEnemy =
        firstNode.type === "enemy"
          ? room.dungeon_data.enemies.find((e) => e.id === firstNode.enemyId)
          : null;

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
        await this.triggerNPCEvent(room, updatedPlayers, roomCode);
      }
    } catch (error) {
      console.error("Start game error:", error);
      this.socket.emit("error", { message: "Failed to start game" });
    }
  }

  async playerAction(data) {
    try {
      const { playerId, roomCode } = this.socket.data;
      const { actionType, skillName, skillAmount, skillId } = data;

      if (!playerId || !roomCode) {
        return this.socket.emit("error", { message: "Invalid session" });
      }

      const room = await Room.findOne({ where: { room_code: roomCode } });
      const player = await Player.findByPk(playerId);

      if (!room || !player) {
        return this.socket.emit("error", {
          message: "Room or player not found",
        });
      }

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
        player.current_stamina = Math.min(
          player.character_data.maxStamina,
          player.current_stamina + staminaRegained,
        );
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

        // Re-fetch room to get latest game_state (prevent race condition)
        const freshRoom = await Room.findOne({
          where: { room_code: roomCode },
        });
        const freshActions = freshRoom.game_state.currentTurnActions || [];

        // Check again if player already acted (double-check after potential wait)
        const stillActed = freshActions.find((a) => a.playerId === playerId);
        if (stillActed) {
          return this.socket.emit("error", {
            message: "You have already acted this turn",
          });
        }

        freshActions.push(newAction);
        freshRoom.game_state = {
          ...freshRoom.game_state,
          currentTurnActions: freshActions,
        };
        await freshRoom.save();

        this.io.to(roomCode).emit("player_action_update", {
          playerId,
          action: newAction,
          totalActions: freshActions.length,
        });

        const playersCheck = await Player.findAll({
          where: { room_id: room.id },
        });
        const alivePlayers = playersCheck.filter((p) => p.is_alive);

        if (freshActions.length >= alivePlayers.length) {
          await this.resolveBattleRound(roomCode);
        }
        return;
      }

      // Find the skill in character data
      const skill = player.character_data?.skills?.find(
        (s) => s.name === (skillName || "Basic Attack"),
      );
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
      player.current_stamina = Math.max(
        0,
        player.current_stamina - staminaCost,
      );
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

      // Re-fetch room to get latest game_state (prevent race condition)
      const freshRoom = await Room.findOne({ where: { room_code: roomCode } });
      const freshActions = freshRoom.game_state.currentTurnActions || [];

      // Check again if player already acted (double-check after potential concurrent request)
      const alreadyActedCheck = freshActions.find(
        (a) => a.playerId === playerId,
      );
      if (alreadyActedCheck) {
        return this.socket.emit("error", {
          message: "You have already acted this turn",
        });
      }

      freshActions.push(newAction);

      // Update room state with fresh data
      const newGameState = {
        ...freshRoom.game_state,
        currentTurnActions: freshActions,
      };
      freshRoom.game_state = newGameState;
      await freshRoom.save(); // Save to persist the action queue

      // Broadcast action to room (so others see it)
      this.io.to(roomCode).emit("player_action_update", {
        playerId,
        action: newAction,
        totalActions: freshActions.length,
      });

      // Check if all ALIVE players have acted
      const players = await Player.findAll({ where: { room_id: room.id } });
      const alivePlayers = players.filter((p) => p.is_alive);

      if (freshActions.length >= alivePlayers.length) {
        // Resolve Turn
        await this.resolveBattleRound(roomCode);
      } else {
        // Emit waiting state - show who has acted and who hasn't
        const playersWhoActed = freshActions.map((a) => a.playerId);
        const playersStillWaiting = alivePlayers.filter(
          (p) => !playersWhoActed.includes(p.id),
        );

        this.io.to(roomCode).emit("waiting_for_players", {
          actedCount: freshActions.length,
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
    try {
      const room = await Room.findOne({ where: { room_code: roomCode } });
      if (!room || !room.game_state) {
        console.error(`Room ${roomCode} not found or no game state`);
        return;
      }

      const players = await Player.findAll({ where: { room_id: room.id } });
      if (!players || players.length === 0) {
        console.error(`No players found for room ${roomCode}`);
        return;
      }
      const gameState = room.game_state;
      const currentEnemy = gameState.currentEnemy;
      const playerActions = gameState.currentTurnActions;

      // Validate enemy exists for battle
      if (!currentEnemy) {
        console.error(`No enemy found for battle in room ${roomCode}`);
        return;
      }

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
      const updatedEnemy = {
        ...currentEnemy,
        hp: battleResult.enemyHP.current,
      };

      // Process Enemy Action (Damage to players)
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

      // Regenerate stamina for all alive players (+1 per round)
      players.forEach((p) => {
        if (p.is_alive) {
          p.current_stamina = Math.min(
            p.character_data.maxStamina,
            p.current_stamina + 1,
          );
        }
      });
      await Promise.all(players.map((p) => p.save()));

      // Calculate round stats from actual player actions
      const totalDamage = battleResult.playerActions
        .filter((action) => action.actionType === "attack")
        .reduce((sum, action) => sum + (action.finalDamage || 0), 0);

      const hasCritical = battleResult.playerActions.some(
        (action) => action.isCritical === true,
      );

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
        const avgHP =
          players.length > 0
            ? Math.round(
                players.reduce((sum, p) => sum + p.current_hp, 0) /
                  players.length,
              )
            : 0;
        const partyState = {
          aliveCount: players.filter((p) => p.is_alive).length,
          totalCount: players.length,
          averageHP: avgHP,
        };

        // Dynamic Rewards Calculation
        const baseXP = 50;
        const xpBonus = currentEnemy.maxHP
          ? Math.floor(currentEnemy.maxHP / 5)
          : 10;
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
        // Game Over - Defeat
        room.status = "finished";
        await room.save();

        const finalSummary = await generateFinalGameSummary({
          theme: room.theme,
          dungeonName: room.dungeon_data.dungeonName,
          completeGameLog: room.game_state.adventure_log || [],
          finalStats: { partySize: players.length, survivors: 0 },
          outcome: "defeat",
          language: room.language,
        });
        this.io.to(roomCode).emit("game_over", finalSummary);

        // Schedule cleanup after game ends
        this.scheduleGameEndCleanup(roomCode);
      }
    } catch (error) {
      console.error("Resolve battle round error:", error);
    }
  }

  async nextNode() {
    try {
      const { playerId, roomCode } = this.socket.data;

      const room = await Room.findOne({ where: { room_code: roomCode } });
      if (!room) {
        return this.socket.emit("error", { message: "Room not found" });
      }

      // Only host can proceed to next node
      if (room.host_id !== playerId) {
        return this.socket.emit("error", {
          message: "Only the host can proceed to the next node",
        });
      }

      // Move index
      const nextIndex = room.current_node_index + 1;
      const nextNode = room.dungeon_data.nodes[nextIndex];

      if (!nextNode) {
        // Dungeon Complete!
        room.status = "finished";
        await room.save();

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
        this.io.to(roomCode).emit("game_over", finalSummary);

        // Schedule cleanup after game ends
        this.scheduleGameEndCleanup(roomCode);
        return;
      }

      const currentNode = room.game_state.currentNode;
      const players = await Player.findAll({ where: { room_id: room.id } });
      const avgHP =
        players.length > 0
          ? Math.round(
              players.reduce((sum, p) => sum + p.current_hp, 0) /
                players.length,
            )
          : 0;
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
          p.current_stamina = Math.min(
            p.character_data.maxStamina,
            p.current_stamina + staminaRegen,
          );
          return p.save();
        }),
      );

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
        await this.triggerNPCEvent(room, players, roomCode);
      }
    } catch (error) {
      console.error("Next node error:", error);
    }
  }

  async triggerNPCEvent(room, players, roomCode) {
    try {
      const currentNode = room.game_state.currentNode;

      // Validate players array
      if (!players || players.length === 0) {
        console.error("No players available for NPC event");
        return;
      }
      const avgHP = Math.round(
        players.reduce((sum, p) => sum + p.current_hp, 0) / players.length,
      );
      const avgMaxHP = Math.round(
        players.reduce((sum, p) => sum + p.character_data.maxHP, 0) /
          players.length,
      );
      const avgStamina = Math.round(
        players.reduce((sum, p) => sum + p.current_stamina, 0) / players.length,
      );
      const avgMaxStamina = Math.round(
        players.reduce((sum, p) => sum + p.character_data.maxStamina, 0) /
          players.length,
      );

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
        adventure_log: [
          ...(room.game_state.adventure_log || []),
          { type: "npc_event", npc: event.npcName },
        ],
      };
      await room.save();

      // Emit event to all players, but indicate who gets to choose
      this.io.to(roomCode).emit("npc_event", {
        event: event,
        choosingPlayerId: choosingPlayer.id,
        choosingPlayerName: choosingPlayer.username,
      });
    } catch (error) {
      console.error("Trigger NPC event error:", error);
    }
  }

  async npcChoice({ choiceId }) {
    try {
      const { roomCode, playerId } = this.socket.data;
      const room = await Room.findOne({ where: { room_code: roomCode } });
      if (!room || !room.game_state) {
        return this.socket.emit("error", {
          message: "Room or game state not found",
        });
      }
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
            p.character_data.maxHP = Math.max(
              1,
              p.character_data.maxHP + effects.hpBonus,
            );
          }

          // Apply Stamina bonus (both current and max)
          if (effects.staminaBonus) {
            p.current_stamina = Math.max(
              0,
              Math.min(
                p.character_data.maxStamina,
                p.current_stamina + effects.staminaBonus,
              ),
            );
            p.character_data.maxStamina = Math.max(
              1,
              p.character_data.maxStamina + effects.staminaBonus,
            );
          }

          // Apply Skill Power bonus
          if (effects.skillPowerBonus) {
            p.character_data.skillPower =
              (p.character_data.skillPower || 1.0) + effects.skillPowerBonus;
          }

          return p.save();
        }),
      );

      // Log the NPC choice result to adventure log
      const choosingPlayer = players.find(
        (p) => p.id === room.game_state.npcChoosingPlayerId,
      );
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
    try {
      const { roomCode, playerId, username } = this.socket.data;
      console.log(
        `Client ${this.socket.id} disconnected (Player: ${username}, Room: ${roomCode})`,
      );

      if (!roomCode || !playerId) return;

      // Clear any action timers for this player
      const timerKey = `${roomCode}:${playerId}`;
      if (this.actionTimers.has(timerKey)) {
        clearTimeout(this.actionTimers.get(timerKey));
        this.actionTimers.delete(timerKey);
      }

      const room = await Room.findOne({ where: { room_code: roomCode } });
      if (!room) return;

      // Check remaining connected players in room
      const socketsInRoom = await this.io.in(roomCode).fetchSockets();
      const remainingPlayers = socketsInRoom.filter(
        (s) => s.id !== this.socket.id,
      );

      if (remainingPlayers.length === 0) {
        // No more players in room, cleanup after a delay (allow for reconnection)
        console.log(
          `No players remaining in room ${roomCode}, scheduling cleanup...`,
        );

        // Wait 30 seconds before cleanup to allow reconnection
        setTimeout(async () => {
          const checkSockets = await this.io.in(roomCode).fetchSockets();
          if (checkSockets.length === 0) {
            console.log(
              `Cleaning up room ${roomCode} - no players reconnected`,
            );
            await this.cleanupRoom(roomCode);
          }
        }, 30000);
      } else {
        // Notify remaining players about disconnection
        this.io.to(roomCode).emit("player_disconnected", {
          playerId,
          username,
          remainingCount: remainingPlayers.length,
        });

        // If room is in waiting status and player disconnects, remove them from DB
        if (room.status === "waiting") {
          await Player.destroy({ where: { id: playerId } });

          // Update player list for remaining players
          const players = await Player.findAll({ where: { room_id: room.id } });
          this.io.to(roomCode).emit("room_update", { room, players });
        }
      }
    } catch (error) {
      console.error("Disconnect handler error:", error);
    }
  }

  /**
   * Clean up room and all associated players from database
   * @param {string} roomCode - The room code to cleanup
   * @param {string} reason - Reason for cleanup (for logging)
   */
  async cleanupRoom(roomCode, reason = "cleanup") {
    try {
      const room = await Room.findOne({ where: { room_code: roomCode } });
      if (!room) {
        console.log(`Room ${roomCode} already cleaned up or not found`);
        return;
      }

      const roomId = room.id;

      // Clear all action timers for this room
      for (const [key, timerId] of this.actionTimers.entries()) {
        if (key.startsWith(`${roomCode}:`)) {
          clearTimeout(timerId);
          this.actionTimers.delete(key);
        }
      }

      // Delete all players in the room
      const deletedPlayers = await Player.destroy({
        where: { room_id: roomId },
      });

      // Delete the room
      await Room.destroy({ where: { id: roomId } });

      console.log(
        `[${reason}] Room ${roomCode} cleaned up: ${deletedPlayers} players removed`,
      );
    } catch (error) {
      console.error(`Failed to cleanup room ${roomCode}:`, error);
    }
  }

  /**
   * Schedule room cleanup after game ends
   * @param {string} roomCode - The room code
   * @param {number} delayMs - Delay before cleanup (default 60 seconds)
   */
  scheduleGameEndCleanup(roomCode, delayMs = 60000) {
    console.log(
      `Game ended in room ${roomCode}, scheduling cleanup in ${delayMs / 1000}s...`,
    );

    setTimeout(async () => {
      await this.cleanupRoom(roomCode, "game_ended");
    }, delayMs);
  }

  // --- Helper Methods ---

  startActionTimers(roomCode, timeoutMs) {
    // Set timer for each player to auto-submit rest action if they don't act
    Room.findOne({ where: { room_code: roomCode } }).then((room) => {
      if (!room) {
        console.error(`Room ${roomCode} not found for action timers`);
        return;
      }
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
      player.current_stamina = Math.min(
        player.character_data.maxStamina,
        player.current_stamina + staminaRegained,
      );
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

      // Re-fetch room to get latest game_state (prevent race condition)
      const freshRoom = await Room.findOne({ where: { room_code: roomCode } });
      const freshActions = freshRoom.game_state.currentTurnActions || [];

      // Check again if player already acted (double-check after potential wait)
      const stillActed = freshActions.find((a) => a.playerId === playerId);
      if (stillActed) return;

      freshActions.push(newAction);
      freshRoom.game_state = {
        ...freshRoom.game_state,
        currentTurnActions: freshActions,
      };
      await freshRoom.save();

      // Broadcast auto action
      this.io.to(roomCode).emit("player_action_update", {
        playerId,
        action: newAction,
        totalActions: freshActions.length,
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

      if (freshActions.length >= alivePlayers.length) {
        // Resolve the battle round
        await this.resolveBattleRound(roomCode);
      }
    } catch (error) {
      console.error("Auto-submit rest action error:", error);
    }
  }
}

module.exports = GameHandler;
