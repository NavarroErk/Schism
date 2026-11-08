import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import "../css/react-tabs.css";

export default function Home() {
  const navigate = useNavigate();

  const [dependencyStatus, setDependencyStatus] = useState();
  const [inputType, setInputType] = useState("url");
  const [file, setFile] = useState(null);

  useEffect(() => {
    async function fetchDependencyStatus() {
      try {
        const response = await fetch("/api/health");
        const json = await response.json();
        console.log("json", json);

        setDependencyStatus(json);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    }
    fetchDependencyStatus();
  }, []);

  function pickFile(f) {
    if (!f) return;
    // get file extension
    const ext = f.name.split(".").pop().toLowerCase();
    if (["mp3", "flac", "wav", "m4a"].includes(ext)) {
      setFile(f);
    } else {
      alert("Only MP3, FLAC, WAV and M4A files are allowed.");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    // console.log("body:", body);
    if (inputType === "url") {
      try {
        const response = await fetch("api/jobs/url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        // console.log(response);
        if (response.ok) {
          navigate("/queue");
        } else {
          const error = await response.json();
          // console.log(error.detail);
          alert("Job failed. ");
        }
      } catch (error) {
        alert("Server could not be reached.");
      }
    } else if (inputType === "file") {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("output_format", body.output_format);
        formData.append("demucs_model", body.demucs_model);

        const response = await fetch("/api/jobs/file", {
          method: "POST",
          body: formData,
        });
        // console.log("URL:", await response.json());
        if (response.ok) {
          navigate("/queue");
        } else {
          alert("Job Failed");
        }
      } catch (error) {
        alert("Server could not be reached.");
      }
    }
  }

  return (
    <>
      {/* Tool	Windows	macOS	Linux
      ffmpeg | winget install Gyan.FFmpeg |	brew install ffmpeg |	sudo apt install ffmpeg*/}
      {dependencyStatus && (
        <ul>
          {<li>status: {dependencyStatus.status}</li>}
          {dependencyStatus.dependencies.map((dependency) => (
            <li key={dependency.name}>
              {dependency.name}: {dependency.found ? "installed" : "missing"}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit}>
        <Tabs>
          <TabList>
            <Tab onClick={() => setInputType("url")}>Split From URL</Tab>
            <Tab onClick={() => setInputType("file")}>Split From File</Tab>
          </TabList>

          <TabPanel>
            <input
              type="text"
              name="url"
              id="url-input"
              placeholder="Enter url"
              autoComplete="off"
              required
            />
            {/* Submit should choose the active inputType. Only one of url or filedrop. */}
          </TabPanel>
          <TabPanel>
            <label
              style={{
                display: "block",
                border: "2px dashed gray",
                padding: 40,
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                pickFile(e.dataTransfer.files[0]);
              }}
            >
              {file === null
                ? "Drag and drop a file here or click to upload."
                : file.name}

              <input
                type="file"
                accept=".mp3,.flac,.wav,.m4a"
                onChange={(e) => pickFile(e.target.files[0])}
                hidden
              />
            </label>
          </TabPanel>
        </Tabs>
        <div>
          <select name="output_format" id="output-format-select" required>
            <option value="" disabled hidden selected>
              Select Output Format
            </option>
            <option value="wav">WAV</option>
            <option value="flac">FLAC</option>
            <option value="mp3">MP3</option>
          </select>
          <select name="demucs_model" id="model-select" required>
            <option value="" disabled hidden selected>
              Select Demucs Model
            </option>
            <option value="htdemucs">htdemucs</option>
            <option value="htdemucs_6s">htdemucs_6s</option>
            <option value="htdemucs_ft">htdemucs_ft</option>
          </select>
          <button type="submit">Submit</button>
        </div>
      </form>
    </>
  );
}
