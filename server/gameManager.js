const rooms = {};

const handleConnection = (io, socket) => {
  socket.on("joinRoom", ({ roomId, name, role, language }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        history: [],
        turnIndex: 0,
        status: "waiting", // 'waiting', 'playing', 'finished'
        language: language || "id",
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
        room.status = "playing";
        io.to(roomId).emit("game_start");

        //AI Integration Placeholder
        // Here integrate with your AI module to start the game logic

        const data = await aiModule.startGame(room.players, room.language); //Ai Module Call
        room.history.push({ sender: "GM", message: data.narrative });
        io.to(roomId).emit("chat_message", {
          sender: "GM",
          message: data.narrative,
        });
        io.to(roomId).emit("turn_update", {
          currentTurn: room.players[0].id,
          suggestions: data.suggestions,
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

      const data = await aiModule.generateResponse(
        room.history,
        message,
        currentPlayer,
        nextPlayer,
        room.language,
      ); //Ai Module Call

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
      //5. Game Over or Next Turn
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
