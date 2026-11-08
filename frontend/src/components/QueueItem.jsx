import { useState } from "react";
import { useNavigate } from "react-router-dom";

function QueueItem({ job, fetchJobsData, key }) {
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

  function getJobClassName() {
    if (terminalStatuses.includes(job.status)) {
      // job not active
      if (job.status == "Success") {
        // not active, success
        return "queue-item";
      } else {
        // not active, failed
        return "queue-item queue-item-failed";
      }
    } else {
      // active
      return "queue-item queue-item-active";
    }
  }

  function isJobActive() {
    if (!terminalStatuses.includes(job.status)) {
      return true;
    } else {
      return false;
    }
  }

  return (
    <div
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      className={getJobClassName()}
      //   key={key}
    >
      <div className="queue-item-filename-date-row">
        {job.error ? (
          <>
            {" "}
            <p>Status: {job.status}</p> <p>{job.date}</p>
          </>
        ) : (
          <>
            {" "}
            <p>{job.file_name ? job.file_name.split(".")[0] : "N/A"}</p>{" "}
            <p>{job.date}</p>{" "}
          </>
        )}

        {/* {job.error ? <p>{job.error}</p> : <p>File: {job.file_name}</p>} */}

        {/* <p>{job.date}</p> */}
      </div>
      {job.error ? (
        <p>Error: {job.error.replace(/\x1B\[[0-9;]*m/g, "")}</p>
      ) : (
        <p>Status: {job.status}</p>
      )}
      {/* <p>Status: {job.status}</p> */}

      {isExpanded === true ? (
        <>
          <p>URL: {job.url}</p>
          <p>Path: {job.path ? job.path : "No path found."}</p>
          <div className="queue-item-format-model-row">
            <p>Output Format: {job.output_format}</p>
            <p>Demucs Model: {job.demucs_model}</p>
          </div>
          <p>Job ID: {job.job_id}</p>
        </>
      ) : (
        <></>
      )}
      <div className="job-item-buttons">
        {terminalStatuses.includes(job.status) && job.status !== "Success" ? (
          <button>Retry</button>
        ) : (
          <button onClick={(e) => handleRename(123, e)}>Rename</button>
        )}
        <button onClick={(e) => handleDelete(job.job_id, e)}>Delete</button>
        <button onClick={(e) => handleOpenInStudio(job.job_id, e)}>
          Open In Studio
        </button>
      </div>
    </div>
  );
}

export default QueueItem;
