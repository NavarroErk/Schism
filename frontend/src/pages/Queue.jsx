import { useState, useEffect } from "react";
import QueueItem from "../components/QueueItem";
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
      <div className="job-queue-filters">
        <p>Polling again in {displayPollingTimer} seconds</p>
        <select name="" id="">
          <option value=""></option>
        </select>
      </div>
      {jobsData && (
        <div className="job-queue">
          {jobsData.map((job, i) => (
            <>
              <QueueItem
                job={job}
                fetchJobsData={fetchJobsData}
                key={i}
              ></QueueItem>
            </>
          ))}
        </div>
      )}
      {/* </div> */}
    </div>
  );
}
