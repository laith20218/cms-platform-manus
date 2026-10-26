/**
 * Push 10.4 — media processing domain (admin-web).
 *
 * Mirrors the backend's ProcessingStatus state machine (CMS.Domain
 * MediaEnums.cs, written by the Push 10.3 transcoding pipeline) and the
 * Difficulty enum (Easy=0 / Medium=1 / Hard=2 — the values this UI SENDS;
 * the API may also answer with the enum strings "Easy"|"Medium"|"Hard",
 * which normalize to the same tiers).
 *
 * Spec contract (task book 1.B): the upload panel replaces raw byte counters
 * with a human-readable phase machine — each ladder rung gets its own
 * Arabic/English sentence and a target percent for the animated bar.
 *
 * Degradation contract: TODAY's API does not yet expose `processingStatus`
 * on the episode DTO. The poller treats `undefined` on an uploaded episode
 * as Ready — the source MP4 is playable immediately, so claiming otherwise
 * would be dishonest. The moment the field ships, the full ladder lights up
 * with zero frontend changes.
 */

/** The backend enum's raw member names (JsonStringEnumConverter, no policy). */
export type ProcessingStatus =
  | 'Pending'
  | 'Transcoding_360p'
  | 'Transcoding_720p'
  | 'Transcoding_1080p'
  | 'Ready'
  | 'Failed';

export interface ProcessingPhaseInfo {
  status: Exclude<ProcessingStatus, 'Failed'>;
  labelAr: string;
  labelEn: string;
  /** Target width for the animated progress bar (0-100). */
  progress: number;
}

/** The ladder, in order — exactly the task book's human sentences.
 * Push 10.8 (1.B): the rung text switched from raw pixel heights to the market
 * vocabulary — 360p → SD, 720p → HD, 1080p → FHD. */
export const PROCESSING_PHASES: readonly ProcessingPhaseInfo[] = [
  { status: 'Pending', labelAr: 'جاري تجهيز الفيديو في الخادم...', labelEn: 'Preparing the video on the server…', progress: 8 },
  { status: 'Transcoding_360p', labelAr: 'جاري إنشاء نسخة SD (مناسبة للجوال)...', labelEn: 'Creating the SD copy (mobile-friendly)…', progress: 32 },
  { status: 'Transcoding_720p', labelAr: 'جاري إنشاء نسخة HD (جودة عالية)...', labelEn: 'Creating the HD copy (high quality)…', progress: 58 },
  { status: 'Transcoding_1080p', labelAr: 'جاري إنشاء نسخة FHD (جودة فائقة)...', labelEn: 'Creating the FHD copy (ultra quality)…', progress: 84 },
  { status: 'Ready', labelAr: 'الفيديو جاهز للمشاهدة ✅', labelEn: 'The video is ready to watch ✅', progress: 100 },
] as const;

const PHASE_BY_STATUS = new Map<string, ProcessingPhaseInfo>(
  PROCESSING_PHASES.map((phase) => [phase.status, phase]),
);

/** Index of a status in the ladder (Failed → -1). */
export function processingPhaseIndex(status: ProcessingStatus | null | undefined): number {
  if (!status) return -1;
  const index = PROCESSING_PHASES.findIndex((phase) => phase.status === status);
  return index;
}

/** Push 10.8 (1.B) — the rung→market-vocabulary chip text ("المعالجة: HD"). */
const RUNG_LABELS: Record<string, string> = {
  '360p': 'SD',
  '720p': 'HD',
  '1080p': 'FHD',
};

/**
 * Push 10.8 (1.B) — the DYNAMIC timeline: the steps the pipeline will ACTUALLY run,
 * derived from the episode's stored target quality. A concrete target collapses the
 * ladder to exactly one rung (P360 → [Pending, Transcoding_360p (SD), Ready]; Auto
 * keeps the full five-step machine). Steps that will never run are not shown.
 */
export function processingPhasesFor(targetQuality: TargetQuality | string | null | undefined): ProcessingPhaseInfo[] {
  const rungStatus = targetQuality === 'P360'
    ? 'Transcoding_360p'
    : targetQuality === 'P720'
      ? 'Transcoding_720p'
      : targetQuality === 'P1080'
        ? 'Transcoding_1080p'
        : null;
  if (!rungStatus || !PHASE_BY_STATUS.has(rungStatus)) return [...PROCESSING_PHASES];

  const rung = PHASE_BY_STATUS.get(rungStatus)!;
  // One rung carries the whole encode: the bar passes the halfway mark mid-encode
  // instead of ⅓/⅔ shares of the never-shown upper rungs.
  const single: ProcessingPhaseInfo = { ...rung, progress: 60 };
  return [PROCESSING_PHASES[0], single, PROCESSING_PHASES[4]];
}

/** Display info for a status; `undefined` status → null (caller decides). */
export function processingPhase(status: ProcessingStatus | null | undefined): ProcessingPhaseInfo | null {
  if (!status) return null;
  return PHASE_BY_STATUS.get(status) ?? null;
}

/** Non-terminal statuses — the poller keeps polling while any is present. */
export function isProcessingActive(status: ProcessingStatus | null | undefined): boolean {
  return status === 'Pending'
    || status === 'Transcoding_360p'
    || status === 'Transcoding_720p'
    || status === 'Transcoding_1080p';
}

