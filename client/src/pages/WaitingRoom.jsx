import "../waiting-room.css"

export default function WaitingRoom() {
  const players = [
    { name: "Warrior", ready: true, you: true },
    { name: "Mage", ready: false },
    null
  ]

  return (
    <div className="waiting-room dungeon-bg">
      <h2 className="waiting-title">Dungeon Waiting Room</h2>
      <p className="waiting-sub">Room Code: ABCD (2 / 3)</p>

      <div className="waiting-focus">
        <div className="player-cards">
          {players.map((player, index) => (
            <div
              key={index}
              className={`player-card
                ${player?.ready ? "ready" : ""}
                ${!player ? "empty" : ""}`}
            >
              {player ? (
                <>
                  <div className="player-name">
                    {player.name} {player.you && "(You)"}
                  </div>
                  <div className="player-status">
                    {player.ready ? "READY" : "WAITING"}
                  </div>
                </>
              ) : (
                <span className="empty-slot">Empty Slot</span>
              )}
            </div>
          ))}
        </div>

        <div className="waiting-actions">
          <button className="btn-dungeon">
            <span>READY</span>
          </button>

          <button className="btn-dungeon-primary">
            <span>START DUNGEON</span>
          </button>
        </div>
      </div>
    </div>
  )
}
