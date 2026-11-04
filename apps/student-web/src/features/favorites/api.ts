import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';
import type {
  CreateFavoriteListPayload,
  FavoriteListParams,
  FavoriteListQuestionsParams,
  FavoriteListSummary,
  PagedFavorites,
  UpdateFavoriteListPayload,
} from './types';

/**
 * Push 11.3 — favorites API wrappers. Every call rides apiClient (Bearer +
 * X-Installation-Id attached by the request interceptor) plus the auto-renewed
 * X-Entitlement header — exactly the auth surface /api/v1/favorites requires.
 *
 * W15.0 — favoriteListsApi adds the custom-lists surface (/favorites/lists).
 * List CRUD is student metadata (no entitlement needed); question-content calls
 * (add/remove/browse) carry the entitlement config like the flat family.
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

export const favoriteListsApi = {
  /** Lists + counts; ?questionId= resolves per-list membership flags (the picker). */
  listLists: async (questionId?: string): Promise<FavoriteListSummary[]> => {
    const res = await apiClient.get<FavoriteListSummary[]>('/favorites/lists', {
      params: questionId ? { questionId } : undefined,
    });
    return res.data;
  },

  createList: async (payload: CreateFavoriteListPayload): Promise<{ id: string; name: string }> => {
    const res = await apiClient.post<{ id: string; name: string }>('/favorites/lists', {
      name: payload.name,
      description: payload.description ?? null,
      color: payload.color ?? null,
    });
    return res.data;
  },

  updateList: async (listId: string, payload: UpdateFavoriteListPayload): Promise<{ id: string; name: string }> => {
    const res = await apiClient.put<{ id: string; name: string }>(`/favorites/lists/${listId}`, {
      name: payload.name ?? null,
      description: payload.description ?? null,
      color: payload.color ?? null,
    });
    return res.data;
  },

  deleteList: async (listId: string): Promise<void> => {
    await apiClient.delete(`/favorites/lists/${listId}`);
  },

  addQuestionToList: async (listId: string, questionId: string): Promise<{ listId: string; questionId: string; isNew: boolean }> => {
    const res = await apiClient.post<{ listId: string; questionId: string; isNew: boolean }>(
      `/favorites/lists/${listId}/questions/${questionId}`,
      undefined,
      await entitlementRequestConfig(),
    );
    return res.data;
  },

  removeQuestionFromList: async (listId: string, questionId: string): Promise<void> => {
    await apiClient.delete(`/favorites/lists/${listId}/questions/${questionId}`, await entitlementRequestConfig());
  },

  /** Paged questions inside one list — same FavoriteItem card shape as flat favorites. */
  listQuestionsInList: async (params: FavoriteListQuestionsParams): Promise<PagedFavorites> => {
    const res = await apiClient.get<PagedFavorites>(`/favorites/lists/${params.listId}/questions`, {
      ...(await entitlementRequestConfig()),
      params: {
        search: params.search,
        page: params.page,
        pageSize: params.pageSize,
      },
    });
    return res.data;
  },
};
