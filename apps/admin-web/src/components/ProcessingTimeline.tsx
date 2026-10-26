import { CheckCircle2, LoaderCircle } from 'lucide-react';
import {
  PROCESSING_PHASES,
  formatEta,
  formatSpeed,
  normalizeTargetQuality,
  processingPhasesFor,
  type ProcessingPhaseInfo,
  type ProcessingStatus,
} from '../lib/mediaProcessing';

/**
 * Push 10.4 (1.B) — the human-readable processing state machine.
 *
 * Two stages, one visual language:
 *
 *  UPLOADING — the multipart stats strip: total size, live speed (MB/s), ETA,
 *  parts progress. The existing retry/pause/resume engine feeds it numbers.
 *
 *  TRANSCODING — the 10.3 pipeline ladder as a phase checklist: each rung
 *  gets the task book's exact Arabic sentence, a check when it's done, a
 *  spinner while it's active, and the shared bar animates to the rung's
 *  target percent (CSS transition — smooth by construction). `Failed` turns
 *  the bar red; `Ready` completes it with the success sentence.
 *
 * Push 10.8 (1.B) — the ladder is DYNAMIC: `targetQuality` collapses it to the
 * steps the pipeline will actually run (P360 → [Pending, SD, Ready]; Auto →
 * the full five steps). A status outside the visible set (legacy stuck rows)
 * falls back to the full ladder so the live phase always renders honestly.
 */

