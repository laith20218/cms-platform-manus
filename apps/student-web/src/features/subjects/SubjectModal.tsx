import { Link } from 'react-router-dom';
import { BookOpen, ClipboardCheck, GraduationCap, LibraryBig } from 'lucide-react';
import { BottomSheet } from '@/components/ui/Overlays';
import { useSubjectModal, type SubjectActionScope, type SubjectForModal } from './SubjectModalContext';

/**
 * SubjectModal — Wave 14.3 PR #1 («نافذة المادة»).
 *
 * Mobile action sheet for a Subject card: the "…" trigger (subject-more-trigger
 * in SubjectsPage) opens it with the subject identity. The links mirror the
 * card's desktop quick-actions row 1:1 — same labels, icons and destinations —
 * so mobile and desktop behavior never diverge. Since PR #1.5 each action is
 * also scope-gated like its row counterpart: when the opened subject carries
 * a `scope`, only entitled actions render (no scope = all actions, keeping
 * direct/test renders backward-compatible). Rendered through the shared Radix
 * BottomSheet (portal + focus trap + Escape + backdrop close). Returns null
 * while closed: no DOM, no focus trap.
 */

type SubjectAction = {
  key: keyof SubjectActionScope;
  testId: string;
  label: string;
  icon: typeof BookOpen;
  href: (subject: SubjectForModal) => string;
};

// Same destinations as the card's desktop quick-actions row (SubjectsPage).
// `key` doubles as the scope gate: the sheet renders an action only when the
// subject has no scope or its flag is true — the same conditions the row uses.
const ACTION_DEFINITIONS: SubjectAction[] = [
  { key: 'content', testId: 'subject-action-content', label: 'المحتوى', icon: BookOpen, href: (s) => `/subjects/${s.slug}` },
  { key: 'exams', testId: 'subject-action-exams', label: 'الاختبارات', icon: ClipboardCheck, href: (s) => `/my-studies?subjectId=${s.id}&tab=exams` },
  { key: 'library', testId: 'subject-action-library', label: 'المكتبة', icon: LibraryBig, href: (s) => `/my-studies?subjectId=${s.id}&tab=library` },
  { key: 'courses', testId: 'subject-action-courses', label: 'الكورسات', icon: GraduationCap, href: (s) => `/my-studies?subjectId=${s.id}&tab=courses` },
];

export function SubjectModal() {
  const { state, closeSubjectModal } = useSubjectModal();

  if (!state.isOpen || !state.subject) return null;

  const subject = state.subject;
  const actions = ACTION_DEFINITIONS.filter((a) => !subject.scope || subject.scope[a.key]);

  return (
    <BottomSheet
      open
      onOpenChange={(next) => { if (!next) closeSubjectModal(); }}
      title={subject.nameAr}
      testId="subject-actions-sheet"
    >
      <div className="space-y-1.5 pb-2">
        {actions.map(({ testId, label, icon: Icon, href }) => (
          <Link
            key={testId}
            to={href(subject)}
            onClick={closeSubjectModal}
            data-testid={testId}
            className="press flex min-h-14 w-full items-center gap-3 rounded-2xl border border-transparent bg-[var(--c-bg)] px-4 py-3 text-start transition-all hover:border-[var(--c-primary-200)]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--c-primary-50)]">
              <Icon className="h-[18px] w-[18px] text-[var(--c-primary-700)]" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--c-text)]">{label}</span>
          </Link>
        ))}
      </div>
    </BottomSheet>
  );
}
