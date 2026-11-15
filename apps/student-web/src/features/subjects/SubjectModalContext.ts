import { createContext, useContext } from 'react';

/**
 * SubjectModalContext — Wave 14.3 PR #1 («نافذة المادة»), split (Wave 15.5b
 * DEBT-ESLINT-01) into a pure context+hook module matching the auth-context/
 * useAuth pattern in src/app/providers/.
 *
 * App-wide state for the subject quick-actions sheet: any Subject card can
 * open it without prop drilling and without window globals. The provider
 * mounts once in App.tsx (inside BrowserRouter, around AppRoutes) and
 * <SubjectModal /> consumes it to render the mobile BottomSheet.
 */

/**
 * Per-action entitlements for the quick-actions sheet. Mirrors SubjectCard's
 * desktop quick-actions gates (SubjectsPage): an action renders in the sheet
 * only when its flag is true. Kept optional on SubjectForModal — a subject
 * passed without scope renders every action (backward-compatible default).
 */
export type SubjectActionScope = {
  content: boolean;
  exams: boolean;
  library: boolean;
  courses: boolean;
};

/** The minimum subject identity the sheet needs to build its action links. */
export type SubjectForModal = {
  id: string;
  slug: string;
  nameAr: string;
  /** Optional per-action entitlements; when omitted the sheet renders all actions. */
  scope?: SubjectActionScope;
};

export type SubjectModalState = {
  isOpen: boolean;
  subject: SubjectForModal | null;
};

export type SubjectModalApi = {
  openSubjectModal: (subject: SubjectForModal) => void;
  closeSubjectModal: () => void;
  state: SubjectModalState;
};

export const SubjectModalContext = createContext<SubjectModalApi | null>(null);

/**
 * No-op fallback for consumers rendered OUTSIDE the provider (isolated test
 * renders of SubjectsPage, future Storybook-style stories). Matches the
 * codebase's tolerant-context precedent (usePlayerShell returns null rather
 * than throwing). In the real app the provider is always mounted (App.tsx),
 * so this default only ever fires in isolation — where a silent no-op is the
 * least surprising behavior for an optional affordance like the "…" trigger.
 */
const noopSubjectModalApi: SubjectModalApi = {
  openSubjectModal: () => {},
  closeSubjectModal: () => {},
  state: { isOpen: false, subject: null },
};

export function useSubjectModal(): SubjectModalApi {
  return useContext(SubjectModalContext) ?? noopSubjectModalApi;
}
