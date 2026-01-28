import { useState, useEffect, useRef } from "react";
import PlayerList from "../components/PlayerList";
import ChatBox from "../components/Chatbox";
import CommandInput from "../components/CommandInput";
import { parseCommand } from "../utils/commandParser";
import { socket } from "../socket";
import { useLanguage } from "../context/LanguageContext";
import LanguageToggle from "../components/LanguageToggle";
import MusicPlayer from "../components/MusicPlayer";

// Action icons mapping
const ACTION_ICONS = {
  attack: "/attack-action.png",
  damage: "/attack-action.png",
  heal: "/heal.png",
  victory: "/Victory.png",
  defeat: "/gameover.png",
  gameover: "/gameover.png",
};

export default function GameRoom() {
  const { t } = useLanguage();
  const hasJoinedRef = useRef(false);

  // Constants from localStorage
  const USERNAME = localStorage.getItem("username") || "Warrior";
  const ROOM_ID = localStorage.getItem("roomCode") || "demo-room";
  const PLAYER_ID = localStorage.getItem("playerId") || null;

  // ============ STATE ============
  const [messages, setMessages] = useState([{ id: 1, type: "system", text: "Waiting for dungeon master..." }]);

  // Game state
  const [dungeon, setDungeon] = useState(null);
  const [currentNode, setCurrentNode] = useState(null);
  const [currentEnemy, setCurrentEnemy] = useState(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [gameStatus, setGameStatus] = useState("waiting"); // waiting | playing | battle | npc_event | finished
  const [isDisconnected, setIsDisconnected] = useState(false);

  // Player state
  const [players, setPlayers] = useState([]);
  const [myPlayerId, setMyPlayerId] = useState(PLAYER_ID);
  const [isHost, setIsHost] = useState(false);

  // NPC state
  const [npcEvent, setNpcEvent] = useState(null);
  const [npcChoosingPlayerId, setNpcChoosingPlayerId] = useState(null);
  const [npcResolved, setNpcResolved] = useState(false);

  // Battle state
  const [battleSummary, setBattleSummary] = useState(null);

  // Character state
  const [character, setCharacter] = useState({
    name: USERNAME,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    maxStamina: 100,
    isAlive: true,
    skills: [],
  });

  // Game over state
  const [gameOverData, setGameOverData] = useState(null);

  // ============ HELPERS ============

  /**
   * Update character state from player data.
   * Single source of truth for character updates.
   */
  const updateCharacterFromPlayer = (playerData) => {
    if (!playerData) return;
    setCharacter({
      name: playerData.username,
      hp: playerData.current_hp,
      maxHp: playerData.character_data?.maxHP || 100,
      stamina: playerData.current_stamina,
      maxStamina: playerData.character_data?.maxStamina || 100,
      isAlive: playerData.is_alive,
      skills: playerData.character_data?.skills || [],
    });
  };

  /**
   * Add message to chat.
   */
  const addMessage = (type, text, icon = null, extra = {}) => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        type,
        text,
        icon,
        timestamp: new Date().toLocaleTimeString(),
        ...extra,
      },
    ]);
  };

  // ============ SOCKET SETUP & EVENT LISTENERS ============
  useEffect(() => {
    if (!socket.connected) socket.connect();

    // ===== REGISTER ALL LISTENERS FIRST (before join_room emit) =====
    // This ensures all event handlers are ready to receive responses

    // ===== JOIN & SETUP EVENTS =====
    const handleJoinSuccess = (data) => {
      setMyPlayerId(data.playerId);
      setIsHost(data.isHost);
      localStorage.setItem("playerId", data.playerId);
      addMessage("system", `Welcome ${data.username}! You joined room ${data.roomCode}`);
    };

    const handleRoomUpdate = (data) => {
      if (data.players) {
        setPlayers(data.players);
        const myPlayer = data.players.find((p) => p.id === myPlayerId);
        if (myPlayer) {
          updateCharacterFromPlayer(myPlayer);
        }
      }
    };

    // ===== GAME START =====
    const handleGameStart = (data) => {
      // Hydrate from complete authoritative snapshot
      setGameStatus("playing");
      setDungeon(data.dungeon);
      setCurrentRound(data.gameState?.round || 1);
      setCurrentNode(data.gameState?.currentNode || null);
      setCurrentEnemy(data.gameState?.currentEnemy || null);
      setPlayers(data.players || []);
      setBattleSummary(null);
      setNpcEvent(null);

      // Update my character from players data
      // Note: myPlayerId should be set by join_room_success which arrives first
      const myPlayer = data.players?.find((p) => p.id === myPlayerId);
      if (myPlayer) {
        updateCharacterFromPlayer(myPlayer);
      }

      addMessage("system", `⚔️ Adventure begins in ${data.dungeon?.dungeonName || "the dungeon"}!`);
      if (data.gameState?.currentNode) {
        addMessage("narration", `📍 ${data.gameState.currentNode.name}: ${data.gameState.currentNode.description}`);
      }
      if (data.gameState?.currentEnemy) {
        addMessage("enemy", `👹 ${data.gameState.currentEnemy.name} appears!`, ACTION_ICONS.attack);
      }
    };

    // ===== GAME STATE SYNC (Reconnection) =====
    const handleGameStateSync = (data) => {
      // Hydrate from complete authoritative snapshot (same as game_start)
      setDungeon(data.dungeon);
      setCurrentRound(data.gameState?.round || 1);
      setCurrentNode(data.gameState?.currentNode || null);
      setCurrentEnemy(data.gameState?.currentEnemy || null);
      setPlayers(data.players || []);

      // Update my character from players data
      const myPlayer = data.players?.find((p) => p.id === myPlayerId);
      if (myPlayer) {
        updateCharacterFromPlayer(myPlayer);
      }

      // Determine game status from server state
      if (data.gameState?.currentNPCEvent) {
        setGameStatus("npc_event");
        setNpcEvent(data.gameState.currentNPCEvent);
        setNpcChoosingPlayerId(data.gameState.npcChoosingPlayerId || null);
        addMessage("system", `🔄 Rejoined during NPC event...`);
      } else if (data.gameState?.currentEnemy && data.gameState.currentEnemy.hp > 0) {
        setGameStatus("battle");
        addMessage("system", `🔄 Rejoined during battle! Round ${data.gameState.round}`);
      } else {
        setGameStatus("playing");
        addMessage("system", `🔄 Rejoined the game!`);
      }

      addMessage("system", `📍 Location: ${data.gameState?.currentNode?.name || "Unknown"}`);
    };

    // ===== BATTLE EVENTS =====
    const handleRoundStarted = (data) => {
      setCurrentRound(data.round);
      setGameStatus("battle");
      addMessage("system", `⚔️ Round ${data.round} starts!`);
      if (data.narrative) {
        addMessage("narration", data.narrative);
      }
    };

    const handlePlayerActionUpdate = (data) => {
      const icon = data.action.type === "heal" ? ACTION_ICONS.heal : ACTION_ICONS.attack;
      let text = "";

      if (data.action.type === "rest") {
        text = `${data.action.playerName} rests`;
      } else {
        text = `${data.action.playerName} uses ${data.action.skillName}!`;
      }

      addMessage("action", text, icon);
    };

    const handleBattleResult = (data) => {
      // Main narrative
      if (data.narrative) {
        addMessage("narration", data.narrative);
      }

      // Individual player actions
      if (data.playerNarratives) {
        data.playerNarratives.forEach((pn) => {
          const icon = pn.type === "heal" ? ACTION_ICONS.heal : ACTION_ICONS.attack;
          addMessage("action", pn.narrative, icon);
        });
      }

      // Enemy action
      if (data.enemyAction) {
        addMessage("enemy", `👹 ${data.enemyAction.narrative}`, ACTION_ICONS.attack);
      }

      // Update enemy state
      if (data.enemy) {
        setCurrentEnemy(data.enemy);
      }

      // Update all players including my character
      if (data.players) {
        setPlayers(data.players);
        const myPlayer = data.players.find((p) => p.id === myPlayerId);
        if (myPlayer) {
          updateCharacterFromPlayer(myPlayer);
        }
      }
    };

    const handleBattleSummary = (data) => {
      setBattleSummary(data);
      addMessage("victory", `🎉 Victory! ${data.summary}`, ACTION_ICONS.victory);
      if (data.quote) {
        addMessage("quote", `"${data.quote}"`);
      }
    };

    // ===== NPC EVENTS =====
    const handleNpcEvent = (data) => {
      setGameStatus("npc_event");
      setNpcEvent(data.event);
      setNpcChoosingPlayerId(data.choosingPlayerId);
      setNpcResolved(false);

      addMessage("npc", `🧙 ${data.event.npcName}\n${data.event.description}`);
      addMessage("system", `${data.choosingPlayerName} must choose...`);

      data.event.choices?.forEach((choice, idx) => {
        addMessage("choice", `${idx + 1}. ${choice.label}`);
      });
    };

    const handleNpcResolution = (data) => {
      setNpcEvent(null);
      setNpcChoosingPlayerId(null);
      setNpcResolved(true);
      setGameStatus("playing");

      if (data.narrative) {
        addMessage("narration", data.narrative);
      }

      // Update players if provided
      if (data.players) {
        setPlayers(data.players);
        const myPlayer = data.players.find((p) => p.id === myPlayerId);
        if (myPlayer) {
          updateCharacterFromPlayer(myPlayer);
        }
      }
    };

    // ===== NODE TRANSITION =====
    const handleNodeTransition = (data) => {
      setCurrentNode(data.nextNode);
      setCurrentEnemy(null);
      setBattleSummary(null);
      setNpcResolved(false);
      setCurrentRound(1);

      addMessage("narration", `📍 ${data.nextNode.name}`);

      // Determine game status based on next node
      if (data.nextNode.type === "enemy" && data.currentEnemy) {
        setCurrentEnemy(data.currentEnemy);
        setGameStatus("battle");
        addMessage("enemy", `👹 ${data.currentEnemy.name} appears!`, ACTION_ICONS.attack);
      } else if (data.nextNode.type === "npc") {
        setGameStatus("npc_event");
      } else {
        setGameStatus("playing");
      }
    };

    // ===== GAME OVER =====
    const handleGameOver = (data) => {
      setGameStatus("finished");
      setGameOverData(data);

      const isVictory = data.legendStatus === "legendary" || data.legendStatus === "heroic";
      const icon = isVictory ? ACTION_ICONS.victory : ACTION_ICONS.gameover;

      addMessage("gameover", `🏆 ${data.summary}`, icon);
      if (data.epitaph) {
        addMessage("epitaph", `"${data.epitaph}"`);
      }
    };

    // ===== UTILITIES =====
    const handleWaitingForPlayers = (data) => {
      const count = data.waitingOn?.length || 0;
      if (count > 0) {
        addMessage("system", `⏳ Waiting for ${count} player(s)...`);
      }
    };

    const handleActionTimeout = (data) => {
      addMessage("warning", `⏰ ${data.playerName} timed out!`);
    };

    const handleError = (err) => {
      addMessage("error", `❌ Error: ${err.message || "Unknown error"}`);
    };

    // ===== CONNECTION =====
    const handleDisconnect = () => {
      setIsDisconnected(true);
      addMessage("warning", "⚠️ Connection lost. Reconnecting...");
    };

    const handleConnect = () => {
      setIsDisconnected(false);
      // Rejoin room
      if (hasJoinedRef.current) {
        const storedPlayerId = localStorage.getItem("playerId");
        if (storedPlayerId) {
          socket.emit("join_room", { roomCode: ROOM_ID, playerId: storedPlayerId });
        } else {
          socket.emit("join_room", { roomCode: ROOM_ID, username: USERNAME });
        }
        addMessage("system", "🔗 Reconnected!");
      }
    };

    const handlePlayerReconnected = (data) => {
      if (data.playerId !== myPlayerId) {
        addMessage("system", `✅ ${data.username} reconnected!`);
      }
    };

    // Register all listeners BEFORE emitting join_room
    socket.on("join_room_success", handleJoinSuccess);
    socket.on("room_update", handleRoomUpdate);
    socket.on("game_start", handleGameStart);
    socket.on("game_state_sync", handleGameStateSync);
    socket.on("round_started", handleRoundStarted);
    socket.on("player_action_update", handlePlayerActionUpdate);
    socket.on("battle_result", handleBattleResult);
    socket.on("battle_summary", handleBattleSummary);
    socket.on("npc_event", handleNpcEvent);
    socket.on("npc_resolution", handleNpcResolution);
    socket.on("node_transition", handleNodeTransition);
    socket.on("game_over", handleGameOver);
    socket.on("waiting_for_players", handleWaitingForPlayers);
    socket.on("action_timeout", handleActionTimeout);
    socket.on("error", handleError);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect", handleConnect);
    socket.on("player_reconnected", handlePlayerReconnected);

    // NOW emit join_room after all listeners are registered
    if (!hasJoinedRef.current) {
      hasJoinedRef.current = true;
      if (PLAYER_ID) {
        socket.emit("join_room", {
          roomCode: ROOM_ID,
          playerId: PLAYER_ID,
        });
      } else {
        socket.emit("join_room", {
          roomCode: ROOM_ID,
          username: USERNAME,
        });
      }
    }

    // Cleanup
    return () => {
      socket.off("join_room_success", handleJoinSuccess);
      socket.off("room_update", handleRoomUpdate);
      socket.off("game_start", handleGameStart);
      socket.off("game_state_sync", handleGameStateSync);
      socket.off("round_started", handleRoundStarted);
      socket.off("player_action_update", handlePlayerActionUpdate);
      socket.off("battle_result", handleBattleResult);
      socket.off("battle_summary", handleBattleSummary);
      socket.off("npc_event", handleNpcEvent);
      socket.off("npc_resolution", handleNpcResolution);
      socket.off("node_transition", handleNodeTransition);
      socket.off("game_over", handleGameOver);
      socket.off("waiting_for_players", handleWaitingForPlayers);
      socket.off("action_timeout", handleActionTimeout);
      socket.off("error", handleError);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect", handleConnect);
      socket.off("player_reconnected", handlePlayerReconnected);
    };
  }, [myPlayerId]);

  // ============ ACTION HANDLERS ============

  /**
   * Handle player action: skill or rest.
   */
  const handleAction = (skill) => {
    if (!character.isAlive) return;

    if (skill.type === "rest") {
      socket.emit("player_action", { actionType: "rest" });
      return;
    }

    // Map skill type to action type
    const typeMap = { damage: "attack", heal: "heal", defend: "defend" };
    const actionType = typeMap[skill.type] || "attack";

    socket.emit("player_action", {
      actionType,
      skillName: skill.name,
      skillAmount: skill.amount || 10,
      skillId: skill.id,
    });
  };

  /**
   * Handle NPC choice.
   */
  const handleNpcChoice = (choiceId) => {
    socket.emit("npc_choice", { choiceId });
  };

  /**
   * Move to next node.
   */
  const handleNextNode = () => {
    socket.emit("next_node");
  };

  /**
   * Rejoin after disconnection.
   */
  const handleRejoin = () => {
    setIsDisconnected(false);
    socket.disconnect();
    setTimeout(() => {
      socket.connect();
    }, 500);
  };

  /**
   * Handle messages from command input.
   */
  const handleSendMessage = (text) => {
    const parsed = parseCommand(text);
    addMessage("player", text, null, { sender: USERNAME });

    if (!parsed) return;

    // Handle slash commands
    if (parsed.command === "attack") {
      const attackSkill = character.skills.find((s) => s.type === "damage");
      if (attackSkill) handleAction(attackSkill);
    } else if (parsed.command === "heal") {
      const healSkill = character.skills.find((s) => s.type === "heal");
      if (healSkill) handleAction(healSkill);
    } else if (parsed.command === "rest") {
      handleAction({ type: "rest" });
    } else if (parsed.command === "next") {
      handleNextNode();
    }
  };

  // ============ RENDER ============
  const npcCanChoose = npcChoosingPlayerId === myPlayerId;

  return (
    <div className="vh-100 d-flex flex-column bg-dark text-light">
      {/* Disconnection Modal */}
      {isDisconnected && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex align-items-center justify-content-center"
          style={{ zIndex: 9999 }}
        >
          <div className="card bg-danger p-4 text-center" style={{ maxWidth: 400 }}>
            <h4 className="mb-3">⚠️ Connection Lost</h4>
            <p className="mb-4">Reconnect to continue playing.</p>
            <button className="btn btn-primary btn-lg" onClick={handleRejoin}>
              🔗 Rejoin
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-bottom border-secondary p-2 bg-dark d-flex justify-content-between align-items-center">
        <div>
          <h4 className="mb-0 text-warning">⚔️ {dungeon?.dungeonName || "Dior Dungeon"}</h4>
          <small className="text-muted">
            Round: {currentRound} | Status: {gameStatus.toUpperCase()}
            {currentNode && ` | Location: ${currentNode.name}`}
          </small>
        </div>
        <div className="d-flex align-items-center gap-2">
          <MusicPlayer />
          <LanguageToggle />
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-grow-1 d-flex overflow-hidden">
        {/* Left: Player List */}
        <div className="col-3 border-end border-secondary bg-dark p-0 overflow-auto">
          <PlayerList players={players} currentPlayerId={myPlayerId} />
        </div>

        {/* Center: Chat & Actions */}
        <div className="col-6 d-flex flex-column p-0">
          <ChatBox messages={messages} />

          {/* Battle Action Buttons */}
          {gameStatus === "battle" && character.isAlive && (
            <div className="p-2 bg-secondary border-top border-dark">
              <div className="d-flex gap-2 flex-wrap justify-content-center">
                {character.skills.map((skill, idx) => (
                  <button
                    key={idx}
                    className={`btn btn-sm d-flex align-items-center gap-1 ${
                      skill.type === "heal" ? "btn-success" : "btn-danger"
                    }`}
                    onClick={() => handleAction(skill)}
                    disabled={character.stamina < (skill.staminaCost || 0)}
                    title={`${skill.staminaCost || 0} stamina`}
                  >
                    <img
                      src={skill.type === "heal" ? ACTION_ICONS.heal : ACTION_ICONS.attack}
                      alt={skill.type}
                      style={{ width: 16, height: 16 }}
                    />
                    {skill.name}
                  </button>
                ))}
                <button
                  className="btn btn-warning btn-sm"
                  onClick={() => handleAction({ type: "rest" })}
                  title="Restore stamina"
                >
                  🛌 Rest
                </button>
              </div>
            </div>
          )}

          {/* NPC Choice Buttons */}
          {gameStatus === "npc_event" && npcEvent && (
            <div className="p-2 bg-info border-top border-dark">
              <p className="mb-2 text-dark fw-bold">{npcCanChoose ? "Choose wisely:" : "Waiting for decision..."}</p>
              <div className="d-flex gap-2 flex-wrap">
                {npcEvent.choices?.map((choice, idx) => (
                  <button
                    key={idx}
                    className="btn btn-dark btn-sm"
                    onClick={() => handleNpcChoice(choice.id)}
                    disabled={!npcCanChoose}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Next Node Button (after battle victory) */}
          {gameStatus === "playing" && battleSummary && (
            <div className="p-2 bg-success border-top border-dark text-center">
              <button
                className="btn btn-light"
                onClick={handleNextNode}
                disabled={!isHost}
                title={!isHost ? "Only host can proceed" : "Continue to next area"}
              >
                ➡️ Continue
              </button>
            </div>
          )}

          {/* Next Node Button (after NPC resolution) */}
          {gameStatus === "playing" && npcResolved && (
            <div className="p-2 bg-info border-top border-dark text-center">
              <button
                className="btn btn-dark"
                onClick={handleNextNode}
                disabled={!isHost}
                title={!isHost ? "Only host can proceed" : "Continue to next area"}
              >
                ➡️ Continue
              </button>
            </div>
          )}

          {/* Command Input */}
          <CommandInput onSend={handleSendMessage} disabled={!character.isAlive || gameStatus === "finished"} />
        </div>

        {/* Right: Character & Enemy Info */}
        <div className="col-3 border-start border-secondary bg-dark p-2 overflow-auto">
          {/* My Character */}
          <div className="card bg-secondary text-light mb-3">
            <div className="card-header bg-primary">
              <h6 className="mb-0">🧙 {character.name}</h6>
            </div>
            <div className="card-body p-2">
              <div className="mb-2">
                <small>HP</small>
                <div className="progress" style={{ height: 10 }}>
                  <div
                    className="progress-bar bg-danger"
                    style={{
                      width: `${(character.hp / character.maxHp) * 100}%`,
                    }}
                  />
                </div>
                <small>
                  {character.hp}/{character.maxHp}
                </small>
              </div>
              <div className="mb-2">
                <small>Stamina</small>
                <div className="progress" style={{ height: 10 }}>
                  <div
                    className="progress-bar bg-success"
                    style={{
                      width: `${(character.stamina / character.maxStamina) * 100}%`,
                    }}
                  />
                </div>
                <small>
                  {character.stamina}/{character.maxStamina}
                </small>
              </div>
              <div>
                <small className="text-muted">Skills:</small>
                <ul className="list-unstyled mb-0 small">
                  {character.skills.map((s, i) => (
                    <li key={i}>
                      <img
                        src={s.type === "heal" ? ACTION_ICONS.heal : ACTION_ICONS.attack}
                        alt={s.type}
                        style={{ width: 12, height: 12, marginRight: 4 }}
                      />
                      {s.name}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Current Enemy */}
          {currentEnemy && currentEnemy.hp > 0 && (
            <div className="card bg-secondary text-light mb-3">
              <div className="card-header bg-danger">
                <h6 className="mb-0">👹 {currentEnemy.name}</h6>
              </div>
              <div className="card-body p-2">
                <div className="mb-2">
                  <small>HP</small>
                  <div className="progress" style={{ height: 10 }}>
                    <div
                      className="progress-bar bg-danger"
                      style={{
                        width: `${(currentEnemy.hp / (currentEnemy.maxHP || currentEnemy.hp)) * 100}%`,
                      }}
                    />
                  </div>
                  <small>
                    {currentEnemy.hp}/{currentEnemy.maxHP || "???"}
                  </small>
                </div>
                <small className="text-muted">{currentEnemy.role || currentEnemy.archetype}</small>
              </div>
            </div>
          )}

          {/* Game Over */}
          {gameOverData && (
            <div className="card bg-dark border-warning">
              <div className="card-body text-center">
                <img
                  src={
                    gameOverData.legendStatus === "legendary" || gameOverData.legendStatus === "heroic"
                      ? ACTION_ICONS.victory
                      : ACTION_ICONS.gameover
                  }
                  alt="Result"
                  className="img-fluid mb-2"
                  style={{ maxHeight: 80 }}
                />
                <h5 className="text-warning">{gameOverData.legendStatus?.toUpperCase()}</h5>
                <p className="small">{gameOverData.epitaph}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
