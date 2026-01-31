const { Room, Player } = require("../models");
const { generateCharacter } = require("../ai/characterGenerator");

class CharacterController {
  // Store io instance for socket broadcasts
  static setIO(io) {
    this.io = io;
  }
  /**
   * Generate a character for a player in a room
   * POST /api/characters/:playerId/generate
   */
  static async generateCharacter(req, res) {
    try {
      const { playerId } = req.params;
      const { roomCode } = req.body;

      // Validate input
      if (!playerId || !roomCode) {
        return res.status(400).json({ error: "Missing playerId or roomCode" });
      }

      // Find room
      const room = await Room.findOne({ where: { room_code: roomCode } });
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      // Find player
      const player = await Player.findOne({
        where: { id: playerId, room_id: room.id },
      });
      if (!player) {
        return res.status(404).json({ error: "Player not found in room" });
      }

      // Check if player already has a character
      if (player.character_data && Object.keys(player.character_data).length > 0) {
        return res.status(400).json({ error: "Player already has a character" });
      }

      // Check room is in waiting status
      if (room.status !== "waiting") {
        return res.status(400).json({ error: "Cannot generate character - game already in progress" });
      }

      // Generate character using AI
      const charData = await generateCharacter({
        theme: room.theme,
        language: room.language,
      });

      // Update player with generated character
      player.character_data = charData;
      player.current_hp = parseInt(charData.hp) || 100;
      player.current_stamina = parseInt(charData.stamina) || 100;
      await player.save();

      // Broadcast to all players in the room
      if (CharacterController.io) {
        const allPlayers = await Player.findAll({ where: { room_id: room.id } });
        CharacterController.io.to(roomCode).emit("room_update", {
          room: room,
          players: allPlayers,
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          player: {
            id: player.id,
            username: player.username,
            character_data: player.character_data,
            current_hp: player.current_hp,
            current_stamina: player.current_stamina,
            is_ready: player.is_ready,
          },
          message: "Character generated successfully",
        },
      });
    } catch (error) {
      console.error("Error generating character:", error);
      return res.status(500).json({ error: "Failed to generate character" });
    }
  }

  /**
   * Regenerate a character for a player (only if they haven't acted in game)
   * PUT /api/characters/:playerId/regenerate
   */
  static async regenerateCharacter(req, res) {
    try {
      const { playerId } = req.params;
      const { roomCode } = req.body;

      if (!roomCode) {
        return res.status(400).json({ error: "Missing roomCode" });
      }

      const room = await Room.findOne({ where: { room_code: roomCode } });
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      if (room.status !== "waiting") {
        return res.status(400).json({ error: "Can only regenerate in waiting room" });
      }

      const player = await Player.findOne({
        where: { id: playerId, room_id: room.id },
      });
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }

      // Generate new character
      const charData = await generateCharacter({
        theme: room.theme,
        language: room.language,
      });

      player.character_data = charData;
      player.current_hp = parseInt(charData.hp) || 100;
      player.current_stamina = parseInt(charData.stamina) || 100;
      await player.save();

      // Broadcast to all players in the room
      if (CharacterController.io) {
        const allPlayers = await Player.findAll({ where: { room_id: room.id } });
        CharacterController.io.to(roomCode).emit("room_update", {
          room: room,
          players: allPlayers,
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          player: {
            id: player.id,
            username: player.username,
            character_data: player.character_data,
            current_hp: player.current_hp,
            current_stamina: player.current_stamina,
          },
          message: "Character regenerated successfully",
        },
      });
    } catch (error) {
      console.error("Error regenerating character:", error);
      return res.status(500).json({ error: "Failed to regenerate character" });
    }
  }

  /**
   * Check character generation status for all players in a room
   * GET /api/rooms/:roomCode/characters-status
   */
  static async getCharacterStatus(req, res) {
    try {
      const { roomCode } = req.params;

      const room = await Room.findOne({ where: { room_code: roomCode } });
      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      const players = await Player.findAll({ where: { room_id: room.id } });

      const status = players.map((p) => ({
        id: p.id,
        username: p.username,
        hasCharacter: p.character_data && Object.keys(p.character_data).length > 0,
      }));

      const allGenerated = status.every((s) => s.hasCharacter);

      return res.status(200).json({
        success: true,
        data: {
          roomCode,
          allGenerated,
          players: status,
        },
      });
    } catch (error) {
      console.error("Error checking character status:", error);
      return res.status(500).json({ error: "Failed to check character status" });
    }
  }
}

module.exports = CharacterController;
