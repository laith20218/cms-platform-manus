import { Link } from 'react-router-dom';
import { BookOpen, ChevronLeft, Clock } from 'lucide-react';
import type { LectureSummary } from './services/academic-api';

/**
 * W20.1 — the ONE shared lecture card for both lecture-list surfaces:
 * /study «المحتوى» (ContentTab) and /subjects/:slug (SubjectDetailPage).
 * They previously duplicated the same anatomy; the owner's "calmer, lighter
 * lecture list" polish now lands in one place and cannot drift.
 *
 * Calmer hierarchy (no information loss):
 *  - Number badge: soft `--c-primary-50` fill with `--c-primary-700` digits
 *    (same recipe as the study hub's header/scope chrome) instead of the loud
 *    full gradient — the number is context, not the loudest element.
 *  - Title: the card's clearest line (bold, 15px); meta (سؤال / دقيقة) is a
 *    single muted secondary line underneath.
 *  - Primary action is obvious: the whole card stays the open action, with a
 *    trailing chevron affordance on in-progress cards (darkens on hover);
 *    completed cards keep the green «مكتملة» badge.
 *  - Progress bar and completed badge keep their exact semantics.
 */
export function LectureCard({
  lecture,
  href,
  testId,
}: {
  lecture: LectureSummary;
  href: string;
  testId?: string;
}) {
  return (
    <Link
      to={href}
      data-testid={testId}
      className="group block rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 transition-all hover:border-[var(--c-primary-300)] hover:shadow-md"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--c-primary-50)] text-sm font-bold text-[var(--c-primary-700)] transition-colors group-hover:bg-[var(--c-primary-100)]"
          lang="en"
        >
          {lecture.lectureNumber}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-bold text-[var(--c-text)]">{lecture.titleAr}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--c-text-muted)]">
            <span><span lang="en">{lecture.questionsCount}</span> سؤال</span>
            {lecture.durationMinutes != null && lecture.durationMinutes > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden="true" />
                <span lang="en">{lecture.durationMinutes}</span>د
              </span>
            )}
          </p>
        </div>
        {lecture.isCompleted ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--c-success-50)] px-2.5 py-1 text-xs font-bold text-[var(--c-success-700)]">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />مكتملة
          </span>
        ) : (
          <ChevronLeft
            className="h-5 w-5 shrink-0 text-[var(--c-text-faint)] transition-colors group-hover:text-[var(--c-primary-700)]"
            aria-hidden="true"
          />
        )}
      </div>
      {lecture.userProgress !== undefined && !lecture.isCompleted && lecture.questionsCount > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-[var(--c-text-muted)]">تقدّمك</span>
            <span className="font-semibold text-[var(--c-primary-700)]" lang="en">{lecture.userProgress.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--c-bg)]">
            <div className="h-full rounded-full" style={{ width: `${lecture.userProgress}%`, background: 'var(--grad-primary)' }} />
          </div>
        </div>
      )}
    </Link>
  );
}
