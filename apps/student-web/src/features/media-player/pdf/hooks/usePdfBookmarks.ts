import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { libraryApi } from '@/features/library/services/library-api';
import {
  BOOKMARKS_MIGRATED_FLAG,
  isBookmarked,
  orderBookmarks,
  readLegacyBookmarks,
  removeLegacyBookmarks,
  type PageBookmark,
} from '../pdf-bookmarks';

/**
 * Wave 12.5.B — server-persisted PDF page bookmarks (ported from localStorage).
 *
 * Cache design mirrors favorites/hooks.ts: the list lives under
 * ['pdf-bookmarks', fileId]; BOTH mutations are optimistic (onMutate snapshot →
 * setQueryData → onError rollback + toast) so add/remove stays INSTANT like the
 * old localStorage toggle, while the server confirms underneath.
 *
 * Concurrency model (the pending-add race, handled): both mutations resolve the
 * row against SERVER truth (a fresh GET) before POST/DELETE — a remove that races
 * an in-flight add finds the row id server-side or discovers it doesn't exist yet,
 * so no optimistic row can be resurrected by a late reconcile.
 *
 * One-time legacy import (supervisor Q2): on the first successful GET, any
 * `cms:pdf:bookmarks:<fileId>` key left by the pre-12.5 client is read, POSTed
 * page-by-page (idempotent via the server's unique (student, file, page) triple),
 * and the key is removed. Keys are PER-FILE and only removed after a successful
 * import, so a device with several documents migrates each one on its first open
 * (a single global flag can't gate this without silently dropping the other
 * documents' bookmarks). The BOOKMARKS_MIGRATED_FLAG marker records that this
 * device completed a migration at least once. A failed import keeps the key —
 * the next mount retries; nothing is lost locally.
 */

function toPageBookmarks(rows: Array<{ id: string; pageNumber: number; snippet?: string | null; createdAt: string }>): PageBookmark[] {
  return rows.map((row) => ({
    id: row.id,
    page: row.pageNumber,
    addedAt: row.createdAt,
    ...(row.snippet ? { snippet: row.snippet } : {}),
  }));
}

export function usePdfBookmarks(fileId: string) {
  const queryClient = useQueryClient();
  const listKey = useMemo(() => ['pdf-bookmarks', fileId] as const, [fileId]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: listKey,
    enabled: !!fileId,
    staleTime: 60_000,
    queryFn: async (): Promise<PageBookmark[]> => {
      const serverRows = await libraryApi.getBookmarks(fileId);

      // One-time legacy import — see the module docblock. Best-effort: a failed
      // import keeps the legacy key for the next mount and the (server) list
      // still renders; the import never blocks the player.
      const legacy = readLegacyBookmarks(fileId);
      if (legacy.length > 0) {
        try {
          const imported: PageBookmark[] = [];
          for (const entry of legacy) {
            const created = await libraryApi.addBookmark(fileId, entry.page, entry.snippet);
            imported.push(...toPageBookmarks([created]));
          }
          removeLegacyBookmarks(fileId);
          try {
            window.localStorage.setItem(BOOKMARKS_MIGRATED_FLAG, new Date().toISOString());
          } catch {
            /* marker is informational; the per-file key removal above is the real contract */
          }
          return orderBookmarks([...toPageBookmarks(serverRows), ...imported]);
        } catch {
          // keep the legacy key; retry on the next mount (never blocks the list)
        }
      }

      return orderBookmarks(toPageBookmarks(serverRows));
    },
  });

  const bookmarks = useMemo(() => data ?? [], [data]);

  /** Shared optimistic machinery: snapshot → mutate cache → rollback on error. */
  const applyOptimistic = useCallback(
    async (next: PageBookmark[]) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<PageBookmark[]>(listKey) ?? [];
      queryClient.setQueryData<PageBookmark[]>(listKey, orderBookmarks(next));
      return previous;
    },
    [queryClient, listKey],
  );

  const rollback = useCallback(
    (previous: PageBookmark[]) => {
      queryClient.setQueryData<PageBookmark[]>(listKey, orderBookmarks(previous));
      toast.error('تعذر حفظ العلامة المرجعية. تحقق من اتصالك وحاول مجددًا.');
    },
    [queryClient, listKey],
  );

  /**
   * Toggle one page (the `pdf-bookmark-add` rail button). Optimistically flips the
   * row instantly, then resolves against server truth: removes when the server has
   * the page, adds when it doesn't.
   */
  const toggleMutation = useMutation({
    mutationFn: async ({ page, snippet }: { page: number; snippet?: string }) => {
      const serverRows = await libraryApi.getBookmarks(fileId);
      const existing = serverRows.find((row) => row.pageNumber === page);
      if (existing) {
        await libraryApi.deleteBookmark(existing.id);
        return { page, removed: true as const };
      }
      const created = await libraryApi.addBookmark(fileId, page, snippet);
      return { page, removed: false as const, row: toPageBookmarks([created])[0] };
    },
    onMutate: async ({ page, snippet }) => {
      const previous = await applyOptimistic(
        isBookmarked(bookmarks, page)
          ? bookmarks.filter((b) => b.page !== page)
          : [...bookmarks, { page, addedAt: new Date().toISOString(), ...(snippet ? { snippet } : {}) }],
      );
      return { previous };
    },
    onSuccess: (result) => {
      // Reconcile the optimistic row with its server identity (id) as soon as the
      // POST lands — the pending-add race stays honest without waiting for the
      // onSettled refetch.
      if (!result.removed) {
        queryClient.setQueryData<PageBookmark[]>(
          listKey,
          orderBookmarks([...(queryClient.getQueryData<PageBookmark[]>(listKey) ?? []).filter((b) => b.page !== result.page), result.row]),
        );
      }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) rollback(context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  /** Remove one page's row (the StudyListsPanel per-row button). */
  const removeMutation = useMutation({
    mutationFn: async (page: number) => {
      const serverRows = await libraryApi.getBookmarks(fileId);
      const existing = serverRows.find((row) => row.pageNumber === page);
      if (!existing) return { page, removed: true as const }; // already gone server-side
      await libraryApi.deleteBookmark(existing.id);
      return { page, removed: true as const };
    },
    onMutate: async (page) => {
      const previous = await applyOptimistic(bookmarks.filter((b) => b.page !== page));
      return { previous };
    },
    onError: (_error, _page, context) => {
      if (context?.previous) rollback(context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  const toggle = useCallback(
    (page: number, snippet?: string) => toggleMutation.mutate({ page, snippet }),
    [toggleMutation],
  );
  const remove = useCallback((page: number) => removeMutation.mutate(page), [removeMutation]);
  const has = useCallback((page: number) => isBookmarked(bookmarks, page), [bookmarks]);

  return { bookmarks, toggle, remove, has, isLoading, isError, refetch };
}
