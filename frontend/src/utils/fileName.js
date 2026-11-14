// "Knot feat. Showing Teeth.wav" -> "Knot feat. Showing Teeth"
// only the last ".something" is removed, so dots inside the name are kept
export function removeExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}
