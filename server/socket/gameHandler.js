const { Room, Player } = require("../models");
const { generateCharacter } = require("../ai/characterGenerator");

class GameHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;

    // Register event listeners
    socket.on("join_room", this.joinRoom.bind(this));
    socket.on("player_ready", this.playerReady.bind(this));
    socket.on("start_game", this.startGame.bind(this));
    socket.on("player_action", this.playerAction.bind(this));
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

      if (room.status !== "waiting") {
        return this.socket.emit("error", {
          message: "Game already in progress",
        });
      }

      // Check if player already exists in room (optional: reconnect logic)
      let player = await Player.findOne({
        where: { room_id: room.id, username },
      });

      if (!player) {
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

      // Update room status
      room.status = "playing";
      room.current_node_index = 0;
      room.game_state = {
        round: 1,
        turnIndex: 0,
        logs: [],
      };
      await room.save();

      // Generate characters for all players
      // Note: In a real app, maybe do this in parallel or earlier.
      // For now, sequentially or Promise.all
      const characterPromises = players.map(async (p) => {
        // Use room theme for character generation context
        const charData = await generateCharacter({ theme: room.theme });
        p.character_data = charData;

        // Parse HP/Stamina from AI response or fallback
        // AI returns strings like "100", "50", etc.
        p.current_hp = parseInt(charData.hp) || 100;
        p.current_stamina = parseInt(charData.stamina) || 100;

        return p.save();
      });

      await Promise.all(characterPromises);

      // Notify game start with initial data
      const updatedPlayers = await Player.findAll({
        where: { room_id: room.id },
      });
      this.io.to(roomCode).emit("game_start", {
        room,
        players: updatedPlayers,
        dungeon: room.dungeon_data,
      });
    } catch (error) {
      console.error("Start game error:", error);
      this.socket.emit("error", { message: "Failed to start game" });
    }
  }

  async playerAction(data) {
    // TODO: Implement battle logic
    // 1. Validate turn
    // 2. Calculate damage
    // 3. Update DB
    // 4. broadcast
  }

  async endTurn() {
    // TODO: Move to next player or trigger AI turn
  }

  async handleDisconnect() {
    // Handle cleanup
    console.log(`Client ${this.socket.id} disconnected`);
  }
}

module.exports = GameHandler;