/** Short chip label for the episode list row (bilingual). */
export function processingChipLabel(status: ProcessingStatus | null | undefined, isArabic: boolean): string | null {
  if (status === 'Failed') return isArabic ? 'فشلت المعالجة' : 'Processing failed';
  const phase = processingPhase(status);
  if (!phase) return null;
  if (status === 'Ready') return isArabic ? 'جاهز' : 'Ready';
  // Compact rung label for the row chip: "المعالجة: HD" (10.8 market vocabulary).
  const rung = phase.status.startsWith('Transcoding_') ? phase.status.replace('Transcoding_', '') : '...';
  const rungLabel = RUNG_LABELS[rung] ?? rung;
  return isArabic ? `المعالجة: ${rungLabel}` : `Processing: ${rungLabel}`;
}

/* ============ target quality (Push 10.7 — Auto/P360/P720/P1080) ============ */

/** The backend enum's raw member names (JsonStringEnumConverter, no policy). */
export type TargetQuality = 'Auto' | 'P360' | 'P720' | 'P1080';

export const TARGET_QUALITY_OPTIONS: readonly { value: TargetQuality; labelAr: string; labelEn: string }[] = [
  // Task-book labels (10.8 vocabulary): Auto is recommended; the concrete rungs are
  // one rendition each (memory-friendly on the transcoding host).
  { value: 'Auto', labelAr: 'تلقائي (موصى به)', labelEn: 'Auto (recommended)' },
  { value: 'P1080', labelAr: 'عالية (FHD)', labelEn: 'High (FHD)' },
  { value: 'P720', labelAr: 'متوسطة (HD)', labelEn: 'Medium (HD)' },
  { value: 'P360', labelAr: 'منخفضة (SD)', labelEn: 'Low (SD)' },
];

/**
 * Accepts the API's enum strings ("Auto"|"P360"|"P720"|"P1080") or an unknown
 * value; anything unrecognised (or null/absent — legacy rows) reads as Auto.
 */
export function normalizeTargetQuality(raw: string | number | null | undefined): TargetQuality {
  if (raw === null || raw === undefined) return 'Auto';
  const key = String(raw);
  return key === 'P360' || key === 'P720' || key === 'P1080' ? key : 'Auto';
}

/** The rung height a quality target implies (Auto imposes no ceiling). */
export function targetQualityHeight(quality: TargetQuality): number | null {
  if (quality === 'P1080') return 1080;
  if (quality === 'P720') return 720;
  if (quality === 'P360') return 360;
  return null;
}

/** Push 10.7 (2.C) — the task-book warning sentence (exact). */
export const TARGET_QUALITY_DOWNGRADE_WARNING_AR =
  'الفيديو المرفوع دقته أقل، سيتم اعتماد الدقة الأقل تلقائياً لتجنب التكبير.';
export const TARGET_QUALITY_DOWNGRADE_WARNING_EN =
  'The uploaded video has a lower resolution; the closest lower quality will be applied automatically to avoid upscaling.';

/**
 * Push 10.7 (2.C) — best-effort client-side resolution probe: loads the file's
 * metadata in a detached <video> element and reports the DISPLAY dimensions
 * (the browser applies rotation — the same semantics the backend probe uses).
 * null = not a video / metadata unreadable; the backend handles those gracefully.
 */
export function probeVideoResolution(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|mkv|m4v|avi)$/i.test(file.name)) {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    const done = (result: { width: number; height: number } | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      resolve(result);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const { videoWidth, videoHeight } = video;
      done(videoWidth > 0 && videoHeight > 0 ? { width: videoWidth, height: videoHeight } : null);
    };
    video.onerror = () => done(null);
    // Safety net: some container/codec combos never fire metadata events.
    window.setTimeout(() => done(null), 8000);
    video.src = url;
  });
}

/* ============ difficulty (Easy=0 / Medium=1 / Hard=2) ============ */

export type DifficultyValue = 0 | 1 | 2;

export const DIFFICULTY_OPTIONS: readonly { value: DifficultyValue; labelAr: string; labelEn: string }[] = [
  { value: 0, labelAr: 'سهل', labelEn: 'Easy' },
  { value: 1, labelAr: 'متوسط', labelEn: 'Medium' },
  { value: 2, labelAr: 'صعب', labelEn: 'Hard' },
];

/**
 * Accepts the numeric value this UI sends (0|1|2) OR the API's enum strings
 * ("Easy"|"Medium"|"Hard" — JsonStringEnumConverter without a naming policy).
 * null → not provided (badge hidden, form defaults to Easy).
 */
export function normalizeDifficulty(raw: number | string | null | undefined): DifficultyValue | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    return raw === 0 || raw === 1 || raw === 2 ? raw : null;
  }
  const key = String(raw).trim().toLowerCase();
  if (key === 'easy') return 0;
  if (key === 'medium') return 1;
  if (key === 'hard') return 2;
  const numeric = Number(key);
  return numeric === 0 || numeric === 1 || numeric === 2 ? numeric : null;
}

export function difficultyLabel(value: DifficultyValue | null | undefined, isArabic: boolean): string {
  if (value === null || value === undefined) return '';
  const option = DIFFICULTY_OPTIONS.find((option) => option.value === value);
  return option ? (isArabic ? option.labelAr : option.labelEn) : '';
}

/** Badge classes matching the center's statusBadge pattern (light theme). */
export function difficultyBadgeClass(value: DifficultyValue): string {
  if (value === 0) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (value === 1) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-red-700 bg-red-50 border-red-200';
}

/* ============ upload stat formatting (1.B human numbers) ============ */

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—';
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
  return `${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s`;
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds < 60) return `~${Math.max(1, Math.round(seconds))} ث`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `~${minutes}:${String(rest).padStart(2, '0')} دقيقة`;
}
