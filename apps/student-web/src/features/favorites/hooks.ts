import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { favoriteListsApi, favoritesApi } from './api';
import type {
  CreateFavoriteListPayload,
  FavoriteItem,
  FavoriteListParams,
  FavoriteListQuestionsParams,
  FavoriteListSummary,
  PagedFavorites,
} from './types';

/**
 * Push 11.3 — favorites data hooks.
 *
 * Cache design: the list key is ['favorites', 'list', params] so every
 * parameterization is cached independently; ALL mutations invalidate the
 * ['favorites'] PREFIX (covers the parameterized lists AND any legacy
 * ['favorites'] entries from the pre-11.3 page), so a save in the player or the
 * question view is reflected on the next favorites-page mount even within the
 * app's 5-minute global staleTime (the 11.2-DIAG H1 root cause).
 */

export function useFavoritesList(params: FavoriteListParams) {
  return useQuery({
    queryKey: ['favorites', 'list', params],
    queryFn: () => favoritesApi.listFavorites(params),
    placeholderData: (previous) => previous, // keeps the grid mounted across page/filter transitions
  });
}

export function useCreateEpisodeFavorite(episodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => favoritesApi.createEpisodeFavorite(episodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
    onError: () => {
      toast.error('تعذّر تحديث المفضلة، حاول مجددًا');
    },
  });
}

export function useDeleteFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (item: Pick<FavoriteItem, 'targetType' | 'targetId'>) =>
      favoritesApi.deleteFavorite(item.targetType, item.targetId),

    // Optimistic removal: the card disappears instantly; the server confirms or the
    // snapshot is restored with a toast. Cancelling in-flight list fetches first
    // prevents a stale refetch from overwriting the optimistic state.
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] });
      const snapshots = queryClient.getQueriesData<PagedFavorites>({ queryKey: ['favorites', 'list'] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        queryClient.setQueryData<PagedFavorites>(key, {
          ...data,
          items: data.items.filter(candidate => !(candidate.targetType === item.targetType && candidate.targetId === item.targetId)),
          total: Math.max(0, data.total - 1),
        });
      }
      return { snapshots };
    },

    onError: (_error, _item, context) => {
      if (context?.snapshots) {
        for (const [key, data] of context.snapshots) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error('تعذّر إزالة العنصر من المفضلة', {
        description: 'تحقق من اتصالك واستحقاقك ثم أعد المحاولة.',
      });
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}

// ===== W15.0 — custom favorites lists (named question collections) =====
// Cache design: the lists key is ['favorites', 'lists', questionId ?? null] so the
// chips row (no questionId) and the QuestionPage picker (with questionId — resolves
// membership flags server-side) cache independently; membership mutations optimistically
// patch EVERY ['favorites', 'lists', *] copy, then settle through the ['favorites']
// prefix invalidation (same convention as the flat hooks above).

export function useFavoriteLists(questionId?: string) {
  return useQuery({
    queryKey: ['favorites', 'lists', questionId ?? null],
    queryFn: () => favoriteListsApi.listLists(questionId),
  });
}

export function useQuestionsInFavoriteList(params: FavoriteListQuestionsParams | null) {
  return useQuery({
    queryKey: ['favorites', 'list-questions', params],
    queryFn: () => favoriteListsApi.listQuestionsInList(params!),
    enabled: params !== null,
    placeholderData: (previous) => previous, // keeps the grid mounted across page transitions
  });
}

// ===== W19.2 (D-32) — the reading-queue sheet's accumulate-on-demand pages =====

/** The reading sheet fetches list questions in 100-row pages and accumulates. */
export const READING_QUEUE_PAGE_SIZE = 100;

/**
 * The old sheet rode the per-page ['favorites','list-questions'] query whose
 * data REPLACES each page: past 100 rows the numbering restarted, the stepper
 * index pointed into the wrong page, and the remaining-count math broke. This
 * infinite query accumulates pages into one flat sequentially-numbered queue.
 *
 * Keyed ['favorites','reading-queue', listId] — deliberately OUTSIDE
 * 'list-questions' so useRemoveQuestionFromFavoriteList's optimistic patch
 * (which writes the paged PagedFavorites shape) can never corrupt the
 * InfiniteData shape; both stay under the ['favorites'] prefix every
 * mutation invalidates on settle.
 */
export function useListReadingQueue(listId: string) {
  return useInfiniteQuery({
    queryKey: ['favorites', 'reading-queue', listId],
    queryFn: ({ pageParam }) =>
      favoriteListsApi.listQuestionsInList({ listId, page: pageParam, pageSize: READING_QUEUE_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length < lastPage.totalPages ? allPages.length + 1 : undefined,
    staleTime: 60_000,
  });
}

export function useCreateFavoriteList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateFavoriteListPayload) => favoriteListsApi.createList(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites', 'lists'] });
    },
    onError: () => {
      toast.error('تعذّر إنشاء القائمة، حاول مجددًا');
    },
  });
}

