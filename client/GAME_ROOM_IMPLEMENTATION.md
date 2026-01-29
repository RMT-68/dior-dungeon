# Game Room Client Implementation

## Overview
This implementation provides a complete client-side game room for the multiplayer dungeon adventure game with real-time socket communication.

## Components Created

### 1. **GameRoom.jsx** (Main Game Component)
- Main game container managing state and socket events
- Displays 3 players with their stats and skills
- Real-time chat for game narration
- Action panel for player input
- Enemy display during battles
- NPC encounter display

**Key Features:**
- Automatic reconnection support using localStorage
- Real-time game state synchronization
- Turn-based action management
- Battle round results with narration
- NPC event handling with host-only choices

### 2. **PlayerCard.jsx**
- Displays individual player information
- Shows HP and stamina bars with percentage indicators
- Lists all player skills with descriptions
- Visual indicators for:
  - Current player (gold border)
  - Host (crown badge 👑)
  - Defeated players (grayscale overlay)

### 3. **ChatBox.jsx**
- Scrolling chat log for game narration
- Different message types with color coding:
  - 📢 System messages (blue)
  - 📖 Narration (purple)
  - ⚔️ Player actions (green)
  - 👹 Enemy actions (red)
  - 🎉 Victories (gold)
  - 🚪 Transitions (blue)
  - 💬 NPC encounters (teal)
  - ✨ NPC results (gray)
  - 🏁 Game over (dark red)
  - ⚠️ Warnings (orange)
  - ❌ Errors (red)

### 4. **EnemyDisplay.jsx**
- Shows enemy information during battles
- HP and stamina bars
- Enemy role badge (boss/elite/minion)
- Enemy archetype and skill power
- List of enemy abilities
- Visual differentiation by role:
  - Boss: Gold border, 👹 icon
  - Elite: Purple border, 👺 icon
  - Minion: Gray border, 👿 icon

### 5. **ActionPanel.jsx**
- Dynamic action interface based on game state
- **Battle Mode:**
  - Shows all player skills as clickable buttons
  - Stamina cost indicators
  - Disabled state for insufficient stamina
  - Rest button to recover stamina
  - Visual feedback for submitted actions
- **NPC Mode:**
  - Two choice buttons (positive/negative)
  - Shows effect preview (HP, Stamina, Skill Power)
  - Host-only interaction
  - Other players see waiting message
- **Victory Mode:**
  - Shows victory message
  - Continue button (host only)

### 6. **game-room.css**
- Complete styling for all game room components
- Dark fantasy theme with gradients
- Responsive design for mobile/tablet
- Smooth animations and transitions
- Custom scrollbar styling
- Hover effects and visual feedback

## Socket Events Handled

### Incoming Events:
- `room_update` - Updates room and player data
- `game_start` - Initiates game and shows initial narration
- `game_state_sync` - Syncs state for reconnecting players
- `battle_round_result` - Shows battle results and narration
- `node_transition` - Displays transition between nodes
- `npc_event` - Shows NPC encounter with choices
- `npc_choice_result` - Shows results of NPC choice
- `game_over` - Displays final summary
- `turn_timeout` - Warns about time running out
- `error` - Displays error messages

### Outgoing Events:
- `join_room` - Join/rejoin game room
- `player_action` - Submit battle action (attack/rest)
- `npc_choice` - Submit NPC choice (host only)
- `next_node` - Advance to next node (host only)
- `leave_room` - Leave the game

## Game Flow

### 1. Waiting Room → Game Room
When host starts the game:
1. `game_start` event received
2. Navigate to `/game` with room/player data
3. GameRoom automatically rejoins socket room
4. Initial game state loaded

### 2. Battle Node
1. Enemy displayed at top
2. Players see their skill buttons
3. Each player submits action (attack or rest)
4. When all players acted, battle round resolves
5. Narration shows in chat
6. New round begins until enemy defeated

### 3. NPC Node
1. NPC description displayed
2. Host sees two choice buttons
3. Other players wait
4. Host selects choice
5. Results applied to all players
6. Host continues to next node

### 4. Victory & Progression
1. When enemy defeated, victory message shown
2. Host clicks "Continue Adventure"
3. Stamina partially restored
4. Transition narration displayed
5. Next node loads (battle or NPC)

### 5. Game Over
1. Final summary displayed
2. 10-second delay
3. Auto-navigate back to lobby

## Key Features

### Turn Management
- Visual indicator for whose turn it is
- Disabled actions when not your turn
- "Action Submitted" feedback
- Auto-rest if timeout occurs

### Host Privileges
- Only host can:
  - Choose NPC options
  - Advance to next node after victory
  - Control game progression

### Reconnection Support
- Uses localStorage to persist:
  - roomCode
  - playerId
  - username
- Automatic rejoin on page refresh
- State sync from server

### Responsive Design
- Mobile-friendly layout
- Sidebar becomes horizontal on small screens
- Touch-friendly buttons
- Scrollable content areas

## Usage

Players will:
1. Create/join room in Lobby
2. Generate character in Waiting Room
3. Ready up when satisfied
4. Host starts game
5. Navigate to Game Room automatically
6. Play through dungeon encounters
7. Return to lobby when game ends

## Technical Notes

- Uses React hooks for state management
- Socket.io for real-time communication
- React Router for navigation
- PropTypes for type checking
- CSS animations for visual polish
- Auto-scrolling chat
- Optimized re-renders with proper dependencies

## Future Enhancements

Potential additions:
- Player avatars/portraits
- Animation effects for attacks
- Sound effects for actions
- Battle logs export
- Player statistics tracking
- Achievement system
- Spectator mode for defeated players
- Chat input for player communication
