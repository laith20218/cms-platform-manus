import { memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AudioLines, FileCode, FileText, Film, HelpCircle, Image as ImageIcon,
  ListChecks, Loader2, Play, Trash2, Video,
} from 'lucide-react';
import { cn } from '@/utils';
import type { FavoriteItem } from '../types';

/** Push 11.3 — the enriched favorites card. One card per saved item: thumbnail (or type
 *  placeholder), title, context subtitle, type chip, duration, processing badge, progress
 *  bar (when the server joined a PlaybackProgress row), and the actions: متابعة (episodes
 *  with progress — product decision #3), فتح, and the optimistic delete X.
 *
 *  Accessibility: the card is a static article with INDEPENDENT action buttons (chosen
 *  over making the whole card a button — nested semantics stay clean and every action is
 *  individually keyboard-reachable). All targets are ≥ 44px, labels are Arabic.
 */

const fileTypeConfig: Record<string, { icon: typeof FileText; label: string; color: string; bg: string }> = {
  pdf: { icon: FileText, label: 'PDF', color: 'var(--c-danger-500)', bg: 'var(--c-danger-50)' },
  html: { icon: FileCode, label: 'HTML', color: 'var(--c-primary-700)', bg: 'var(--c-primary-50)' },
  image: { icon: ImageIcon, label: 'صورة', color: 'var(--c-info-500)', bg: 'var(--c-info-50)' },
  video: { icon: Video, label: 'فيديو', color: 'var(--c-warning-500)', bg: 'var(--c-warning-50)' },
  audio: { icon: AudioLines, label: 'صوت', color: 'var(--c-info-500)', bg: 'var(--c-info-50)' },
};

function typeChip(item: FavoriteItem): { icon: typeof FileText; label: string; color: string; bg: string } {
  if (item.targetType === 'question') return { icon: ListChecks, label: 'سؤال', color: 'var(--c-primary-700)', bg: 'var(--c-primary-50)' };
  if (item.targetType === 'episode') return fileTypeConfig[item.fileType === 'audio' ? 'audio' : 'video'];
  return fileTypeConfig[item.fileType ?? ''] ?? { icon: FileText, label: 'ملف', color: 'var(--c-primary-700)', bg: 'var(--c-primary-50)' };
}

function formatDuration(totalSeconds: number | null): string | null {
  if (totalSeconds == null || totalSeconds <= 0) return null;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const two = (value: number) => value.toString().padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`;
}

function processingBadge(item: FavoriteItem): { label: string; className: string } | null {
  const status = item.processingStatus?.toLowerCase();
  if (item.targetType !== 'episode' && item.targetType !== 'file') return null;
  if (status === 'pending' || status?.startsWith('transcoding'))
    return { label: 'قيد المعالجة', className: 'bg-[var(--c-warning-50)] text-[var(--c-warning-500)]' };
  if (status === 'failed')
    return { label: 'تعذر المعالجة', className: 'bg-[var(--c-danger-50)] text-[var(--c-danger-500)]' };
  return null;
}

export interface FavoriteCardProps {
  item: FavoriteItem;
  onDelete: (item: FavoriteItem) => void;
  deletePending: boolean;
}

export const FavoriteCard = memo(function FavoriteCard({ item, onDelete, deletePending }: FavoriteCardProps) {
  const navigate = useNavigate();
  const chip = typeChip(item);
  const ChipIcon = chip.icon;
  const duration = formatDuration(item.durationSeconds);
  const badge = processingBadge(item);
  const canContinue = item.targetType === 'episode' && item.progress !== null && item.courseId !== null;
  const progressPercent = item.progress?.completionPercent ?? null;

  const openEpisode = () => {
    if (item.courseId) navigate(`/my-studies/courses/${item.courseId}?episode=${item.targetId}`);
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      data-testid={`favorite-card-${item.targetType}`}
      className="group relative flex gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-3 shadow-sm transition-shadow hover:shadow-md sm:gap-4 sm:p-4"
    >
      {/* Thumbnail — episode: course cover fallback (decision #2); file: own thumbnail;
          question: type placeholder. */}
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[var(--c-bg)] sm:h-28 sm:w-28">
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt={`غلاف ${item.title}`}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
        ) : null}
        {!item.thumbnailUrl && (
          <span className="flex h-full w-full items-center justify-center" style={{ color: chip.color, background: chip.bg }}>
            {item.targetType === 'question'
              ? <HelpCircle className="h-9 w-9" strokeWidth={1.5} />
              : <ChipIcon className="h-9 w-9" strokeWidth={1.5} />}
          </span>
        )}
        {duration && (
          <span className="absolute bottom-1 left-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white" dir="ltr">
            {duration}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
            style={{ color: chip.color, background: chip.bg }}
          >
            <ChipIcon className="h-3 w-3" />
            {chip.label}
          </span>
          {badge && (
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold', badge.className)}>
              <Loader2 className="h-3 w-3 animate-spin" />
              {badge.label}
            </span>
          )}
        </div>

        <h3 className="line-clamp-2 text-sm font-bold leading-6 text-[var(--c-text)] sm:text-base" title={item.title}>
          {item.title}
        </h3>

        {item.subtitle && (
          <p className="line-clamp-1 text-xs text-[var(--c-text-muted)]">{item.subtitle}</p>
        )}

        {progressPercent != null && item.progress && (
          <div
            role="progressbar"
            aria-label="آخر مشاهدة"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPercent)}
            className="mt-auto h-1.5 w-full overflow-hidden rounded-full bg-[var(--c-bg-hover)]"
          >
            <div
              className="h-full rounded-full bg-[var(--c-primary-600)]"
              style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
            />
          </div>
        )}

        {/* Actions — متابعة (episodes with progress, decision #3) + فتح. Questions have
            no deep-linkable route in 11.3 (subject-slug based), so no open button. */}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {item.targetType === 'episode' && item.courseId && (
            <button
              type="button"
              onClick={openEpisode}
              disabled={badge !== null}
              data-testid={canContinue ? 'favorite-continue' : 'favorite-open'}
              aria-label={canContinue ? `متابعة ${item.title}` : `فتح ${item.title}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 py-1.5 text-sm font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary-500)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: 'var(--c-primary-700)' }}
            >
              {canContinue
                ? <><Play className="h-4 w-4" fill="currentColor" /> متابعة</>
                : <><Film className="h-4 w-4" /> فتح الحلقة</>}
            </button>
          )}
          {item.targetType === 'file' && (
            <Link
              to="/my-studies?tab=library"
              data-testid="favorite-open"
              aria-label={`فتح ${item.title} في المكتبة`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--c-border-strong)] px-4 py-1.5 text-sm font-semibold text-[var(--c-text-soft)] transition-colors hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary-500)]"
            >
              <FileText className="h-4 w-4" />
              فتح في المكتبة
            </Link>
          )}
        </div>
      </div>

      {/* Delete — top-left (the far corner from the RTL thumbnail side). */}
      <button
        type="button"
        onClick={() => onDelete(item)}
        disabled={deletePending}
        aria-label={`إزالة ${item.title} من المفضلة`}
        data-testid="favorite-delete"
        className="absolute left-2 top-2 flex h-11 w-11 items-center justify-center rounded-xl text-[var(--c-text-faint)] transition-colors hover:bg-[var(--c-danger-50)] hover:text-[var(--c-danger-500)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-danger-500)] disabled:opacity-40"
      >
        {deletePending
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Trash2 className="h-4 w-4" />}
      </button>
    </motion.article>
  );
});
