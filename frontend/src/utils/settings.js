// app settings, saved on this device (localStorage)

// compressed playback: smaller stems load faster in Studio/Practice. on by default
export function getCompressedPlayback() {
  return localStorage.getItem("compressedPlayback") !== "false";
}

export function setCompressedPlayback(isOn) {
  localStorage.setItem("compressedPlayback", String(isOn));
}
