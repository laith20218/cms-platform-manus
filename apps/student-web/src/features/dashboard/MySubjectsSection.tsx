import { Link } from 'react-router-dom';
import { useMySubjects, hasScope, type MySubjectEntry } from '@/features/my-studies/hooks/useMySubjects';
import { useSubjectModal } from '@/features/subjects/SubjectModalContext';
import { Skeleton } from '@/components/ui/Skeleton';
import type { StudentStats } from '@/features/stats/services/stats-api';

/**
 * MySubjectsSection — Wave 14.3 PR #2 («موادي»), rebuilt in Wave 15.2 (D1/D5).
 *
 * One progress card per ENTITLED subject (useMySubjects — the same
 * ['my-subjects-entitled'] cache every My Studies tab reads), rendered at the
 * top of the Dashboard. New students see their subjects here even with zero
 * attempts: the /stats/me bySubject rows are merged per subjectId (0% until
 * the first attempt). The old «التقدّم حسب المادة» grid was deleted (D5) and
 * non-entitled stats rows no longer render at all (no «غير مفعّلة» badge, D1).
 * Each card opens the shared scope-gated SubjectModal (PR #1/#1.5) so every
 * subject on the Dashboard is actionable — same destinations and gating as
 * the subjects browser quick-actions:
 *   content: always · exams: QuestionsExams · library: LecturesText||VideoAudio
 *   · courses: VideoAudio.
 *
 * States: loading → 3 skeleton cards; error → inline retry; empty (no active
 * subscription code) → dashed card with the activation CTA (/activate-code).
 */

/** PR #1.5 scope rules, shared with ContinueCard (15.2) and the subject sheet. */
// eslint-disable-next-line react-refresh/only-export-components -- Wave 14.3 PR #2 pins the shared scope mapping next to its primary consumer; duplicating it would let consumers drift (same one-file precedent as SubjectModalContext's provider + hook).
export function scopeForSubject(subject: MySubjectEntry) {
  return {
    content: true,
    exams: hasScope(subject, 'QuestionsExams'),
    library: hasScope(subject, 'LecturesText') || hasScope(subject, 'VideoAudio'),
    courses: hasScope(subject, 'VideoAudio'),
  };
}

export function MySubjectsSection({ bySubject }: { bySubject: StudentStats['bySubject'] }) {
  const mySubjects = useMySubjects();
  const { openSubjectModal } = useSubjectModal();
  const subjects = mySubjects.data ?? [];

  // 15.2 (D1): /stats/me progress rows merged onto the entitled subject list.
  const progressById = new Map<string, StudentStats['bySubject'][number]>(
    bySubject.map((row) => [row.subjectId, row]),
  );

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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {subjects.map((subject) => {
            const progress = progressById.get(subject.id);
            const pct = progress ? Math.min(100, progress.completedPercentage) : 0;
            const questions = progress?.questionsAnswered ?? 0;
            const accuracy = progress?.accuracy;

            return (
              <button
                key={subject.id}
                type="button"
                data-testid={`my-subject-card-${subject.id}`}
                onClick={() => openSubject(subject)}
                aria-label={`خيارات المادة ${subject.nameAr}`}
                className="press flex flex-col gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 text-start transition-colors hover:bg-[var(--c-bg-hover)]"
              >
                <div className="flex items-center gap-2">
                  {subject.color && (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: subject.color }} />
                  )}
                  <span className="truncate font-semibold text-[var(--c-text)]">{subject.nameAr}</span>
                </div>
                <div className="flex justify-between text-xs text-[var(--c-text-muted)]">
                  <span>الإكمال</span>
                  <strong className="text-[var(--c-primary-700)]" lang="en">{pct.toFixed(0)}%</strong>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--c-bg)]">
                  <div className="h-full rounded-full bg-[var(--c-primary-700)]" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-[var(--c-text-muted)]">
                  <span lang="en">{questions}</span> سؤال مجاب
                  {accuracy !== undefined && (
                    <> • الدقة: <span lang="en">{accuracy.toFixed(0)}%</span></>
                  )}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