export interface UploadStats {
  uploadedBytes: number;
  totalBytes: number;
  speedBps: number;
  etaSeconds: number;
  /** Hotfix 10.8f — single-PUT uploads have no parts; the parts line renders only
   * for multipart-style callers that still provide a total. */
  completedParts?: number;
  totalParts?: number;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export function ProcessingTimeline({
  stage,
  uploadPercent,
  uploadStats,
  status,
  targetQuality,
  isArabic,
  testId = 'processing-timeline',
}: {
  stage: 'uploading' | 'processing';
  uploadPercent?: number;
  uploadStats?: UploadStats | null;
  status?: ProcessingStatus | null | undefined;
  /** Push 10.8 (1.B) — the stored transcoding target drives the visible steps
   * (P360/P720/P1080 → one rung; Auto/absent → the full ladder). */
  targetQuality?: string | null | undefined;
  isArabic: boolean;
  testId?: string;
}) {
  const failed = status === 'Failed';

  /* Push 10.8 — the dynamic ladder: steps that will not run are never shown.
   * Fallback: a live Transcoding_* status outside the visible set (a legacy row
   * edited to a lower target mid-encode) widens back to the full ladder so the
   * active phase keeps rendering instead of vanishing. */
  const phases: ProcessingPhaseInfo[] = processingPhasesFor(normalizeTargetQuality(targetQuality));
  const visible = status && status.startsWith('Transcoding_') && !phases.some((phase) => phase.status === status)
    ? [...PROCESSING_PHASES]
    : phases;

  const activeIndex = visible.findIndex((phase) => phase.status === status);
  const barPercent = stage === 'uploading'
    ? Math.min(100, Math.max(0, uploadPercent ?? 0))
    : failed ? 100 : (activeIndex >= 0 ? visible[activeIndex].progress : 0);

  return (
    <div data-testid={testId} className="space-y-3">
      {/* ===== Stage 1: multipart upload stats ===== */}
      {stage === 'uploading' && uploadStats && (
        <div className="grid grid-cols-3 gap-2" data-testid="upload-stats">
          <div className="rounded-lg border bg-white px-3 py-2" style={{ borderColor: 'var(--cms-line)' }}>
            <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--cms-text-muted)' }}>
              {isArabic ? 'الحجم' : 'Size'}
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: 'var(--cms-text)' }} data-testid="upload-stat-size">
              {formatBytes(uploadStats.totalBytes)}
            </p>
          </div>
          <div className="rounded-lg border bg-white px-3 py-2" style={{ borderColor: 'var(--cms-line)' }}>
            <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--cms-text-muted)' }}>
              {isArabic ? 'السرعة' : 'Speed'}
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: 'var(--cms-text)' }} data-testid="upload-stat-speed">
              {formatSpeed(uploadStats.speedBps)}
            </p>
          </div>
          <div className="rounded-lg border bg-white px-3 py-2" style={{ borderColor: 'var(--cms-line)' }}>
            <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--cms-text-muted)' }}>
              {isArabic ? 'الوقت المتبقي' : 'ETA'}
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: 'var(--cms-text)' }} data-testid="upload-stat-eta">
              {formatEta(uploadStats.etaSeconds)}
            </p>
          </div>
          {(uploadStats.totalParts != null && uploadStats.totalParts > 0) && (
            <p className="col-span-3 text-xs tabular-nums" style={{ color: 'var(--cms-text-muted)' }} data-testid="upload-stat-parts">
              {isArabic
                ? `${formatBytes(uploadStats.uploadedBytes)} من أصل ${formatBytes(uploadStats.totalBytes)} · ${uploadStats.completedParts ?? 0}/${uploadStats.totalParts} أجزاء`
                : `${formatBytes(uploadStats.uploadedBytes)} of ${formatBytes(uploadStats.totalBytes)} · ${uploadStats.completedParts ?? 0}/${uploadStats.totalParts} parts`}
            </p>
          )}
        </div>
      )}

      {/* ===== Stage 2: transcoding ladder (dynamic — 10.8) ===== */}
      {stage === 'processing' && (
        <ol className="space-y-1.5" data-testid="processing-phases">
          {visible.map((phase, index) => {
            const done = activeIndex > index || (status === 'Ready' && phase.status === 'Ready');
            const active = activeIndex === index;
            return (
              <li
                key={phase.status}
                data-testid={`processing-phase-${phase.status}`}
                data-phase-state={done ? 'done' : active ? 'active' : 'pending'}
                className="flex items-center gap-2.5 text-sm"
                style={{ color: done || active ? 'var(--cms-text)' : 'var(--cms-text-muted)' }}
                aria-current={active ? 'step' : undefined}
              >
                <span className="shrink-0" aria-hidden="true">
                  {done ? (
                    <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--cms-teal-600)' }} strokeWidth={2} />
                  ) : active ? (
                    <LoaderCircle className="w-4 h-4 animate-spin" style={{ color: 'var(--cms-teal-700)' }} strokeWidth={2} />
                  ) : (
                    <span className="block h-4 w-4 rounded-full border" style={{ borderColor: 'var(--cms-line-strong)' }} />
                  )}
                </span>
                <span className={active ? 'font-semibold' : undefined}>
                  {isArabic ? phase.labelAr : phase.labelEn}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {/* ===== The shared animated bar ===== */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs tabular-nums" style={{ color: 'var(--cms-text-soft)' }}>
          <span data-testid="processing-bar-label">
            {stage === 'uploading'
              ? (isArabic ? 'جارٍ رفع الملف…' : 'Uploading the file…')
              : failed
                ? (isArabic ? 'فشلت المعالجة' : 'Processing failed')
                : (isArabic ? 'المعالجة على الخادم' : 'Server-side processing')}
          </span>
          <span data-testid="processing-bar-percent">{Math.round(barPercent)}%</span>
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full"
          style={{ background: 'var(--cms-ivory-100)' }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(barPercent)}
          aria-label={stage === 'uploading' ? (isArabic ? 'تقدم الرفع' : 'Upload progress') : (isArabic ? 'تقدم المعالجة' : 'Processing progress')}
        >
          <div
            data-testid="processing-bar-fill"
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${barPercent}%`,
              background: failed ? 'var(--cms-red-500, #ef4444)' : 'var(--cms-teal-600)',
            }}
          >
            {/* In-flight shimmer — alive while work is happening, calm when done. */}
            {!(stage === 'processing' && (status === 'Ready' || failed)) && (
              <div className="h-full w-full animate-pulse rounded-full bg-white/25" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
