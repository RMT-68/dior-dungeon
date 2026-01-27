const aiModule = require("./aiModule");

const rooms = {};

const handleConnection = (io, socket) => {
  // Generate Dungeon Event
  socket.on(
    "generate_dungeon",
    async ({ roomId, theme, difficulty, maxNode }) => {
      const room = rooms[roomId];
      if (!room) {
        socket.emit("error", "Room not found");
        return;
      }

      try {
        // Call AI to generate dungeon
        const dungeonData = await aiModule.generateDungeon({
          theme,
          difficulty,
          maxNode: maxNode || 5,
        });

        // Store dungeon in room state
        room.dungeon = dungeonData;
        room.currentNodeIndex = 0;
        room.completedNodes = [];

        // Send dungeon data to all players in room
        io.to(roomId).emit("dungeon_generated", dungeonData);
        console.log(
          `Dungeon generated for room ${roomId}: ${dungeonData.dungeonName}`,
        );
      } catch (error) {
        console.error("Error generating dungeon:", error);
        socket.emit("error", "Failed to generate dungeon");
      }
    },
  );

  socket.on("join_room", ({ roomId, name, role, language }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        history: [],
        turnIndex: 0,
        status: "waiting", // 'waiting', 'playing', 'finished'
        language: language || "id",
        dungeon: null,
        currentNodeIndex: 0,
        completedNodes: [],
        currentEnemy: null,
      };
    }

    const room = rooms[roomId];
    if (room.players.length >= 3) {
      socket.emit("error", "Room is full");
      return;
    }

    const roleTaken = room.players.find((player) => player.role === role);
    if (roleTaken) {
      socket.emit("error", `Role ${role} already taken by ${roleTaken.name}`);
      return;
    }

    const player = { id: socket.id, name, role, hp: 100, maxHp: 100 };
    room.players.push(player);
    socket.join(roomId);

    io.to(roomId).emit("roomUpdate", {
      players: room.players,
      isFull: room.players.length === 3,
    });
    console.log(`${name} joined room ${roomId} as ${role}`);

    socket.on("leave_room", ({ roomId }) => {
      const room = rooms[roomId];
      if (room) {
        room.players = room.players.filter((p) => p.id !== socket.id);
        io.to(roomId).emit("room_update", {
          players: room.players,
          isFull: room.players.length === 3,
        });
        console.log(`${name} left room ${roomId}`);
      }
    });

    socket.on("start_game", async ({ roomId }) => {
      const room = rooms[roomId];
      if (room && room.players.length === 3 && room.status === "waiting") {
        // Check if dungeon is generated
        if (!room.dungeon) {
          socket.emit("error", "Please generate dungeon first");
          return;
        }

        room.status = "playing";
        io.to(roomId).emit("game_start");

        // Get first node
        const firstNode = room.dungeon.nodes[0];
        room.currentNodeIndex = 0;

        // If first node has enemy, load it
        if (firstNode.type === "enemy" && firstNode.enemyId) {
          room.currentEnemy = room.dungeon.enemies.find(
            (e) => e.id === firstNode.enemyId,
          );
        }

        //AI Integration - Start game with dungeon context
        const data = await aiModule.startGame(
          room.players,
          room.language,
          room.dungeon,
          firstNode,
          room.currentEnemy,
        );

        room.history.push({ sender: "GM", message: data.narrative });
        io.to(roomId).emit("chat_message", {
          sender: "GM",
          message: data.narrative,
        });
        io.to(roomId).emit("turn_update", {
          currentTurn: room.players[0].id,
          suggestions: data.suggestions,
        });

        // Send current node info
        io.to(roomId).emit("node_update", {
          currentNode: firstNode,
          nodeIndex: 0,
          totalNodes: room.dungeon.nodes.length,
          currentEnemy: room.currentEnemy,
        });
      }
    });

    socket.on("player_action", async ({ roomId, action }) => {
      const room = rooms[roomId];
      if (!room || room.status !== "playing") return;
      const currentPlayer = room.players[room.turnIndex];
      if (currentPlayer.id !== socket.id) return;

      //1. Broadcast Player Action
      room.history.push({
        sender: currentPlayer.name,
        message: action,
        role: currentPlayer.role,
      });
      io.to(roomId).emit("chat_message", {
        sender: currentPlayer.name,
        message: action,
        role: currentPlayer.role,
      });

      //2. AI Processing
      io.to(roomId).emit("typing_status", { isTyping: true });

      const nextTurnIndex = (room.turnIndex + 1) % 3;
      const nextPlayer = room.players[nextTurnIndex];

      const currentNode = room.dungeon.nodes[room.currentNodeIndex];

      const data = await aiModule.generateResponse(
        room.history,
        action,
        currentPlayer,
        nextPlayer,
        room.language,
        room.dungeon,
        currentNode,
        room.currentEnemy,
      );

      //3. Broadcast AI Narrative
      room.history.push({ sender: "GM", message: data.narrative });
      io.to(roomId).emit("chat_message", {
        sender: "GM",
        message: data.narrative,
      });
      io.to(roomId).emit("typing_status", { isTyping: false });

      //4. Update stats
      if (data.damageToPlayer > 0) {
        currentPlayer.hp = Math.max(0, currentPlayer.hp - data.damageToPlayer);
        io.to(roomId).emit("room_update", {
          players: room.players,
          isFull: true,
        });
        io.to(roomId).emit("chat_message", {
          sender: "SYSTEM",
          message: `${currentPlayer.name} took ${data.damageToPlayer} damage! HP: ${currentPlayer.hp}/${currentPlayer.maxHp}`,
        });
      }

      //5. Check if enemy defeated or node completed
      if (data.enemyDefeated || data.nodeCompleted) {
        room.completedNodes.push(room.currentNodeIndex);

        // Check if there are more nodes
        if (room.currentNodeIndex < room.dungeon.nodes.length - 1) {
          // Move to next node
          room.currentNodeIndex++;
          const nextNode = room.dungeon.nodes[room.currentNodeIndex];

          // Load enemy if next node has one
          if (nextNode.type === "enemy" && nextNode.enemyId) {
            room.currentEnemy = room.dungeon.enemies.find(
              (e) => e.id === nextNode.enemyId,
            );
          } else {
            room.currentEnemy = null;
          }

          io.to(roomId).emit("node_completed", {
            completedNode: room.dungeon.nodes[room.currentNodeIndex - 1],
            nextNode: nextNode,
          });

          io.to(roomId).emit("node_update", {
            currentNode: nextNode,
            nodeIndex: room.currentNodeIndex,
            totalNodes: room.dungeon.nodes.length,
            currentEnemy: room.currentEnemy,
          });
        } else {
          // All nodes completed - Victory!
          io.to(roomId).emit("game_over", {
            message: "CONGRATULATIONS! YOU HAVE DEFEATED THE DUNGEON!",
            victory: true,
          });
          room.status = "finished";
          return;
        }
      }

      //6. Game Over or Next Turn
      if (data.gameOver || currentPlayer.hp === 0) {
        if (currentPlayer.hp === 0) {
          io.to(roomId).emit("game_over", {
            message: "HERO DEFEATED! GAME OVER.",
            victory: false,
          });
        } else {
          io.to(roomId).emit("game_over", {
            message: "CONGRATULATIONS! YOU HAVE DEFEATED THE DUNGEON!",
            victory: true,
          });
        }
        room.status = "finished";
      } else {
        room.turnIndex = nextTurnIndex;
        io.to(roomId).emit("turn_update", {
          currentTurn: nextPlayer.id,
          suggestions: data.suggestions,
        });
      }
    });
  });
};

const handleDisconnect = (io, socket) => {};

module.exports = {
  handleConnection,
  handleDisconnect,
};
