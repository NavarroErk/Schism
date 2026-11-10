import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import "../css/Practice.css";

export default function Practice() {
  const location = useLocation();

  const practiceData =
    location.state || JSON.parse(sessionStorage.getItem("practiceData"));

  const audioContextRef = useRef(null);
  const audioBuffersRef = useRef(null);
  const nodesRef = useRef([]);
  const hasStartedRef = useRef(false);
  const seekOffsetRef = useRef(0);
  const playbackStartRef = useRef(0);
  const startOffsetRef = useRef(0);
  const playbackRateRef = useRef(1);
  const trackProgressIntervalRef = useRef(null);
  const SoundTouchNodeRef = useRef(null);
  const masterGainRef = useRef(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackProgress, setTrackProgress] = useState(0);
  const [stemGains, setStemGains] = useState(
    practiceData?.stemGains ||
      (practiceData ? Array(practiceData.json.length).fill(1) : []),
  );
  const [loopStart, setLoopStart] = useState(null);
  const [loopEnd, setLoopEnd] = useState(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [masterGain, setMasterGain] = useState(1);

  useEffect(() => {
    if (practiceData && window.isSecureContext) getStemFiles();
    return () => stopAudio();
  }, []);

  async function getStemFiles() {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      // all stems feed into one master gain before the speakers
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.connect(audioContextRef.current.destination);
      // loaded here instead of at the top so the app doesn't crash on HTTP
      const { SoundTouchNode } = await import("@soundtouchjs/audio-worklet");
      const { default: processorUrl } =
        await import("@soundtouchjs/audio-worklet/processor?url");
      SoundTouchNodeRef.current = SoundTouchNode;
      await SoundTouchNode.register(audioContextRef.current, processorUrl);
      const buffers = await Promise.all(
        practiceData.json.map(async (fileName) => {
          const response = await fetch(
            `api/jobs/${practiceData.jobId}/stem/${fileName}`,
          );
          const arrayBuffer = await response.arrayBuffer();
          return audioContextRef.current.decodeAudioData(arrayBuffer);
        }),
      );
      audioBuffersRef.current = buffers;
      setIsLoaded(true);
      createNodes();
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  // source -> SoundTouch (pitch correction) -> stem gain -> master gain -> destination
  function createNodes() {
    nodesRef.current.forEach(({ stNode }) => stNode.disconnect());
    const ctx = audioContextRef.current;
    const rate = playbackRateRef.current;
    const nodes = audioBuffersRef.current.map((buffer) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      const stNode = new SoundTouchNodeRef.current({ context: ctx });
      stNode.playbackRate.value = rate;
      const gainNode = ctx.createGain();
      source.connect(stNode);
      stNode.connect(gainNode);
      gainNode.connect(masterGainRef.current);
      return { source, stNode, gainNode };
    });
    nodesRef.current = nodes;
  }

  // song position in seconds, accounting for playback speed
  function getPosition() {
    return (
      startOffsetRef.current +
      (audioContextRef.current.currentTime - playbackStartRef.current) *
        playbackRateRef.current
    );
  }

  function startProgressInterval() {
    trackProgressIntervalRef.current = setInterval(() => {
      setTrackProgress(
        (getPosition() / audioBuffersRef.current[0].duration) * 100,
      );
    }, 100);
  }

  function handlePlay() {
    if (!isLoaded) {
      alert("Loading media. Please wait.");
      return;
    }
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();

    if (!isPlaying) {
      if (
        hasStartedRef.current &&
        audioContextRef.current.state === "suspended"
      ) {
        audioContextRef.current.resume();
      } else {
        createNodes();
        stemGains.forEach((gain, i) => {
          nodesRef.current[i].gainNode.gain.value = gain;
        });
        const offset = seekOffsetRef.current;
        const startTime = audioContextRef.current.currentTime;
        playbackStartRef.current = startTime;
        startOffsetRef.current = offset;
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

  function handleSeek(pct) {
    if (!audioBuffersRef.current) return;
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
      playbackStartRef.current = startTime;
      startOffsetRef.current = offset;
      startProgressInterval();
    } else {
      nodesRef.current.forEach(({ source }) => {
        try {
          source.stop();
        } catch (e) {}
      });
      seekOffsetRef.current = offset;
      hasStartedRef.current = false;
    }
  }

  function handleCircleClick(e) {
    if (!audioBuffersRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    let angle = Math.atan2(y, x) + Math.PI / 2;
    if (angle < 0) angle += 2 * Math.PI;
    const pct = (angle / (2 * Math.PI)) * 100;
    handleSeek(pct);
  }

  function handleStemGain(e, i) {
    const val = parseFloat(e.target.value);
    setStemGains((prev) => {
      const next = [...prev];
      next[i] = val;
      return next;
    });
    nodesRef.current[i].gainNode.gain.value = val;
  }

  function handleMasterGain(e) {
    const val = parseFloat(e.target.value);
    setMasterGain(val);
    masterGainRef.current.gain.value = val;
  }

  function handlePlaybackRate(e) {
    const rate = parseFloat(e.target.value);
    // lock in current position before the speed changes
    if (hasStartedRef.current) {
      startOffsetRef.current = getPosition();
      playbackStartRef.current = audioContextRef.current.currentTime;
    }
    playbackRateRef.current = rate;
    setPlaybackRate(rate);
    nodesRef.current.forEach(({ source, stNode }) => {
      source.playbackRate.value = rate;
      stNode.playbackRate.value = rate;
    });
  }

  function stopAudio() {
    clearInterval(trackProgressIntervalRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
    setIsPlaying(false);
  }

  function formatTime(pct) {
    if (!audioBuffersRef.current) return "0:00";
    const seconds = (pct / 100) * audioBuffersRef.current[0].duration;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function formatDuration() {
    if (!audioBuffersRef.current) return "0:00";
    const d = audioBuffersRef.current[0].duration;
    const m = Math.floor(d / 60);
    const s = Math.floor(d % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (!window.isSecureContext) {
    return (
      <div className="practice-page">
        <p>Practice mode requires HTTPS (or localhost).</p>
      </div>
    );
  }

  const radius = 110;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (trackProgress / 100) * circumference;

  return (
    <div className="practice-page">
      <div className="circle-section" onClick={handleCircleClick}>
        <svg width="260" height="260" viewBox="0 0 260 260">
          <circle
            cx="130"
            cy="130"
            r={radius}
            fill="none"
            stroke="rgb(60,60,60)"
            strokeWidth="12"
          />
          <circle
            cx="130"
            cy="130"
            r={radius}
            fill="none"
            stroke="white"
            strokeWidth="12"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            transform="rotate(-90 130 130)"
          />
        </svg>
        <div className="circle-time">
          <span className="current-time">{formatTime(trackProgress)}</span>
          <span className="total-time">{formatDuration()}</span>
        </div>
      </div>

      <div className="practice-tabs-section">
        {/* mobile: tabs */}
        <div className="practice-tabs-mobile">
          <Tabs>
            <TabList>
              <Tab>Mixer</Tab>
              <Tab>Markers</Tab>
            </TabList>
            <TabPanel>
              <div className="practice-fader-panel">
                {practiceData?.json.map((stem, i) => (
                  <div className="fader-channel" key={i}>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={stemGains[i]}
                      onChange={(e) => handleStemGain(e, i)}
                      style={{ touchAction: "none" }}
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
                    style={{ touchAction: "none" }}
                  />
                  <span className="fader-label">Master</span>
                </div>
              </div>
            </TabPanel>
            <TabPanel>
              <div className="markers-panel">
                <div className="marker-buttons">
                  <button onClick={() => setLoopStart(trackProgress)}>
                    Set Loop Start
                  </button>
                  <button onClick={() => setLoopEnd(trackProgress)}>
                    Set Loop End
                  </button>
                  <button
                    onClick={() => {
                      setLoopStart(null);
                      setLoopEnd(null);
                    }}
                  >
                    Clear Markers
                  </button>
                </div>
                <div className="marker-list">
                  <p>
                    Loop Start:{" "}
                    {loopStart !== null ? formatTime(loopStart) : "Not set"}
                  </p>
                  <p>
                    Loop End:{" "}
                    {loopEnd !== null ? formatTime(loopEnd) : "Not set"}
                  </p>
                </div>
              </div>
            </TabPanel>
          </Tabs>
        </div>

        {/* desktop - side by side */}
        <div className="practice-panels-desktop">
          <div className="practice-fader-panel">
            {practiceData?.json.map((stem, i) => (
              <div className="fader-channel" key={i}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={stemGains[i]}
                  onChange={(e) => handleStemGain(e, i)}
                  style={{ touchAction: "none" }}
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
                style={{ touchAction: "none" }}
              />
              <span className="fader-label">Master</span>
            </div>
          </div>
          <div className="markers-panel">
            <div className="marker-buttons">
              <button onClick={() => setLoopStart(trackProgress)}>
                Set Loop Start
              </button>
              <button onClick={() => setLoopEnd(trackProgress)}>
                Set Loop End
              </button>
              <button
                onClick={() => {
                  setLoopStart(null);
                  setLoopEnd(null);
                }}
              >
                Clear Markers
              </button>
            </div>
            <div className="marker-list">
              <p>
                Loop Start:{" "}
                {loopStart !== null ? formatTime(loopStart) : "Not set"}
              </p>
              <p>
                Loop End: {loopEnd !== null ? formatTime(loopEnd) : "Not set"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="speed-control">
        <span>Speed: {Math.round(playbackRate * 100)}%</span>
        <input
          type="range"
          min={0.5}
          max={1.5}
          step={0.01}
          value={playbackRate}
          onChange={handlePlaybackRate}
        />
      </div>

      <div className="practice-transport">
        <button>⏮</button>
        <button onClick={handlePlay}>
          {!isLoaded ? "..." : !isPlaying ? "▶" : "⏸"}
        </button>
        <button>⏭</button>
      </div>
    </div>
  );
}
