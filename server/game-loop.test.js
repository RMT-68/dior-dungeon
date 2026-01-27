// MUST mock before imports
const mockGemini = jest.fn(async (model, prompt) => {
  if (prompt.includes("dungeon generator")) {
    return JSON.stringify({
      dungeonName: "Test Dungeon",
      description: "Test Desc",
      difficulty: "easy",
      theme: "test",
      nodes: [
        { id: 1, name: "Battle Node", type: "enemy", enemyId: "e1" },
        { id: 2, name: "NPC Node", type: "npc", enemyId: null },
        { id: 3, name: "Boss Node", type: "enemy", enemyId: "e2" },
      ],
      enemies: [
        {
          id: "e1",
          name: "Minion",
          role: "minion",
          hp: 100,
          maxHP: 100,
          skills: [{ name: "Hit", amount: 10, type: "damage" }],
        },
        {
          id: "e2",
          name: "Boss",
          role: "boss",
          hp: 200,
          maxHP: 200,
          skills: [{ name: "Smash", amount: 20, type: "damage" }],
        },
      ],
    });
  }
  if (prompt.includes("character generator")) {
    return JSON.stringify({
      name: "Hero",
      role: "Warrior",
      hp: 100,
      stamina: 100,
      skillPower: 1.5,
      skills: [
        { name: "Slash", amount: 20, type: "damage" },
        { name: "Bash", amount: 15, type: "damage" },
        { name: "Heal", amount: 10, type: "healing" },
      ],
    });
  }
  if (prompt.includes("battle narration") || prompt.includes("Game Master")) {
    return JSON.stringify({
      narrative: "The battle rages!",
      playerNarratives: [{ playerId: "p1", narrative: "Hits hard!" }],
      enemyAction: { skillUsed: "Hit", narrative: "Enemy strikes back!" },
    });
  }
  if (prompt.includes("storyteller") && prompt.includes("transition")) {
    return JSON.stringify({
      narrative: "The party moves on.",
      mood: "brave",
    });
  }
  if (prompt.includes("NPC event")) {
    return JSON.stringify({
      npcName: "Helper",
      description: "Hello",
      choices: [
        {
          id: "positive",
          label: "Yes",
          outcome: {
            narrative: "Good",
            effects: { hpBonus: 10, staminaBonus: 10, skillPowerBonus: 0 },
          },
        },
        {
          id: "negative",
          label: "No",
          outcome: {
            narrative: "Bad",
            effects: { hpBonus: 0, staminaBonus: 0, skillPowerBonus: 0 },
          },
        },
      ],
    });
  }
  return "{}";
});

jest.mock("./helpers/gemini", () => mockGemini);

const request = require("supertest");
const socketIoClient = require("socket.io-client");
const { app, server: httpServer } = require("./app");
const { Room, Player, sequelize } = require("./models");

let PORT;

describe("Game Loop Integration", () => {
  let roomCode;
  let playerSocket;
  let playerId;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        PORT = httpServer.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await sequelize.close();
    httpServer.close();
  });

  test("Full Game Flow", (done) => {
    // 1. Create Room
    request(app)
      .post("/api/rooms")
      .send({
        hostName: "Host",
        theme: "Test",
        difficulty: "easy",
        maxNode: 3,
      })
      .end((err, res) => {
        if (err) return done(err);
        roomCode = res.body.data.room_code;

        // 2. Connect Socket
        playerSocket = socketIoClient(`http://localhost:${PORT}`);

        playerSocket.on("connect", () => {
          playerSocket.emit("join_room", { roomCode, username: "Player1" });
        });

        playerSocket.on("room_update", (data) => {
          // Check if joined
          const p = data.players.find((x) => x.username === "Player1");
          if (p && !p.is_ready) {
            playerId = p.id;
            // 3. Ready Up
            playerSocket.emit("player_ready", { isReady: true });
          } else if (p && p.is_ready && data.room.status === "waiting") {
            // 4. Start Game
            playerSocket.emit("start_game");
          }
        });

        playerSocket.on("game_start", (data) => {
          try {
            expect(data.room.status).toBe("playing");
            expect(data.currentNode.type).toBe("enemy");

            // 5. Perform Action
            playerSocket.emit("player_action", {
              actionType: "attack",
              skillName: "Slash",
              skillAmount: 20,
            });
          } catch (e) {
            done(e);
          }
        });

        playerSocket.on("battle_result", (data) => {
          // Battle resolved!
          try {
            expect(data.round).toBe(1);
            expect(data.enemyAction).toBeDefined();

            // Move to next node (assume victory or just testing transition)
            playerSocket.emit("next_node");
          } catch (e) {
            done(e);
          }
        });

        playerSocket.on("node_transition", (data) => {
          try {
            expect(data.transition).toBeDefined();
            expect(data.nextNode.type).toBe("npc");
            // Wait for NPC event
          } catch (e) {
            done(e);
          }
        });

        playerSocket.on("npc_event", (data) => {
          try {
            expect(data.npcName).toBe("Helper");
            playerSocket.disconnect();
            done();
          } catch (e) {
            done(e);
          }
        });

        playerSocket.on("error", (err) => {
          console.error("Socket Error:", err);
          done(err);
        });
      });
  }, 10000);
});
