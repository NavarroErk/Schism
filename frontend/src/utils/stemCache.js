// keeps the decoded stems of the last opened song in memory - switching between Studio and Practice doesn't download and decode them again.
// one song is kept at a time, A page refresh clears it.

let cached = null; // { key, promise }
let decodeContext = null; // only used for decoding, never plays anything

export function loadStems(jobId, fileNames) {
  const key = `${jobId}:${fileNames.join(",")}`;

  // same song as last time? reuse it
  if (cached?.key === key) return cached.promise;

  if (!decodeContext) decodeContext = new AudioContext();

  // different song? download + decode, replacing the old one
  const promise = Promise.all(
    fileNames.map(async (fileName) => {
      const response = await fetch(`/api/jobs/${jobId}/stem/${fileName}`);
      const arrayBuffer = await response.arrayBuffer();
      return decodeContext.decodeAudioData(arrayBuffer);
    }),
  );
  cached = { key, promise };

  // if loading fails, forget it so the next visit tries again
  promise.catch(() => {
    if (cached?.promise === promise) cached = null;
  });

  return promise;
}
