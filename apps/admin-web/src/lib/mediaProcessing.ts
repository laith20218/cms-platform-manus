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

/** The ladder, in order — exactly the task book's human sentences. */
export const PROCESSING_PHASES: readonly ProcessingPhaseInfo[] = [
  { status: 'Pending', labelAr: 'جاري تجهيز الفيديو في الخادم...', labelEn: 'Preparing the video on the server…', progress: 8 },
  { status: 'Transcoding_360p', labelAr: 'جاري إنشاء نسخة 360p (مناسبة للجوال)...', labelEn: 'Creating the 360p copy (mobile-friendly)…', progress: 32 },
  { status: 'Transcoding_720p', labelAr: 'جاري إنشاء نسخة 720p (جودة عالية)...', labelEn: 'Creating the 720p copy (high quality)…', progress: 58 },
  { status: 'Transcoding_1080p', labelAr: 'جاري إنشاء نسخة 1080p (جودة فائقة)...', labelEn: 'Creating the 1080p copy (ultra quality)…', progress: 84 },
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
  // Compact rung label for the row chip: "المعالجة: 720p"
  const rung = phase.status.startsWith('Transcoding_') ? phase.status.replace('Transcoding_', '') : '...';
  return isArabic ? `المعالجة: ${rung}` : `Processing: ${rung}`;
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
