import type { DifficultyValue, TargetQuality } from '../lib/mediaProcessing';
import { DIFFICULTY_OPTIONS, TARGET_QUALITY_OPTIONS } from '../lib/mediaProcessing';

/**
 * Push 10.4 (1.A) — the episode metadata form block, shared by the multipart
 * upload panel and the episode edit modal:
 *
 *  - Title — required, ≤200 chars, live counter
 *  - Description — optional, ≤1000 chars, live counter
 *  - Difficulty — select (سهل / متوسط / صعب → Easy=0 / Medium=1 / Hard=2),
 *    defaulted to Easy (the column's DB default)
 *
 * Constraints mirror the Push 10.3 schema caps (CourseEpisode.Description ≤
 * 1000; Title ≤ 200) — the API remains the validator of record; these are
 * the honest client-side mirrors so the field never ships a payload the
 * server must reject.
 *
 * RTL: a native <select> inside the RTL section — option order is logical
 * (سهل first), the closed control renders right-aligned like every other
 * input in the center. (admin-web carries no Radix Select and the 10.4
 * lockfile exception is hls.js-only — the native select is the faithful
 * stand-in, keyboard/screen-reader accessible by construction.)
 *
 * Push 10.7 — the block gained the transcoding target dropdown (جودة المعالجة:
 * تلقائي / عالية 1080p / متوسطة 720p / منخفضة 360p) in the same native-select
 * pattern. `showQuality` hides it where it is meaningless (audio uploads,
 * YouTube episodes); the resolution-downgrade warning is the CALLER's concern
 * (only the upload panel knows the file's probed resolution).
 */

export interface EpisodeMetadataValues {
  title: string;
  description: string;
  difficulty: DifficultyValue;
  targetQuality: TargetQuality;
}

export interface EpisodeMetadataFieldsProps {
  values: EpisodeMetadataValues;
  onChange: (patch: Partial<EpisodeMetadataValues>) => void;
  isArabic: boolean;
  disabled?: boolean;
  /** Title required — invalid state outline + hint (validated on submit). */
  titleInvalid?: boolean;
  /** Compact row variant for the upload panel grid (title + difficulty one row). */
  layout?: 'stacked' | 'rows';
  testIdPrefix?: string;
  /** Push 10.7 — render the transcoding-target dropdown (hidden for audio/
   * YouTube assets where the pipeline never applies). Default: true. */
  showQuality?: boolean;
}

export const EPISODE_TITLE_MAX = 200;
export const EPISODE_DESCRIPTION_MAX = 1000;

export function EpisodeMetadataFields({
  values,
  onChange,
  isArabic,
  disabled = false,
  titleInvalid = false,
  layout = 'stacked',
  testIdPrefix = 'episode-metadata',
  showQuality = true,
}: EpisodeMetadataFieldsProps) {
  const copy = isArabic ? {
    titleLabel: 'عنوان الحلقة',
    titleLabelEn: 'Episode title',
    descriptionLabel: 'الوصف (اختياري)',
    difficultyLabel: 'مستوى الصعوبة',
    qualityLabel: 'جودة المعالجة',
    titleRequired: 'العنوان مطلوب',
    counter: (n: number, max: number) => `${n}/${max}`,
  } : {
    titleLabel: 'Episode title',
    titleLabelEn: 'Episode title',
    descriptionLabel: 'Description (optional)',
    difficultyLabel: 'Difficulty',
    qualityLabel: 'Processing quality',
    titleRequired: 'Title is required',
    counter: (n: number, max: number) => `${n}/${max}`,
  };

  const titleId = `${testIdPrefix}-title`;
  const descriptionId = `${testIdPrefix}-description`;
  const difficultyId = `${testIdPrefix}-difficulty`;
  const qualityId = `${testIdPrefix}-target-quality`;

  return (
    <div className={layout === 'rows' ? 'grid gap-2 md:grid-cols-2' : 'space-y-2'}>
      <div>
        <label htmlFor={titleId} className="mb-1 flex items-center justify-between text-xs font-medium" style={{ color: 'var(--cms-text-soft)' }}>
          <span>
            {copy.titleLabel}
            <span aria-hidden="true" className="ms-0.5" style={{ color: 'var(--cms-red-500)' }}>*</span>
          </span>
          <span className="tabular-nums" style={{ color: 'var(--cms-text-muted)' }}>
            {copy.counter(values.title.trim().length, EPISODE_TITLE_MAX)}
          </span>
        </label>
        <input
          id={titleId}
          value={values.title}
          disabled={disabled}
          maxLength={EPISODE_TITLE_MAX}
          aria-required="true"
          aria-invalid={titleInvalid || undefined}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder={isArabic ? copy.titleLabel : copy.titleLabelEn}
          data-testid={titleId}
          className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
          style={{ borderColor: titleInvalid ? 'var(--cms-red-400, #f87171)' : 'var(--cms-line-strong)' }}
        />
        {titleInvalid && (
          <p className="mt-1 text-xs" style={{ color: 'var(--cms-red-600)' }}>{copy.titleRequired}</p>
        )}
      </div>

      <div>
        <label htmlFor={difficultyId} className="mb-1 block text-xs font-medium" style={{ color: 'var(--cms-text-soft)' }}>
          {copy.difficultyLabel}
        </label>
        <select
          id={difficultyId}
          value={values.difficulty}
          disabled={disabled}
          onChange={(e) => onChange({ difficulty: Number(e.target.value) as DifficultyValue })}
          data-testid={difficultyId}
          className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
          style={{ borderColor: 'var(--cms-line-strong)' }}
        >
          {DIFFICULTY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {isArabic ? option.labelAr : option.labelEn}
            </option>
          ))}
        </select>
      </div>

      {showQuality && (
        <div className={layout === 'rows' ? 'md:col-span-2' : undefined}>
          <label htmlFor={qualityId} className="mb-1 block text-xs font-medium" style={{ color: 'var(--cms-text-soft)' }}>
            {copy.qualityLabel}
          </label>
          <select
            id={qualityId}
            value={values.targetQuality}
            disabled={disabled}
            onChange={(e) => onChange({ targetQuality: e.target.value as TargetQuality })}
            data-testid={qualityId}
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
            style={{ borderColor: 'var(--cms-line-strong)' }}
          >
            {TARGET_QUALITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {isArabic ? option.labelAr : option.labelEn}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={layout === 'rows' ? 'md:col-span-2' : undefined}>
        <label htmlFor={descriptionId} className="mb-1 flex items-center justify-between text-xs font-medium" style={{ color: 'var(--cms-text-soft)' }}>
          <span>{copy.descriptionLabel}</span>
          <span className="tabular-nums" style={{ color: 'var(--cms-text-muted)' }}>
            {copy.counter(values.description.trim().length, EPISODE_DESCRIPTION_MAX)}
          </span>
        </label>
        <textarea
          id={descriptionId}
          value={values.description}
          disabled={disabled}
          rows={layout === 'rows' ? 3 : 4}
          maxLength={EPISODE_DESCRIPTION_MAX}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={isArabic
            ? 'وصف مختصر لمحتوى الحلقة — يظهر للطالب أسفل المشغّل'
            : 'A short description of the episode — shown to the student under the player'}
          data-testid={descriptionId}
          className="w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
          style={{ borderColor: 'var(--cms-line-strong)' }}
        />
      </div>
    </div>
  );
}
