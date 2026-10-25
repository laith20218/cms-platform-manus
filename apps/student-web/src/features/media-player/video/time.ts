/** Push 10.2 — time display helpers for player controls (Arabic-locale safe). */

export function formatMediaDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const total = Math.floor(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${minutes}:${ss}`;
}

/** Human-readable value for the seek slider's aria-valuetext. */
export function seekValueText(seconds: number, duration: number): string {
  return `${formatMediaDuration(seconds)} من ${formatMediaDuration(duration)}`;
}

export const PLAYBACK_RATES: readonly number[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function formatRate(rate: number): string {
  return `${rate}×`;
}
