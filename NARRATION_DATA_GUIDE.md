# Narration Data Guide

This document outlines all Socket.IO events that contain narrative data and how to access them on the client-side for displaying immersive story narration.

## Overview

The game emits narration data through multiple Socket.IO events at different game phases. Each event contains narrative content that should be displayed to players to enhance immersion and provide story context.

---

## Battle Narrations

### 1. `round_started` Event
**When Emitted:** At the beginning of each battle round

**Data Structure:**
```javascript
{
  narrative: String,  // AI-generated narrative for round start
  roundNumber: Number,
  currentEnemy: Object,
  playerStats: Array
}
```

**Where to Access:**
```javascript
socket.on('round_started', (data) => {
  console.log(data.narrative);  // Display this to show round start narration
});
```

**Example:**
```
"The enemy lunges forward with a fierce growl! The air crackles with tension as 
battle begins..."
```

---

### 2. `battle_result` Event
**When Emitted:** After each round of combat is resolved

**Data Structure:**
```javascript
{
  narrative: String,               // Main battle narration
  playerNarratives: {
    [playerId]: String            // Individual player action narration
  },
  actionResults: Array,
  currentEnemy: Object,
  allPlayersStats: Array
}
```

**Where to Access:**
```javascript
socket.on('battle_result', (data) => {
  // Main battle narrative
  console.log(data.narrative);
  
  // Individual player action narratives
  Object.entries(data.playerNarratives).forEach(([playerId, narrative]) => {
    console.log(`Player ${playerId}: ${narrative}`);
  });
});
```

**Example:**
```
Main: "The Warrior raises his sword, striking at the enemy! The mage channels 
a fireball spell from the back lines."

Player 1: "You swing your sword with all your might, connecting with a satisfying 
crunch!"

Player 2: "Your fireball erupts from your hands, engulfing the enemy in flames!"
```

---

### 3. `battle_summary` Event
**When Emitted:** When battle victory is achieved

**Data Structure:**
```javascript
{
  narrative: String,              // Complete victory summary
  battleDuration: Number,         // Number of rounds
  enemyDefeated: Object,
  playerRewards: Array,
  updatedStats: {
    [playerId]: Object            // Updated player stats
  }
}
```

**Where to Access:**
```javascript
socket.on('battle_summary', (data) => {
  // Display victory narrative
  console.log(data.narrative);
  
  // Show rewards given
  data.playerRewards.forEach(reward => {
    console.log(`You gained: ${reward}`);
  });
});
```

**Example:**
```
"The enemy falls to the ground, defeated! Your party stands victorious, though 
battered and exhausted. You've grown stronger through this encounter."
```

---

## NPC Event Narrations

### 4. `npc_event` Event
**When Emitted:** When encountering an NPC node

**Data Structure:**
```javascript
{
  event: {
    narrative: String,             // NPC dialogue and scene description
    character: String,             // NPC name
    choices: Array<{
      id: String,
      description: String,
      statAffects: {
        strength?: Number,
        intelligence?: Number,
        wisdom?: Number,
        dexterity?: Number
      }
    }>
  }
}
```

**Where to Access:**
```javascript
socket.on('npc_event', (data) => {
  // Display NPC dialogue
  console.log(data.event.narrative);
  
  // Display NPC name
  console.log(`Speaking with: ${data.event.character}`);
  
  // Display choices for player selection
  data.event.choices.forEach(choice => {
    console.log(`${choice.id}: ${choice.description}`);
  });
});
```

**Example:**
```
Narrative: "An old hermit sits by a flickering fire. As you approach, his eyes 
gleam with ancient knowledge. 'Lost adventurers, I see. Which path calls to 
your soul?'"

Choices:
1. "Seek the path of strength" → +3 Strength
2. "Study the ancient tomes" → +3 Intelligence
3. "Meditate on inner wisdom" → +3 Wisdom
```

---

## Transition Narrations

### 5. `node_transition` Event
**When Emitted:** When moving between dungeon nodes (both before and after)

**Data Structure:**
```javascript
{
  transition: String,             // Narrative describing movement between nodes
  currentNode: {
    id: Number,
    type: String,                 // "battle" or "npc"
    description: String
  },
  nextNode: {
    id: Number,
    type: String,                 // "battle" or "npc"
    description: String
  }
}
```

**Where to Access:**
```javascript
socket.on('node_transition', (data) => {
  // Display movement narration
  console.log(data.transition);
  
  // Know what type of node you're entering
  if (data.nextNode.type === 'battle') {
    console.log('Preparing for battle...');
  } else if (data.nextNode.type === 'npc') {
    console.log('Approaching NPC encounter...');
  }
});
```

**Example:**
```
"You venture deeper into the dungeon. The air grows colder, echoing with 
distant sounds. Ahead, you see a shadowy figure emerging from the darkness..."
```

---

## Game End Narrations

### 6. `game_over` Event
**When Emitted:** When all players are defeated (game ends in loss)

**Data Structure:**
```javascript
{
  result: String,                 // "defeat" or "victory"
  narrative: String,              // Game end narration
  finalStats: {
    [playerId]: Object            // Final player statistics
  },
  nodesCompleted: Number,
  totalDamageDealt: Number,
  totalDamageTaken: Number
}
```

