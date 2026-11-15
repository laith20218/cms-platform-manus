import { useMemo, useState, type ReactNode } from 'react';
import { SubjectModalContext, type SubjectModalApi, type SubjectModalState } from './SubjectModalContext';

/**
 * SubjectModalProvider — Wave 14.3 PR #1 («نافذة المادة»). Holds the
 * quick-actions-sheet state; see SubjectModalContext.ts for the contract.
 * Split out (Wave 15.5b DEBT-ESLINT-01) so this file exports only the
 * component and SubjectModalContext.ts only the context + hook.
 */
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
