import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import LanguageToggle from "../components/LanguageToggle";

export default function Lobby() {
  const navigate = useNavigate();
  const {
    t,
    language: currentLang,
    setLanguage: setGlobalLanguage,
  } = useLanguage();

  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);

  const [theme, setTheme] = useState("");
  const [difficulty, setDifficulty] = useState("easy");
  const [maxNode, setMaxNode] = useState(5);
  const [language, setLanguage] = useState(currentLang);

  const handleCreateRoom = async () => {
    if (!username) {
      alert("Enter your name");
      return;
    }

    if (!theme.trim()) {
      alert("Please enter a dungeon theme");
      return;
    }

    if (maxNode < 3) {
      alert("Dungeon length must be at least 3 nodes");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("http://localhost:3000/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostName: username,
          theme: theme.trim(),
          difficulty,
          maxNode: Number(maxNode),
          language,
        }),
      });

      if (!res.ok) throw new Error("Failed to create room");

      const data = await res.json();
      const createdRoomCode = data.data.room_code;

      localStorage.setItem("username", username);
      localStorage.setItem("roomCode", createdRoomCode);

      navigate(`/wait?room=${createdRoomCode}&name=${username}`);
    } catch (err) {
      console.error(err);
      alert("Failed to create room");
    } finally {
      setLoading(false);
      setShowCreateModal(false);
    }
  };

  const handleJoinRoom = () => {
    if (!username || !roomCode) {
      alert("Enter name & room code");
      return;
    }

    localStorage.setItem("username", username);
    localStorage.setItem("roomCode", roomCode);

    navigate(`/wait?room=${roomCode}&name=${username}`);
  };

  return (
    <div className="vh-100 dungeon-hero d-flex flex-column">
      <nav className="navbar navbar-dark px-4">
        <div className="container-fluid d-flex justify-content-between">
          <img src="/dior-dungeon.png" alt="logo" style={{ height: 70 }} />
          <div className="d-flex align-items-center gap-3">
            <LanguageToggle />
            <button className="btn btn-dungeon">
              <span>{t("common.home")}</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="flex-grow-1 d-flex align-items-center justify-content-center">
        <div className="text-center text-light hero-content px-3">
          <img
            src="/dior-dungeon.png"
            className="hero-logo logo-glow mb-3"
            alt="Dior Dungeon"
          />

          <p className="hero-subtitle">{t("lobby.subtitle")}</p>

          <div className="dungeon-form">
            <div className="dungeon-form-inner">
              <input
                className="form-control dungeon-input"
                placeholder={t("lobby.enterName")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />

              <input
                className="form-control dungeon-input"
                placeholder={t("lobby.enterRoomCode")}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                disabled={loading}
              />

              <div className="d-flex flex-column gap-3 mt-3">
                <button
                  className="btn btn-dungeon-primary"
                  onClick={() => {
                    if (!username) return alert(t("lobby.enterName"));
                    setShowCreateModal(true);
                  }}
                  disabled={loading}
                >
                  <span>{t("lobby.create")}</span>
                </button>

                <button
                  className="btn btn-dungeon"
                  onClick={handleJoinRoom}
                  disabled={loading}
                >
                  <span>{t("lobby.join")}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div
          className="modal fade show d-block"
          style={{ background: "rgba(0,0,0,.85)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content bg-dark text-light border-warning">
              <div className="modal-header border-warning">
                <h5>{t("lobby.createRoom")}</h5>
                <button
                  className="btn-close btn-close-white"
                  onClick={() => setShowCreateModal(false)}
                />
              </div>

              <div className="modal-body">
                <label>{t("lobby.dungeonTheme")}</label>
                <input
                  type="text"
                  className="form-control dungeon-input"
                  placeholder={t("lobby.themePlaceholder")}
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                />

                <label className="mt-3">{t("lobby.difficulty")}</label>
                <select
                  className="form-select dungeon-input"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option value="easy">{t("lobby.easy")}</option>
                  <option value="medium">{t("lobby.medium")}</option>
                  <option value="hard">{t("lobby.hard")}</option>
                </select>

                <label className="mt-3">{t("lobby.dungeonLength")}</label>
                <input
                  type="number"
                  min={3}
                  max={10}
                  className="form-control dungeon-input"
                  value={maxNode}
                  onChange={(e) => setMaxNode(Number(e.target.value))}
                />

                <label className="mt-3">{t("lobby.language")}</label>
                <select
                  className="form-select dungeon-input"
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    setGlobalLanguage(e.target.value);
                  }}
                >
                  <option value="en">English</option>
                  <option value="id">Bahasa Indonesia</option>
                </select>
              </div>

              <div className="modal-footer border-warning">
                <button
                  className="btn btn-dungeon-primary w-100"
                  onClick={handleCreateRoom}
                  disabled={loading}
                >
                  <span>
                    {loading ? t("lobby.creating") : t("lobby.confirmCreate")}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
