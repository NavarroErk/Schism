import { useState, useEffect } from "react";
import QueueItem from "../components/QueueItem";
import { RefreshIcon } from "../components/Icons.jsx";
import "../css/Queue.css";

export default function Queue() {
  const [jobsData, setJobsData] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(5000);
  const [displayPollingTimer, setDisplayPollingTimer] = useState(
    pollingInterval / 1000,
  );

  useEffect(() => {
    // immediately fetch jobs data to populate the queue
    fetchJobsData();
    const interval = setInterval(fetchJobsData, pollingInterval);
    const displayInterval = setInterval(() => {
      setDisplayPollingTimer((prev) => {
        if (prev <= 1) return pollingInterval / 1000;
        return prev - 1;
      });
    }, 1000);

    // clear interval on unmount
    return () => {
      clearInterval(interval);
      clearInterval(displayInterval);
    };
  }, [pollingInterval]);

  async function fetchJobsData() {
    try {
      const response = await fetch("/api/jobs");
      const json = await response.json();
      setJobsData(json.toReversed());
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }

  return (
    <div className="queue-page">
      <div className="queue-toolbar">
        <h1 className="queue-title">
          Queue
          {jobsData && <span className="queue-count">{jobsData.length}</span>}
        </h1>
        <span className="queue-poll" title="Next refresh">
          <RefreshIcon />
          {displayPollingTimer}s
        </span>
      </div>
      {jobsData && (
        <div className="job-queue">
          {jobsData.length === 0 && (
            <p className="queue-empty">No jobs yet.</p>
          )}
          {jobsData.map((job, i) => (
            <QueueItem
              job={job}
              fetchJobsData={fetchJobsData}
              key={job.job_id ?? i}
            ></QueueItem>
          ))}
        </div>
      )}
    </div>
  );
}
