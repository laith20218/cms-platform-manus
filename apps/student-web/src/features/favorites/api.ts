import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';
import type { FavoriteListParams, PagedFavorites } from './types';

/**
 * Push 11.3 — favorites API wrappers. Every call rides apiClient (Bearer +
 * X-Installation-Id attached by the request interceptor) plus the auto-renewed
 * X-Entitlement header — exactly the auth surface /api/v1/favorites requires.
 */
export const favoritesApi = {
  listFavorites: async (params: FavoriteListParams): Promise<PagedFavorites> => {
    const res = await apiClient.get<PagedFavorites>('/favorites', {
      ...(await entitlementRequestConfig()),
      params: {
        type: params.type,
        sort: params.sort,
        page: params.page,
        pageSize: params.pageSize,
      },
    });
    return res.data;
  },

  /** Player star button save — 201 fresh / 200 idempotent duplicate. */
  createEpisodeFavorite: async (episodeId: string): Promise<{ id: string }> => {
    const res = await apiClient.post<{ favoriteId: string; targetId: string; targetType: string }>(
      `/favorites/episodes/${episodeId}`,
      undefined,
      await entitlementRequestConfig(),
    );
    return { id: res.data.favoriteId };
  },

  deleteFavorite: async (targetType: 'question' | 'file' | 'episode', targetId: string): Promise<void> => {
    await apiClient.delete(`/favorites/${targetType}/${targetId}`, await entitlementRequestConfig());
  },
};
