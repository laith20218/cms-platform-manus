import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';

// Push 11.3: the favorites LIST surface moved to features/favorites (typed + paged);
// this client keeps only the question-side save/remove toggle used by QuestionPage.

export const questionApi = {
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
