import { useEffect, useRef } from "react";

// Style mapping for different message types
const MESSAGE_STYLES = {
  system: { bg: "bg-secondary", text: "text-white", icon: "⚙️" },
  narration: { bg: "bg-dark", text: "text-warning", icon: "📜" },
  action: { bg: "bg-primary", text: "text-white", icon: "⚔️" },
  enemy: { bg: "bg-danger", text: "text-white", icon: "👹" },
  victory: { bg: "bg-success", text: "text-white", icon: "🎉" },
  defeat: { bg: "bg-dark", text: "text-danger", icon: "💀" },
  gameover: { bg: "bg-dark", text: "text-warning", icon: "🏆" },
  npc: { bg: "bg-info", text: "text-dark", icon: "🧙" },
  choice: { bg: "bg-light", text: "text-info", icon: "❓" },
  effect: { bg: "bg-warning", text: "text-dark", icon: "✨" },
  location: { bg: "bg-secondary", text: "text-light", icon: "📍" },
  status: { bg: "bg-dark", text: "text-muted", icon: "📊" },
  warning: { bg: "bg-warning", text: "text-dark", icon: "⚠️" },
  error: { bg: "bg-danger", text: "text-white", icon: "❌" },
  story: { bg: "bg-dark", text: "text-info", icon: "📖" },
  highlight: { bg: "bg-dark", text: "text-success", icon: "⭐" },
  epitaph: { bg: "bg-dark", text: "text-warning fst-italic", icon: "📜" },
  quote: { bg: "bg-dark", text: "text-light fst-italic", icon: "💬" },
  player: { bg: "bg-light", text: "text-dark", icon: "🗣️" },
  ai: { bg: "bg-primary", text: "text-white", icon: "🤖" },
};

export default function ChatBox({ messages }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-grow-1 overflow-auto p-3 bg-dark">
      {messages.map((msg) => {
        const style = MESSAGE_STYLES[msg.type] || MESSAGE_STYLES.system;

        return (
          <div key={msg.id} className="mb-2 d-flex align-items-start gap-2">
            {/* Icon from asset or emoji */}
            {msg.icon ? (
              <img
                src={msg.icon}
                alt={msg.type}
                style={{ width: 24, height: 24, objectFit: "contain" }}
                className="flex-shrink-0 mt-1"
              />
            ) : (
              <span className="flex-shrink-0" style={{ width: 24 }}>
                {style.icon}
              </span>
            )}

            {/* Message content */}
            <div
              className={`rounded px-2 py-1 ${style.bg} ${style.text} flex-grow-1`}
            >
              {msg.sender && <strong>{msg.sender}: </strong>}
              {msg.text}
              {msg.timestamp && (
                <small className="ms-2 opacity-50">{msg.timestamp}</small>
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
