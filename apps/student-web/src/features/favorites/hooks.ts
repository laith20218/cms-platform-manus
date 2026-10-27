import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { favoritesApi } from './api';
import type { FavoriteItem, FavoriteListParams, PagedFavorites } from './types';

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
