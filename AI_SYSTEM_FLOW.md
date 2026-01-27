# AI System Flow - Dior Dungeon

## 1. Scenario Selection

User dari client join room yang di generate AI.

### Room Generation
- **AI generates room** dengan kriteria:
  - Max node
  - Difficulty level
  
### Room Structure
- Room yang digenerate AI akan berbentuk **array sebanyak Max node** yang dibutuhkan
- Setiap node dapat berisikan:
  - **Monster Node**
    - Monster memiliki HP
    - Monster memiliki Skills
  - **NPC Node**
    - NPC memiliki events

### Special Rules
- **Last node** akan **pasti berisi Boss**
- Setiap **monster node** akan ada **battle**
- Setiap **NPC node** akan ada **event** dengan 2 endpoint:
  - **Positif**: Menambahkan bonus untuk player
  - **Negatif**: Mengurangkan bonus untuk player

---

## 2. Character Selection

User akan memilih character yang tergenerate/digenerate oleh AI.

### Character Attributes
- **HP (Health Points)**
  - HP yang kurang dari 0 akan dinyatakan `isAlive: false`
  
- **Stamina**
  - Currency untuk menggunakan skill yang dipunya
  
- **Skill Power**
  - Multiplier untuk skill character
  
- **Skills** (Array)
  - Nama skill
  - Deskripsi skill

---

## 3. Battle System

User akan dihadapi battle pada node battle yang ditemui.

### Battle Flow
1. **Battle Duration**
   - Battle akan terus berlangsung sampai HP monster mati

2. **Turn Order**
   - Users dan monster akan **bergiliran** untuk memulai turnnya
   - Setiap turn **semua user** akan melakukan aksi terlebih dahulu
   - Lalu **end turn**

3. **AI Response**
   - Setiap ronde akan **generate AI response** sesuai dengan user actions

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SCENARIO SELECTION                        │
│  AI generates room → Array of Nodes (Max node count)        │
└─────────────────────────────────────────────────────────────┘
                              ↓
                   ┌──────────────────────┐
                   │  Node Types:         │
                   │  - Monster (HP + Skills) │
                   │  - NPC (Events)      │
                   │  - Boss (Last Node)  │
                   └──────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  CHARACTER SELECTION                         │
│  AI generates character → HP, Stamina, Skill Power, Skills  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      BATTLE SYSTEM                           │
│  Turn-based combat → AI generates responses each round      │
└─────────────────────────────────────────────────────────────┘
```

---

---

## 4. Room Management

User dapat membuat room, join, dan leave game.

### Room Operations
- **Create Room**
  - Host membuat room dengan spesifikasi (theme, difficulty, maxNode, language)
  - Room mendapat unique room ID
  - Room diberi status: `waiting | playing | finished`

- **Join Room**
  - Player dapat join room yang masih dalam status `waiting`
  - Max player per room ditentukan
  - Player mendapat player ID

- **Leave Room**
  - Player dapat meninggalkan room sebelum game dimulai
  - Jika game sudah dimulai, player dapat spectate atau forfeit
  - Host leaving room = room disbanded

---

## 5. Lobby System

### Lobby Features
- **Player List**: Menampilkan semua player yang join room
- **Room Settings**: Theme, difficulty, max node, language
- **Start Game Button**: Host dapat memulai game ketika minimum player tercapai
- **Ready Status**: Player dapat set status ready/not ready

---

## 6. Real-Time Communication

### Chat System
- **In-game Chat**: Player dapat chat dalam room
- **Broadcast Messages**: Pesan dikirim ke semua player di room
- **System Messages**: Notifikasi action (join, leave, start turn, dll)
- **Message Format**: 
  ```json
  {
    "playerId": "string",
    "playerName": "string",
    "message": "string",
    "timestamp": "ISO-8601",
    "type": "chat | system | action"
  }
  ```

### Voice Support
- **Optional voice channel** untuk komunikasi real-time antar player
- Backend dapat integrate dengan WebRTC atau third-party service

---

## 7. Combat Commands

Player dapat melakukan action dengan command selama turn mereka.

### Available Commands
- **`/attack skillName`** - Serang enemy dengan skill tertentu
  - Cost: Stamina
  - Damage: (Skill Power × Skill Damage Multiplier) + Dice Roll
  
- **`/heal skillName`** - Gunakan healing skill
  - Cost: Stamina
  - Restore: (Skill Power × Skill Heal Multiplier) + Dice Roll
  
- **`/defend`** - Posisi defensive untuk round ini
  - Cost: 0 Stamina
  - Effect: Mengurangi damage yang diterima sebesar 30-50%

- **`/endTurn`** - Akhiri turn pemain
  - Diperlukan untuk lanjut ke turn selanjutnya

---

## 8. Dice Roll Logic

Untuk menambah randomness dan excitement dalam battle.

### Dice System
- **Dice Roll Range**: 1-20 (d20 system)
- **Hit Calculation**:
  ```
  Final Damage = (Base Damage × Skill Power) + (Dice Roll / 10)
  ```
- **Crit Chance**:
  - Dice Roll ≥ 18 = Critical Hit (2x damage)
  - Dice Roll ≤ 2 = Miss (0 damage)

### Example
```
Player Attack:
- Base Skill Damage: 20
- Player Skill Power: 2.5
- Dice Roll: 15
- Final Damage: (20 × 2.5) + 1.5 = 51.5 damage
```

---

## 9. Turn Management

Mencegah spam dan memastikan turn-based gameplay.

### Turn Flow
1. **Current Turn Player** hanya bisa execute 1 action per turn
2. **Action Lock**: Setelah action, player tidak bisa action lagi sampai next turn
3. **Turn Timer** (optional): Max 30-60 detik per turn, auto-pass jika timeout
4. **Turn Queue**: Sistem antri turn untuk multiple players
5. **Initiative Roll**: Siapa mulai duluan ditentukan by dice roll atau fixed order

### Turn Sequence
```
Round 1:
├─ Player 1 Turn (execute action → end turn)
├─ Player 2 Turn (execute action → end turn)
├─ Enemy Turn (AI generates action)
└─ Round complete

