import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../css/Studio.css";

export default function Studio() {
  const location = useLocation();
  const navigate = useNavigate();

  const audioContextRef = useRef(null);
  const audioBuffersRef = useRef();
  const nodesRef = useRef([]);

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
      gainNode.connect(audioContextRef.current.destination);
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
    const duration = audioBuffersRef.current[0].duration;
    const offset = (pct / 100) * duration;

    setTrackProgress(pct);

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

  function stopAudio() {
    clearInterval(trackProgressIntervalRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
    setIsPlaying(false);
  }

  function handleOpenInPractice() {
    const practiceData = { ...stemsData, stemGains };
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
          <button>⤓</button>
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
        </div>
        <div className="transport-bar">
          <button>⏮</button>
          <button onClick={handlePlay}>
            {!isLoaded ? "..." : !isPlaying ? "▶" : "⏸"}
          </button>
          <button>⏭</button>
        </div>
      </div>
    </div>
  );
}
