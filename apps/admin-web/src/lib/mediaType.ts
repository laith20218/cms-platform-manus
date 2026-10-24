/**
 * Honest media-type sniffing for course-episode uploads (Push 7).
 *
 * Production post-mortem: the user uploaded an MP3 named `mp3.رقيق` — an
 * extension the browser does not recognize, so `file.type` came back EMPTY.
 * The old upload code fell back to `file.type || 'video/mp4'`, which invented
 * a video type for an audio file. The episode was stored mislabeled
 * (video/mp4), the student <video> element could not decode MP3 bytes, and
 * the episode silently failed to play.
 *
 * Rule of this module: NEVER invent a content type. If we cannot tell what
 * the file is (browser type missing AND extension unknown — e.g. an Arabic
 * extension like `mp3.رقيق`), return null and let the caller reject with a
 * clear message instead of guessing.
 */

/** Extension → MIME map for every type the backend allows on course episodes. */
const EXTENSION_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

/** Extracts the lowercased extension of a filename (Unicode-safe: names may carry Arabic). */
function fileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot < 0 || lastDot === fileName.length - 1) return '';
  return fileName.slice(lastDot + 1).toLowerCase();
}

/**
 * Sniffs the content type of an episode media file:
 *   1. the browser-reported `file.type`, when it is on the allow-list, wins;
 *   2. otherwise the file EXTENSION is consulted (e.g. an MP3 with an Arabic
 *      name like `test-عربي.mp3` still ends in `.mp3` → audio/mpeg);
 *   3. `null` when neither signal maps to an allowed type — the caller MUST
 *      reject (never fabricate a type, never reach the server).
 */
export function sniffEpisodeMediaType(file: File, allowList: readonly string[]): string | null {
  if (file.type && allowList.includes(file.type)) return file.type;
  const mapped = EXTENSION_MIME[fileExtension(file.name)];
  if (mapped && allowList.includes(mapped)) return mapped;
  return null;
}
