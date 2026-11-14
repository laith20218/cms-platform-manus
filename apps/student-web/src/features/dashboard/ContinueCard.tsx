import { useMySubjects, type MySubjectEntry } from '@/features/my-studies/hooks/useMySubjects';
import { useSubjectModal } from '@/features/subjects/SubjectModalContext';
import type { StudentStats } from '@/features/stats/services/stats-api';
import { scopeForSubject } from './MySubjectsSection';

/** A /stats/me bySubject row for one subject. */
type SubjectProgress = StudentStats['bySubject'][number];

/**
 * ContinueCard — Wave 15.2 (D3): the gradient «تابع من حيث توقفت» hero.
 *
 * Picks the highest-completion entitled subject (bySubject ∩ my-subjects);
 * with zero attempts it falls back to the first entitled subject in
 * "start" mode («ابدأ الدراسة»); with no entitled subjects at all the card
 * hides. The CTA opens the shared scope-gated SubjectModal — the same sheet
 * the «موادي» cards open — scoped to the picked subject.
 *
 * D4: the gradient is inline Tailwind arbitrary values over existing
 * tokens (globals.css grad-* tokens are flat by design and untouched).
 */
export function ContinueCard({ bySubject }: { bySubject: StudentStats['bySubject'] }) {
  const mySubjects = useMySubjects();
  const { openSubjectModal } = useSubjectModal();

  if (mySubjects.isLoading) {
    return <div className="h-32 rounded-2xl animate-pulse bg-[var(--c-bg-hover)]" />;
  }

  const entitled = bySubject.filter((row) => mySubjects.data?.some((m) => m.id === row.subjectId));

  let candidate: { subject: MySubjectEntry; progress?: SubjectProgress } | null = null;
  if (entitled.length > 0) {
    const top = entitled.reduce((a, b) => (b.completedPercentage > a.completedPercentage ? b : a));
    const subject = mySubjects.data!.find((m) => m.id === top.subjectId)!;
    candidate = { subject, progress: top };
  } else if (mySubjects.data && mySubjects.data.length > 0) {
    candidate = { subject: mySubjects.data[0], progress: undefined };
  }

  if (!candidate) return null; // no entitled subjects → hide the card

  const { subject, progress } = candidate;

  return (
    <section
      data-testid="dashboard-continue-card"
      className="rounded-2xl p-6 shadow-lg text-white bg-gradient-to-l from-[var(--c-primary-600)] to-[var(--c-primary-700)]"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium opacity-90 mb-1">
            {progress ? 'تابع من حيث توقفت' : 'ابدأ الدراسة'}
          </div>
          <h2 className="text-xl font-bold truncate">{subject.nameAr}</h2>
          <p className="mt-1 text-sm opacity-90">
            {progress
              ? `${Math.round(progress.completedPercentage)}% مكتمل • ${progress.questionsAnswered} سؤال مجاب`
              : 'لم تبدأ بعد'}
          </p>
        </div>
        <button
          type="button"
          data-testid="dashboard-continue-cta"
          onClick={() =>
            openSubjectModal({
              id: subject.id,
              slug: subject.slug,
              nameAr: subject.nameAr,
              scope: scopeForSubject(subject),
            })
          }
          className="press shrink-0 h-11 px-6 rounded-xl bg-white text-[var(--c-primary-700)] font-bold text-sm hover:bg-white/95 transition"
        >
          {progress ? 'أكمل الدراسة' : 'ابدأ الآن'}
        </button>
      </div>
    </section>
  );
}
