import { useState, useEffect } from "react";
import "../css/Settings.css";

export default function Settings() {
  const [dependencyStatus, setDependencyStatus] = useState(null);
  const [isUnreachable, setIsUnreachable] = useState(false);

  useEffect(() => {
    async function fetchDependencyStatus() {
      try {
        const response = await fetch("/api/health");
        const json = await response.json();
        setDependencyStatus(json);
      } catch (error) {
        console.error("Error fetching data:", error);
        setIsUnreachable(true);
      }
    }
    fetchDependencyStatus();
  }, []);

  return (
    <div className="settings-page">
      <h1 className="settings-title">Settings</h1>

      {/* Tool	Windows	macOS	Linux
      ffmpeg | winget install Gyan.FFmpeg |	brew install ffmpeg |	sudo apt install ffmpeg*/}
      <section className="status-box">
        <div className="status-box-header">
          <span className="status-box-title">System status</span>
          {dependencyStatus && (
            <span className="status-box-overall">{dependencyStatus.status}</span>
          )}
        </div>

        {isUnreachable && (
          <p className="status-box-empty">Server could not be reached.</p>
        )}
        {!dependencyStatus && !isUnreachable && (
          <p className="status-box-empty">Checking…</p>
        )}

        {dependencyStatus && (
          <ul className="status-list">
            {dependencyStatus.dependencies.map((dependency) => (
              <li
                key={dependency.name}
                className={dependency.found ? "is-found" : "is-missing"}
              >
                <span className="status-dot" />
                <span className="status-name">{dependency.name}</span>
                <span className="status-value">
                  {dependency.found ? "Installed" : "Missing"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
