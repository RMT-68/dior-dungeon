// MUST mock before imports
jest.mock("./helpers/gemini", () => {
  return jest.fn(async (model, prompt) => {
    if (prompt.includes("dungeon generator")) {
      return JSON.stringify({
        dungeonName: "Test Dungeon",
        description: "Test Desc",
        difficulty: "easy",
        theme: "test",
        nodes: [
          { id: 1, name: "Node 1", type: "enemy", enemyId: "e1" },
          { id: 2, name: "Node 2", type: "npc", enemyId: null },
          { id: 3, name: "Node 3", type: "enemy", enemyId: "e1" },
        ],
        enemies: [
          {
            id: "e1",
            name: "Enemy 1",
            role: "boss",
            hp: 150,
            maxHP: 150,
            stamina: 60,
            maxStamina: 60,
            skillPower: 2.0,
            skills: [
              {
                name: "Attack",
                description: "Basic attack",
                type: "damage",
                amount: 10,
              },
            ],
          },
        ],
      });
    }
    if (prompt.includes("character generator")) {
      return JSON.stringify({
        id: "character-1",
        name: "Test Warrior",
        role: "Warrior",
        theme: "Dark Forest",
        hp: 120,
        maxHP: 120,
        stamina: 80,
        maxStamina: 80,
        skillPower: 1.5,
        skills: [
          {
            name: "Slash",
            description: "Basic attack",
            type: "damage",
            amount: 20,
          },
          {
            name: "Heal",
            description: "Basic heal",
            type: "healing",
            amount: 10,
          },
          {
            name: "Bash",
            description: "Heavy attack",
            type: "damage",
            amount: 30,
          },
        ],
      });
    }
    return "{}";
  });
});

const request = require("supertest");
const socketIoClient = require("socket.io-client");
const { app, server: httpServer } = require("./app");
const { Room, Player, sequelize } = require("./models");

let PORT;

describe("Game Flow Integration", () => {
  let roomCode;

  beforeAll(async () => {
    // Sync DB (force true to clean up)
    await sequelize.sync({ force: true });

    // Start server on random port using the EXPORTED server (with socket.io)
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

  test("Create Room via API", async () => {
    const res = await request(app).post("/api/rooms").send({
      hostName: "HostUser",
      theme: "Dark Forest",
      difficulty: "easy",
      maxNode: 3,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.room_code).toBeDefined();

    roomCode = res.body.data.room_code;
  });

  test("Join Room via Socket", (done) => {
    const clientSocket = socketIoClient(`http://localhost:${PORT}`);

    clientSocket.on("connect", () => {
      clientSocket.emit("join_room", { roomCode, username: "Player1" });
    });

    clientSocket.on("room_update", (data) => {
      try {
        expect(data.room.room_code).toBe(roomCode);
        expect(data.players.length).toBeGreaterThan(0);
        expect(data.players[0].username).toBe("Player1");
        clientSocket.disconnect();
        done();
      } catch (error) {
        done(error);
      }
    });

    clientSocket.on("error", (err) => {
      done(err);
    });
  });
});
