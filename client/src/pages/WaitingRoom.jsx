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
  const [isReady, setIsReady] = useState(false);
  const [loading, setLoading] = useState(true);

  const maxPlayers = 3;

  useEffect(() => {
    if (!roomCode || !username) {
      navigate("/");
      return;
    }

    localStorage.setItem("roomCode", roomCode);
    localStorage.setItem("username", username);
  }, [roomCode, username]);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("join_room", {
      roomCode,
      username,
    });

    socket.on("room_update", ({ room, players }) => {
      setRoom(room);
      setPlayers(players);
      setLoading(false);

      const me = players.find((p) => p.username === username);
      if (me) setIsReady(me.is_ready);
    });

    socket.on("game_start", () => {
      navigate("/room");
    });

    socket.on("error", (err) => {
      alert(err.message || "Something went wrong");
      navigate("/");
    });

    return () => {
      socket.off("room_update");
      socket.off("game_start");
      socket.off("error");
    };
  }, [roomCode, username]);

  const handleReady = () => {
    socket.emit("player_ready", {
      isReady: !isReady,
    });
  };

  const handleStart = () => {
    socket.emit("start_game");
  };

  const allReady =
    players.length === maxPlayers && players.every((p) => p.is_ready);

  const slots = Array.from({ length: maxPlayers });

  return (
    <div className="dungeon-bg">
      <div
        className="d-flex justify-content-end p-3"
        style={{ position: "absolute", top: 0, right: 0 }}
      >
        <LanguageToggle />
      </div>
      <h2 className="waiting-title">{t("waiting.title")}</h2>

      <p className="waiting-sub">
        {t("waiting.roomCode")}: <strong>{roomCode}</strong> ({players.length} /{" "}
        {maxPlayers})
      </p>

      {room?.dungeon_data && (
        <div
          className="dungeon-info"
          style={{
            maxWidth: 800,
            margin: "0 auto 32px",
            padding: "24px",
            border: "1px solid rgba(255, 215, 0, 0.35)",
            background: "rgba(0,0,0,0.65)",
            boxShadow: "0 0 25px rgba(0,0,0,0.6)",
          }}
        >
          <h3
            style={{
              color: "#f5c97a",
              fontFamily: "serif",
              letterSpacing: "1px",
              marginBottom: 12,
            }}
          >
            {room.dungeon_data.dungeonName}
          </h3>

          <p
            style={{
              color: "#ddd",
              fontSize: 14,
              lineHeight: 1.6,
              opacity: 0.9,
              marginBottom: 16,
            }}
          >
            {room.dungeon_data.description}
          </p>

          <span
            style={{
              display: "inline-block",
              padding: "6px 14px",
              border: "1px solid #f5c97a",
              color: "#f5c97a",
              fontSize: 12,
              letterSpacing: 1,
            }}
          >
            {t("waiting.difficulty")}:{" "}
            {room.dungeon_data.difficulty.toUpperCase()}
          </span>
        </div>
      )}

      <div className="waiting-focus">
        <div className="player-cards">
          {slots.map((_, index) => {
            const player = players[index];

            return (
              <div
                key={index}
                className={`player-card
                  ${player?.is_ready ? "ready" : ""}
                  ${!player ? "empty" : ""}
                `}
              >
                {player ? (
                  <>
                    <div className="player-name">
                      {player.username}
                      {player.username === username && ` (${t("common.you")})`}
                    </div>
                    <div className="player-status">
                      {player.is_ready
                        ? t("waiting.ready")
                        : t("waiting.waiting")}
                    </div>
                  </>
                ) : (
                  <span className="empty-slot">
                    {t("waiting.waitingAdventurer")}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {loading && (
          <p className="text-center text-light opacity-75 mb-3">
            {t("waiting.connecting")}
          </p>
        )}

        {!loading && players.length < maxPlayers && (
          <p className="text-center text-light opacity-75 mb-3">
            {t("waiting.waitingPlayers")}
          </p>
        )}

        <div className="waiting-actions">
          <button className="btn btn-dungeon" onClick={handleReady}>
            <span>{isReady ? t("waiting.unready") : t("waiting.ready")}</span>
          </button>

          <button
            className="btn btn-dungeon-primary"
            disabled={!allReady}
            onClick={handleStart}
          >
            <span>{t("waiting.startDungeon")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
