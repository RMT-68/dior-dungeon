import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { socket } from "../socket";
import { useLanguage } from "../context/LanguageContext";
import LanguageToggle from "../components/LanguageToggle";
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
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [regenCount, setRegenCount] = useState(0);
  const MAX_REGEN = 3;
  const maxPlayers = 3;

  /* ================= SAFETY ================= */
  useEffect(() => {
    if (!roomCode || !username) {
      navigate("/");
      return;
    }
    localStorage.setItem("roomCode", roomCode);
    localStorage.setItem("username", username);
  }, [roomCode, username]);

  /* ================= SOCKET ================= */
  useEffect(() => {
    // Connect socket if not connected
    if (!socket.connected) socket.connect();

    // Wait for connection before emitting join_room
    const handleConnect = () => {
      socket.emit("join_room", { roomCode, username });
    };

    // If already connected, emit immediately
    if (socket.connected) {
      socket.emit("join_room", { roomCode, username });
    } else {
      // Otherwise, wait for connection
      socket.once("connect", handleConnect);
    }

    socket.on("room_update", ({ room, players }) => {
      setRoom(room);
      setPlayers(players);
      setLoading(false);

      const me = players.find((p) => p.username === username);
      if (me) {
        setIsReady(me.is_ready);

        // If player already has a character, set regenCount to 1 so button shows "Regenerate"
        const hasCharacter = !!(me.character_data && Object.keys(me.character_data).length > 0);
        if (hasCharacter) {
          setRegenCount((prev) => (prev === 0 ? 1 : prev));
        }
      }

      const statusMap = {};
      players.forEach((p) => {
        statusMap[p.id] = !!(p.character_data && Object.keys(p.character_data).length > 0);
      });
      setCharacterStatus(statusMap);
    });

    socket.on("game_start", () => navigate("/game"));

    socket.on("error", (err) => {
      alert(err.message || "Something went wrong");
      navigate("/");
    });

    return () => {
      socket.off("connect", handleConnect);
      socket.off("room_update");
      socket.off("game_start");
      socket.off("error");
    };
  }, [roomCode, username]);

  const myPlayer = players.find((p) => p.username === username);

  /* ================= GENERATE ================= */
  const handleGenerateCharacter = async () => {
    if (!myPlayer || !roomCode) return;
    if (regenCount >= MAX_REGEN) return;
    if (generating) return;

    setGenerating(true);

    try {
      const isFirst = regenCount === 0;
      const endpoint = isFirst ? "generate" : "regenerate";

      const res = await fetch(`http://localhost:3000/api/characters/${myPlayer.id}/${endpoint}`, {
        method: isFirst ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode }),
      });

      const json = await res.json();
      if (!json?.success) {
        alert("Generate character failed");
        return;
      }

      const charData = json.data.player.character_data;

      setPlayers((prev) => prev.map((p) => (p.id === myPlayer.id ? { ...p, character_data: charData } : p)));

      setCharacterStatus((prev) => ({
        ...prev,
        [myPlayer.id]: true,
      }));

      setRegenCount((prev) => prev + 1);
    } catch (err) {
      console.error(err);
      alert("Generate character failed");
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

  const allCharactersGenerated = players.length === maxPlayers && players.every((p) => characterStatus[p.id]);

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
      <div className="d-flex justify-content-end p-3" style={{ position: "absolute", top: 0, right: 0 }}>
        <LanguageToggle />
      </div>
      <h2 className="waiting-title">{t("waiting.title")}</h2>

      {room.dungeon_data && (
        <div className="waiting-dungeon-info">
          <h3>{room.dungeon_data.dungeonName}</h3>
          <p>{room.dungeon_data.description}</p>
          <span className="badge">Difficulty: {room.dungeon_data.difficulty?.toUpperCase()}</span>
        </div>
      )}

      <p className="waiting-sub">
        Room Code: <strong>{roomCode}</strong> ({players.length}/{maxPlayers})
      </p>

      <div className="waiting-focus">
        <div className="player-cards">
          {slots.map((_, index) => {
            const player = players[index];
            const isYou = player?.username === username;
            const hasChar = player && characterStatus[player.id];

            return (
              <div key={index} className={`player-card ${player?.is_ready ? "ready" : ""} ${!player ? "empty" : ""}`}>
                {player ? (
                  <>
                    <div className="player-name">
                      {player.username} {isYou && "(You)"}
                    </div>

                    {hasChar && player.character_data ? (
                      <div className="character-info">
                        <div className="character-role">{player.character_data.role}</div>

                        <div className="character-stats">
                          <div>HP: {player.character_data.hp}</div>
                          <div>Stamina: {player.character_data.stamina}</div>
                        </div>

                        {/* 🔥 FIXED SKILL LAYOUT */}
                        <div className="character-skills">
                          <ul>
                            {player.character_data.skills?.slice(0, 3).map((s, i) => (
                              <li key={i}>
                                <span className="skill-name">{s.name}</span>
                                <span className={`skill-type ${s.type}`}>{s.type === "damage" ? "DMG" : "HEAL"}</span>
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
                          {regenCount === 0 ? "GENERATE CHARACTER" : `REGENERATE (${regenCount}/${MAX_REGEN})`}
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
          <button className="btn btn-dungeon" onClick={handleReady}>
            <span>{isReady ? "UNREADY" : "READY"}</span>
          </button>

          <button className="btn btn-dungeon-primary" disabled={!allCharactersGenerated} onClick={handleStart}>
            <span>{t("waiting.startDungeon")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
