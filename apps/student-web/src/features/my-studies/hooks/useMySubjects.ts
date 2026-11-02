import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';

/**
 * A subject entry as returned by GET /subjects/my-subjects — the subjects the
 * student holds an ACTIVE grant for (any content scope). An empty list means
 * the student has no active subscription code at all.
 */
export interface MySubjectEntry {
  id: string;
  slug: string;
  nameAr: string;
  color?: string | null;
  /** Content scopes the student holds: QuestionsExams / LecturesText / VideoAudio. */
  contentScopes?: string[] | null;
}

/**
 * Shared catalog query: the student's entitled subjects. All My Studies tabs
 * (courses / exams / library) and the subjects browser use this as the
 * entitlement signal — an empty list switches the UI into the locked state.
 */
export function useMySubjects() {
  return useQuery({
    queryKey: ['my-subjects-entitled'],
    staleTime: 60_000,
    queryFn: async (): Promise<MySubjectEntry[]> => {
      // R69 — GET /subjects/my-subjects is JWT-authorised only (AcademicController
      // runs no X-Entitlement validation on it). Requesting an entitlement token
      // here made the whole My Studies shell throw once POST /entitlements/issue
      // started returning 403 for zero-grant students (R69 §2.B guard) — turning
      // the truthful "locked" state into a false connection error. The subjects
      // list must resolve so every tab can render its own locked state.
      const res = await apiClient.get('/subjects/my-subjects');
      const list = res.data?.items ?? res.data ?? [];
      return Array.isArray(list) ? list : [];
    },
  });
}

export function hasScope(subject: MySubjectEntry, scope: 'QuestionsExams' | 'LecturesText' | 'VideoAudio'): boolean {
  return (subject.contentScopes ?? []).includes(scope);
}
