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
    socket.on("leave_room", this.leaveRoom.bind(this));
    socket.on("disconnect", this.handleDisconnect.bind(this));
  }

  // --- Event Handlers ---

  async joinRoom({ roomCode, playerId, username }) {
    try {
      // Check if already in room - if so, just resync game state
      if (this.socket.data.roomCode === roomCode && this.socket.data.playerId) {
        console.log(
          `[JOIN] Player ${this.socket.data.playerId} already in room ${roomCode}, sending game_start for sync`,
        );

        // Still send game state if game is in progress
        const room = await Room.findOne({ where: { room_code: roomCode } });
        if (room && room.status === "playing") {
          const players = await Player.findAll({ where: { room_id: room.id } });

          // Send game_start event so GameRoom renders properly
          this.socket.emit("game_start", {
            playerId: this.socket.data.playerId,
            room: {
              host_id: room.host_id,
            },
            dungeon: room.dungeon_data,
            gameState: {
              round: room.game_state?.round || 1,
              currentNode: room.game_state?.currentNode,
              currentEnemy: room.game_state?.currentEnemy,
              currentTurnActions: room.game_state?.currentTurnActions || [],
              currentNPCEvent: room.game_state?.currentNPCEvent || null,
              npcChoosingPlayerId: room.game_state?.npcChoosingPlayerId || null,
              adventureLog: room.game_state?.adventure_log || [],
            },
            players: players,
            metadata: {
              totalPlayers: players.length,
              alivePlayers: players.filter((p) => p.is_alive).length,
            },
          });
        }
        return;
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

      // Determine which lookup to use: playerId for reconnection, username for new player
      let player;
      let isReconnecting = false;

      if (playerId) {
        // Try to find by playerId (reconnection)
        player = await Player.findByPk(playerId);
        if (player && player.room_id !== room.id) {
          // Player exists but in wrong room
          return this.socket.emit("error", {
            message: "This player ID belongs to a different room",
          });
        }
        isReconnecting = !!player;
      } else if (username) {
        // Try to find by username (new join or reconnect by username)
        player = await Player.findOne({
          where: { room_id: room.id, username },
        });
      }

      if (player) {
        // Player reconnecting: update socket ID (always allow)
        console.log(
          `[RECONNECT] Player ${player.id} (${player.username}) reconnecting to room ${roomCode}`,
        );
        player.socket_id = this.socket.id;
        await player.save();
      } else {
        // New player joining - reject if game in progress
        if (room.status === "playing") {
          console.log(
            `[JOIN_BLOCKED] New player tried to join playing game ${roomCode}`,
          );
          return this.socket.emit("error", {
            message:
              "Cannot join a game already in progress. Wait for it to finish.",
          });
        }

        console.log(
          `[JOIN_NEW] New player ${username} joining room ${roomCode}`,
        );
        player = await Player.create({
          username: username || "Warrior",
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
      }

      this.socket.join(roomCode);
      this.socket.data.roomCode = roomCode;
      this.socket.data.playerId = player.id;
      this.socket.data.username = player.username;

      // Emit player ID back to client
      this.socket.emit("join_room_success", {
        playerId: player.id,
        roomCode: roomCode,
        username: player.username,
        isHost: room.host_id === player.id,
        hostId: room.host_id,
      });

      // Broadcast updated player list
      const players = await Player.findAll({ where: { room_id: room.id } });

      console.log(
        `[JOIN_BROADCAST] Broadcasting ${players.length} players to room ${roomCode}:`,
        players.map((p) => ({
          id: p.id,
          username: p.username,
          hasCharacter: !!(
            p.character_data && Object.keys(p.character_data).length > 0
          ),
          hp: p.current_hp,
          stamina: p.current_stamina,
        })),
      );

      this.io.to(roomCode).emit("room_update", {
        room: room,
        players: players,
      });

      if (room.status === "playing") {
        // Broadcast reconnection message to other players
        this.io.to(roomCode).emit("player_reconnected", {
          playerId: player.id,
          username: player.username,
        });

        console.log(
          `[RECONNECT_SYNC] Syncing game state for player ${player.username} (ID: ${player.id})`,
        );

        // Fetch all current players in room
        const updatedPlayers = await Player.findAll({
          where: { room_id: room.id },
        });

        console.log(
          `[RECONNECT_SYNC] Sending game_start with ${updatedPlayers.length} players to player ${player.id}`,
        );

        // Send game_start event so GameRoom renders properly when joining mid-game
        this.socket.emit("game_start", {
          playerId: player.id,
          room: {
            host_id: room.host_id,
          },
          dungeon: room.dungeon_data,
          gameState: {
            round: room.game_state.round,
            currentNode: room.game_state.currentNode,
            currentEnemy: room.game_state.currentEnemy,
            currentTurnActions: room.game_state.currentTurnActions || [],
            currentNPCEvent: room.game_state.currentNPCEvent || null,
            npcChoosingPlayerId: room.game_state.npcChoosingPlayerId || null,
            adventureLog: room.game_state.adventure_log || [],
          },
          players: updatedPlayers,
          metadata: {
            totalPlayers: updatedPlayers.length,
            alivePlayers: updatedPlayers.filter((p) => p.is_alive).length,
          },
        });

        console.log(
          `[RECONNECT_SYNC] Synced for player ${player.id}: Round ${room.game_state.round}, Node: ${room.game_state.currentNode?.id}`,
        );

        // Generate and send story summary for context
        try {
          const history = room.game_state.adventure_log || [];
          const partyState = {
            playerCount: updatedPlayers.length,
            aliveCount: updatedPlayers.filter((p) => p.is_alive).length,
            averageHP: Math.round(
              updatedPlayers.length > 0
                ? updatedPlayers.reduce((sum, p) => sum + p.current_hp, 0) /
                    updatedPlayers.length
                : 0,
            ),
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
      }

      console.log(
        `Player ${player.username} (ID: ${player.id}) joined room ${roomCode}`,
      );
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

      console.log(
        `[START_GAME_CHECK] Players character status:`,
        players.map((p) => ({
          id: p.id,
          username: p.username,
          hasCharacter: !!(
            p.character_data && Object.keys(p.character_data).length > 0
          ),
          characterName: p.character_data?.name,
          ready: p.is_ready,
        })),
      );

      if (!allHaveCharacters) {
        const missingCharacters = players
          .filter(
            (p) =>
              !(p.character_data && Object.keys(p.character_data).length > 0),
          )
          .map((p) => p.username);

        console.log(
          `[START_GAME_BLOCKED] Missing characters:`,
          missingCharacters,
        );

        return this.socket.emit("error", {
          message: `All players must generate a character before starting the game. Missing: ${missingCharacters.join(", ")}`,
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
        currentNPCEvent: null,
        npcChoosingPlayerId: null,
      };
      room.changed("game_state", true);
      await room.save();

      // Notify game start with COMPLETE authoritative snapshot to all players
      // This matches the structure of game_state_sync to ensure consistency
      const updatedPlayers = await Player.findAll({
        where: { room_id: room.id },
      });

      this.io.to(roomCode).emit("game_start", {
        dungeon: room.dungeon_data,
        gameState: {
          round: 1,
          currentNode: firstNode,
          currentEnemy: initialEnemy,
          currentTurnActions: [],
          currentNPCEvent: null,
          npcChoosingPlayerId: null,
          adventureLog: [],
        },
        players: updatedPlayers,
        metadata: {
          totalPlayers: updatedPlayers.length,
          alivePlayers: updatedPlayers.filter((p) => p.is_alive).length,
        },
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
      const { actionType, skill } = data;

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
          diceRoll: diceRoll,
          staminaRegained: staminaRegained,
        };

        console.log(`[ACTION] ${player.username} rests:`, {
          diceRoll,
          staminaRegained,
          newStamina: player.current_stamina,
        });

        const freshRoom = await Room.findOne({
          where: { room_code: roomCode },
        });
        const freshActions = freshRoom.game_state.currentTurnActions || [];

        console.log(`[REST_ACTION] Before push:`, {
          count: freshActions.length,
          actions: freshActions.map((a) => ({
            player: a.playerName,
            type: a.type,
          })),
        });

        const alreadyActedCheck = freshActions.find(
          (a) => a.playerId === playerId,
        );
        if (alreadyActedCheck) {
          return this.socket.emit("error", {
            message: "You have already acted this turn",
          });
        }

        freshActions.push(newAction);

        console.log(`[REST_ACTION] After push:`, {
          count: freshActions.length,
          actions: freshActions.map((a) => ({
            player: a.playerName,
            type: a.type,
          })),
        });

        freshRoom.game_state = {
          ...freshRoom.game_state,
          currentTurnActions: freshActions,
        };
        freshRoom.changed("game_state", true);
        await freshRoom.save();

        this.io.to(roomCode).emit("player_action_update", {
          playerId,
          action: newAction,
          totalActions: freshActions.length,
        });

        const players = await Player.findAll({ where: { room_id: room.id } });
        const alivePlayers = players.filter((p) => p.is_alive);

        console.log(`[REST_ACTION] Checking all acted:`, {
          actedCount: freshActions.length,
          aliveCount: alivePlayers.length,
          shouldResolve: freshActions.length >= alivePlayers.length,
        });

        if (freshActions.length >= alivePlayers.length) {
          console.log(`[REST_ACTION] Calling resolveBattleRound`);
          await this.resolveBattleRound(roomCode);
        } else {
          this.io.to(roomCode).emit("waiting_for_players", {
            actedCount: freshActions.length,
            totalCount: alivePlayers.length,
            waitingOn: alivePlayers
              .filter((p) => !freshActions.find((a) => a.playerId === p.id))
              .map((p) => ({
                id: p.id,
                username: p.username,
              })),
          });
        }
        return;
      }

      // Validate skill was provided
      if (!skill || !skill.name) {
        return this.socket.emit("error", { message: "No skill provided" });
      }

      // Verify skill exists in player's character data
      const serverSkill = player.character_data?.skills?.find(
        (s) => s.name === skill.name,
      );
      if (!serverSkill) {
        return this.socket.emit("error", {
          message: `Skill "${skill.name}" not found in your character data`,
        });
      }

      const staminaCost = serverSkill.staminaCost || 0;

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

      // Get skill power from character data
      const skillPower = player.character_data.skillPower || 2.0;
      const skillAmount = serverSkill.amount || 10;

      const newAction = {
        playerId,
        playerName: player.username,
        type: actionType,
        skillName: skill.name,
        skillType: serverSkill.type,
        skillAmount: skillAmount,
        skillPower: skillPower,
        staminaCost: staminaCost,
      };

      console.log(`[ACTION] ${player.username} uses ${newAction.skillName}:`, {
        type: actionType,
        skillAmount: skillAmount,
        skillPower: skillPower,
        staminaCost: staminaCost,
      });

      // Re-fetch room to get latest game_state (prevent race condition)
      const freshRoom = await Room.findOne({ where: { room_code: roomCode } });
      const freshActions = freshRoom.game_state.currentTurnActions || [];

      console.log(`[SKILL_ACTION] Before push:`, {
        count: freshActions.length,
        actions: freshActions.map((a) => ({
          player: a.playerName,
          type: a.type,
        })),
      });

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

      console.log(`[SKILL_ACTION] After push:`, {
        count: freshActions.length,
        actions: freshActions.map((a) => ({
          player: a.playerName,
          type: a.type,
        })),
      });

      // Update room state with fresh data
      const newGameState = {
        ...freshRoom.game_state,
        currentTurnActions: freshActions,
      };
      freshRoom.game_state = newGameState;
      freshRoom.changed("game_state", true);
      await freshRoom.save();

      // Broadcast action to room (so others see it)
      this.io.to(roomCode).emit("player_action_update", {
        playerId,
        action: newAction,
        totalActions: freshActions.length,
      });

      // Check if all ALIVE players have acted
      const players = await Player.findAll({ where: { room_id: room.id } });
      const alivePlayers = players.filter((p) => p.is_alive);

      console.log(`[SKILL_ACTION] Checking all acted:`, {
        actedCount: freshActions.length,
        aliveCount: alivePlayers.length,
        shouldResolve: freshActions.length >= alivePlayers.length,
      });

      if (freshActions.length >= alivePlayers.length) {
        console.log(`[SKILL_ACTION] Calling resolveBattleRound`);
        await this.resolveBattleRound(roomCode);
      } else {
        this.io.to(roomCode).emit("waiting_for_players", {
          actedCount: freshActions.length,
          totalCount: alivePlayers.length,
          waitingOn: alivePlayers
            .filter((p) => !freshActions.find((a) => a.playerId === p.id))
            .map((p) => ({
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

      console.log(`[RESOLVE_START] Room fetched for ${roomCode}`);
      console.log(`[RESOLVE_START] game_state exists:`, !!room.game_state);
      console.log(`[RESOLVE_START] currentTurnActions:`, {
        exists: !!room.game_state.currentTurnActions,
        length: room.game_state.currentTurnActions?.length,
        content: room.game_state.currentTurnActions?.map((a) => ({
          player: a.playerName,
          type: a.type,
        })),
      });

      const players = await Player.findAll({ where: { room_id: room.id } });
      if (!players || players.length === 0) {
        console.error(`No players found for room ${roomCode}`);
        return;
      }
      const gameState = room.game_state;
      const currentEnemy = gameState.currentEnemy;
      const playerActions = gameState.currentTurnActions;

      console.log(`[RESOLVE_START] playerActions array:`, {
        length: playerActions?.length,
        content: playerActions?.map((a) => ({
          player: a.playerName,
          type: a.type,
        })),
      });

      // Validate enemy exists for battle
      if (!currentEnemy) {
        console.error(`No enemy found for battle in room ${roomCode}`);
        return;
      }

      console.log(
        `[BATTLE] Round ${gameState.round} - Player actions:`,
        playerActions.map((a) => ({
          player: a.playerName,
          type: a.type,
          skill: a.skillName,
          amount: a.skillAmount,
          power: a.skillPower,
        })),
      );

      // ===== CALCULATE DAMAGE HERE (NOT in battleNarrationGenerator) =====
      const processedActions = playerActions.map((action) => {
        let result;

        if (action.type === "rest") {
          // REST actions already have dice roll and stamina regain
          result = {
            actionType: "rest",
            diceRoll: action.diceRoll,
            staminaRegained: action.staminaRegained,
          };
        } else if (action.type === "attack") {
          // Calculate attack damage
          const diceRoll = this.rollD20();
          const isCritical = diceRoll >= 18;
          const isMiss = diceRoll <= 2;

          let finalDamage;
          if (isMiss) {
            finalDamage = 0;
          } else {
            const skillPower =
              action.skillPower !== undefined ? action.skillPower : 2.0;
            finalDamage = action.skillAmount * skillPower + diceRoll / 10;
            if (isCritical) finalDamage *= 2;
            finalDamage = Math.round(finalDamage * 10) / 10;
          }

          result = {
            actionType: "attack",
            diceRoll: diceRoll,
            finalDamage: finalDamage,
            isCritical: isCritical,
            isMiss: isMiss,
          };
        } else if (action.type === "heal") {
          // Calculate heal amount
          const diceRoll = this.rollD20();
          const skillPower =
            action.skillPower !== undefined ? action.skillPower : 2.0;
          const finalHeal =
            Math.round((action.skillAmount * skillPower + diceRoll / 10) * 10) /
            10;

          result = {
            actionType: "heal",
            diceRoll: diceRoll,
            finalHeal: finalHeal,
          };
        } else if (action.type === "defend") {
          const diceRoll = this.rollD20();
          result = {
            actionType: "defend",
            diceRoll: diceRoll,
            defenseBonus: 0.4,
          };
        }

        return {
          playerId: action.playerId,
          playerName: action.playerName,
          skillName: action.skillName,
          skillType: action.skillType,
          ...result,
        };
      });

      console.log(`[DAMAGE_CALC] Round ${gameState.round} calculated damage:`, {
        playerActions: processedActions.map((a) => ({
          player: a.playerName,
          type: a.actionType,
          damage: a.finalDamage,
          heal: a.finalHeal,
          critical: a.isCritical,
          miss: a.isMiss,
        })),
      });

      // ===== APPLY DAMAGE TO ENEMY =====
      const attackActions = processedActions.filter(
        (a) => a.actionType === "attack",
      );
      console.log(
        `[DAMAGE_APPLY] Attack actions found: ${attackActions.length}`,
      );
      attackActions.forEach((a, idx) => {
        console.log(
          `  [${idx}] ${a.playerName} - finalDamage: ${a.finalDamage}, isMiss: ${a.isMiss}, isCritical: ${a.isCritical}`,
        );
      });

      const totalDamageToEnemy = attackActions.reduce(
        (sum, a) => sum + (a.finalDamage || 0),
        0,
      );

      const totalHealToEnemy = processedActions
        .filter((a) => a.actionType === "heal")
        .reduce((sum, a) => sum + (a.finalHeal || 0), 0);

      console.log(`[DAMAGE_APPLY] Round ${gameState.round}:`, {
        enemyHPBefore: currentEnemy.hp,
        totalDamageDealt: totalDamageToEnemy,
        totalHealUsed: totalHealToEnemy,
        enemyHPAfter: Math.max(0, currentEnemy.hp - totalDamageToEnemy),
      });

      // Update enemy HP: reduce by damage, increase by heal
      let newEnemyHP = currentEnemy.hp - totalDamageToEnemy;
      newEnemyHP = Math.max(0, newEnemyHP); // Can't go below 0

      console.log(
        `[HP_UPDATE] Updating enemy HP: ${currentEnemy.hp} - ${totalDamageToEnemy} = ${newEnemyHP}`,
      );

      // Call AI to generate NARRATION ONLY (damage already applied)
      const battleResult = await generateBattleNarration({
        theme: room.theme,
        enemy: currentEnemy,
        processedActions: processedActions,
        battleState: { currentRound: gameState.round },
        language: room.language,
      });

      console.log(battleResult);

      console.log(`[BATTLE_RESULT] Round ${gameState.round}:`, {
        totalDamage: totalDamageToEnemy,
        enemyHPBefore: currentEnemy.hp,
        enemyHPAfter: newEnemyHP,
        playerActions: processedActions.map((a) => ({
          player: a.playerName,
          type: a.actionType,
          damage: a.finalDamage,
          heal: a.finalHeal,
          critical: a.isCritical,
          miss: a.isMiss,
        })),
      });

      // Apply results to DB

      // Update Enemy HP with calculated damage
      const updatedEnemy = {
        ...currentEnemy,
        hp: newEnemyHP,
      };

      console.log(`[ENEMY_OBJECT] updatedEnemy created:`, {
        name: updatedEnemy.name,
        hpBefore: currentEnemy.hp,
        hpAfter: updatedEnemy.hp,
      });

      // Process Enemy Action (Damage to players)
      if (
        battleResult.enemyAction &&
        battleResult.enemyAction.type === "attack"
      ) {
        const damage = Math.ceil(battleResult.enemyAction.finalDamage || 0); // Round up to ensure integer
        // Distribute damage (random target or all? Let's say random for now or logic in AI?)
        // The generator doesn't specify TARGET. We'll pick a random alive player.
        const alivePlayers = players.filter((p) => p.is_alive);
        if (alivePlayers.length > 0) {
          const targetIndex = Math.floor(Math.random() * alivePlayers.length);
          const target = alivePlayers[targetIndex];
          target.current_hp = Math.max(
            0,
            Math.floor(target.current_hp - damage),
          );
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
      const totalDamage = Math.round(
        battleResult.playerActions
          .filter((action) => action.actionType === "attack")
          .reduce((sum, action) => sum + (action.finalDamage || 0), 0),
      ); // Round to integer

      const hasCritical = battleResult.playerActions.some(
        (action) => action.isCritical === true,
      );

      // Update Game State
      const nextRound = gameState.round + 1;
      const roundLog = {
        round: gameState.round,
        narrative: battleResult.narrative,
        totalDamage: totalDamage, // Already an integer
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
      // Force Sequelize to detect JSONB changes
      room.changed("game_state", true);
      await room.save();

      console.log(`[ROOM_SAVED] Room state saved. Enemy HP in game_state:`, {
        enemyName: room.game_state.currentEnemy?.name,
        enemyHP: room.game_state.currentEnemy?.hp,
      });

      // Broadcast results
      console.log(`[BROADCAST] Sending battle_result event with enemy:`, {
        name: updatedEnemy.name,
        hp: updatedEnemy.hp,
      });

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
      room.changed("game_state", true);
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

      // Select the host to make the choice
      const choosingPlayer = players.find((p) => p.id === room.host_id);
      if (!choosingPlayer) {
        console.error("Host player not found for NPC event");
        return;
      }

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
      room.changed("game_state", true);
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
      room.changed("game_state", true);
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

  async leaveRoom() {
    try {
      const { roomCode, playerId, username } = this.socket.data;
      if (!roomCode || !playerId) return;

      const room = await Room.findOne({ where: { room_code: roomCode } });
      if (!room) return;

      // Remove player from room
      await Player.destroy({ where: { id: playerId } });
      console.log(`Player ${username} (ID: ${playerId}) left room ${roomCode}`);

      // Notify remaining players
      const remainingPlayers = await Player.findAll({
        where: { room_id: room.id },
      });
      this.io
        .to(roomCode)
        .emit("room_update", { room, players: remainingPlayers });

      // If no players left, cleanup room
      if (remainingPlayers.length === 0) {
        await this.cleanupRoom(roomCode, "all players left");
      }
    } catch (error) {
      console.error("Leave room error:", error);
    }
  }

  async handleDisconnect() {
    try {
      const { roomCode, playerId, username } = this.socket.data;
      console.log(
        `Client ${this.socket.id} disconnected (Player: ${username} ID: ${playerId}, Room: ${roomCode})`,
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

      // Clear host_id first to avoid foreign key constraint error
      await Room.update({ host_id: null }, { where: { id: roomId } });

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
          timeoutSeconds: Math.floor(timeoutMs / 30000),
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
      freshRoom.changed("game_state", true);
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
  /**
   * Fetch complete game state for a room
   * @param {Room} room - The room object
   * @returns {Object} Complete game state snapshot
   */
  async fetchGameStateSnapshot(room) {
    try {
      const players = await Player.findAll({
        where: { room_id: room.id },
      });

      return {
        room: {
          id: room.id,
          room_code: room.room_code,
          status: room.status,
          theme: room.theme,
          language: room.language,
          current_node_index: room.current_node_index,
          host_id: room.host_id,
          created_at: room.createdAt,
        },
        dungeon: room.dungeon_data,
        gameState: {
          round: room.game_state.round,
          currentNode: room.game_state.currentNode,
          currentEnemy: room.game_state.currentEnemy,
          currentTurnActions: room.game_state.currentTurnActions || [],
          currentNPCEvent: room.game_state.currentNPCEvent || null,
          npcChoosingPlayerId: room.game_state.npcChoosingPlayerId || null,
          adventureLog: room.game_state.adventure_log || [],
          logs: room.game_state.logs || [],
        },
        players: players.map((p) => ({
          id: p.id,
          username: p.username,
          socket_id: p.socket_id,
          is_ready: p.is_ready,
          is_alive: p.is_alive,
          current_hp: p.current_hp,
          current_stamina: p.current_stamina,
          character_data: p.character_data,
          created_at: p.createdAt,
        })),
        metadata: {
          fetchedAt: new Date().toISOString(),
          totalPlayers: players.length,
          alivePlayers: players.filter((p) => p.is_alive).length,
        },
      };
    } catch (error) {
      console.error("Error fetching game state snapshot:", error);
      throw error;
    }
  }

  /**
   * Roll a d20 (1-20)
   */
  rollD20() {
    return Math.floor(Math.random() * 20) + 1;
  }
}

module.exports = GameHandler;
