/** W14.3 Phase A (D4) — shared academic context, URL-persisted.
 *
 * Single source of truth for the academic hierarchy selection
 * (university → college → year → semester → subject). The selection lives
 * in the URL query string (`?univ=…&college=…&year=…&semester=…&subject=…`)
 * via react-router's `useSearchParams`, so:
 *   • navigating between centers (Questions / Exams / Academic / ExamCourses)
 *     preserves the context — every consumer hydrates from the same URL;
 *   • a browser refresh or a shared link restores the exact work context;
 *   • the back button behaves like a filter undo (writes use history `replace`
 *     to keep one entry per screen, not one per keystroke).
 *
 * Downstream-reset semantics match the legacy per-center cascade: picking a
 * university clears college/year/semester/subject, picking a college clears
 * year/semester/subject, and so on. List *fetching* stays in each center —
 * this hook owns only the selection state.
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/** URL parameter names (short, stable, human-readable in the address bar). */
export const ACADEMIC_URL_PARAMS = {
  universityId: 'univ',
  collegeId: 'college',
  yearId: 'year',
  semesterId: 'semester',
  subjectId: 'subject',
} as const;

/** The five selection ids, as plain strings ('' = nothing selected). */
export type AcademicContextIds = {
  universityId: string;
  collegeId: string;
  yearId: string;
  semesterId: string;
  subjectId: string;
};

export type AcademicContextApi = AcademicContextIds & {
  /** Select a university — clears everything below it. */
  chooseUniversity: (id: string) => void;
  /** Select a college — clears year/semester/subject. */
  chooseCollege: (id: string) => void;
  /** Select a year — clears semester/subject. */
  chooseYear: (id: string) => void;
  /** Select a semester — clears subject. */
  chooseSemester: (id: string) => void;
  /** Select a subject — keeps the whole chain. */
  chooseSubject: (id: string) => void;
  /** Bulk-merge ids into the URL without downstream clearing
   * (hydration from legacy storage, deep links, programmatic jumps). */
  hydrate: (ids: Partial<AcademicContextIds>) => void;
  /** Remove every academic parameter from the URL. */
  clear: () => void;
};

function readIds(params: URLSearchParams): AcademicContextIds {
  const read = (key: string) => params.get(key) ?? '';
  return {
    universityId: read(ACADEMIC_URL_PARAMS.universityId),
    collegeId: read(ACADEMIC_URL_PARAMS.collegeId),
    yearId: read(ACADEMIC_URL_PARAMS.yearId),
    semesterId: read(ACADEMIC_URL_PARAMS.semesterId),
    subjectId: read(ACADEMIC_URL_PARAMS.subjectId),
  };
}

/** Merge `ids` into a params object, dropping empty values to keep the URL clean. */
function mergeIds(previous: URLSearchParams, ids: Partial<AcademicContextIds>): URLSearchParams {
  const merged: AcademicContextIds = { ...readIds(previous), ...ids };
  const next = new URLSearchParams(previous);
  for (const [field, key] of Object.entries(ACADEMIC_URL_PARAMS)) {
    const value = merged[field as keyof AcademicContextIds];
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return next;
}

/** Extract just the five ids from an {@link AcademicContextApi} value
 * (spread keeps the function fields — always use this for hydration snapshots). */
export function academicIdsOf(context: AcademicContextApi): AcademicContextIds {
  return {
    universityId: context.universityId,
    collegeId: context.collegeId,
    yearId: context.yearId,
    semesterId: context.semesterId,
    subjectId: context.subjectId,
  };
}

/** W14.3 D4 — read/write the shared academic context in the URL query string. */
export function useAcademicContext(): AcademicContextApi {
  const [params, setParams] = useSearchParams();

  const ids = useMemo(() => readIds(params), [params]);

  const write = useCallback((updates: Partial<AcademicContextIds>) => {
    setParams(previous => mergeIds(previous, updates), { replace: true });
  }, [setParams]);

  const chooseUniversity = useCallback((id: string) => (
    write({ universityId: id, collegeId: '', yearId: '', semesterId: '', subjectId: '' })
  ), [write]);
  const chooseCollege = useCallback((id: string) => (
    write({ collegeId: id, yearId: '', semesterId: '', subjectId: '' })
  ), [write]);
  const chooseYear = useCallback((id: string) => (
    write({ yearId: id, semesterId: '', subjectId: '' })
  ), [write]);
  const chooseSemester = useCallback((id: string) => (
    write({ semesterId: id, subjectId: '' })
  ), [write]);
  const chooseSubject = useCallback((id: string) => write({ subjectId: id }), [write]);
  const hydrate = useCallback((partial: Partial<AcademicContextIds>) => write(partial), [write]);
  const clear = useCallback(() => (
    write({ universityId: '', collegeId: '', yearId: '', semesterId: '', subjectId: '' })
  ), [write]);

  return useMemo(() => ({
    ...ids,
    chooseUniversity,
    chooseCollege,
    chooseYear,
    chooseSemester,
    chooseSubject,
    hydrate,
    clear,
  }), [ids, chooseUniversity, chooseCollege, chooseYear, chooseSemester, chooseSubject, hydrate, clear]);
}
