import React, { createContext, useState, useContext } from "react";

const LanguageContext = createContext();

const translations = {
  en: {
    common: {
      home: "HOME",
      back: "Back",
      confirm: "Confirm",
      cancel: "Cancel",
      loading: "Loading...",
      error: "Error",
      success: "Success",
      you: "You",
    },
    lobby: {
      title: "Dior Dungeon",
      subtitle:
        "A text-based dungeon adventure where an AI Dungeon Master brings your story to life.",
      createRoom: "Create Room",
      joinRoom: "Join Room",
      enterName: "Enter your name",
      enterRoomCode: "Enter room code (optional)",
      selectTheme: "Select Dungeon Theme",
      selectDifficulty: "Select Difficulty",
      maxPlayers: "Max Players",
      language: "Language",
      create: "CREATE DUNGEON",
      join: "JOIN DUNGEON",
      or: "OR",
      back: "Back",
      creating: "CREATING...",
      confirmCreate: "CONFIRM CREATE",
      success: "Room Created!",
      error: "Error",
      themePlaceholder:
        "e.g. Vampire Cathedral, Cyberpunk Ruins, Desert of Gods",
      dungeonTheme: "Dungeon Theme",
      difficulty: "Difficulty",
      dungeonLength: "Dungeon Length",
      easy: "Easy",
      medium: "Medium",
      hard: "Hard",
    },
    waiting: {
      title: "Dungeon Waiting Room",
      roomCode: "Room Code",
      connecting: "Connecting to dungeon...",
      waitingPlayers: "Waiting for more players...",
      waitingAdventurer: "Waiting for adventurer...",
      ready: "READY",
      unready: "UNREADY",
      waiting: "WAITING",
      startDungeon: "START DUNGEON",
      difficulty: "DIFFICULTY",
    },
    game: {
      partyRoster: "Party Roster",
      allies: "Allies",
      noAllies: "No other adventurers...",
      waiting: "Waiting",
      ready: "Ready",
      youReady: "You",
      enter: "Enter Dungeon",
      hp: "HP",
      stm: "STM",
      dead: "DEAD",
      alive: "Alive",
      victory: "VICTORY",
      defeat: "DEFEAT",
      return: "Return to Lobby",
      dungeonNode: "Dungeon Node",
      status: "Status",
      adventurer: "Adventurer",
    },
  },
  id: {
    common: {
      home: "BERANDA",
      back: "Kembali",
      confirm: "Konfirmasi",
      cancel: "Batal",
      loading: "Memuat...",
      error: "Error",
      success: "Berhasil",
      you: "Kamu",
    },
    lobby: {
      title: "Dior Dungeon",
      subtitle:
        "Petualangan dungeon berbasis teks dimana AI Dungeon Master menghidupkan ceritamu.",
      createRoom: "Buat Ruangan",
      joinRoom: "Gabung Ruangan",
      enterName: "Masukkan namamu",
      enterRoomCode: "Masukkan kode ruangan (opsional)",
      selectTheme: "Pilih Tema Dungeon",
      selectDifficulty: "Pilih Tingkat Kesulitan",
      maxPlayers: "Maksimal Pemain",
      language: "Bahasa",
      create: "BUAT DUNGEON",
      join: "GABUNG DUNGEON",
      or: "ATAU",
      back: "Kembali",
      creating: "MEMBUAT...",
      confirmCreate: "KONFIRMASI BUAT",
      success: "Ruangan Dibuat!",
      error: "Error",
      themePlaceholder: "cth. Kastil Vampir, Reruntuhan Cyberpunk, Gurun Dewa",
      dungeonTheme: "Tema Dungeon",
      difficulty: "Tingkat Kesulitan",
      dungeonLength: "Panjang Dungeon",
      easy: "Mudah",
      medium: "Sedang",
      hard: "Sulit",
    },
    waiting: {
      title: "Ruang Tunggu Dungeon",
      roomCode: "Kode Ruangan",
      connecting: "Menghubungkan ke dungeon...",
      waitingPlayers: "Menunggu pemain lain...",
      waitingAdventurer: "Menunggu petualang...",
      ready: "SIAP",
      unready: "BATAL SIAP",
      waiting: "MENUNGGU",
      startDungeon: "MULAI DUNGEON",
      difficulty: "KESULITAN",
    },
    game: {
      partyRoster: "Daftar Regu",
      allies: "Sekutu",
      noAllies: "Tidak ada petualang lain...",
      waiting: "Menunggu",
      ready: "Siap",
      youReady: "Kamu",
      enter: "Masuk Dungeon",
      hp: "HP",
      stm: "STM",
      dead: "MATI",
      alive: "Hidup",
      victory: "KEMENANGAN",
      defeat: "KEKALAHAN",
      return: "Kembali ke Lobi",
      dungeonNode: "Node Dungeon",
      status: "Status",
      adventurer: "Petualang",
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
