import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';

export interface FavoriteItem {
  favoriteId: string;
  targetType: 'question' | 'file';
  targetId: string;
  subjectId: string;
  title: string;
  subtitle?: string | null;
  meta: string;
  createdAt: string;
}

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

  answer: async (questionId: string, selectedOptionId: string, durationSeconds: number) => {
    const res = await apiClient.post(`/questions/${questionId}/answer`, {
      selectedOptionId, durationSeconds, isOffline: false,
    }, await entitlementRequestConfig());
    return res.data;
  },

  report: async (questionId: string, reasonType: string, description: string) => {
    await apiClient.post(`/questions/${questionId}/report`, { reasonType, description }, await entitlementRequestConfig());
  },

  getFavorites: async (): Promise<FavoriteItem[]> => {
    const res = await apiClient.get('/favorites', await entitlementRequestConfig());
    return res.data;
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
