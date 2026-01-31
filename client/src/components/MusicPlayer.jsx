import { useState, useEffect, useRef } from "react";

export default function MusicPlayer({ src = "/home.m4a", volume = 0.3 }) {
  const audioRef = useRef(null);
  const [isMuted, setIsMuted] = useState(() => {
    // Persist mute state in localStorage
    const saved = localStorage.getItem("musicMuted");
    return saved === "true";
  });
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = volume;
    audio.loop = true;
    audio.muted = isMuted;

    // Try to autoplay (may be blocked by browser)
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => setIsPlaying(true))
        .catch(() => {
          // Autoplay blocked - wait for user interaction
          setIsPlaying(false);
        });
    }

    // Listen for user interaction to start audio if blocked
    const handleInteraction = () => {
      if (!isPlaying && audio.paused) {
        audio
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {});
      }
    };

    document.addEventListener("click", handleInteraction, { once: true });
    document.addEventListener("keydown", handleInteraction, { once: true });

    return () => {
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };
  }, [volume, isPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
    localStorage.setItem("musicMuted", isMuted.toString());
  }, [isMuted]);

  const toggleMute = () => {
    setIsMuted((prev) => !prev);

    // If audio wasn't playing yet, try to start it
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => {});
    }
  };

  return (
    <>
      <audio ref={audioRef} src={src} preload="auto" />
      <button
        onClick={toggleMute}
        className="btn btn-sm position-relative"
        style={{
          background: "rgba(0, 0, 0, 0.6)",
          border: "2px solid rgba(255, 215, 0, 0.5)",
          borderRadius: "50%",
          width: 40,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "all 0.3s ease",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.3)",
        }}
        title={isMuted ? "Unmute Music" : "Mute Music"}
        onMouseEnter={(e) => {
          e.target.style.background = "rgba(255, 215, 0, 0.3)";
          e.target.style.transform = "scale(1.1)";
        }}
        onMouseLeave={(e) => {
          e.target.style.background = "rgba(0, 0, 0, 0.6)";
          e.target.style.transform = "scale(1)";
        }}
      >
        {isMuted ? (
          <span style={{ fontSize: "1.2rem" }}>🔇</span>
        ) : (
          <span style={{ fontSize: "1.2rem" }}>🔊</span>
        )}
      </button>
    </>
  );
}
