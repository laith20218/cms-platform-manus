import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';

// Push 11.3: the favorites LIST surface moved to features/favorites (typed + paged);
// this client keeps only the question-side save/remove toggle used by QuestionPage.
// W16.2b: getRandom joins — the bank's training builder draw (16.2a C3-1 endpoint).

/** One drawn question as returned by GET /questions/random — the QuestionPreviewDto
 * (student view: options/images carry NO correctness flags). */
export interface RandomQuestion {
  id: string;
  text: string;
  type: string;
  difficulty: string;
  tags: string[];
  options: { id: string; letter: string; text: string; imageUrl?: string | null }[];
  images: { imageUrl: string; altText?: string | null; sortOrder: number }[];
}

/** The draw parameters — every narrowing after Count is optional. */
export interface RandomQuestionsParams {
  subjectId: string;
  count: number;
  lectureIds?: string[];
  paragraphTags?: string[];
  semesterCourseId?: string;
}

export const questionApi = {
  /** W16.2 (C3-1): random-N draw for the training builder. The query string is
   *  built explicitly (repeated keys) — axios's default array serializer would
   *  emit `lectureIds[]=` keys the API's List<Guid> binder can't read. */
  getRandom: async (params: RandomQuestionsParams): Promise<RandomQuestion[]> => {
    const qs = new URLSearchParams();
    qs.set('subjectId', params.subjectId);
    qs.set('count', String(params.count));
    for (const id of params.lectureIds ?? []) qs.append('lectureIds', id);
    for (const tag of params.paragraphTags ?? []) qs.append('paragraphTags', tag);
    if (params.semesterCourseId) qs.set('semesterCourseId', params.semesterCourseId);
    const res = await apiClient.get(`/questions/random?${qs.toString()}`, await entitlementRequestConfig());
    const list = res.data;
    return Array.isArray(list) ? list : [];
  },

  getByLecture: async (lectureId: string) => {
    const config = await entitlementRequestConfig();
    const res = await apiClient.get(`/questions`, { ...config, params: { lectureId } });
    return res.data;
  },

  getById: async (id: string) => {
    const res = await apiClient.get(`/questions/${id}`, await entitlementRequestConfig());
    return res.data;
  },

  answer: async (questionId: string, answer: { selectedOptionId?: string; answerText?: string }, durationSeconds: number) => {
    const res = await apiClient.post(`/questions/${questionId}/answer`, {
      selectedOptionId: answer.selectedOptionId ?? null,
      answerText: answer.answerText ?? null,
      durationSeconds,
      isOffline: false,
    }, await entitlementRequestConfig());
    return res.data;
  },

  report: async (questionId: string, reasonType: string, description: string) => {
    await apiClient.post(`/questions/${questionId}/report`, { reasonType, description }, await entitlementRequestConfig());
  },

  toggleFavorite: async (questionId: string, isFavorite: boolean) => {
    const config = await entitlementRequestConfig();
    if (isFavorite) {
      await apiClient.delete(`/favorites/questions/${questionId}`, config);
    } else {
      await apiClient.post('/favorites', { questionId }, config);
    }
  },
};
