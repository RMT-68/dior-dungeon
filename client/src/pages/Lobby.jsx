import { useNavigate } from "react-router-dom"

export default function Lobby() {
  const navigate = useNavigate()

  return (
    <div className="vh-100 dungeon-hero d-flex flex-column">
      <nav className="navbar navbar-dark px-4">
        <div className="container-fluid d-flex align-items-center justify-content-between">
          <img
            src="/dior-dungeon.png"
            alt="Dior Dungeon"
            className="img-fluid logo-glow"
            style={{ height: "70px" }}
          />

          <button className="btn btn-dungeon">
            <span>HOME</span>
          </button>
        </div>
      </nav>

      <div className="flex-grow-1 d-flex align-items-center justify-content-center">
        <div className="text-center text-light hero-content px-3">
          <div className="hero-logo-wrapper">
            <img
              src="/dior-dungeon.png"
              alt="Dior Dungeon"
              className="img-fluid logo-glow hero-logo"
            />
          </div>
          <p className="hero-subtitle">
            A text-based dungeon adventure where an AI Dungeon Master
            brings your story to life.
          </p>
          <div className="dungeon-form">
            <div className="dungeon-form-inner">

              <input
                type="text"
                className="form-control dungeon-input"
                placeholder="Enter your name"
              />

              <input
                type="text"
                className="form-control dungeon-input"
                placeholder="Enter room code"
              />

              <button
                className="btn btn-dungeon-primary w-100 mt-3"
                onClick={() => navigate("/game")}
              >
                <span>ENTER DUNGEON</span>
              </button>

            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
