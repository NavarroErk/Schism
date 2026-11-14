import { useNavigate } from "react-router-dom";

// shown by Studio and Practice when no song has been opened yet
export default function NoSongLoaded() {
  const navigate = useNavigate();

  return (
    <div className="empty-state">
      <span className="empty-state-title">No song loaded</span>
      <p className="empty-state-text">
        Go to the Queue, pick a finished job and choose <strong>Studio</strong>{" "}
        or <strong>Practice</strong>.
      </p>
      <button
        className="btn-primary empty-state-btn"
        onClick={() => navigate("/queue")}
      >
        Go to Queue
      </button>
    </div>
  );
}
