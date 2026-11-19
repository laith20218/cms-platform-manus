import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { questionApi } from '../services/question-api';

/**
 * Wave 18.4 (D-30) — the ONE question-favorite toggle, extracted from the two
 * copies that used to live in QuestionPage and PracticePage.
 *
 * Behavior (unchanged from the originals):
 *  • optimistic local override map (survives even when no list cache exists);
 *  • with `flipQueryCaches` (the QuestionPage mode) every cached copy of the
 *    question in ['questions'…] + ['question-detail', id] flips in place too,
 *    and the rollback re-invalidates those caches;
 *  • onSuccess invalidates ['favorites'] so the favorites page reflects the
 *    save on its next mount; errors roll EVERYTHING back with a toast.
 *
 * `isFavorite(questionId, cachedValue)` resolves the effective state
 * (override → cached/seed value).
 */
export function useQuestionFavoriteToggle(options?: { flipQueryCaches?: boolean }) {
  const queryClient = useQueryClient();
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, boolean>>({});
  const flipQueryCaches = options?.flipQueryCaches ?? false;

  const favoriteMutation = useMutation({
    mutationFn: ({ questionId, isFav }: { questionId: string; isFav: boolean }) =>
      questionApi.toggleFavorite(questionId, isFav),
    onMutate: async ({ questionId, isFav }) => {
      const next = !isFav;
      setFavoriteOverrides((prev) => ({ ...prev, [questionId]: next }));

      if (flipQueryCaches) {
        const flip = (entry: unknown): unknown =>
          entry && typeof entry === 'object' && 'id' in entry && (entry as { id?: string }).id === questionId
            ? { ...entry, isFavorite: next }
            : entry;

        queryClient.setQueriesData({ queryKey: ['questions'] }, (data: unknown) => {
          if (!data || typeof data !== 'object') return data;
          if ('items' in data && Array.isArray((data as { items?: unknown[] }).items)) {
            return { ...(data as object), items: ((data as { items: unknown[] }).items).map(flip) };
          }
          return flip(data);
        });
        queryClient.setQueryData(['question-detail', questionId], (data: unknown) => flip(data));
      }

      return { questionId };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      toast.success(variables.isFav ? 'أُزيل السؤال من المفضلة' : 'أُضيف السؤال إلى المفضلة');
    },
    onError: (_error, { questionId: targetId }) => {
      setFavoriteOverrides((prev) => {
        const next = { ...prev };
        delete next[targetId];
        return next;
      });
      if (flipQueryCaches) {
        // Cache rollback: re-flip by refetching the question surfaces.
        queryClient.invalidateQueries({ queryKey: ['questions'] });
        queryClient.invalidateQueries({ queryKey: ['question-detail', targetId] });
      }
      toast.error('تعذّر تحديث المفضلة. تحقق من اتصالك واستحقاقك.');
    },
  });

  const isFavorite = (questionId: string, cachedValue: boolean) =>
    favoriteOverrides[questionId] ?? cachedValue;

  const toggle = (questionId: string, currentIsFavorite: boolean) => {
    favoriteMutation.mutate({ questionId, isFav: currentIsFavorite });
  };

  return {
    favoriteOverrides,
    isFavorite,
    toggle,
    flatPending: favoriteMutation.isPending,
    /** The question id currently in flight (for per-row spinners). */
    pendingQuestionId: favoriteMutation.isPending
      ? (favoriteMutation.variables as { questionId?: string } | undefined)?.questionId ?? null
      : null,
  };
}
