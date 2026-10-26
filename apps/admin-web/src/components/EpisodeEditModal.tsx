import { useState } from 'react';
import { LoaderCircle, Save } from 'lucide-react';
import { apiRequest, type CourseEpisode } from '../lib/api';
import { normalizeDifficulty, normalizeTargetQuality } from '../lib/mediaProcessing';
import { AccessibleModal } from './AccessibleModal';
import { EpisodeMetadataFields, type EpisodeMetadataValues } from './EpisodeMetadataFields';

/**
 * Push 10.4 (1.A) — the episode edit modal.
 *
 * Opens from the pencil action on every episode row. Edits:
 *  - Title (≤200), Description (≤1000), Difficulty (0|1|2) — the 10.4
 *    metadata surface
 *  - Episode number + duration seconds — the fields today's update endpoint
 *    already accepts
 *  - Transcoding target (Auto/P360/P720/P1080) — Push 10.7: applies on the
 *    NEXT encode (recovery-sweep re-run or future re-queue); an already-Ready
 *    episode keeps its existing HLS tree until re-encoded
 *
 * Submit → PUT /api/v1/admin/courses/episodes/{id} with the full payload
 * (title, episodeNumber, durationSeconds, description, difficulty,
 * targetQuality). The metadata keys are additive: the current API ignores
 * unknown JSON members, so the request is forward-compatible with the backend
 * DTO wiring without changing any behavior today.
 */

export interface EpisodeEditModalProps {
  episode: CourseEpisode;
  token: string;
  isArabic: boolean;
  onClose: () => void;
  onSaved: (notice: string) => void;
  /** Structured failures bubble to the parent's ProcessingErrorModal. */
  onStructuredError: (error: { humanMessage?: string; technicalDetails?: string; message: string }) => void;
}

export function EpisodeEditModal({ episode, token, isArabic, onClose, onSaved, onStructuredError }: EpisodeEditModalProps) {
  const [values, setValues] = useState<EpisodeMetadataValues>({
    title: episode.title ?? '',
    description: episode.description ?? '',
    difficulty: normalizeDifficulty(episode.difficulty) ?? 0,
    targetQuality: normalizeTargetQuality(episode.targetQuality),
  });
  const [episodeNumber, setEpisodeNumber] = useState(String(episode.episodeNumber ?? 1));
  const [duration, setDuration] = useState(episode.durationSeconds != null ? String(episode.durationSeconds) : '');
  const [titleInvalid, setTitleInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  /* Push 10.7 — the target dropdown only applies to uploaded video episodes
   * (the pipeline never runs for YouTube embeds or audio uploads). */
  const isVideoEpisode = episode.sourceType === 'Upload'
    && !!episode.contentType?.toLowerCase().startsWith('video/');

  const patch = (p: Partial<EpisodeMetadataValues>) => {
    if ('title' in p && p.title !== undefined && p.title.trim().length > 0) setTitleInvalid(false);
    setValues((v) => ({ ...v, ...p }));
  };

  const submit = async () => {
    if (!values.title.trim()) {
      setTitleInvalid(true);
      return;
    }
    if (!episodeNumber.trim() || !Number.isFinite(Number(episodeNumber))) return;
    setBusy(true);
    try {
      await apiRequest(`/api/v1/admin/courses/episodes/${episode.id}`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: values.title.trim(),
          episodeNumber: Number(episodeNumber),
          durationSeconds: duration.trim() ? Number(duration) : null,
          description: values.description.trim() || null,
          difficulty: values.difficulty,
          targetQuality: values.targetQuality,
        }),
      });
      onSaved(isArabic ? 'تم حفظ بيانات الحلقة.' : 'Episode updated.');
      onClose();
    } catch (error) {
      // Route the structured payload (humanMessage/technicalDetails) to the
      // dual-language modal; plain failures keep the generic message.
      const apiError = error as { humanMessage?: string; technicalDetails?: string; message?: string };
      onStructuredError({
        humanMessage: apiError.humanMessage,
        technicalDetails: apiError.technicalDetails,
        message: error instanceof Error ? error.message : (isArabic ? 'فشل حفظ التعديلات.' : 'Failed to update episode.'),
      });
    } finally {
      setBusy(false);
    }
  };

  const copy = isArabic ? {
    number: 'رقم الحلقة',
    duration: 'المدة (ثانية، اختياري)',
    save: 'حفظ التعديلات',
    cancel: 'إلغاء',
    heading: 'تعديل بيانات الحلقة',
    sub: 'العنوان والوصف ومستوى الصعوبة يظهرون للطالب في صفحة المشغّل',
  } : {
    number: 'Episode number',
    duration: 'Duration (seconds, optional)',
    save: 'Save changes',
    cancel: 'Cancel',
    heading: 'Edit episode',
    sub: 'Title, description and difficulty are shown to the student on the player page',
  };

  return (
    <AccessibleModal
      open
      onOpenChange={(open) => { if (!open && !busy) onClose(); }}
      isArabic={isArabic}
      dismissGuard={busy}
      maxWidth="max-w-xl"
      testId="episode-edit-modal"
      title={copy.heading}
      description={copy.sub}
    >
      <div className="space-y-4 px-5 py-5">
        <EpisodeMetadataFields
          values={values}
          onChange={patch}
          isArabic={isArabic}
          disabled={busy}
          titleInvalid={titleInvalid}
          layout="rows"
          testIdPrefix="episode-edit"
          showQuality={isVideoEpisode}
        />

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label htmlFor="episode-edit-number" className="mb-1 block text-xs font-medium" style={{ color: 'var(--cms-text-soft)' }}>
              {copy.number}
            </label>
            <input
              id="episode-edit-number"
              value={episodeNumber}
              disabled={busy}
              inputMode="numeric"
              onChange={(e) => setEpisodeNumber(e.target.value)}
              data-testid="episode-edit-number"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
              style={{ borderColor: 'var(--cms-line-strong)' }}
            />
          </div>
          <div>
            <label htmlFor="episode-edit-duration" className="mb-1 block text-xs font-medium" style={{ color: 'var(--cms-text-soft)' }}>
              {copy.duration}
            </label>
            <input
              id="episode-edit-duration"
              value={duration}
              disabled={busy}
              inputMode="numeric"
              onChange={(e) => setDuration(e.target.value)}
              data-testid="episode-edit-duration"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
              style={{ borderColor: 'var(--cms-line-strong)' }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4" style={{ borderColor: 'var(--cms-line)' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-50 disabled:opacity-50"
            style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            data-testid="episode-edit-save"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50"
            style={{ background: 'var(--cms-teal-700)' }}
          >
            {busy
              ? <LoaderCircle className="w-4 h-4 animate-spin" strokeWidth={2} />
              : <Save className="w-4 h-4" strokeWidth={2} />}
            {copy.save}
          </button>
        </div>
      </div>
    </AccessibleModal>
  );
}
