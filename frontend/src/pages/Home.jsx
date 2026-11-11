import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import {
  FileAudioIcon,
  LinkIcon,
  SpinnerIcon,
  UploadIcon,
} from "../components/Icons.jsx";
import { useToast } from "../components/toast-context.js";
import "../css/react-tabs.css";
import "../css/Home.css";

const OUTPUT_FORMATS = [
  { value: "wav", label: "WAV" },
  { value: "flac", label: "FLAC" },
  { value: "mp3", label: "MP3" },
];

const DEMUCS_MODELS = [
  {
    value: "htdemucs",
    label: "4 Stem",
    description: "Default. 4 stems: vocals, drums, bass, other.",
  },
  {
    value: "htdemucs_6s",
    label: "6 Stem",
    description: "6 stems. Adds guitar and piano.",
  },
  {
    value: "htdemucs_ft",
    label: "4 Stem FT",
    description: "Fine-tuned 4 stem. Cleaner, but about 4x slower.",
  },
];

export default function Home() {
  const navigate = useNavigate();
  const showToast = useToast();

  const [inputType, setInputType] = useState("url");
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [demucsModel, setDemucsModel] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const modelDescription = DEMUCS_MODELS.find(
    (model) => model.value === demucsModel,
  )?.description;

  function pickFile(f) {
    if (!f) return;
    // get file extension
    const ext = f.name.split(".").pop().toLowerCase();
    if (["mp3", "flac", "wav", "m4a"].includes(ext)) {
      setFile(f);
    } else {
      showToast("Only MP3, FLAC, WAV and M4A files are allowed.", "error");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    // console.log("body:", body);

    // our own validation instead of the browser's required bubbles (form is noValidate)
    if (inputType === "url" && !body.url?.trim()) {
      showToast("Enter a URL");
      return;
    }
    if (inputType === "file" && !file) {
      showToast("Choose a file to split");
      return;
    }
    if (!body.output_format) {
      showToast("Select an output format");
      return;
    }
    if (!body.demucs_model) {
      showToast("Select a Demucs model");
      return;
    }

    if (inputType === "url") {
      setIsSubmitting(true);
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
          showToast("Job failed.", "error");
        }
      } catch (error) {
        showToast("Server could not be reached.", "error");
      } finally {
        setIsSubmitting(false);
      }
    } else if (inputType === "file") {
      setIsSubmitting(true);
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
          showToast("Job failed.", "error");
        }
      } catch (error) {
        showToast("Server could not be reached.", "error");
      } finally {
        setIsSubmitting(false);
      }
    }
  }

  return (
    <div className="home-page">
      <header className="home-hero">
        <h1 className="home-logo">
          SCH<span>ISM</span>
        </h1>
        <p className="home-tagline">Stem separation</p>
      </header>

      <form className="home-form" onSubmit={handleSubmit} noValidate>
        <Tabs>
          <TabList>
            <Tab onClick={() => setInputType("url")}>From URL</Tab>
            <Tab onClick={() => setInputType("file")}>From File</Tab>
          </TabList>

          <TabPanel>
            <div className="url-field">
              <LinkIcon className="url-field-icon" />
              <input
                type="text"
                name="url"
                id="url-input"
                placeholder="Paste a URL"
                autoComplete="off"
                required
              />
            </div>
            {/* Submit should choose the active inputType. Only one of url or filedrop. */}
          </TabPanel>
          <TabPanel>
            <label
              className={`file-drop ${isDragging ? "is-dragging" : ""} ${file ? "has-file" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                pickFile(e.dataTransfer.files[0]);
              }}
            >
              {file === null ? (
                <>
                  <UploadIcon className="file-drop-icon" />
                  <span className="file-drop-title">
                    Drop a file or <u>browse</u>
                  </span>
                  <span className="file-drop-hint">MP3, FLAC, WAV, M4A</span>
                </>
              ) : (
                <>
                  <FileAudioIcon className="file-drop-icon" />
                  <span className="file-drop-title">{file.name}</span>
                  <span className="file-drop-hint">
                    Click to choose another
                  </span>
                </>
              )}

              <input
                type="file"
                accept=".mp3,.flac,.wav,.m4a"
                onChange={(e) => pickFile(e.target.files[0])}
                hidden
              />
            </label>
          </TabPanel>
        </Tabs>

        <div className="home-option" role="radiogroup" aria-label="Output format">
          <span className="field-label">Output format</span>
          <div className="choice-group">
            {OUTPUT_FORMATS.map((format) => (
              <label className="choice" key={format.value}>
                <input
                  type="radio"
                  name="output_format"
                  value={format.value}
                  required
                />
                {format.label}
              </label>
            ))}
          </div>
        </div>

        <div className="home-option" role="radiogroup" aria-label="Demucs model">
          <span className="field-label">Demucs model</span>
          <span className="model-description" aria-live="polite">
            {modelDescription ?? "Pick a model"}
          </span>
          <div className="choice-group">
            {DEMUCS_MODELS.map((model) => (
              <label className="choice" key={model.value}>
                <input
                  type="radio"
                  name="demucs_model"
                  value={model.value}
                  onChange={() => setDemucsModel(model.value)}
                  required
                />
                {model.label}
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary home-submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? <SpinnerIcon /> : "Split"}
        </button>
      </form>
    </div>
  );
}
