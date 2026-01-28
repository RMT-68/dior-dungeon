import { Routes, Route } from "react-router-dom"
import Lobby from "./pages/Lobby"
import WaitingRoom from "./pages/WaitingRoom"
import GameRoom from "./pages/GameRoom"

function App() {
  return (
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/wait" element={<WaitingRoom />} />
      <Route path="/room" element={<GameRoom />} />
    </Routes>
  )
}

export default App
