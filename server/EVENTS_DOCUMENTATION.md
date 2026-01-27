# Client-Server Events Documentation

## Socket Events untuk Dungeon Generation System

### Client → Server Events

#### 1. `generate_dungeon`

Generate dungeon sebelum game dimulai.

**Emit from client:**

```javascript
socket.emit("generate_dungeon", {
  roomId: "room123",
  theme: "Vampire Castle",
  difficulty: "medium", // "easy" | "medium" | "hard"
  maxNode: 5,
});
```

**Server response:**

- Event: `dungeon_generated` (success)
- Event: `error` (failure)

---

#### 2. `join_room`

Join room (unchanged, tapi room sekarang support dungeon state).

```javascript
socket.emit("join_room", {
  roomId: "room123",
  name: "Player1",
  role: "warrior",
  language: "id", // atau "en"
});
```

---

#### 3. `start_game`

Start game (sekarang memerlukan dungeon sudah di-generate).

```javascript
socket.emit("start_game", {
  roomId: "room123",
});
```

---

#### 4. `player_action`

Player melakukan action (unchanged).

```javascript
socket.emit("player_action", {
  roomId: "room123",
  action: "I attack the vampire with my sword!",
});
```

---

### Server → Client Events

#### 1. `dungeon_generated`

Dikirim setelah dungeon berhasil di-generate.

**Data:**

```javascript
{
  dungeonName: "Castle of the Blood Moon",
  description: "An ancient vampire castle shrouded in darkness...",
  difficulty: "medium",
  nodes: [
    {
      id: 1,
      name: "Castle Gate",
      type: "enemy",
      enemyId: "vamp_minion_1",
      tags: ["entrance", "outdoor"]
    },
    {
      id: 2,
      name: "Grand Hall",
      type: "npc",
      enemyId: null,
      tags: ["indoor", "mysterious"]
    },
    // ... more nodes
  ],
  enemies: [
    {
      id: "vamp_minion_1",
      name: "Vampire Guard",
      role: "minion",
      archetype: "Undead Warrior",
      tags: ["vampire", "guard"]
    },
    // ... more enemies
  ]
}
```

---

#### 2. `node_update`

Dikirim setiap kali update node (awal game atau pindah node).

**Data:**

```javascript
{
  currentNode: {
    id: 1,
    name: "Castle Gate",
    type: "enemy",
    enemyId: "vamp_minion_1",
    tags: ["entrance"]
  },
  nodeIndex: 0,
  totalNodes: 5,
  currentEnemy: {
    id: "vamp_minion_1",
    name: "Vampire Guard",
    role: "minion",
    archetype: "Undead Warrior",
    tags: ["vampire"]
  } // atau null jika tidak ada enemy
}
```

---

#### 3. `node_completed`

Dikirim saat node selesai dan pindah ke node berikutnya.

**Data:**

```javascript
{
  completedNode: {
    id: 1,
    name: "Castle Gate",
    type: "enemy",
    // ...
  },
  nextNode: {
    id: 2,
    name: "Grand Hall",
    type: "npc",
    // ...
  }
}
```

---

#### 4. `game_start`

Game dimulai (unchanged).

---

#### 5. `chat_message`

Message dari GM atau player (unchanged).

```javascript
{
  sender: "GM", // atau player name
  message: "You enter the dark castle...",
  role: "warrior" // jika dari player
}
```

---

#### 6. `turn_update`

Update giliran player (unchanged).

```javascript
{
  currentTurn: "socket_id_player",
  suggestions: [
    "Attack the vampire",
    "Use healing potion",
    "Search for clues"
  ]
}
```

---

#### 7. `room_update` / `roomUpdate`

Update state room (player HP, dll).

```javascript
{
  players: [
    { id: "socket1", name: "Player1", role: "warrior", hp: 85, maxHp: 100 },
    { id: "socket2", name: "Player2", role: "mage", hp: 100, maxHp: 100 },
    { id: "socket3", name: "Player3", role: "rogue", hp: 90, maxHp: 100 }
  ],
  isFull: true
}
```

---

#### 8. `game_over`

Game selesai (victory atau defeat).

```javascript
{
  message: "CONGRATULATIONS! YOU HAVE DEFEATED THE DUNGEON!",
  victory: true // atau false
}
```

---

#### 9. `typing_status`

GM sedang typing (AI processing).

```javascript
{
  isTyping: true; // atau false
}
```

---

#### 10. `error`

Error message.

```javascript
"Error message here";
```

---

## Flow Permainan

1. **Create/Join Room**
   - Client: `join_room`
   - Server: `roomUpdate`

2. **Generate Dungeon**
   - Client: `generate_dungeon`
   - Server: `dungeon_generated`

3. **Start Game**
   - Client: `start_game`
   - Server: `game_start`, `chat_message` (opening), `turn_update`, `node_update`

4. **Game Loop**
   - Client: `player_action`
   - Server: `chat_message` (player action)
   - Server: `typing_status` (true)
   - Server: `chat_message` (GM response)
   - Server: `typing_status` (false)
   - Server: `room_update` (jika ada damage)
   - Server: `node_completed` (jika node selesai)
   - Server: `node_update` (update ke node baru)
   - Server: `turn_update` atau `game_over`

5. **Game End**
   - Server: `game_over`

---

## Example Client Implementation

```javascript
// Generate dungeon
const generateDungeon = () => {
  socket.emit("generate_dungeon", {
    roomId: currentRoom,
    theme: "Vampire Castle",
    difficulty: "medium",
    maxNode: 5,
  });
};

// Listen for dungeon generated
socket.on("dungeon_generated", (dungeonData) => {
  console.log("Dungeon generated:", dungeonData);
  // Update UI dengan dungeon info
  setDungeon(dungeonData);
});

// Listen for node updates
socket.on("node_update", (data) => {
  console.log(
    `Node ${data.nodeIndex + 1}/${data.totalNodes}: ${data.currentNode.name}`,
  );
  setCurrentNode(data.currentNode);
  setCurrentEnemy(data.currentEnemy);
});

// Listen for node completion
socket.on("node_completed", (data) => {
  console.log("Node completed!", data.completedNode.name);
  console.log("Moving to:", data.nextNode.name);
});
```
