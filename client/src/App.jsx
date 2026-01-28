import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import Lobby from "./pages/Lobby";
import WaitingRoom from "./pages/WaitingRoom";
import GameRoom from "./pages/GameRoom";
import { LanguageProvider } from "./context/LanguageContext";

// Global click sound
let clickAudio = null;
function playClickSound() {
  if (!clickAudio) {
    clickAudio = new Audio("/click.mp3");
    clickAudio.volume = 0.4;
  }
  clickAudio.currentTime = 0;
  clickAudio.play().catch(() => {});
}

function App() {
  // Add global click sound effect
  useEffect(() => {
    const handleClick = (e) => {
      // Check if clicked element is a button or clickable element
      const clickable = e.target.closest(
        "button, .btn, [role='button'], a, select, input[type='checkbox'], input[type='radio']",
      );
      if (clickable) {
        playClickSound();
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

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
