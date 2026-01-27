import { useEffect, useRef } from "react"

export default function ChatBox({ messages }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <div className="flex-grow-1 overflow-auto p-3 bg-light">
      {messages.map((msg) => (
        <div key={msg.id} className="mb-2">
          {msg.type === "ai" && (
            <div className="text-primary">
              🤖 <strong>DM:</strong> {msg.text}
            </div>
          )}

          {msg.type === "system" && (
            <span className="badge bg-secondary">
              ⚙️ {msg.text}
            </span>
          )}

          {msg.type === "player" && (
            <div>
              <strong>{msg.sender}:</strong> {msg.text}
            </div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
