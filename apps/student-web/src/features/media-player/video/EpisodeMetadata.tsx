import { useState } from 'react';
import { useId } from 'react';
import { ChevronDown, Clock, Eye } from 'lucide-react';
import { cn } from '@/utils';
import { formatMediaDuration } from './time';

/**
 * Push 10.4 — episode metadata card for the PlayerShell.
 *
 * Shows under the player, inside the shell's dark stage:
 *  - Title (prominent, h2)
 *  - Difficulty badge — سهل (green) / متوسط (yellow) / صعب (red)
 *  - Duration (15:30) + views count
 *  - Description — collapsible past 3 lines ("عرض المزيد" / "عرض أقل")
 *
 * The difficulty arrives as either the API's enum string ("Easy"|"Medium"|"Hard")
 * or the numeric value the admin panel sends (0|1|2) — both normalize.
 *
 * Mobile-first: renders correctly from 375px (badges wrap, description
 * clamps, 44px touch targets on the toggle).
 */

export interface EpisodeMetadataData {
  title: string;
  description?: string | null;
  difficulty?: number | string | null;
  durationSeconds?: number | null;
  viewsCount?: number | null;
}

/** Numeric/enum-string → display tier. null = hidden (not yet provided). */
function difficultyTier(raw: number | string | null | undefined): 0 | 1 | 2 | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    if (raw === 0 || raw === 1 || raw === 2) return raw;
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'easy') return 0;
  if (normalized === 'medium') return 1;
  if (normalized === 'hard') return 2;
  const numeric = Number(normalized);
  return numeric === 0 || numeric === 1 || numeric === 2 ? numeric : null;
}

const DIFFICULTY_META: Record<0 | 1 | 2, { label: string; className: string }> = {
  0: {
    label: 'سهل',
    className: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  },
  1: {
    label: 'متوسط',
    className: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  },
  2: {
    label: 'صعب',
    className: 'border-red-400/30 bg-red-400/10 text-red-300',
  },
};

function formatViews(views: number): string {
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}م`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(views >= 10_000 ? 0 : 1)}ألف`;
  return String(views);
}

export function EpisodeMetadata({ metadata, testId = 'episode-metadata' }: {
  metadata: EpisodeMetadataData;
  testId?: string;
}) {
  const { title, description, difficulty, durationSeconds, viewsCount } = metadata;
  const [expanded, setExpanded] = useState(false);
  const descriptionId = useId();
  const tier = difficultyTier(difficulty);
  const hasDescription = Boolean(description && description.trim().length > 0);

  return (
    <section
      data-testid={testId}
      aria-labelledby={descriptionId}
      dir="rtl"
      className="w-full max-w-3xl rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-4 sm:px-6 sm:py-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2
          id={descriptionId}
          data-testid="episode-metadata-title"
          className="min-w-0 flex-1 basis-64 text-base font-bold leading-snug text-white sm:text-lg"
        >
          {title}
        </h2>
        {tier !== null && (
          <span
            aria-label={`مستوى الصعوبة: ${DIFFICULTY_META[tier].label}`}
            data-testid="episode-metadata-difficulty"
            data-difficulty={tier}
            className={cn(
              'inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-bold',
              DIFFICULTY_META[tier].className,
            )}
          >
            {DIFFICULTY_META[tier].label}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-400 sm:text-sm">
        {typeof durationSeconds === 'number' && durationSeconds > 0 && (
          <span className="inline-flex items-center gap-1.5" data-testid="episode-metadata-duration">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            <span dir="ltr">{formatMediaDuration(durationSeconds)}</span>
          </span>
        )}
        {typeof viewsCount === 'number' && viewsCount >= 0 && (
          <span className="inline-flex items-center gap-1.5" data-testid="episode-metadata-views">
            <Eye className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {formatViews(viewsCount)} مشاهدة
          </span>
        )}
      </div>

      {hasDescription && (
        <div className="mt-3 border-t border-white/5 pt-3">
          <p
            data-testid="episode-metadata-description"
            className={cn(
              'text-sm leading-7 text-slate-300/90',
              !expanded && 'line-clamp-3',
            )}
          >
            {description}
          </p>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls={descriptionId}
            data-testid="episode-metadata-toggle"
            className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm font-medium text-teal-300 transition-colors hover:text-teal-200"
          >
            {expanded ? 'عرض أقل' : 'عرض المزيد'}
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')}
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        </div>
      )}
    </section>
  );
}
