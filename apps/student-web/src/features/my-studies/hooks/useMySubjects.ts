import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';

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
      const config = await entitlementRequestConfig();
      const res = await apiClient.get('/subjects/my-subjects', config);
      const list = res.data?.items ?? res.data ?? [];
      return Array.isArray(list) ? list : [];
    },
  });
}

export function hasScope(subject: MySubjectEntry, scope: 'QuestionsExams' | 'LecturesText' | 'VideoAudio'): boolean {
  return (subject.contentScopes ?? []).includes(scope);
}
