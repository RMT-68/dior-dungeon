import { useState, useEffect, useRef } from "react";
import PlayerList from "../components/PlayerList";
import ChatBox from "../components/Chatbox";
import CommandInput from "../components/CommandInput";
import { parseCommand } from "../utils/commandParser";
import { socket } from "../socket";
import { useLanguage } from "../context/LanguageContext";
import LanguageToggle from "../components/LanguageToggle";

const USERNAME = localStorage.getItem("username") || "Warrior";
const ROOM_ID = localStorage.getItem("roomCode") || "demo-room";

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

  const [messages, setMessages] = useState([
    { id: 1, type: "system", text: "Waiting for dungeon master..." },
  ]);

  const [dungeon, setDungeon] = useState(null);
  const [currentNode, setCurrentNode] = useState(null);
  const [currentEnemy, setCurrentEnemy] = useState(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [gameStatus, setGameStatus] = useState("waiting"); // waiting, playing, npc_event, battle, finished

  // Player & Game State
  const [players, setPlayers] = useState([]);
  const [myPlayerId, setMyPlayerId] = useState(null);
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
      socket.emit("join_room", {
        roomCode: ROOM_ID,
        username: USERNAME,
      });
    }

    // ============ JOIN & ROOM EVENTS ============
    socket.on("join_room_success", (data) => {
      setMyPlayerId(data.playerId);
      setIsHost(data.isHost);
      addMessage(
        "system",
        `Welcome ${data.username}! You joined room ${data.roomCode}`,
      );
    });

    socket.on("room_update", (data) => {
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
    });

    // ============ GAME START ============
    socket.on("game_start", (data) => {
      setGameStatus("playing");
      setDungeon(data.dungeon);
      setCurrentNode(data.currentNode);
      setCurrentEnemy(data.currentEnemy);
      if (data.players) setPlayers(data.players);

      addMessage(
        "system",
        `⚔️ Adventure begins in ${data.dungeon?.dungeonName || "the dungeon"}!`,
      );
      if (data.currentNode) {
        addMessage(
          "narration",
          `📍 ${data.currentNode.name}: ${data.currentNode.description}`,
        );
      }
      if (data.currentEnemy) {
        addMessage(
          "enemy",
          `👹 ${data.currentEnemy.name} appears! (HP: ${data.currentEnemy.hp})`,
          ACTION_ICONS.attack,
        );
      }
    });

    // ============ BATTLE EVENTS ============
    socket.on("round_started", (data) => {
      setCurrentRound(data.round);
      setGameStatus("battle");
      addMessage("system", `⚔️ Round ${data.round}: ${data.narrative}`);
    });

    socket.on("player_action_update", (data) => {
      const actionIcon =
        data.action.type === "heal" ? ACTION_ICONS.heal : ACTION_ICONS.attack;
      const actionText =
        data.action.type === "rest"
          ? `${data.action.playerName} rests and recovers ${data.action.staminaRegained} stamina`
          : `${data.action.playerName} uses ${data.action.skillName}!`;
      addMessage("action", actionText, actionIcon, { playerId: data.playerId });
    });

    socket.on("battle_result", (data) => {
      // Main battle narrative
      addMessage("narration", data.narrative);

      // Individual player actions
      if (data.playerNarratives) {
        data.playerNarratives.forEach((pn) => {
          const icon =
            pn.type === "heal" ? ACTION_ICONS.heal : ACTION_ICONS.attack;
          addMessage("action", pn.narrative, icon);
        });
      }

      // Enemy action
      if (data.enemyAction) {
        addMessage(
          "enemy",
          `👹 ${data.enemyAction.narrative}`,
          ACTION_ICONS.attack,
        );
      }

      // Update enemy state
      if (data.enemy) {
        setCurrentEnemy(data.enemy);
        if (data.enemy.hp > 0) {
          addMessage(
            "status",
            `Enemy HP: ${data.enemy.hp}/${data.enemy.maxHP || "???"}`,
          );
        }
      }

      // Update players
      if (data.players) {
        setPlayers(data.players);
      }
    });

    socket.on("battle_summary", (data) => {
      setBattleSummary(data);
      addMessage(
        "victory",
        `🎉 Victory! ${data.summary}`,
        ACTION_ICONS.victory,
      );
      if (data.quote) {
        addMessage("quote", `"${data.quote}"`);
      }
    });

    // ============ NPC EVENTS ============
    socket.on("npc_event", (data) => {
      setGameStatus("npc_event");
      setNpcEvent(data.event);
      setNpcChoosingPlayerId(data.choosingPlayerId);

      addMessage("npc", `🧙 ${data.event.npcName}: "${data.event.dialogue}"`);
      addMessage("system", `${data.choosingPlayerName} must make a choice...`);

      data.event.choices?.forEach((choice, idx) => {
        addMessage("choice", `  ${idx + 1}. ${choice.text}`);
      });
    });

    socket.on("npc_resolution", (data) => {
      setNpcEvent(null);
      setNpcChoosingPlayerId(null);
      addMessage("narration", `📜 ${data.narrative}`);
      if (data.effects) {
        addMessage("effect", `Effects: ${JSON.stringify(data.effects)}`);
      }
    });

    // ============ NODE TRANSITION ============
    socket.on("node_transition", (data) => {
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
    });

    // ============ GAME OVER ============
    socket.on("game_over", (data) => {
      setGameStatus("finished");
      setGameOverData(data);

      const isVictory =
        data.legendStatus === "legendary" || data.legendStatus === "heroic";
      const icon = isVictory ? ACTION_ICONS.victory : ACTION_ICONS.gameover;

      addMessage("gameover", `🏆 ${data.summary}`, icon);
      if (data.highlights) {
        data.highlights.forEach((h) => addMessage("highlight", `⭐ ${h}`));
      }
      if (data.epitaph) {
        addMessage("epitaph", `📜 "${data.epitaph}"`);
      }
    });

    // ============ WAITING & TIMEOUT ============
    socket.on("waiting_for_players", (data) => {
      addMessage(
        "system",
        `Waiting for ${data.waitingOn?.length || 0} players to act...`,
      );
    });

    socket.on("action_timeout", (data) => {
      addMessage("warning", `⏰ ${data.playerName} timed out and will defend!`);
    });

    // ============ STORY & MISC ============
    socket.on("story_summary", (data) => {
      addMessage("story", `📖 ${data.summary}`);
    });

    socket.on("error", (err) => {
      addMessage("error", `❌ ${err.message}`);
    });

    return () => {
      socket.off("join_room_success");
      socket.off("room_update");
      socket.off("game_start");
      socket.off("round_started");
      socket.off("player_action_update");
      socket.off("battle_result");
      socket.off("battle_summary");
      socket.off("npc_event");
      socket.off("npc_resolution");
      socket.off("node_transition");
      socket.off("game_over");
      socket.off("waiting_for_players");
      socket.off("action_timeout");
      socket.off("story_summary");
      socket.off("error");
    };
  }, [myPlayerId]);

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

  const handleNpcChoice = (choiceIndex) => {
    socket.emit("npc_choice", { choiceIndex });
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
      {/* Header */}
      <div className="border-bottom border-secondary p-2 bg-dark d-flex justify-content-between align-items-center">
        <div>
          <h4 className="mb-0 text-warning">
            ⚔️ {dungeon?.dungeonName || t("game.dungeonNode")}
            {currentNode && ` - ${currentNode.name}`}
          </h4>
          <small className="text-muted">
            Round: {currentRound} | Status: {gameStatus.toUpperCase()}
            {currentEnemy &&
              ` | Enemy: ${currentEnemy.name} (HP: ${currentEnemy.hp})`}
          </small>
        </div>
        <LanguageToggle />
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
                      src={
                        skill.type === "heal"
                          ? ACTION_ICONS.heal
                          : ACTION_ICONS.attack
                      }
                      alt={skill.type}
                      style={{ width: 20, height: 20 }}
                    />
                    {skill.name} ({skill.staminaCost || 0} SP)
                  </button>
                ))}
                <button
                  className="btn btn-warning btn-sm"
                  onClick={() => handleAction("rest")}
                >
                  🛌 Rest
                </button>
              </div>
            </div>
          )}

          {/* NPC Choices */}
          {gameStatus === "npc_event" &&
            npcEvent &&
            myPlayerId === npcChoosingPlayerId && (
              <div className="p-2 bg-info border-top border-dark">
                <p className="mb-2 text-dark fw-bold">Make your choice:</p>
                <div className="d-flex gap-2 flex-wrap">
                  {npcEvent.choices?.map((choice, idx) => (
                    <button
                      key={idx}
                      className="btn btn-dark btn-sm"
                      onClick={() => handleNpcChoice(idx)}
                    >
                      {choice.text}
                    </button>
                  ))}
                </div>
              </div>
            )}

          {/* Next Node Button (after victory) */}
          {battleSummary && isHost && (
            <div className="p-2 bg-success border-top border-dark text-center">
              <button className="btn btn-light" onClick={handleNextNode}>
                ➡️ Continue to Next Area
              </button>
            </div>
          )}

          <CommandInput
            onSend={handleSendMessage}
            disabled={!character.isAlive || gameStatus === "finished"}
          />
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
                        src={
                          s.type === "heal"
                            ? ACTION_ICONS.heal
                            : ACTION_ICONS.attack
                        }
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
                <small className="text-muted">
                  {currentEnemy.role || currentEnemy.description}
                </small>
              </div>
            </div>
          )}

          {/* Game Over Display */}
          {gameOverData && (
            <div className="card bg-dark border-warning mt-3">
              <div className="card-body text-center">
                <img
                  src={
                    gameOverData.legendStatus === "legendary" ||
                    gameOverData.legendStatus === "heroic"
                      ? ACTION_ICONS.victory
                      : ACTION_ICONS.gameover
                  }
                  alt="Result"
                  className="img-fluid mb-2"
                  style={{ maxHeight: 100 }}
                />
                <h5 className="text-warning">
                  {gameOverData.legendStatus?.toUpperCase()}
                </h5>
                <p className="small">{gameOverData.epitaph}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
