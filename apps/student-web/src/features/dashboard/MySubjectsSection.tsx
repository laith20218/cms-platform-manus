import { Link } from 'react-router-dom';
import { useMySubjects, hasScope, type MySubjectEntry } from '@/features/my-studies/hooks/useMySubjects';
import { useSubjectModal } from '@/features/subjects/SubjectModalContext';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * MySubjectsSection — Wave 14.3 PR #2 («موادي»).
 *
 * One compact chip per ENTITLED subject (useMySubjects — the same
 * ['my-subjects-entitled'] cache every My Studies tab reads), rendered at the
 * top of the Dashboard. New students see their subjects here even with zero
 * attempts: the «التقدّم حسب المادة» grid below is attempt-driven and stays a
 * progress view. Each chip opens the shared scope-gated SubjectModal
 * (PR #1/#1.5) so every subject on the Dashboard is actionable — same
 * destinations and gating as the subjects browser quick-actions:
 *   content: always · exams: QuestionsExams · library: LecturesText||VideoAudio
 *   · courses: VideoAudio.
 *
 * States: loading → 3 skeleton chips; error → inline retry; empty (no active
 * subscription code) → dashed card with the activation CTA (/activate-code).
 */

/** PR #1.5 scope rules, shared with the progress-card buttons in DashboardPage. */
// eslint-disable-next-line react-refresh/only-export-components -- Wave 14.3 PR #2 pins the shared scope mapping next to its primary consumer; duplicating it into DashboardPage would let the two drift (same one-file precedent as SubjectModalContext's provider + hook).
export function scopeForSubject(subject: MySubjectEntry) {
  return {
    content: true,
    exams: hasScope(subject, 'QuestionsExams'),
    library: hasScope(subject, 'LecturesText') || hasScope(subject, 'VideoAudio'),
    courses: hasScope(subject, 'VideoAudio'),
  };
}

export function MySubjectsSection() {
  const mySubjects = useMySubjects();
  const { openSubjectModal } = useSubjectModal();
  const subjects = mySubjects.data ?? [];

  const openSubject = (subject: MySubjectEntry) => {
    openSubjectModal({
      id: subject.id,
      slug: subject.slug,
      nameAr: subject.nameAr,
      scope: scopeForSubject(subject),
    });
  };

  return (
    <section aria-labelledby="my-subjects-heading">
      <div className="mb-4 flex items-center justify-between">
        <h2 id="my-subjects-heading" className="text-lg font-bold text-[var(--c-text)]">موادي</h2>
        <Link to="/subjects" className="text-sm font-semibold text-[var(--c-primary-700)]">تصفح المواد</Link>
      </div>

      {mySubjects.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          <Skeleton className="h-11 rounded-2xl" />
          <Skeleton className="h-11 rounded-2xl" />
          <Skeleton className="h-11 rounded-2xl" />
        </div>
      ) : mySubjects.isError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
          <p className="text-sm text-[var(--c-text-muted)]">تعذر تحميل موادك</p>
          <button
            type="button"
            onClick={() => mySubjects.refetch()}
            className="press min-h-11 rounded-xl bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : subjects.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-surface)] p-5 text-sm">
          <p className="text-[var(--c-text-muted)]">لم تفعّل أي مادة بعد</p>
          <Link
            to="/activate-code"
            className="press inline-flex min-h-11 items-center rounded-xl bg-[var(--c-primary-700)] px-4 py-2 text-sm font-bold text-white transition-colors"
          >
            تفعيل كود
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {subjects.map((subject) => (
            <button
              key={subject.id}
              type="button"
              onClick={() => openSubject(subject)}
              aria-label={`خيارات المادة ${subject.nameAr}`}
              data-testid={`my-subject-chip-${subject.id}`}
              className="press flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-3 text-start transition-colors hover:bg-[var(--c-bg-hover)]"
            >
              {subject.color && (
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: subject.color }} />
              )}
              <span className="truncate font-semibold text-[var(--c-text)]">{subject.nameAr}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
