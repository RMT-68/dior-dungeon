const { Room, Player } = require("../models");
const { generateDungeon } = require("../ai/dungeonGenerator");
const { v4: uuidv4 } = require("uuid");

class RoomController {
  static async createRoom(req, res) {
    try {
      const { hostName, difficulty, maxNode, language, theme } = req.body;

      // 🔒 VALIDATION (THEME NOT REQUIRED)
      if (!hostName || !difficulty || !maxNode) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const dungeon = await generateDungeon({
        theme,
        difficulty,
        maxNode: parseInt(maxNode),
        language: language || "en",
      });

      const roomCode = uuidv4().substring(0, 6).toUpperCase();
      // For now, host_id will be set when first player joins
      const newRoom = await Room.create({
        room_code: roomCode,
        host_name: hostName,
        host_id: null,
        theme,
        difficulty,
        max_node: parseInt(maxNode),
        language: language || "en",
        status: "waiting",
        dungeon_data: dungeon,
        current_node_index: 0,
        game_state: {
          round: 0,
          logs: [],
          turnOrder: [],
        },
      });

      return res.status(201).json({
        success: true,
        data: newRoom,
      });
    } catch (error) {
      console.error("Error creating room:", error);
      return res.status(500).json({ error: "Failed to create room" });
    }
  }

  static async getRooms(req, res) {
    try {
      const rooms = await Room.findAll({
        where: { status: "waiting" },
        include: [{ model: Player, attributes: ["username"] }],
        order: [["createdAt", "DESC"]],
      });
      res.json({ success: true, data: rooms });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch rooms" });
    }
  }

  static async getRoomDetails(req, res) {
    try {
      const { id } = req.params;
      const room = await Room.findOne({
        where: { room_code: id },
        include: [{ model: Player }],
      });

      if (!room) {
        return res.status(404).json({ error: "Room not found" });
      }

      res.json({ success: true, data: room });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch room details" });
    }
  }
}

module.exports = RoomController;
