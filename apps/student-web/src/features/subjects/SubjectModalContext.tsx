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
  const context = useContext(SubjectModalContext);
  if (!context) {
    throw new Error('useSubjectModal must be used within <SubjectModalProvider>');
  }
  return context;
}
