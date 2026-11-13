import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * SubjectModalContext — Wave 14.3 PR #1 («نافذة المادة»).
 *
 * App-wide state for the subject quick-actions sheet: any Subject card can
 * open it without prop drilling and without window globals. The provider
 * mounts once in App.tsx (inside BrowserRouter, around AppRoutes) and
 * <SubjectModal /> consumes it to render the mobile BottomSheet.
 */

/** The minimum subject identity the sheet needs to build its action links. */
export type SubjectForModal = {
  id: string;
  slug: string;
  nameAr: string;
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

const SubjectModalContext = createContext<SubjectModalApi | null>(null);

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

export function SubjectModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SubjectModalState>({ isOpen: false, subject: null });

  const api = useMemo<SubjectModalApi>(
    () => ({
      openSubjectModal: (subject) => setState({ isOpen: true, subject }),
      closeSubjectModal: () => setState({ isOpen: false, subject: null }),
      state,
    }),
    [state],
  );

  return <SubjectModalContext.Provider value={api}>{children}</SubjectModalContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- spec (Wave 14.3 PR #1) pins provider + hook in ONE context file; the codebase's split-file alternative (see useAuth.ts) would deviate from the approved deliverable list.
export function useSubjectModal(): SubjectModalApi {
  return useContext(SubjectModalContext) ?? noopSubjectModalApi;
}
