import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { socket } from "../socket";
import { useLanguage } from "../context/LanguageContext";
import LanguageToggle from "../components/LanguageToggle";
import MusicPlayer from "../components/MusicPlayer";
import "../waiting-room.css";

export default function WaitingRoom() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const roomCode = searchParams.get("room") || localStorage.getItem("roomCode");

  const username = searchParams.get("name") || localStorage.getItem("username");

  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [characterStatus, setCharacterStatus] = useState({});
  const [isReady, setIsReady] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Use ref to track join status - persists across re-renders
  const hasJoinedRef = useRef(false);

  const [regenCount, setRegenCount] = useState(0);
  const MAX_REGEN = 3;
  const maxPlayers = 3;

  // Error state
  const [error, setError] = useState("");

  const showError = (message) => {
    setError(message);
    setTimeout(() => setError(""), 3000);
  };

  /* ================= SAFETY ================= */
  useEffect(() => {
    if (!roomCode || !username) {
      navigate("/");
      return;
    }
    localStorage.setItem("roomCode", roomCode);
    localStorage.setItem("username", username);
  }, [roomCode, username, navigate]);

  /* ================= SOCKET ================= */
  useEffect(() => {
    if (!socket.connected) socket.connect();
    if (!roomCode || !username) return;

    // Define handler functions
    const handleRoomUpdate = ({ room, players }) => {
      console.log(
        "[WR_ROOM_UPDATE] Received players:",
        players.map((p) => ({
          id: p.id,
          username: p.username,
          hasCharacter: !!(
            p.character_data && Object.keys(p.character_data).length > 0
          ),
          characterName: p.character_data?.name,
          role: p.character_data?.role,
        })),
      );

      setRoom(room);
      setPlayers(players);

      const me = players.find((p) => p.username === username);
      if (me) setIsReady(me.is_ready);

      const statusMap = {};
      players.forEach((p) => {
        statusMap[p.id] = !!(
          p.character_data && Object.keys(p.character_data).length > 0
        );
      });
      setCharacterStatus(statusMap);
    };

    const handleGameStart = () => {
      console.log(
        "[WR_GAME_START] Navigating to game, current players:",
        players.length,
      );
      localStorage.setItem("gameJustStarted", "true");
      navigate("/game");
    };

    const handleError = (err) => {
      showError(err.message || "Something went wrong");
    };

    const handlePlayerDisconnected = ({ username: disconnectedUsername }) => {
      console.log(`Player ${disconnectedUsername} disconnected`);
      // Room update will be broadcasted automatically, no need to do anything here
    };

    // Register listeners
    socket.on("room_update", handleRoomUpdate);
    socket.on("game_start", handleGameStart);
    socket.on("error", handleError);
    socket.on("player_disconnected", handlePlayerDisconnected);

    // Emit join only once using ref
    if (!hasJoinedRef.current) {
      hasJoinedRef.current = true;
      socket.emit("join_room", { roomCode, username });
    }

    return () => {
      socket.off("room_update", handleRoomUpdate);
      socket.off("game_start", handleGameStart);
      socket.off("error", handleError);
      socket.off("player_disconnected", handlePlayerDisconnected);
    };
  }, [roomCode, username, navigate]);

  const myPlayer = players.find((p) => p.username === username);

  /* ================= CLEANUP ON LEAVE ================= */
  useEffect(() => {
    return () => {
      // When leaving the waiting room, notify server to remove player
      // BUT NOT if we're transitioning to the game (game just started)
      const gameJustStarted =
        localStorage.getItem("gameJustStarted") === "true";

      if (hasJoinedRef.current && !gameJustStarted) {
        console.log("[WR_CLEANUP] Leaving room, emitting leave_room");
        socket.emit("leave_room");
        hasJoinedRef.current = false;
      } else if (gameJustStarted) {
        console.log(
          "[WR_CLEANUP] Game started, NOT emitting leave_room (transitioning to game)",
        );
      }
    };
  }, []);

  /* ================= GENERATE ================= */
  const handleGenerateCharacter = async () => {
    if (!myPlayer || !roomCode) return;
    if (regenCount >= MAX_REGEN) return;
    if (generating) return;

    setGenerating(true);

    try {
      const isFirst = regenCount === 0;
      const endpoint = isFirst ? "generate" : "regenerate";

      const res = await fetch(
        `https://api.jobberint.space/api/characters/${myPlayer.id}/${endpoint}`,
        {
          method: isFirst ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomCode }),
        },
      );

      const json = await res.json();
      if (!json?.success) {
        showError("Generate character failed");
        return;
      }

      const charData = json.data.player.character_data;

      setPlayers((prev) =>
        prev.map((p) =>
          p.id === myPlayer.id ? { ...p, character_data: charData } : p,
        ),
      );

      setCharacterStatus((prev) => ({
        ...prev,
        [myPlayer.id]: true,
      }));

      setRegenCount((prev) => prev + 1);
    } catch (err) {
      console.error(err);
      showError("Generate character failed");
    } finally {
      setGenerating(false);
    }
  };

  /* ================= READY / START ================= */
  const handleReady = () => {
    socket.emit("player_ready", { isReady: !isReady });
  };

  const handleStart = () => {
    socket.emit("start_game");
  };

  const handleLeave = () => {
    socket.emit("leave_room", { roomCode, username });
    localStorage.removeItem("roomCode");
    navigate("/");
  };

  const allCharactersGenerated =
    players.length === maxPlayers &&
    players.every((p) => characterStatus[p.id]);

  const slots = Array.from({ length: maxPlayers });

  if (!room) {
    return (
      <div className="dungeon-bg">
        <p className="opacity-75">Loading dungeon...</p>
      </div>
    );
  }

  /* ================= RENDER ================= */
  return (
    <div className="dungeon-bg">
      <div
        className="d-flex justify-content-end p-3 gap-2"
        style={{ position: "absolute", top: 0, right: 0 }}
      >
        <MusicPlayer />
        <LanguageToggle />
      </div>
      <h2 className="waiting-title">{t("waiting.title")}</h2>

      {room.dungeon_data && (
        <div className="waiting-dungeon-info">
          <h3>{room.dungeon_data.dungeonName}</h3>
          <p>{room.dungeon_data.description}</p>
          <span className="badge">
            Difficulty: {room.dungeon_data.difficulty?.toUpperCase()}
          </span>
        </div>
      )}

      <p className="waiting-sub">
        Room Code: <strong>{roomCode}</strong> ({players.length}/{maxPlayers})
      </p>

      {/* Error Message */}
      {error && (
        <div
          className="alert alert-danger py-2 mb-3 mx-auto"
          style={{
            background: "rgba(220, 53, 69, 0.2)",
            border: "1px solid #dc3545",
            color: "#ff6b6b",
            fontSize: "0.85rem",
            borderRadius: "8px",
            maxWidth: "400px",
          }}
        >
          ⚠️ {error}
        </div>
      )}

      <div className="waiting-focus">
        <div className="player-cards">
          {slots.map((_, index) => {
            const player = players[index];
            const isYou = player?.username === username;
            const hasChar = player && characterStatus[player.id];

            return (
              <div
                key={index}
                className={`player-card ${player?.is_ready ? "ready" : ""} ${!player ? "empty" : ""}`}
              >
                {player ? (
                  <>
                    <div className="player-name">
                      {player.username} {isYou && "(You)"}
                    </div>

                    {hasChar && player.character_data ? (
                      <div className="character-info">
                        <div className="character-name">
                          {player.character_data.name}
                        </div>
                        <div className="character-role">
                          {player.character_data.role}
                        </div>

                        <div className="character-stats">
                          <div>HP: {player.character_data.hp}</div>
                          <div>Stamina: {player.character_data.stamina}</div>
                        </div>

                        {/* 🔥 FIXED SKILL LAYOUT */}
                        <div className="character-skills">
                          <ul>
                            {player.character_data.skills
                              ?.slice(0, 3)
                              .map((s, i) => (
                                <li key={i}>
                                  <span className="skill-name">{s.name}</span>
                                  <span className={`skill-type ${s.type}`}>
                                    {s.type === "damage" ? "DMG" : "HEAL"}
                                  </span>
                                </li>
                              ))}
                          </ul>
                        </div>
                      </div>
                    ) : (
                      <div className="player-status">NOT GENERATED</div>
                    )}

                    {isYou && (
                      <button
                        className="btn btn-dungeon"
                        disabled={regenCount >= MAX_REGEN || generating}
                        onClick={handleGenerateCharacter}
                      >
                        <span>
                          {regenCount === 0
                            ? "GENERATE CHARACTER"
                            : `REGENERATE (${regenCount}/${MAX_REGEN})`}
                        </span>
                      </button>
                    )}
                  </>
                ) : (
                  <span className="empty-slot">Waiting for adventurer...</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="waiting-actions">
          <button className="btn btn-dungeon-danger" onClick={handleLeave}>
            <span>🚪 LEAVE</span>
          </button>

          <button className="btn btn-dungeon" onClick={handleReady}>
            <span>{isReady ? "UNREADY" : "READY"}</span>
          </button>

          <button
            className="btn btn-dungeon-primary"
            disabled={!allCharactersGenerated}
            onClick={handleStart}
          >
            <span>{t("waiting.startDungeon")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
