# Socket.IO Game Handler API Documentation

This document describes all socket events handled by the GameHandler class, including what data clients must send and what responses the server emits.

---

## Event: `join_room`

**Description:** Player joins or reconnects to a game room

### Client Sends:
```javascript
socket.emit("join_room", {
  roomCode: "ABC123",  // string - Code of the room to join
  username: "Player1"  // string - Player's username
});
```

### Server Emits:

**To requesting player:**
- `join_room_success`: `{ playerId, roomCode, username, isHost }`
- `error`: `{ message }` (if room not found, game finished, or cannot join)

**If room is waiting:**
- `room_update`: `{ room, players }` (broadcasts to all players in room)

**If room is playing (reconnection):**
- `story_summary`: AI-generated story summary of progress so far
- `game_start`: `{ room, players, dungeon, currentNode, currentEnemy }`
- `npc_event`: `{ event, choosingPlayerId, choosingPlayerName }` (if in NPC node)
- `round_started`: `{ round, narrative }` (if in battle)
- `waiting_for_players`: `{ actedCount, totalCount, waitingFor }` (if in battle)

### Behavior:
- Sets first player to join as host (if not already set)
- Allows reconnection if player already exists in room
- Blocks new players from joining if `room.status === "playing"`
- Blocks all joins if `room.status === "finished"`
- Stores `playerId`, `roomCode`, `username` in socket.data for future events

---

## Event: `player_ready`

**Description:** Player marks themselves as ready to start the game

### Client Sends:
```javascript
socket.emit("player_ready", {
  isReady: true  // boolean - true to mark ready, false to unmark
});
```

### Server Emits:
- `room_update`: `{ room, players }` (broadcasts to all players in room)
- `error`: `{ message }` (if invalid session)

### Behavior:
- Updates player's `is_ready` flag in database
- Broadcasts updated player list to all players
- Game can only start when all players have `is_ready = true`

---

## Event: `start_game`

**Description:** Host initiates game start (no parameters needed)

### Client Sends:
```javascript
socket.emit("start_game");
```

### Server Emits:

**To all players (broadcast):**
- `game_start`: `{ room, players, dungeon, currentNode, currentEnemy }`
- `npc_event`: `{ event, choosingPlayerId, choosingPlayerName }` (if first node is NPC)

**To requesting player (errors):**
- `error`: `{ message: "Only the host can start the game" }`
- `error`: `{ message: "Not all players are ready" }`
- `error`: `{ message: "All players must generate a character before starting the game" }`

### Behavior:
- **Authorization:** Only host can start game (`room.host_id === playerId`)
- **Validation:** All players must have `is_ready = true`
- **Validation:** All players must have `character_data` populated (non-empty object)
- Sets `room.status = "playing"`
- Initializes `room.game_state` with first node
- If first node is `type: "npc"`, triggers NPC event immediately

---

## Event: `player_action`

**Description:** Player performs action during battle turn

### Client Sends:

**For REST action:**
```javascript
socket.emit("player_action", {
  actionType: "rest"  // string - regenerates 1d6 stamina
});
```

**For SKILL action (attack/heal/defend):**
```javascript
socket.emit("player_action", {
  actionType: "attack",        // string - "attack", "heal", or "defend"
  skillName: "Fireball",       // string - Name of skill from character_data.skills
  skillAmount: 60,             // number - Base damage/heal amount
  skillId: "skill-1"           // string (optional) - Skill identifier
});
```

### Server Emits:

**To all players (after action recorded):**
- `player_action_update`: `{ playerId, action, totalActions }`
- `waiting_for_players`: `{ actedCount, totalCount, waitingFor }` (if not all acted yet)

**To all players (when all players have acted):**
- `battle_result`: `{ round, narrative, playerNarratives, enemyAction, enemy, battleStatus, players }`

**If battle status is "ongoing":**
- `round_started`: `{ round, narrative }`

**If battle status is "victory":**
- `battle_summary`: AI-generated victory summary with rewards

**If battle status is "defeat":**
- `game_over`: AI-generated defeat summary

**To requesting player (errors):**
- `error`: `{ message: "Invalid session" }`
- `error`: `{ message: "Not in battle" }`
- `error`: `{ message: "You have already acted this turn" }`
- `error`: `{ message: "Skill not found" }`
- `error`: `{ message: "Not enough stamina. Required: X, Have: Y" }`

### Behavior:
- **Action Timer:** First action in round starts 30-second timer for all players
- **Auto-Rest:** If timer expires, player auto-submits rest action
- **Stamina Cost:** Deducts `skill.staminaCost` from `player.current_stamina`
- **REST Action:** Rolls 1d6 to regenerate stamina
- **Race Condition Protection:** Re-fetches room state before saving action
- **Turn Resolution:** Triggers `resolveBattleRound()` when all alive players have acted
- **Stamina Regen:** All alive players gain +1 stamina per round
- **Victory/Defeat Detection:** Checks if enemy HP ≤ 0 or all players dead

---

## Event: `next_node`

**Description:** Host proceeds to next dungeon node (no parameters needed)

### Client Sends:
```javascript
socket.emit("next_node");
```

### Server Emits:

**To all players (if more nodes exist):**
- `node_transition`: `{ transition, nextNode, currentEnemy }` (AI-generated transition narrative)
- `npc_event`: `{ event, choosingPlayerId, choosingPlayerName }` (if next node is NPC)

**To all players (if no more nodes):**
- `game_over`: AI-generated victory summary with final stats

**To requesting player (errors):**
- `error`: `{ message: "Only the host can proceed to the next node" }`
- `error`: `{ message: "Room not found" }`

### Behavior:
- **Authorization:** Only host can proceed (`room.host_id === playerId`)
- Increments `room.current_node_index`
- Regenerates 50% stamina for all players
- Resets `round = 1`, `logs = []`, `currentTurnActions = []`
- If next node is NPC, triggers `triggerNPCEvent()`
- If no next node, ends game with victory

---

## Event: `npc_choice`

**Description:** Chosen player makes decision during NPC event

### Client Sends:
```javascript
socket.emit("npc_choice", {
  choiceId: "choice-1"  // string - ID of the chosen option
});
```

### Server Emits:

**To all players:**
- `npc_resolution`: `{ narrative, effects, players }` (updated player states)

**To requesting player (errors):**
- `error`: `{ message: "Only the chosen player can make this decision" }`
- `error`: `{ message: "No active NPC event" }`
- `error`: `{ message: "Invalid choice" }`

### Behavior:
- **Authorization:** Only the chosen player can make choice (`room.game_state.npcChoosingPlayerId === playerId`)
- Applies effects to ALL players in party:
  - `hpBonus`: Modifies `current_hp` and `character_data.maxHP`
  - `staminaBonus`: Modifies `current_stamina` and `character_data.maxStamina`
  - `skillPowerBonus`: Modifies `character_data.skillPower`
- Logs choice to `room.game_state.adventure_log`
- Clears `currentNPCEvent` and `npcChoosingPlayerId`
- Host must call `next_node` to continue after NPC resolution

---

## Event: `disconnect`

**Description:** Player disconnects (automatic, no client action needed)

### Client Sends:
```
(Automatic socket.io disconnect event)
```

### Server Emits:
```
(Currently none - only logs to console)
```

### Current Behavior:
- Logs disconnect to console: `Client {socket.id} disconnected`

### TODO (Not Yet Implemented):
- Set `player.socket_id = null` in database
- End game with `game_over` event if `room.status === "playing"`
- Reassign host if host disconnects during waiting room
- Clear action timers for disconnected player

---

## Event: `end_turn`

**Description:** Deprecated - turn resolution is automatic when all players act

### Status:
**DEPRECATED** - This event is no longer used. Turn resolution happens automatically in `playerAction` when all alive players have submitted actions.

---

## Helper Events (Server → Client Only)

These events are emitted by the server but not directly triggered by client:

### `timer_started`
```javascript
{
  timeoutMs: 30000,
  timeoutSeconds: 30,
  players: [{ id, username }, ...]
}
```
Emitted when first player acts in a round, starting 30-second action timer.

### `action_timeout`
```javascript
{
  playerId: 123,
  playerName: "Player1",
  autoAction: "rest",
  staminaRegained: 4,
  diceRoll: 4
}
```
Emitted when player's action timer expires and rest action is auto-submitted.

---

## Data Structures

### Room Object
```javascript
{
  id: 1,
  room_code: "ABC123",
  host_id: 1,
  host_name: "Player1",
  theme: "Vampire Castle",
  difficulty: "medium",
  max_node: 5,
  language: "en",
  status: "waiting" | "playing" | "finished",
  dungeon_data: { /* Generated dungeon */ },
  game_state: { /* Active game state */ }
}
```

### Player Object
```javascript
{
  id: 1,
  username: "Player1",
  socket_id: "socket-id-123",
  room_id: 1,
  is_ready: true,
  is_alive: true,
  current_hp: 100,
  current_stamina: 6,
  character_data: { /* Generated character */ }
}
```

### Game State Object
```javascript
{
  round: 1,
  turnIndex: 0,
  logs: [/* Battle round logs */],
  adventure_log: [/* All battle/NPC history */],
  currentTurnActions: [/* Current round actions */],
  currentNode: { /* Current dungeon node */ },
  currentEnemy: { /* Current enemy or null */ },
  currentNPCEvent: { /* Active NPC event or null */ },
  npcChoosingPlayerId: 123  // ID of player making choice
}
```

### Action Object
```javascript
{
  playerId: 1,
  playerName: "Player1",
  type: "rest" | "attack" | "heal" | "defend",
  skillName: "Fireball",
  skillAmount: 60,
  skillPower: 2.5,
  staminaCost: 2,
  staminaRegained: 4,  // Only for rest actions
  diceRoll: 4,         // Only for rest actions
  auto: true           // Only if auto-submitted by timeout
}
```

---

## Error Handling

All errors are emitted as:
```javascript
socket.emit("error", { message: "Error description" });
```

Common error scenarios:
- Invalid session (missing `playerId` or `roomCode` in socket.data)
- Unauthorized action (not host when host-only action required)
- Invalid room status (e.g., trying to act when not in battle)
- Missing or invalid data (e.g., skill not found, not enough stamina)
- Duplicate action (already acted this turn)
- Invalid choice (e.g., not the chosen player for NPC event)
