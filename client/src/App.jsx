import { Routes, Route } from "react-router-dom";
import Lobby from "./pages/Lobby";
import WaitingRoom from "./pages/WaitingRoom";
import GameRoom from "./pages/GameRoom";
import { LanguageProvider } from "./context/LanguageContext";

function App() {
  return (
    <LanguageProvider>
      <Routes>
        <Route path="/" element={<Lobby />} />
        <Route path="/wait" element={<WaitingRoom />} />
        <Route path="/game" element={<GameRoom />} />
      </Routes>
    </LanguageProvider>
  );
}

export default App;
