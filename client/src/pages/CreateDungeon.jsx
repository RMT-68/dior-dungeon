import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function CreateDungeon() {
  const navigate = useNavigate()

  const username = localStorage.getItem("username")

  const [difficulty, setDifficulty] = useState("easy")
  const [maxNode, setMaxNode] = useState(5)
  const [language, setLanguage] = useState("en")
  const [theme, setTheme] = useState("")
  const [loading, setLoading] = useState(false)

  // 🔒 SAFETY
  useEffect(() => {
    if (!username) {
      navigate("/")
    }
  }, [])

  const handleCreateDungeon = async () => {
    setLoading(true)

    try {
      const res = await fetch("http://localhost:3000/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostName: username,
          difficulty,
          maxNode,
          language,
          theme: theme || undefined, // 👈 BIAR AI RANDOM
        }),
      })

      if (!res.ok) throw new Error("Failed to create dungeon")

      const data = await res.json()
      const roomCode = data.data.room_code

      localStorage.setItem("roomCode", roomCode)

      navigate(`/wait?room=${roomCode}`)
    } catch (err) {
      console.error(err)
      alert("Failed to create dungeon")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="vh-100 dungeon-hero d-flex align-items-center justify-content-center">
      <div className="dungeon-form">
        <div className="dungeon-form-inner text-light">

          <h3 className="mb-4 text-center">Configure Your Dungeon</h3>

          {/* DIFFICULTY */}
          <label className="mb-1">Difficulty</label>
          <select
            className="form-control dungeon-input"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          {/* MAX NODE */}
          <label className="mt-3 mb-1">Dungeon Length</label>
          <select
            className="form-control dungeon-input"
            value={maxNode}
            onChange={(e) => setMaxNode(Number(e.target.value))}
          >
            <option value={3}>Short (3 nodes)</option>
            <option value={5}>Medium (5 nodes)</option>
            <option value={7}>Long (7 nodes)</option>
          </select>

          {/* LANGUAGE */}
          <label className="mt-3 mb-1">Language</label>
          <select
            className="form-control dungeon-input"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="id">Bahasa Indonesia</option>
          </select>

          {/* THEME */}
          <label className="mt-3 mb-1">
            Theme <small className="opacity-50">(optional)</small>
          </label>
          <input
            type="text"
            className="form-control dungeon-input"
            placeholder="e.g. Vampire Castle, Ancient Ruins"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          />

          <p className="text-center opacity-50 mt-2">
            Leave empty to let AI decide
          </p>

          {/* ACTION */}
          <button
            className="btn btn-dungeon-primary w-100 mt-4"
            onClick={handleCreateDungeon}
            disabled={loading}
          >
            <span>{loading ? "SUMMONING DUNGEON..." : "START DUNGEON"}</span>
          </button>

        </div>
      </div>
    </div>
  )
}
