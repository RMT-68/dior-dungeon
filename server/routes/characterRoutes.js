const express = require("express");
const router = express.Router();
const CharacterController = require("../controllers/characterController");

/**
 * POST /api/characters/:playerId/generate
 * Generate a character for a player in a room
 * Body: { roomCode }
 */
router.post("/:playerId/generate", CharacterController.generateCharacter);

/**
 * PUT /api/characters/:playerId/regenerate
 * Regenerate a character for a player (only in waiting room)
 * Body: { roomCode }
 */
router.put("/:playerId/regenerate", CharacterController.regenerateCharacter);

/**
 * GET /api/rooms/:roomCode/characters-status
 * Check if all players in a room have generated characters
 */
router.get("/:roomCode/status", CharacterController.getCharacterStatus);

module.exports = router;
