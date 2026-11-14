import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Marquee from "./Marquee.jsx";
import { removeExtension } from "../utils/fileName.js";
import { EditIcon, OpenIcon, RetryIcon, TrashIcon } from "./Icons.jsx";
import { useToast } from "./toast-context.js";

function QueueItem({ job, fetchJobsData }) {
  const navigate = useNavigate();
  const showToast = useToast();

  const [isExpanded, setIsExpanded] = useState(false);
  const [newName, setNewName] = useState(null); // null = not renaming

  // Rename button: turn the title into a text box
  function handleRename(e) {
    e.stopPropagation();
    if (isJobActive()) {
      showToast("Unable to rename an active job");
      return;
    }
    setNewName(title);
  }

  // Enter in the text box: save the new name
  async function submitRename(e) {
    e.preventDefault();
    const name = newName.trim();
    setNewName(null);
    if (!name || name === title) return;

    try {
      const response = await fetch(`/api/jobs/${job.job_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.detail);

      // if this song is open in Studio/Practice, update its saved name too
      const song = JSON.parse(sessionStorage.getItem("songData"));
      if (song?.jobId === job.job_id) {
        sessionStorage.setItem(
          "songData",
          JSON.stringify({ ...song, fileName: json.file_name }),
        );
      }
      fetchJobsData();
    } catch (error) {
      showToast(`Rename failed: ${error.message}`, "error");
    }
  }

  async function handleDelete(jobId, e) {
    // if job was file job, path exists. delete path then delete entry from json

    e.stopPropagation();

    if (isJobActive() == true) {
      alert("Unable to delete an active job");
      return;
    }

    try {
      const response = await fetch(`api/jobs/${jobId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      const json = await response.json();
      if (response.ok) {
        fetchJobsData();
        // console.log(json);
      } else {
        // console.log(json.detail);
      }
    } catch (error) {
      // do something to update UI here
      console.log("Server could not be reached", error);
    }
  }

  // page is "studio" or "practice"
  async function handleOpen(page, jobId, e) {
    e.stopPropagation();

    if (isJobActive() == true) {
      alert("Unable to modify an active job");
      return;
    }

    try {
      const response = await fetch(`api/jobs/${jobId}/stem-file-names`);
      const json = await response.json();
      if (response.ok) {
        const songData = { json, jobId, fileName: job.file_name };
        sessionStorage.setItem("songData", JSON.stringify(songData));
        navigate(`/${page}`, { state: songData });
        // console.log(json);
      } else {
        console.log(json.detail);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }

  const terminalStatuses = [
    "YT-DLP Failed",
    "Demucs Failed",
    "Failed",
    "Success",
  ];

  function handleMouseDown(e) {
    e.currentTarget.dataset.mouseDownX = e.clientX;
    e.currentTarget.dataset.mouseDownY = e.clientY;
  }

  function handleClick(e) {
    const dx = Math.abs(e.clientX - e.currentTarget.dataset.mouseDownX);
    const dy = Math.abs(e.clientY - e.currentTarget.dataset.mouseDownY);
    if (dx > 5 || dy > 5) return; // was a drag, not a click
    setIsExpanded(!isExpanded);
  }

  function getJobState() {
    if (!terminalStatuses.includes(job.status)) return "active";
    return job.status == "Success" ? "success" : "failed";
  }

  function getJobClassName() {
    const state = getJobState();
    let className = "queue-item";
    if (state === "failed") className += " queue-item-failed";
    if (state === "active") className += " queue-item-active";
    if (isExpanded) className += " is-expanded";
    return className;
  }

  function isJobActive() {
    if (!terminalStatuses.includes(job.status)) {
      return true;
    } else {
      return false;
    }
  }

  const title = job.file_name ? removeExtension(job.file_name) : "Untitled";
  const isActive = isJobActive();

  return (
    <div
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      className={getJobClassName()}
    >
      <div className="queue-item-filename-date-row">
        {newName === null ? (
          <Marquee className="queue-item-title" text={title} />
        ) : (
          // Enter saves, Escape or clicking away cancels
          <form
            className="queue-item-rename"
            onSubmit={submitRename}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setNewName(null)}
              onBlur={() => setNewName(null)}
            />
          </form>
        )}
        <span className="queue-item-date">{job.date}</span>
      </div>

      <div className="queue-item-status-row">
        <span className="status-pill">
          <span className="status-pill-dot" />
          {job.status}
        </span>
        {job.error && (
          <Marquee
            className="queue-item-error"
            text={job.error.replace(/\x1B\[[0-9;]*m/g, "")}
          />
        )}
      </div>

      {isExpanded === true ? (
        <dl className="queue-item-details">
          <dt>URL</dt>
          <dd>
            <Marquee text={job.url || "—"} />
          </dd>
          <dt>Path</dt>
          <dd>
            <Marquee text={job.path ? job.path : "No path found."} />
          </dd>
          <dt>Format</dt>
          <dd className="queue-item-format-model-row">
            <span>{job.output_format}</span>
            <span className="queue-item-detail-label">Model</span>
            <span>{job.demucs_model}</span>
          </dd>
          <dt>Job ID</dt>
          <dd>
            <Marquee text={job.job_id} />
          </dd>
        </dl>
      ) : (
        <></>
      )}
      <div className={`job-item-buttons ${isActive ? "is-locked" : ""}`}>
        {terminalStatuses.includes(job.status) && job.status !== "Success" ? (
          <button className="job-btn">
            <RetryIcon />
            Retry
          </button>
        ) : (
          <button className="job-btn" onClick={handleRename}>
            <EditIcon />
            Rename
          </button>
        )}
        <button
          className="job-btn job-btn-danger"
          onClick={(e) => handleDelete(job.job_id, e)}
        >
          <TrashIcon />
          Delete
        </button>
        <button
          className="job-btn job-btn-primary"
          onClick={(e) => handleOpen("studio", job.job_id, e)}
        >
          Studio
          <OpenIcon />
        </button>
        <button
          className="job-btn job-btn-primary"
          onClick={(e) => handleOpen("practice", job.job_id, e)}
        >
          Practice
          <OpenIcon />
        </button>
      </div>
    </div>
  );
}

export default QueueItem;
