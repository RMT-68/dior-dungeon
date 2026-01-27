import { Routes, Route } from "react-router-dom"
import Lobby from "./pages/Lobby"
import GameRoom from "./pages/GameRoom"

function App() {
  return (
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/room" element={<GameRoom />} />
    </Routes>
  )
}

export default App
