// Click sound utility
let clickAudio = null;

export function playClickSound() {
  // Lazy load audio to avoid creating multiple instances
  if (!clickAudio) {
    clickAudio = new Audio("/click.m4a");
    clickAudio.volume = 0.5;
  }

  // Reset and play
  clickAudio.currentTime = 0;
  clickAudio.play().catch(() => {
    // Ignore autoplay errors
  });
}

// Hook for React components
import { useCallback } from "react";

export function useClickSound() {
  const playSound = useCallback(() => {
    playClickSound();
  }, []);

  // Wrapper to play sound and then call original handler
  const withClickSound = useCallback((handler) => {
    return (...args) => {
      playClickSound();
      if (handler) handler(...args);
    };
  }, []);

  return { playSound, withClickSound };
}
