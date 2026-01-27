import { useState, useEffect } from "react"
import PlayerList from "../components/PlayerList"
import ChatBox from "../components/ChatBox"
import CommandInput from "../components/CommandInput"
import { parseCommand } from "../utils/commandParser"
import { socket } from "../socket"

const USERNAME = "Warrior"
const ROOM_ID = "demo-room"

export default function GameRoom() {
  const [messages, setMessages] = useState([
    { id: 1, type: "ai", text: "Waiting for dungeon master..." }
  ])

  const [nodes, setNodes] = useState([])
  const [currentNodeIndex, setCurrentNodeIndex] = useState(0)

  const [character, setCharacter] = useState({
    name: USERNAME,
    hp: 100,
    isAlive: true
  })

  useEffect(() => {
    socket.connect()

    socket.on("connect", () => {
      socket.emit("room:join", {
        roomId: ROOM_ID,
        username: USERNAME
      })
    })

    socket.on("ai:message", (msg) => {
      setMessages((prev) => [...prev, msg])
    })

    socket.on("game:update", (data) => {
      if (data.nodes) setNodes(data.nodes)
      if (data.currentNodeIndex !== undefined)
        setCurrentNodeIndex(data.currentNodeIndex)
      if (data.character) setCharacter(data.character)
    })

    return () => {
      socket.off("ai:message")
      socket.off("game:update")
      socket.disconnect()
    }
  }, [])

  const handleSendMessage = (text) => {
    const parsed = parseCommand(text)

    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        type: "player",
        sender: USERNAME,
        text
      }
    ])

    if (!parsed) return

    socket.emit("command:send", {
      roomId: ROOM_ID,
      username: USERNAME,
      command: parsed.command,
      args: parsed.args
    })
  }

  return (
    <div className="vh-100 d-flex flex-column">
      <div className="border-bottom p-2 bg-white">
        <h4 className="mb-0">
          🧙 Dungeon Node {nodes.length ? currentNodeIndex + 1 : "-"}
        </h4>
        <small>
          HP: {character.hp} | Status:{" "}
          {character.isAlive ? "Alive" : "Dead"}
        </small>
      </div>

      <div className="flex-grow-1 d-flex">
        <div className="col-3 border-end bg-white p-0">
          <PlayerList />
        </div>

        <div className="col-9 d-flex flex-column p-0">
          <ChatBox messages={messages} />
          <CommandInput
            onSend={handleSendMessage}
            disabled={!character.isAlive}
          />
        </div>
      </div>
    </div>
  )
}
