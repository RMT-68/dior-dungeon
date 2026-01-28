import { useState, useEffect } from "react";
import PlayerList from "../components/PlayerList";
import ChatBox from "../components/ChatBox";
import CommandInput from "../components/CommandInput";
import { parseCommand } from "../utils/commandParser";
import { socket } from "../socket";
import { useLanguage } from "../context/LanguageContext";
import LanguageToggle from "../components/LanguageToggle";

const USERNAME = "Warrior";
const ROOM_ID = "demo-room";

export default function GameRoom() {
  const { t } = useLanguage();

  const [messages, setMessages] = useState([{ id: 1, type: "ai", text: "Waiting for dungeon master..." }]);

  const [nodes, setNodes] = useState([]);
  const [currentNodeIndex, setCurrentNodeIndex] = useState(0);

  // Player & Game State
  const [players, setPlayers] = useState([]);
  const [myPlayerId, setMyPlayerId] = useState(null);

  const [character, setCharacter] = useState({
    name: USERNAME,
    hp: 100,
    isAlive: true,
  });

  useEffect(() => {
    // Connect socket if not already connected
    if (!socket.connected) socket.connect();

    const handleConnect = () => {
      // Use correct event name and payload keys matching server
      socket.emit("join_room", {
        roomCode: ROOM_ID,
        username: USERNAME,
      });
    };

    // If already connected, emit immediately
    if (socket.connected) {
      socket.emit("join_room", {
        roomCode: ROOM_ID,
        username: USERNAME,
      });
    } else {
      // Otherwise, wait for connection
      socket.once("connect", handleConnect);
    }

    // Listen for join success to get our ID
    socket.on("join_room_success", (data) => {
      setMyPlayerId(data.playerId);
    });

    // Listen for room updates to get player list
    socket.on("room_update", (data) => {
      if (data.players) {
        setPlayers(data.players);

        // Update my character status if available
        if (myPlayerId) {
          const me = data.players.find((p) => p.id === myPlayerId);
          if (me) {
            setCharacter({
              name: me.username,
              hp: me.current_hp,
              isAlive: me.is_alive,
            });
          }
        }
      }
    });

    // Keep existing listeners for backward compatibility / other server versions
    socket.on("ai:message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("game:update", (data) => {
      if (data.nodes) setNodes(data.nodes);
      if (data.currentNodeIndex !== undefined) setCurrentNodeIndex(data.currentNodeIndex);
      if (data.character) setCharacter(data.character);
    });

    return () => {
      socket.off("connect", handleConnect);
      socket.off("join_room_success");
      socket.off("room_update");
      socket.off("ai:message");
      socket.off("game:update");
      // Don't disconnect - keep connection alive for the session
    };
  }, [myPlayerId]); // Add myPlayerId dependency to update character correctly

  const handleSendMessage = (text) => {
    const parsed = parseCommand(text);

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        type: "player",
        sender: USERNAME,
        text,
      },
    ]);

    if (!parsed) return;

    socket.emit("command:send", {
      roomId: ROOM_ID,
      username: USERNAME,
      command: parsed.command,
      args: parsed.args,
    });
  };

  return (
    <div className="vh-100 d-flex flex-column">
      <div className="border-bottom p-2 bg-white d-flex justify-content-between align-items-center">
        <div>
          <h4 className="mb-0">
            🧙 {t("game.dungeonNode")} {nodes.length ? currentNodeIndex + 1 : "-"}
          </h4>
          <small>
            {t("game.hp")}: {character.hp} | {t("game.status")}: {character.isAlive ? t("game.alive") : t("game.dead")}
          </small>
        </div>
        <LanguageToggle />
      </div>

      <div className="flex-grow-1 d-flex">
        <div className="col-3 border-end bg-white p-0">
          <PlayerList players={players} currentPlayerId={myPlayerId} />
        </div>

        <div className="col-9 d-flex flex-column p-0">
          <ChatBox messages={messages} />
          <CommandInput onSend={handleSendMessage} disabled={!character.isAlive} />
        </div>
      </div>
    </div>
  );
}
