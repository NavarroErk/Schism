import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Tab, Tabs, TabList, TabPanel } from "react-tabs";
import "../css/Practice.css";

// circle geometry
const SIZE = 300;
const CENTER = SIZE / 2;
const RADIUS = 110;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function Practice() {
  const location = useLocation();

  const practiceData =
    location.state || JSON.parse(sessionStorage.getItem("practiceData"));
  const initialGains =
    practiceData?.stemGains ||
    (practiceData ? Array(practiceData.json.length).fill(1) : []);

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

  // refs that mirror state
  const isPlayingRef = useRef(false);
  const stemGainsRef = useRef(initialGains);
  const loopStartRef = useRef(null);
  const loopEndRef = useRef(null);

  // scrubbing - only move the display; seek on release
  const isScrubbingRef = useRef(false);
  const scrubPctRef = useRef(0);

  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackProgress, setTrackProgress] = useState(0);
  const [stemGains, setStemGains] = useState(initialGains);
  const [loopStart, setLoopStart] = useState(null); // percent/null
  const [loopEnd, setLoopEnd] = useState(null); // percent/null
  const [playbackRate, setPlaybackRate] = useState(1);
  const [masterGain, setMasterGain] = useState(1);
  const [seekMode, setSeekMode] = useState("circle"); // "circle" / "line"

  useEffect(() => {
    if (practiceData && window.isSecureContext) getStemFiles();
    return () => stopAudio();
  }, []);

  async function getStemFiles() {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      // stems feed into master gain before the speakers
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.connect(audioContextRef.current.destination);
      // load here to avoid crashes on HTTP (non-secure)
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

  // source -> SoundTouch -> stem gain -> master gain -> destination
  function createNodes() {
    nodesRef.current.forEach(({ stNode }) => stNode.disconnect());
    const ctx = audioContextRef.current;
    const rate = playbackRateRef.current;
    const nodes = audioBuffersRef.current.map((buffer, i) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      const stNode = new SoundTouchNodeRef.current({ context: ctx });
      stNode.playbackRate.value = rate;
      const gainNode = ctx.createGain();
      gainNode.gain.value = stemGainsRef.current[i];
      source.connect(stNode);
      stNode.connect(gainNode);
      gainNode.connect(masterGainRef.current);
      return { source, stNode, gainNode };
    });
    nodesRef.current = nodes;
  }

  function setPlaying(value) {
    isPlayingRef.current = value;
    setIsPlaying(value);
  }

  function getDuration() {
    return audioBuffersRef.current[0].duration;
  }

  function pctToSeconds(pct) {
    return (pct / 100) * getDuration();
  }

  // song position in seconds (accounting for playback speed)
  function getPosition() {
    return (
      startOffsetRef.current +
      (audioContextRef.current.currentTime - playbackStartRef.current) *
        playbackRateRef.current
    );
  }

  function startProgressInterval() {
    clearInterval(trackProgressIntervalRef.current);
    trackProgressIntervalRef.current = setInterval(() => {
      const position = getPosition();

      // A-B loop (jump back to start if A not set)
      if (
        loopEndRef.current !== null &&
        position >= pctToSeconds(loopEndRef.current)
      ) {
        seekTo(pctToSeconds(loopStartRef.current ?? 0));
        return;
      }

      if (position >= getDuration()) {
        handleEnded();
        return;
      }

      if (!isScrubbingRef.current) {
        setTrackProgress((position / getDuration()) * 100);
      }
    }, 50);
  }

  // song finished - next play starts from beginning
  function handleEnded() {
    clearInterval(trackProgressIntervalRef.current);
    stopSources();
    setTrackProgress(100);
    setPlaying(false);
    hasStartedRef.current = false;
    seekOffsetRef.current = 0;
  }

  function stopSources() {
    nodesRef.current.forEach(({ source }) => {
      try {
        source.stop();
      } catch (e) {}
    });
  }

  function handlePlay() {
    if (!isLoaded) {
      alert("Loading media. Please wait.");
      return;
    }

    // pause
    if (isPlayingRef.current) {
      clearInterval(trackProgressIntervalRef.current);
      audioContextRef.current.suspend();
      setPlaying(false);
      return;
    }

    if (
      hasStartedRef.current &&
      audioContextRef.current.state === "suspended"
    ) {
      // resume from pause
      audioContextRef.current.resume();
    } else {
      // fresh start (first play, after a seek while paused, or after the song ended)
      createNodes();
      const offset = seekOffsetRef.current;
      const startTime = audioContextRef.current.currentTime;
      playbackStartRef.current = startTime;
      startOffsetRef.current = offset;
      nodesRef.current.forEach(({ source }) => source.start(startTime, offset));
      audioContextRef.current.resume();
      hasStartedRef.current = true;
      seekOffsetRef.current = 0;
    }
    startProgressInterval();
    setPlaying(true);
  }

  // jump to a position (seconds)
  function seekTo(seconds) {
    setTrackProgress((seconds / getDuration()) * 100);
    stopSources();

    if (isPlayingRef.current) {
      createNodes();
      const startTime = audioContextRef.current.currentTime;
      nodesRef.current.forEach(({ source }) =>
        source.start(startTime, seconds),
      );
      playbackStartRef.current = startTime;
      startOffsetRef.current = seconds;
    } else {
      seekOffsetRef.current = seconds;
      hasStartedRef.current = false;
    }
  }

  // scrubbing
  function pctFromPointer(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (seekMode === "line") {
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      return Math.min(100, Math.max(0, pct));
    }
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    let angle = Math.atan2(y, x) + Math.PI / 2;
    if (angle < 0) angle += 2 * Math.PI;
    return (angle / (2 * Math.PI)) * 100;
  }

  function handleScrubStart(e) {
    if (!audioBuffersRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId); // get moves even off the element
    isScrubbingRef.current = true;
    handleScrubMove(e);
  }

  function handleScrubMove(e) {
    if (!isScrubbingRef.current) return;
    scrubPctRef.current = pctFromPointer(e);
    setTrackProgress(scrubPctRef.current);
  }

  function handleScrubEnd() {
    if (!isScrubbingRef.current) return;
    isScrubbingRef.current = false;
    seekTo(pctToSeconds(scrubPctRef.current));
  }

  const scrubHandlers = {
    onPointerDown: handleScrubStart,
    onPointerMove: handleScrubMove,
    onPointerUp: handleScrubEnd,
    onPointerCancel: handleScrubEnd,
  };

  // loop markers
  function updateLoop(start, end) {
    loopStartRef.current = start;
    loopEndRef.current = end;
    setLoopStart(start);
    setLoopEnd(end);
  }

  function handleSetA() {
    // A not after B; Setting A after B clears B
    if (loopEnd !== null && trackProgress >= loopEnd) {
      updateLoop(trackProgress, null);
    } else {
      updateLoop(trackProgress, loopEnd);
    }
  }

  function handleSetB() {
    if (loopStart !== null && trackProgress <= loopStart) return; // B must be after A
    updateLoop(loopStart, trackProgress);
  }

  // mixer / speed
  function handleStemGain(e, i) {
    const val = parseFloat(e.target.value);
    const next = [...stemGainsRef.current];
    next[i] = val;
    stemGainsRef.current = next;
    setStemGains(next);
    nodesRef.current[i].gainNode.gain.value = val;
  }

  function handleMasterGain(e) {
    const val = parseFloat(e.target.value);
    setMasterGain(val);
    masterGainRef.current.gain.value = val;
  }

  function handlePlaybackRate(e) {
    const rate = parseFloat(e.target.value);
    // lock current position before the speed changes
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
    setPlaying(false);
  }

  function formatTime(pct) {
    if (!audioBuffersRef.current) return "0:00";
    const seconds = pctToSeconds(pct);
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  if (!window.isSecureContext) {
    return (
      <div className="practice-page">
        <p>Practice mode requires HTTPS (or localhost).</p>
      </div>
    );
  }

  const hasLoop = loopStart !== null && loopEnd !== null;

  // UI used in both mobile and desktop layouts

  // arrow drawn at 12 oclock, then rotated around the center to its position
  function circleMarker(pct, label, className) {
    const deg = pct * 3.6;
    const tipY = CENTER - RADIUS - 8;
    return (
      <g className={className} transform={`rotate(${deg} ${CENTER} ${CENTER})`}>
        <polygon
          points={`${CENTER - 7},${tipY - 12} ${CENTER + 7},${tipY - 12} ${CENTER},${tipY}`}
        />
        {/* counter-rotate marker to keep upright */}
        <text
          x={CENTER}
          y={tipY - 16}
          textAnchor="middle"
          transform={`rotate(${-deg} ${CENTER} ${tipY - 21})`}
        >
          {label}
        </text>
      </g>
    );
  }

  function lineMarker(pct, label, className) {
    return (
      <div className={`line-marker ${className}`} style={{ left: `${pct}%` }}>
        <span>{label}</span>
        <span>▼</span>
      </div>
    );
  }

  const circleView = (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} {...scrubHandlers}>
      {hasLoop && (
        <circle
          className="loop-arc"
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          strokeWidth="26"
          strokeDasharray={`${((loopEnd - loopStart) / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={-(loopStart / 100) * CIRCUMFERENCE}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
      )}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke="rgb(60,60,60)"
        strokeWidth="12"
      />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke="white"
        strokeWidth="12"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE - (trackProgress / 100) * CIRCUMFERENCE}
        strokeLinecap="round"
        transform={`rotate(-90 ${CENTER} ${CENTER})`}
      />
      {loopStart !== null && circleMarker(loopStart, "A", "marker-a")}
      {loopEnd !== null && circleMarker(loopEnd, "B", "marker-b")}
      <text
        className="current-time"
        x={CENTER}
        y={CENTER + 4}
        textAnchor="middle"
      >
        {formatTime(trackProgress)}
      </text>
      <text
        className="total-time"
        x={CENTER}
        y={CENTER + 30}
        textAnchor="middle"
      >
        {formatTime(100)}
      </text>
    </svg>
  );

  const lineView = (
    <div className="line-view">
      <div className="line-time">
        <span className="current-time">{formatTime(trackProgress)}</span>
        <span className="total-time"> / {formatTime(100)}</span>
      </div>
      <div className="line-seek" {...scrubHandlers}>
        {loopStart !== null && lineMarker(loopStart, "A", "marker-a")}
        {loopEnd !== null && lineMarker(loopEnd, "B", "marker-b")}
        <div className="line-area">
          {hasLoop && (
            <div
              className="line-loop"
              style={{
                left: `${loopStart}%`,
                width: `${loopEnd - loopStart}%`,
              }}
            />
          )}
          <div className="line-track">
            <div className="line-fill" style={{ width: `${trackProgress}%` }} />
          </div>
        </div>
      </div>
    </div>
  );

  const faders = (
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
  );

  const markerButtons = (
    <div className="marker-buttons">
      <button className="marker-a" onClick={handleSetA} title="Set loop start">
        A
      </button>
      <button
        className="marker-b"
        onClick={handleSetB}
        disabled={loopStart !== null && trackProgress <= loopStart}
        title="Set loop end"
      >
        B
      </button>
      <button onClick={() => updateLoop(null, null)} title="Clear markers">
        X
      </button>
    </div>
  );

  const speedControl = (
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
  );

  const transport = (
    <div className="practice-transport">
      <button>⏮</button>
      <button onClick={handlePlay}>
        {!isLoaded ? "..." : !isPlaying ? "▶" : "⏸"}
      </button>
      <button>⏭</button>
    </div>
  );

  return (
    <div className="practice-page">
      <div className="seek-section">
        <div className={`seek-display ${seekMode}`}>
          <button
            className="seek-toggle"
            onClick={() =>
              setSeekMode(seekMode === "circle" ? "line" : "circle")
            }
            title="Switch between circle and line"
          >
            {seekMode === "circle" ? "—" : "◯"}
          </button>
          {seekMode === "circle" ? circleView : lineView}
        </div>
      </div>

      {/* mobile - speed, then tabs sitting right on top of the play buttons */}
      <div className="practice-mobile">
        {speedControl}
        <div className="mobile-bottom">
          <Tabs>
            <TabList>
              <Tab>Mixer</Tab>
              <Tab>Markers</Tab>
            </TabList>
            <TabPanel>
              <div className="tab-body">{faders}</div>
            </TabPanel>
            <TabPanel>
              <div className="tab-body">{markerButtons}</div>
            </TabPanel>
          </Tabs>
          {transport}
        </div>
      </div>

      {/* desktop - faders then markers + speed + play buttons */}
      <div className="practice-desktop">
        {faders}
        <div className="markers-panel">
          {markerButtons}
          {speedControl}
          {transport}
        </div>
      </div>
    </div>
  );
}