**Where to Access:**
```javascript
socket.on('game_over', (data) => {
  if (data.result === 'defeat') {
    console.log(data.narrative);  // Show defeat narration
    console.log(`Game ended at node ${data.nodesCompleted}`);
  }
});
```

**Example (Defeat):**
```
"The last of your companions falls. Darkness closes in. Your adventure ends 
here, in the depths of the dungeon. But fear not—legends are born from 
sacrifice..."
```

---

### 7. `story_summary` Event
**When Emitted:** At game completion (victory) or when a player reconnects mid-game

**Data Structure:**
```javascript
{
  summary: String,                // Recap of adventure
  nodesCompleted: Number,
  enemiesDefeated: Number,
  npcsEncountered: Number,
  adventureLog: Array,            // Historical events
  currentGameState: Object        // For reconnection purposes
}
```

**Where to Access:**
```javascript
socket.on('story_summary', (data) => {
  // Display adventure recap
  console.log(data.summary);
  
  // Show adventure log entries
  data.adventureLog.forEach(entry => {
    console.log(`[Node ${entry.nodeId}] ${entry.description}`);
  });
});
```

**Example:**
```
"Your legendary adventure has come to an end. You've journeyed through 
treacherous dungeons, defeated 8 fearsome enemies, met 3 enigmatic NPCs, 
and grown stronger with each trial. Your tale will be sung for ages to come!"
```

---

## Implementation Pattern

### Client-Side Narration Display System

```javascript
// Listen for all narration events and display them
const displayNarration = (narrative, type = 'general') => {
  const narrationBox = document.getElementById('narration-display');
  const fadeInClass = type === 'action' ? 'fade-in-quick' : 'fade-in-slow';
  
  narrationBox.innerHTML = narrative;
  narrationBox.classList.add(fadeInClass);
  
  // Auto-fade out after duration
  setTimeout(() => {
    narrationBox.classList.add('fade-out');
  }, 3000);
};

// Battle narrations
socket.on('round_started', (data) => {
  displayNarration(data.narrative, 'round');
});

socket.on('battle_result', (data) => {
  displayNarration(data.narrative, 'action');
  // Also display player-specific narrations in a separate area
  const playerNarratives = document.getElementById('player-narratives');
  Object.entries(data.playerNarratives).forEach(([playerId, narrative]) => {
    const playerEntry = document.createElement('div');
    playerEntry.className = 'player-action-narrative';
    playerEntry.innerHTML = `<small>${narrative}</small>`;
    playerNarratives.appendChild(playerEntry);
  });
});

socket.on('battle_summary', (data) => {
  displayNarration(data.narrative, 'victory');
});

// NPC narrations
socket.on('npc_event', (data) => {
  displayNarration(data.event.narrative, 'npc');
});

// Transition narrations
socket.on('node_transition', (data) => {
  displayNarration(data.transition, 'transition');
});

// Game end narrations
socket.on('game_over', (data) => {
  displayNarration(data.narrative, 'game-end');
});

socket.on('story_summary', (data) => {
  displayNarration(data.summary, 'story');
});
```

---

## Narration Data Hierarchy

### By Game Phase:

**Waiting Room:**
- No narration

**Battle Start:**
- `round_started` → Start of round narration

**Battle Round:**
1. Players submit actions
2. `battle_result` → Combat resolution + individual action narratives
3. Check if enemy defeated
4. Loop or proceed to battle summary

**Battle Victory:**
- `battle_summary` → Victory narrative with rewards

**Node Transition:**
- `node_transition` → Movement narration + next node type

**NPC Encounter:**
- `npc_event` → NPC dialogue + choices
- Player selects choice
- Stats updated
- Return to `node_transition`

**Dungeon Completion:**
- `game_over` → Victory narrative
- `story_summary` → Full adventure recap

**Defeat:**
- `game_over` → Defeat narrative
- Offers restart or quit

---

## Best Practices

1. **Always Display Battle Narratives** - These provide context for combat actions
2. **Queue Narrations** - Don't overlap; fade out before fading in next
3. **Distinguish by Type** - Use different styling for battles vs NPCs vs transitions
4. **Show Player Actions** - Display individual player narratives so everyone sees their impact
5. **Preserve Adventure Log** - Store `story_summary.adventureLog` for post-game review
6. **Mobile Friendly** - Keep narration boxes readable on small screens with text wrapping

---

## Data Access Quick Reference

| Event | Main Narration | Secondary Narration | How to Access |
|-------|---|---|---|
| `round_started` | ✓ `narrative` | — | `data.narrative` |
| `battle_result` | ✓ `narrative` | ✓ `playerNarratives[playerId]` | `data.narrative` + `Object.entries(data.playerNarratives)` |
| `battle_summary` | ✓ `narrative` | ✓ `playerRewards` | `data.narrative` + loop `data.playerRewards` |
| `npc_event` | ✓ `event.narrative` | ✓ `event.choices` | `data.event.narrative` + `data.event.choices` |
| `node_transition` | ✓ `transition` | — | `data.transition` |
| `game_over` | ✓ `narrative` | ✓ `finalStats` | `data.narrative` + `data.finalStats` |
| `story_summary` | ✓ `summary` | ✓ `adventureLog` | `data.summary` + `data.adventureLog` |
