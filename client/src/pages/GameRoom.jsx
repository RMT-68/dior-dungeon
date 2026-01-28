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
  const myPlayerIdRef = useRef(null); // Track latest myPlayerId

  // Read from localStorage inside component to get fresh values
  const USERNAME = localStorage.getItem("username") || "Warrior";
  const ROOM_ID = localStorage.getItem("roomCode") || "demo-room";
  const PLAYER_ID = localStorage.getItem("playerId") || null; // Get playerId from localStorage

  const [messages, setMessages] = useState([{ id: 1, type: "system", text: "Waiting for dungeon master..." }]);

  const [dungeon, setDungeon] = useState(null);
  const [currentNode, setCurrentNode] = useState(null);
  const [currentEnemy, setCurrentEnemy] = useState(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [gameStatus, setGameStatus] = useState("waiting"); // waiting, playing, npc_event, battle, finished, disconnected
  const [isDisconnected, setIsDisconnected] = useState(false); // Track disconnection state

  // Player & Game State
  const [players, setPlayers] = useState([]);
  const [myPlayerId, setMyPlayerId] = useState(PLAYER_ID); // Initialize with stored playerId
  const [isHost, setIsHost] = useState(false);

  // NPC Event State
  const [npcEvent, setNpcEvent] = useState(null);
  const [npcChoosingPlayerId, setNpcChoosingPlayerId] = useState(null);

  // Battle Summary & Game Over
  const [battleSummary, setBattleSummary] = useState(null);
  const [gameOverData, setGameOverData] = useState(null);

  const [character, setCharacter] = useState({
    name: USERNAME,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    maxStamina: 100,
    isAlive: true,
    skills: [],
  });

  // Helper to add message with icon
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

  useEffect(() => {
    if (!socket.connected) socket.connect();

    // Prevent double join
    if (!hasJoinedRef.current) {
      hasJoinedRef.current = true;
      // If we have a playerId from localStorage, use it for reconnection; otherwise use username for new player
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

    // ============ JOIN & ROOM EVENTS ============
    const handleJoinSuccess = (data) => {
      myPlayerIdRef.current = data.playerId; // Update ref with latest playerId
      setMyPlayerId(data.playerId);
      setIsHost(data.isHost);
      // Store playerId in localStorage for future reconnections
      localStorage.setItem("playerId", data.playerId);
      addMessage("system", `Welcome ${data.username}! You joined room ${data.roomCode}`);
    };

    const handleRoomUpdate = (data) => {
      if (data.players) {
        setPlayers(data.players);
        const me = data.players.find((p) => p.id === myPlayerId);
        if (me) {
          setCharacter({
            name: me.username,
            hp: me.current_hp,
            maxHp: me.character_data?.hp || 100,
            stamina: me.current_stamina,
            maxStamina: me.character_data?.maxStamina || 100,
            isAlive: me.is_alive,
            skills: me.character_data?.skills || [],
          });
        }
      }
    };

    // ============ GAME START ============
    const handleGameStart = (data) => {
      setGameStatus("playing");
      setDungeon(data.dungeon);
      setCurrentNode(data.currentNode);
      setCurrentEnemy(data.currentEnemy);
      if (data.players) setPlayers(data.players);

      addMessage("system", `⚔️ Adventure begins in ${data.dungeon?.dungeonName || "the dungeon"}!`);
      if (data.currentNode) {
        addMessage("narration", `📍 ${data.currentNode.name}: ${data.currentNode.description}`);
      }
      if (data.currentEnemy) {
        addMessage("enemy", `👹 ${data.currentEnemy.name} appears! (HP: ${data.currentEnemy.hp})`, ACTION_ICONS.attack);
      }
    };

    // ============ GAME STATE SYNC (Mid-game reconnection) ============
    const handleGameStateSync = (data) => {
      console.log("Game State Sync Received:", { round: data.gameState.round, node: data.gameState.currentNode?.id });

      // Restore all game state
      setGameStatus("playing");
      setDungeon(data.dungeon);
      setCurrentRound(data.gameState.round);
      setCurrentNode(data.gameState.currentNode);
      setCurrentEnemy(data.gameState.currentEnemy);
      setPlayers(data.players);

      // Restore character info from player data
      const myCharacter = data.players.find((p) => p.id === myPlayerId);
      if (myCharacter) {
        setCharacter({
          name: myCharacter.username,
          hp: myCharacter.current_hp,
          maxHp: myCharacter.character_data?.hp || 100,
          stamina: myCharacter.current_stamina,
          maxStamina: myCharacter.character_data?.maxStamina || 100,
          isAlive: myCharacter.is_alive,
          skills: myCharacter.character_data?.skills || [],
        });
      }

      // Determine game status based on state
      if (data.gameState.currentNPCEvent) {
        setGameStatus("npc_event");
        setNpcEvent(data.gameState.currentNPCEvent);
        setNpcChoosingPlayerId(data.gameState.npcChoosingPlayerId);
        addMessage("system", `🔄 Rejoined at NPC event. Waiting for choice...`);
      } else if (data.gameState.currentEnemy && data.gameState.currentEnemy.hp > 0) {
        setGameStatus("battle");
        addMessage("system", `🔄 Rejoined during battle! Round ${data.gameState.round}`);
        addMessage("narration", `👹 ${data.gameState.currentEnemy.name} (HP: ${data.gameState.currentEnemy.hp})`);
      } else {
        addMessage("system", `🔄 Rejoined the game! You're at ${data.gameState.currentNode?.name}`);
      }

      addMessage("system", `📍 Location: ${data.gameState.currentNode?.name || "Unknown"}`);
      addMessage("system", `👥 Party: ${data.metadata.alivePlayers}/${data.metadata.totalPlayers} alive`);
    };

    // ============ BATTLE EVENTS ============
    const handleRoundStarted = (data) => {
      setCurrentRound(data.round);
      setGameStatus("battle");
      addMessage("system", `⚔️ Round ${data.round}: ${data.narrative}`);
    };

    const handlePlayerActionUpdate = (data) => {
      const actionIcon = data.action.type === "heal" ? ACTION_ICONS.heal : ACTION_ICONS.attack;
      const actionText =
        data.action.type === "rest"
          ? `${data.action.playerName} rests and recovers ${data.action.staminaRegained} stamina`
          : `${data.action.playerName} uses ${data.action.skillName}!`;
      addMessage("action", actionText, actionIcon, { playerId: data.playerId });
    };

    const handleBattleResult = (data) => {
      // Main battle narrative
      addMessage("narration", data.narrative);

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
        if (data.enemy.hp > 0) {
          addMessage("status", `Enemy HP: ${data.enemy.hp}/${data.enemy.maxHP || "???"}`);
        }
      }

      // Update players
      if (data.players) {
        setPlayers(data.players);
      }
    };

    const handleBattleSummary = (data) => {
      setBattleSummary(data);
      addMessage("victory", `🎉 Victory! ${data.summary}`, ACTION_ICONS.victory);
      if (data.quote) {
        addMessage("quote", `"${data.quote}"`);
      }
    };

    // ============ NPC EVENTS ============
    const handleNpcEvent = (data) => {
      console.log("NPC Event Received:", {
        myPlayerId: myPlayerIdRef.current,
        choosingPlayerId: data.choosingPlayerId,
      });
      setGameStatus("npc_event");
      setNpcEvent(data.event);
      setNpcChoosingPlayerId(data.choosingPlayerId);

      addMessage("npc", `🧙 ${data.event.npcName}\n${data.event.description}`);
      addMessage("system", `${data.choosingPlayerName} must make a choice...`);

      data.event.choices?.forEach((choice, idx) => {
        addMessage("choice", `  ${idx + 1}. ${choice.label}`);
      });
    };

    const handleNpcResolution = (data) => {
      setNpcEvent(null);
      setNpcChoosingPlayerId(null);
      addMessage("narration", `📜 ${data.narrative}`);
      if (data.effects) {
        addMessage("effect", `Effects: ${JSON.stringify(data.effects)}`);
      }
    };

    // ============ NODE TRANSITION ============
    const handleNodeTransition = (data) => {
      setCurrentNode(data.currentNode);
      setCurrentEnemy(data.currentEnemy);
      addMessage("narration", `📍 ${data.narrative}`);

      if (data.currentNode) {
        addMessage("location", `Arrived at: ${data.currentNode.name}`);
      }
      if (data.currentEnemy) {
        addMessage(
          "enemy",
          `👹 ${data.currentEnemy.name} blocks your path! (HP: ${data.currentEnemy.hp})`,
          ACTION_ICONS.attack,
        );
      }
    };

    // ============ GAME OVER ============
    const handleGameOver = (data) => {
      setGameStatus("finished");
      setGameOverData(data);

      const isVictory = data.legendStatus === "legendary" || data.legendStatus === "heroic";
      const icon = isVictory ? ACTION_ICONS.victory : ACTION_ICONS.gameover;

      addMessage("gameover", `🏆 ${data.summary}`, icon);
      if (data.highlights) {
        data.highlights.forEach((h) => addMessage("highlight", `⭐ ${h}`));
      }
      if (data.epitaph) {
        addMessage("epitaph", `📜 "${data.epitaph}"`);
      }
    };

    // ============ WAITING & TIMEOUT ============
    const handleWaitingForPlayers = (data) => {
      addMessage("system", `Waiting for ${data.waitingOn?.length || 0} players to act...`);
    };

    const handleActionTimeout = (data) => {
      addMessage("warning", `⏰ ${data.playerName} timed out and will defend!`);
    };

    // ============ STORY & MISC ============
    const handleStorySummary = (data) => {
      addMessage("story", `📖 ${data.summary}`);
    };

    const handleError = (err) => {
      addMessage("error", `❌ ${err.message}`);
    };

    // ============ CONNECTION EVENTS ============
    const handleDisconnect = () => {
      console.log("Socket disconnected");
      setIsDisconnected(true);
      addMessage("warning", "⚠️ Connection lost. Attempting to reconnect...");
    };

    const handleConnect = () => {
      console.log("Socket connected");
      // Auto-rejoin the room after reconnection
      if (hasJoinedRef.current && ROOM_ID) {
        const CURRENT_PLAYER_ID = localStorage.getItem("playerId");
        if (CURRENT_PLAYER_ID) {
          socket.emit("join_room", {
            roomCode: ROOM_ID,
            playerId: CURRENT_PLAYER_ID,
          });
        } else {
          const CURRENT_USERNAME = localStorage.getItem("username");
          socket.emit("join_room", {
            roomCode: ROOM_ID,
            username: CURRENT_USERNAME,
          });
        }
        addMessage("system", "🔗 Reconnected! Syncing game state...");
      }
      setIsDisconnected(false);
    };

    const handlePlayerReconnected = (data) => {
      if (data.playerId !== myPlayerId) {
        addMessage("system", `✅ ${data.username} has reconnected to the game!`);
      }
    };

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
    socket.on("story_summary", handleStorySummary);
    socket.on("error", handleError);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect", handleConnect);
    socket.on("player_reconnected", handlePlayerReconnected);

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
      socket.off("story_summary", handleStorySummary);
      socket.off("error", handleError);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect", handleConnect);
      socket.off("player_reconnected", handlePlayerReconnected);
    };
  }, []); // Empty dependency array - set up listeners once on mount

  // ============ ACTION HANDLERS ============
  const handleAction = (actionType, skill = null) => {
    if (!character.isAlive) return;

    socket.emit("player_action", {
      actionType,
      skillName: skill?.name,
      skillAmount: skill?.power || 10,
      skillId: skill?.id,
    });
  };

  const handleNpcChoice = (choiceId) => {
    socket.emit("npc_choice", { choiceId });
  };

  const handleRejoin = () => {
    setIsDisconnected(false);
    socket.disconnect();
    socket.connect();
    const CURRENT_PLAYER_ID = localStorage.getItem("playerId");
    if (CURRENT_PLAYER_ID) {
      socket.emit("join_room", {
        roomCode: ROOM_ID,
        playerId: CURRENT_PLAYER_ID,
      });
    } else {
      socket.emit("join_room", {
        roomCode: ROOM_ID,
        username: USERNAME,
      });
    }
  };

  const handleNextNode = () => {
    socket.emit("next_node");
  };

  const handleSendMessage = (text) => {
    const parsed = parseCommand(text);

    addMessage("player", text, null, { sender: USERNAME });

    if (!parsed) return;

    // Handle commands
    if (parsed.command === "attack") {
      handleAction(
        "attack",
        character.skills.find((s) => s.type === "damage"),
      );
    } else if (parsed.command === "heal") {
      handleAction(
        "heal",
        character.skills.find((s) => s.type === "heal"),
      );
    } else if (parsed.command === "rest") {
      handleAction("rest");
    } else if (parsed.command === "next") {
      handleNextNode();
    }
  };

  // ============ RENDER ============
  return (
    <div className="vh-100 d-flex flex-column bg-dark text-light">
      {/* Disconnection Overlay */}
      {isDisconnected && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex align-items-center justify-content-center"
          style={{ zIndex: 9999 }}
        >
          <div className="card bg-danger p-4 text-center" style={{ maxWidth: 400 }}>
            <h4 className="mb-3">⚠️ Connection Lost</h4>
            <p className="mb-4">
              You have been disconnected from the game. Click below to reconnect and resume playing.
            </p>
            <button className="btn btn-primary btn-lg" onClick={handleRejoin}>
              🔗 Rejoin Game
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="border-bottom border-secondary p-2 bg-dark d-flex justify-content-between align-items-center">
        <div>
          <h4 className="mb-0 text-warning">
            ⚔️ {dungeon?.dungeonName || t("game.dungeonNode")}
            {currentNode && ` - ${currentNode.name}`}
          </h4>
          <small className="text-muted">
            Round: {currentRound} | Status: {gameStatus.toUpperCase()}
            {currentEnemy && ` | Enemy: ${currentEnemy.name} (HP: ${currentEnemy.hp})`}
          </small>
        </div>
        <div className="d-flex align-items-center gap-2">
          <MusicPlayer />
          <LanguageToggle />
        </div>
      </div>

      <div className="flex-grow-1 d-flex overflow-hidden">
        {/* Left Panel - Players */}
        <div className="col-3 border-end border-secondary bg-dark p-0 overflow-auto">
          <PlayerList players={players} currentPlayerId={myPlayerId} />
        </div>

        {/* Main Panel */}
        <div className="col-6 d-flex flex-column p-0">
          <ChatBox messages={messages} />

          {/* Action Buttons */}
          {gameStatus === "battle" && character.isAlive && (
            <div className="p-2 bg-secondary border-top border-dark">
              <div className="d-flex gap-2 flex-wrap justify-content-center">
                {character.skills.map((skill, idx) => (
                  <button
                    key={idx}
                    className={`btn ${skill.type === "heal" ? "btn-success" : "btn-danger"} btn-sm d-flex align-items-center gap-1`}
                    onClick={() => handleAction(skill.type, skill)}
                    disabled={character.stamina < (skill.staminaCost || 0)}
                  >
                    <img
                      src={skill.type === "heal" ? ACTION_ICONS.heal : ACTION_ICONS.attack}
                      alt={skill.type}
                      style={{ width: 20, height: 20 }}
                    />
                    {skill.name} ({skill.staminaCost || 0} SP)
                  </button>
                ))}
                <button className="btn btn-warning btn-sm" onClick={() => handleAction("rest")}>
                  🛌 Rest
                </button>
              </div>
            </div>
          )}

          {/* NPC Choices */}
          {gameStatus === "npc_event" && npcEvent && (
            <div className="p-2 bg-info border-top border-dark">
              <p className="mb-2 text-dark fw-bold">
                {myPlayerId === npcChoosingPlayerId ? "Make your choice:" : "Waiting for decision..."}
              </p>
              <div className="d-flex gap-2 flex-wrap">
                {npcEvent.choices?.map((choice, idx) => (
                  <button
                    key={idx}
                    className="btn btn-dark btn-sm"
                    onClick={() => handleNpcChoice(choice.id)}
                    disabled={myPlayerId !== npcChoosingPlayerId}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Next Node Button (after victory) */}
          {battleSummary && (
            <div className="p-2 bg-success border-top border-dark text-center">
              <button className="btn btn-light" onClick={handleNextNode} disabled={!isHost}>
                ➡️ Continue to Next Area
              </button>
            </div>
          )}

          <CommandInput onSend={handleSendMessage} disabled={!character.isAlive || gameStatus === "finished"} />
        </div>

        {/* Right Panel - Character & Enemy Info */}
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
                        style={{ width: 14, height: 14, marginRight: 4 }}
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
            <div className="card bg-secondary text-light">
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
                <small className="text-muted">{currentEnemy.role || currentEnemy.description}</small>
              </div>
            </div>
          )}

          {/* Game Over Display */}
          {gameOverData && (
            <div className="card bg-dark border-warning mt-3">
              <div className="card-body text-center">
                <img
                  src={
                    gameOverData.legendStatus === "legendary" || gameOverData.legendStatus === "heroic"
                      ? ACTION_ICONS.victory
                      : ACTION_ICONS.gameover
                  }
                  alt="Result"
                  className="img-fluid mb-2"
                  style={{ maxHeight: 100 }}
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