Round 2: (repeat)
```

---

## 10. AI as Game Master

AI tidak hanya generate dungeon, tapi juga sebagai Game Master selama game.

### AI Game Master Features
- **Narrative/Story Generation**: AI generate deskripsi setiap node, encounter, event
- **Enemy AI**: AI decide aksi musuh berdasarkan kondisi battle
  - Attack, defend, use skill, flee (jika bisa)
  - Strategy berdasarkan HP musuh dan player action
  
- **Event Resolution**: AI resolve hasil dari player action
  - Interpretasi action
  - Generate consequences
  - Update game state
  
- **Dynamic Storytelling**: AI adapt cerita berdasarkan player choices
  - NPC event outcome
  - Dialogue dan interaction

### Example AI Flow
```
Player Action: "/attack fireball"
└─ Dice Roll: 17 (crit!)
└─ AI Process:
   ├─ Calculate damage: (50 × 2) + 1.7 = 101.7
   ├─ Apply to enemy HP
   ├─ Generate narrative: "Your fireball engulfs the creature in flames!"
   └─ Generate AI response: Enemy uses heal skill

Game Master Output:
{
  "playerAction": "attack fireball",
  "diceRoll": 17,
  "damage": 101.7,
  "isCritical": true,
  "narrative": "Your fireball engulfs the creature in flames, dealing massive damage!",
  "enemyHP": 45,
  "enemyNextAction": "heal",
  "systemMessage": "Enemy uses Regenerate!"
}
```

---

## 11. Player Status & End Game

### Player Status Display
- **During Battle**:
  ```json
  {
    "playerId": "string",
    "playerName": "string",
    "character": "string",
    "hp": 100,
    "maxHP": 150,
    "stamina": 45,
    "maxStamina": 100,
    "status": "alive | dead",
    "position": 1
  }
  ```

- **End Game Report**:
  ```json
  {
    "playerId": "string",
    "playerName": "string",
    "finalHP": 75,
    "damageDealt": 450,
    "damageTaken": 200,
    "skillsUsed": ["fireball", "heal"],
    "criticalHits": 3,
    "result": "victory | defeat | spectated",
    "reward": {
      "experience": 500,
      "gold": 250,
      "items": []
    }
  }
  ```

---

## 12. Game Log & History

Complete record dari setiap game untuk review dan learning.

### Game Log Content
- **Game Metadata**:
  - Room ID, Dungeon name, Difficulty
  - Start time, End time, Duration
  - All players list

- **Event Log**: Setiap action tercatat dengan timestamp
  ```json
  {
    "round": 1,
    "turn": 1,
    "timestamp": "2026-01-27T10:30:45Z",
    "playerId": "player-1",
    "action": "attack",
    "skillName": "fireball",
    "diceRoll": 15,
    "damage": 75,
    "targetHP": 35,
    "narrative": "Fireball hits the enemy!"
  }
  ```

- **Final Report**:
  - All players' final stats
  - Battle statistics (total damage, heals, etc)
  - Dungeon completion status
  - Rewards distribution

### Game Log Access
- **Export Format**: JSON, CSV, PDF (dengan AI-generated summary)
- **Availability**: Available untuk download setelah game selesai
- **AI Summary**: AI generate narrative summary dari keseluruhan game
  - "The party successfully defeated the Vampire Lord after a fierce 15-round battle..."

---

## AI Generation Endpoints

### 1. Generate Room
**Input:**
- Theme (string)
- Difficulty (string: "easy" | "medium" | "hard")
- Max node (number)
- Language (string: "en" | "id" | etc)

**Output:**
- Dungeon object dengan nodes dan enemies

### 2. Generate Character
**Input:**
- (Based on game requirements)

**Output:**
- Character object dengan HP, Stamina, Skill Power, Skills

### 3. Generate Battle Response
**Input:**
- Player actions (array)
- Current battle state
- Enemy info

**Output:**
- AI-generated narrative
- Enemy action
- Updated game state
- Damage calculations

### 4. Generate Event Outcome
**Input:**
- NPC type
- Player choice (positive/negative)
- Current game state

**Output:**
- Event result
- Bonus/penalty
- Narrative description

### 5. Generate Game Summary
**Input:**
- Complete game log
- All player stats
- Dungeon info

**Output:**
- AI-written narrative summary
- Highlights dan memorable moments
- Final achievements
