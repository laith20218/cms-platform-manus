import { ChevronLeft } from 'lucide-react';
import { hasScope, type MySubjectEntry } from '@/features/my-studies/hooks/useMySubjects';
import { useSubjectModal } from './SubjectModalContext';

/**
 * MuwadiCard — W15.3.3 «موادي» tab.
 *
 * A compact entitled-subject row card: color dot + name on the start side, a
 * «فتح» pill on the end side. The whole card is one button that opens the
 * SHARED subject BottomSheet (Wave 14.3 PR #1.5) — the same sheet the card
 * "…" trigger uses on /subjects — with the student's real content scopes
 * gating its actions (no scope passed = all actions, per the modal contract).
 * No navigation on click: the sheet owns the destinations.
 */
export function MuwadiCard({ subject }: { subject: MySubjectEntry }) {
  const { openSubjectModal } = useSubjectModal();
  const scope = {
    content: true,
    exams: hasScope(subject, 'QuestionsExams'),
    library: hasScope(subject, 'LecturesText') || hasScope(subject, 'VideoAudio'),
    courses: hasScope(subject, 'VideoAudio'),
  };

  return (
    <button
      type="button"
      data-testid={`muwadi-card-${subject.id}`}
      onClick={() => openSubjectModal({
        id: subject.id,
        slug: subject.slug,
        nameAr: subject.nameAr,
        scope,
      })}
      aria-label={`فتح مادة ${subject.nameAr}`}
      className="press flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4 text-start transition-colors hover:bg-[var(--c-bg-hover)]"
    >
      <div className="flex min-w-0 items-center gap-3">
        {subject.color && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: subject.color }}
          />
        )}
        <span className="truncate font-semibold text-[var(--c-text)]">
          {subject.nameAr}
        </span>
      </div>
      <span className="inline-flex items-center gap-1 rounded-xl bg-[var(--c-primary-50)] px-3 py-1.5 text-xs font-bold text-[var(--c-primary-700)] shrink-0">
        فتح
        <ChevronLeft className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}