/** Optimistic membership toggle used by the QuestionPage picker: flips the
 *  containsQuestion flag (picker caches) and the questionsCount (all caches) for the
 *  affected list, rolls back with a toast on failure. */
export function useToggleQuestionInFavoriteList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ listId, questionId, next }: { listId: string; questionId: string; next: boolean }) => {
      if (next) {
        await favoriteListsApi.addQuestionToList(listId, questionId);
      } else {
        await favoriteListsApi.removeQuestionFromList(listId, questionId);
      }
    },

    onMutate: async ({ listId, questionId, next }) => {
      await queryClient.cancelQueries({ queryKey: ['favorites', 'lists'] });
      const snapshots = queryClient.getQueriesData<FavoriteListSummary[]>({ queryKey: ['favorites', 'lists'] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        // key = ['favorites', 'lists', questionId ?? null] — only membership-flag caches
        // queried FOR this question flip containsQuestion; count caches always update.
        const cacheQuestionId = key[2] as string | null | undefined;
        queryClient.setQueryData<FavoriteListSummary[]>(key, data.map((list) =>
          list.id === listId
            ? {
                ...list,
                containsQuestion: cacheQuestionId === questionId ? next : list.containsQuestion,
                questionsCount: Math.max(0, list.questionsCount + (next ? 1 : -1)),
              }
            : list,
        ));
      }
      return { snapshots };
    },

    onError: (_error, _variables, context) => {
      if (context?.snapshots) {
        for (const [key, data] of context.snapshots) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error('تعذّر تحديث القائمة', {
        description: 'تحقق من اتصالك واستحقاقك ثم أعد المحاولة.',
      });
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}

/** Optimistic removal of a question row from the list-scoped browse grid
 *  (FavoritesPage in list mode) — mirrors useDeleteFavorite's card behavior. */
export function useRemoveQuestionFromFavoriteList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listId, questionId }: { listId: string; questionId: string }) =>
      favoriteListsApi.removeQuestionFromList(listId, questionId),

    onMutate: async ({ listId, questionId }) => {
      await queryClient.cancelQueries({ queryKey: ['favorites', 'list-questions'] });
      const snapshots = queryClient.getQueriesData<PagedFavorites>({ queryKey: ['favorites', 'list-questions'] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        const params = key[2] as FavoriteListQuestionsParams | undefined;
        if (params?.listId !== listId) continue;
        queryClient.setQueryData<PagedFavorites>(key, {
          ...data,
          items: data.items.filter((item) => item.targetType !== 'question' || item.targetId !== questionId),
          total: Math.max(0, data.total - 1),
        });
      }
      return { snapshots };
    },

    onError: (_error, _variables, context) => {
      if (context?.snapshots) {
        for (const [key, data] of context.snapshots) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error('تعذّر إزالة السؤال من القائمة', {
        description: 'تحقق من اتصالك واستحقاقك ثم أعد المحاولة.',
      });
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
  });
}
