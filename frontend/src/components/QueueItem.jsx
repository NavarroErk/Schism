import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Marquee from "./Marquee.jsx";
import { EditIcon, OpenIcon, RetryIcon, TrashIcon } from "./Icons.jsx";

function QueueItem({ job, fetchJobsData }) {
  const navigate = useNavigate();

  const [isExpanded, setIsExpanded] = useState(false);

  async function handleRename(jobId, e) {
    e.stopPropagation();

    if (isJobActive() == true) {
      alert("Unable to rename an active job");
      return;
    }
    try {
      // prompt user to input name or bring up overlay.
    } catch (error) {}
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

  async function handleOpenInStudio(jobId, e) {
    e.stopPropagation();

    if (isJobActive() == true) {
      alert("Unable to modify an active job");
      return;
    }

    try {
      const response = await fetch(`api/jobs/${jobId}/stem-file-names`);
      const json = await response.json();
      if (response.ok) {
        sessionStorage.setItem(
          "studioData",
          JSON.stringify({ json, jobId, fileName: job.file_name }),
        );
        navigate("/studio", {
          state: { json, jobId, fileName: job.file_name },
        });
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

  const title = job.file_name ? job.file_name.split(".")[0] : "Untitled";
  const isActive = isJobActive();

  return (
    <div
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      className={getJobClassName()}
    >
      <div className="queue-item-filename-date-row">
        <Marquee className="queue-item-title" text={title} />
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
          <button className="job-btn" onClick={(e) => handleRename(123, e)}>
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
          onClick={(e) => handleOpenInStudio(job.job_id, e)}
        >
          Open In Studio
          <OpenIcon />
        </button>
      </div>
    </div>
  );
}

export default QueueItem;
