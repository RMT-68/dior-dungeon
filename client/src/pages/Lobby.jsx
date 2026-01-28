import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import LanguageToggle from "../components/LanguageToggle";
import MusicPlayer from "../components/MusicPlayer";

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

  // Error states
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);

  const [theme, setTheme] = useState("");
  const [difficulty, setDifficulty] = useState("easy");
  const [maxNode, setMaxNode] = useState(5);
  const [language, setLanguage] = useState(currentLang);

  // Clear error after 3 seconds
  const showError = (message, isModal = false) => {
    if (isModal) {
      setModalError(message);
      setTimeout(() => setModalError(""), 3000);
    } else {
      setError(message);
      setTimeout(() => setError(""), 3000);
    }
  };

  const handleCreateRoom = async () => {
    if (!username) {
      showError(t("lobby.enterName"), true);
      return;
    }

    if (!theme.trim()) {
      showError(t("lobby.enterTheme") || "Please enter a dungeon theme", true);
      return;
    }

    if (maxNode < 3) {
      showError(
        t("lobby.minNodes") || "Dungeon length must be at least 3 nodes",
        true,
      );
      return;
    }

    setLoading(true);
    setModalError("");

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
      showError(t("lobby.createFailed") || "Failed to create room", true);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = () => {
    if (!username || !roomCode) {
      showError(t("lobby.enterNameAndCode") || "Enter name & room code");
      return;
    }

    localStorage.setItem("username", username);
    localStorage.setItem("roomCode", roomCode);

    navigate(`/wait?room=${roomCode}&name=${username}`);
  };

  const handleOpenCreateModal = () => {
    if (!username) {
      showError(t("lobby.enterName"));
      return;
    }
    setModalError("");
    setShowCreateModal(true);
  };

  return (
    <div className="vh-100 dungeon-hero d-flex flex-column">
      <nav className="navbar navbar-dark px-4">
        <div className="container-fluid d-flex justify-content-between">
          <img src="/dior-dungeon.png" alt="logo" style={{ height: 70 }} />
          <div className="d-flex align-items-center gap-3">
            <MusicPlayer />
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
              {/* Error Message */}
              {error && (
                <div
                  className="alert alert-danger py-2 mb-3"
                  style={{
                    background: "rgba(220, 53, 69, 0.2)",
                    border: "1px solid #dc3545",
                    color: "#ff6b6b",
                    fontSize: "0.85rem",
                    borderRadius: "8px",
                  }}
                >
                  ⚠️ {error}
                </div>
              )}

              <input
                className="form-control dungeon-input"
                placeholder={t("lobby.enterName")}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError("");
                }}
                disabled={loading}
              />

              <input
                className="form-control dungeon-input"
                placeholder={t("lobby.enterRoomCode")}
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value.toUpperCase());
                  setError("");
                }}
                disabled={loading}
              />

              <div className="d-flex flex-column gap-3 mt-3">
                <button
                  className="btn btn-dungeon-primary"
                  onClick={handleOpenCreateModal}
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
                {/* Modal Error Message */}
                {modalError && (
                  <div
                    className="alert alert-danger py-2 mb-3"
                    style={{
                      background: "rgba(220, 53, 69, 0.2)",
                      border: "1px solid #dc3545",
                      color: "#ff6b6b",
                      fontSize: "0.85rem",
                      borderRadius: "8px",
                    }}
                  >
                    ⚠️ {modalError}
                  </div>
                )}

                <label>{t("lobby.dungeonTheme")}</label>
                <input
                  type="text"
                  className="form-control dungeon-input"
                  placeholder={t("lobby.themePlaceholder")}
                  value={theme}
                  onChange={(e) => {
                    setTheme(e.target.value);
                    setModalError("");
                  }}
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
