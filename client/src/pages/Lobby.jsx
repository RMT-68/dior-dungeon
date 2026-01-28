import { useState } from "react"
import { useNavigate } from "react-router-dom"

export default function Lobby() {
  const navigate = useNavigate()

  const [username, setUsername] = useState("")
  const [roomCode, setRoomCode] = useState("")
  const [loading, setLoading] = useState(false)

  // =========================
  // MODAL STATE
  // =========================
  const [showCreateModal, setShowCreateModal] = useState(false)

  // =========================
  // DUNGEON CONFIG (PM REQUEST)
  // =========================
  const [theme, setTheme] = useState("") // 🔥 FREE TEXT
  const [difficulty, setDifficulty] = useState("easy")
  const [maxNode, setMaxNode] = useState(5)
  const [language, setLanguage] = useState("en")

  // =========================
  // CREATE ROOM
  // =========================
  const handleCreateRoom = async () => {
    if (!username) {
      alert("Enter your name")
      return
    }

    if (!theme.trim()) {
      alert("Please enter a dungeon theme")
      return
    }

    if (maxNode < 3) {
      alert("Dungeon length must be at least 3 nodes")
      return
    }

    setLoading(true)

    try {
      const res = await fetch("http://localhost:3000/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostName: username,
          theme: theme.trim(), // 🔥 USER DEFINED THEME
          difficulty,
          maxNode: Number(maxNode),
          language,
        }),
      })

      if (!res.ok) throw new Error("Failed to create room")

      const data = await res.json()
      const createdRoomCode = data.data.room_code

      // 🔑 REQUIRED FOR SOCKET FLOW
      localStorage.setItem("username", username)
      localStorage.setItem("roomCode", createdRoomCode)

      navigate(`/wait?room=${createdRoomCode}&name=${username}`)
    } catch (err) {
      console.error(err)
      alert("Failed to create room")
    } finally {
      setLoading(false)
      setShowCreateModal(false)
    }
  }

  // =========================
  // JOIN ROOM
  // =========================
  const handleJoinRoom = () => {
    if (!username || !roomCode) {
      alert("Enter name & room code")
      return
    }

    localStorage.setItem("username", username)
    localStorage.setItem("roomCode", roomCode)

    navigate(`/wait?room=${roomCode}&name=${username}`)
  }

  return (
    <div className="vh-100 dungeon-hero d-flex flex-column">
      {/* ================= NAVBAR ================= */}
      <nav className="navbar navbar-dark px-4">
        <div className="container-fluid d-flex justify-content-between">
          <img src="/dior-dungeon.png" alt="logo" style={{ height: 70 }} />
          <button className="btn btn-dungeon">
            <span>HOME</span>
          </button>
        </div>
      </nav>

      {/* ================= CONTENT ================= */}
      <div className="flex-grow-1 d-flex align-items-center justify-content-center">
        <div className="text-center text-light hero-content px-3">

          <img
            src="/dior-dungeon.png"
            className="hero-logo logo-glow mb-3"
            alt="Dior Dungeon"
          />

          <p className="hero-subtitle">
            A text-based dungeon adventure where an AI Dungeon Master
            brings your story to life.
          </p>

          <div className="dungeon-form">
            <div className="dungeon-form-inner">

              <input
                className="form-control dungeon-input"
                placeholder="Enter your name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />

              <input
                className="form-control dungeon-input"
                placeholder="Enter room code (optional)"
                value={roomCode}
                onChange={(e) =>
                  setRoomCode(e.target.value.toUpperCase())
                }
                disabled={loading}
              />

              <div className="d-flex flex-column gap-3 mt-3">
                {/* CREATE */}
                <button
                  className="btn btn-dungeon-primary"
                  onClick={() => {
                    if (!username) return alert("Enter your name")
                    setShowCreateModal(true)
                  }}
                  disabled={loading}
                >
                  <span>CREATE DUNGEON</span>
                </button>

                {/* JOIN */}
                <button
                  className="btn btn-dungeon"
                  onClick={handleJoinRoom}
                  disabled={loading}
                >
                  <span>JOIN DUNGEON</span>
                </button>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* ================= CREATE DUNGEON MODAL ================= */}
      {showCreateModal && (
        <div
          className="modal fade show d-block"
          style={{ background: "rgba(0,0,0,.85)" }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content bg-dark text-light border-warning">

              <div className="modal-header border-warning">
                <h5>Create Dungeon</h5>
                <button
                  className="btn-close btn-close-white"
                  onClick={() => setShowCreateModal(false)}
                />
              </div>

              <div className="modal-body">

                <label>Dungeon Theme</label>
                <input
                  type="text"
                  className="form-control dungeon-input"
                  placeholder="e.g. Vampire Cathedral, Cyberpunk Ruins, Desert of Gods"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                />

                <label className="mt-3">Difficulty</label>
                <select
                  className="form-select dungeon-input"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>

                <label className="mt-3">Dungeon Length</label>
                <input
                  type="number"
                  min={3}
                  max={10}
                  className="form-control dungeon-input"
                  value={maxNode}
                  onChange={(e) => setMaxNode(Number(e.target.value))}
                />

                <label className="mt-3">Language</label>
                <select
                  className="form-select dungeon-input"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
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
                    {loading ? "CREATING..." : "CONFIRM CREATE"}
                  </span>
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
