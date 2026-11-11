// seconds -> "m:ss.t" (t = tenths of a second)
export function formatTime(seconds) {
  // work in whole tenths so floating point never shows .9 for a round number
  const tenths = Math.max(0, Math.floor((seconds || 0) * 10));
  const m = Math.floor(tenths / 600);
  const s = Math.floor(tenths / 10) % 60;
  const t = tenths % 10;
  return `${m}:${String(s).padStart(2, "0")}.${t}`;
}
