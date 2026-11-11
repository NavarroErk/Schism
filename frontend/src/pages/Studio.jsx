import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../css/Studio.css";

export default function Studio() {
  const location = useLocation();
  const navigate = useNavigate();

  const audioContextRef = useRef(null);
  const audioBuffersRef = useRef();
  const nodesRef = useRef([]);
  const masterGainRef = useRef(null);

  const [stemsData, setStemsData] = useState(
    location.state || JSON.parse(sessionStorage.getItem("studioData")),
  );
  const [isPlaying, setIsPlaying] = useState(false);

  const [trackProgress, setTrackProgress] = useState(0);
  const trackProgressIntervalRef = useRef(null);
  const playbackStartRef = useRef(0);

  const [isLoaded, setIsLoaded] = useState(false);

  const [stemGains, setStemGains] = useState(
    stemsData ? Array(stemsData.json.length).fill(1) : [],
  );
  const [masterGain, setMasterGain] = useState(1);

  // export popup
  const [showExport, setShowExport] = useState(false);
  const [exportFormat, setExportFormat] = useState(null); // "wav" / "flac" / "mp3"
  const [exportDevice, setExportDevice] = useState(false);
  const [exportServer, setExportServer] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const allDestinations = exportDevice && exportServer;

  const hasStartedRef = useRef(false);
  const seekOffsetRef = useRef(0);

  useEffect(() => {
    if (stemsData !== null) {
      getStemFile();
    }
    return () => stopAudio();
  }, []);

  async function getStemFile() {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      // stems feed into master gain before the speakers
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.connect(audioContextRef.current.destination);
      const buffers = await Promise.all(
        stemsData.json.map(async (fileName) => {
          const response = await fetch(
            `api/jobs/${stemsData.jobId}/stem/${fileName}`,
          );
          const arrayBuffer = await response.arrayBuffer();
          return audioContextRef.current.decodeAudioData(arrayBuffer);
        }),
      );
      audioBuffersRef.current = buffers;

      setStemGains(Array(buffers.length).fill(1));
      setIsLoaded(true);
      createNodes();
      console.log("getStemFiles success");
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  function createNodes() {
    const nodes = audioBuffersRef.current.map((buffer) => {
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      const gainNode = audioContextRef.current.createGain();
      source.connect(gainNode);
      gainNode.connect(masterGainRef.current);
      return { source, gainNode };
    });
    nodesRef.current = nodes;
  }
  function startProgressInterval() {
    trackProgressIntervalRef.current = setInterval(() => {
      const duration = audioBuffersRef.current[0].duration;
      const position =
        audioContextRef.current.currentTime - playbackStartRef.current;
      if (position >= duration) {
        handleEnded();
        return;
      }
      setTrackProgress((position / duration) * 100);
    }, 250);
  }

  function handleEnded() {
    clearInterval(trackProgressIntervalRef.current);
    setTrackProgress(100);
    setIsPlaying(false);
    hasStartedRef.current = false;
    seekOffsetRef.current = 0;
  }

  function handlePlay() {
    if (!isLoaded) {
      alert("Loading media. Please wait.");
      return;
    }
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    if (!isPlaying) {
      if (
        hasStartedRef.current &&
        audioContextRef.current.state === "suspended"
      ) {
        // resume from pause; sources still live inside the suspended context
        audioContextRef.current.resume();
      } else {
        // Fresh start (first play, or play after a seek while paused)
        createNodes();
        stemGains.forEach((gain, i) => {
          nodesRef.current[i].gainNode.gain.value = gain;
        });
        const offset = seekOffsetRef.current;
        const startTime = audioContextRef.current.currentTime;
        playbackStartRef.current = startTime - offset;
        nodesRef.current.forEach(({ source }) =>
          source.start(startTime, offset),
        );
        audioContextRef.current.resume();
        hasStartedRef.current = true;
        seekOffsetRef.current = 0;
      }
      startProgressInterval();
      setIsPlaying(true);
    } else {
      clearInterval(trackProgressIntervalRef.current);
      audioContextRef.current.suspend();
      setIsPlaying(false);
    }
  }

  function handleSeek(e) {
    const pct = parseFloat(e.target.value);
    seekTo((pct / 100) * audioBuffersRef.current[0].duration);
  }

  // skip forward/back by seconds
  function handleSkip(seconds) {
    if (!audioBuffersRef.current) return;
    const duration = audioBuffersRef.current[0].duration;
    const current = (trackProgress / 100) * duration;
    seekTo(Math.min(Math.max(current + seconds, 0), duration));
  }

  // jump to a position (seconds)
  function seekTo(offset) {
    const duration = audioBuffersRef.current[0].duration;
    setTrackProgress((offset / duration) * 100);

    if (isPlaying) {
      clearInterval(trackProgressIntervalRef.current);
      nodesRef.current.forEach(({ source }) => source.stop());
      createNodes();
      stemGains.forEach((gain, i) => {
        nodesRef.current[i].gainNode.gain.value = gain;
      });
      const startTime = audioContextRef.current.currentTime;
      nodesRef.current.forEach(({ source }) => source.start(startTime, offset));
      playbackStartRef.current = audioContextRef.current.currentTime - offset;
      startProgressInterval();
    } else {
      nodesRef.current.forEach(({ source }) => {
        try {
          source.stop();
        } catch (e) {}
      });
      seekOffsetRef.current = offset;
      hasStartedRef.current = false;
      playbackStartRef.current = audioContextRef.current.currentTime - offset;
    }
  }

  function handleStemGain(e, i) {
    setStemGains((prev) => {
      const next = [...prev];
      next[i] = parseFloat(e.target.value);
      return next;
    });

    nodesRef.current[i].gainNode.gain.value = parseFloat(e.target.value);
  }

  function handleMasterGain(e) {
    const val = parseFloat(e.target.value);
    setMasterGain(val);
    masterGainRef.current.gain.value = val;
  }

  function stopAudio() {
    clearInterval(trackProgressIntervalRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
    setIsPlaying(false);
  }

  function handleSelectAllDestinations() {
    setExportDevice(!allDestinations);
    setExportServer(!allDestinations);
  }

  // server mixes the stems with their fader gains (master not included)
  async function handleExport() {
    setIsExporting(true);
    try {
      const gains = {};
      stemsData.json.forEach((stem, i) => {
        gains[stem] = stemGains[i];
      });

      const response = await fetch(`api/jobs/${stemsData.jobId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          output_format: exportFormat,
          gains,
          save_to_server: exportServer,
          download: exportDevice,
        }),
      });
      if (!response.ok) throw new Error(await response.text());

      // download to device
      if (exportDevice) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${stemsData.fileName.replace(/\.[^.]+$/, "")} - MIX.${exportFormat}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        alert("Mix saved to server.");
      }
      setShowExport(false);
    } catch (error) {
      alert(error);
    } finally {
      setIsExporting(false);
    }
  }

  function handleOpenInPractice() {
    const practiceData = { ...stemsData, stemGains, masterGain };
    sessionStorage.setItem("practiceData", JSON.stringify(practiceData));
    navigate("/practice", { state: practiceData });
  }
  return (
    <div className="studio-page">
      <div className="studio-header">
        <strong>
          {stemsData?.fileName
            ? stemsData.fileName.split(".")[0]
            : "No Filename Found"}
        </strong>

        <div className="studio-header-btns">
          <button onClick={handleOpenInPractice}>♩</button>
          <button onClick={() => setShowExport(!showExport)}>⤓</button>

          {showExport && (
            <>
              {/* clicking anywhere outside the popup closes it */}
              <div
                className="export-backdrop"
                onClick={() => setShowExport(false)}
              />
              <div className="export-popup">
                <div className="export-section">
                  <span className="export-label">Format</span>
                  <div className="format-options">
                    {["wav", "flac", "mp3"].map((format) => (
                      <button
                        key={format}
                        className={exportFormat === format ? "selected" : ""}
                        onClick={() => setExportFormat(format)}
                      >
                        {format.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="export-section">
                  <span className="export-label">Save To</span>
                  <button
                    className={allDestinations ? "selected" : ""}
                    onClick={handleSelectAllDestinations}
                  >
                    Select All
                  </button>
                  <div className="destination-options">
                    <button
                      className={exportDevice ? "selected" : ""}
                      onClick={() => setExportDevice(!exportDevice)}
                    >
                      Device
                    </button>
                    <button
                      className={exportServer ? "selected" : ""}
                      onClick={() => setExportServer(!exportServer)}
                    >
                      Server
                    </button>
                  </div>
                </div>

                <div className="export-section">
                  <button
                    onClick={handleExport}
                    disabled={
                      !exportFormat ||
                      (!exportDevice && !exportServer) ||
                      isExporting
                    }
                  >
                    {isExporting ? "◌" : "Export Mix"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="stems-panel">
        {stemsData?.json.map((stem, i) => (
          <div className="stem-row" key={i}>
            <span className="stem-name">
              {stem
                .replace(".wav", "")
                .replace(".mp3", "")
                .replace(".flac", "")}
            </span>
            <input
              className="stem-progress"
              type="range"
              min={0}
              max={100}
              value={trackProgress}
              onChange={handleSeek}
            />
          </div>
        ))}
      </div>

      <div className="controls-section">
        <div className="fader-panel">
          {stemsData?.json.map((stem, i) => (
            <div className="fader-channel" key={i}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={stemGains[i]}
                onChange={(e) => handleStemGain(e, i)}
              />
              <span className="fader-label">{stem.split(".")[0]}</span>
            </div>
          ))}
          <div className="fader-channel master-channel">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={masterGain}
              onChange={handleMasterGain}
            />
            <span className="fader-label">Master</span>
          </div>
        </div>
        <div className="transport-bar">
          <button onClick={() => handleSkip(-10)}>⏮</button>
          {!isLoaded ? (
            <button onClick={handlePlay}>◌</button>
          ) : !isPlaying ? (
            <button onClick={handlePlay}>▶</button>
          ) : (
            <button onClick={handlePlay}>⏸</button>
          )}
          <button onClick={() => handleSkip(10)}>⏭</button>
        </div>
      </div>
    </div>
  );
}
