import React, { createContext, useState, useContext } from "react";

const LanguageContext = createContext();

const translations = {
  en: {
    lobby: {
      title: "Dior Dungeon",
      subtitle: "AI-Powered Infinite Adventure",
      createRoom: "Create Room",
      joinRoom: "Join Room",
      enterName: "Enter Character Name",
      enterRoomCode: "Enter 6-digit Room Code",
      selectTheme: "Select Dungeon Theme",
      selectDifficulty: "Select Difficulty",
      maxPlayers: "Max Players",
      language: "Language",
      create: "Forge New Realm",
      join: "Join Adventure",
      or: "OR",
      back: "Back",
      creating: "Creating...",
      success: "Room Created!",
      error: "Error",
    },
    game: {
      waiting: "Waiting for players...",
      ready: "Mark as Ready",
      youReady: "You are Ready ✓",
      enter: "Enter Dungeon",
      hp: "HP",
      stm: "STM",
      victory: "VICTORY",
      defeat: "DEFEAT",
      return: "Return to Lobby",
    },
  },
  id: {
    lobby: {
      title: "Dior Dungeon",
      subtitle: "Petualangan Tanpa Batas AI",
      createRoom: "Buat Ruangan",
      joinRoom: "Gabung Ruangan",
      enterName: "Masukkan Nama Karakter",
      enterRoomCode: "Masukkan Kode Ruangan 6-digit",
      selectTheme: "Pilih Tema Dungeon",
      selectDifficulty: "Pilih Tingkat Kesulitan",
      maxPlayers: "Maksimal Pemain",
      language: "Bahasa",
      create: "Bangun Dunia Baru",
      join: "Mulai Petualangan",
      or: "ATAU",
      back: "Kembali",
      creating: "Membuat...",
      success: "Ruangan Dibuat!",
      error: "Error",
    },
    game: {
      waiting: "Menunggu pemain...",
      ready: "Siap",
      youReady: "Kamu Siap ✓",
      enter: "Masuk Dungeon",
      hp: "HP",
      stm: "STM",
      victory: "KEMENANGAN",
      defeat: "KEKALAHAN",
      return: "Kembali ke Lobi",
    },
  },
};

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState("en"); // 'en' or 'id'

  const t = (key) => {
    const keys = key.split(".");
    let value = translations[language];
    for (const k of keys) {
      value = value?.[k];
    }
    return value || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
