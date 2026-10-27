import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { Bookmark, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { FavoritesToolbar } from './components/FavoritesToolbar';
import { FavoriteCard } from './components/FavoriteCard';
import { FavoritesSkeleton } from './components/FavoritesSkeleton';
import { FavoritesEmptyState } from './components/FavoritesEmptyState';
import { useFavoritesList, useDeleteFavorite } from './hooks';
import type { FavoriteSort, FavoriteTargetType } from './types';

/** Push 11.3 — the advanced favorites page. ALL list state (type tab, sort, page) lives in
 *  the URL search params (?type=&sort=&page=) — shareable, back-button safe — and feeds
 *  React Query via ['favorites', 'list', params]. Skeleton → per-tab empty state → grid →
 *  pagination; deletes are optimistic with rollback (hooks.ts). Replaces the pre-11.3
 *  features/questions/FavoritesPage (the 11.2-DIAG H1 stale-cache empty page). */

const VALID_TYPES = new Set<FavoriteTargetType>(['question', 'file', 'episode']);
const VALID_SORTS = new Set<FavoriteSort>(['recent', 'oldest', 'alpha']);
const PAGE_SIZE = 20;

function parseTypeParam(raw: string | null): FavoriteTargetType | 'all' {
  const value = (raw ?? '').toLowerCase() as FavoriteTargetType;
  return VALID_TYPES.has(value) ? value : 'all';
}

function parseSortParam(raw: string | null): FavoriteSort {
  const value = (raw ?? '').toLowerCase() as FavoriteSort;
  return VALID_SORTS.has(value) ? value : 'recent';
}

function parsePageParam(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '1', 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

export default function FavoritesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const type = parseTypeParam(searchParams.get('type'));
  const sort = parseSortParam(searchParams.get('sort'));
  const page = parsePageParam(searchParams.get('page'));

  const listParams = { type: type === 'all' ? undefined : type, sort, page, pageSize: PAGE_SIZE };
  const favorites = useFavoritesList(listParams);
  const deleteFavorite = useDeleteFavorite();

  // Keep the URL canonical (params outside the valid domains fall back silently).
  useEffect(() => {
    const next = new URLSearchParams();
    if (type !== 'all') next.set('type', type);
    if (sort !== 'recent') next.set('sort', sort);
    if (page !== 1) next.set('page', String(page));
    const canonical = next.toString();
    if (canonical !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [type, sort, page, searchParams, setSearchParams]);

  const data = favorites.data;
  const totalPages = data?.totalPages ?? 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const updateParams = (patch: { type?: FavoriteTargetType | 'all'; sort?: FavoriteSort; page?: number }) => {
    const next = new URLSearchParams();
    const nextType = patch.type ?? type;
    const nextSort = patch.sort ?? sort;
    const nextPage = patch.page ?? page;
    if (nextType !== 'all') next.set('type', nextType);
    if (nextSort !== 'recent') next.set('sort', nextSort);
    if (nextPage !== 1) next.set('page', String(nextPage));
    setSearchParams(next);
  };

  return (
    <section className="space-y-5 pb-6" aria-label="المفضلة">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-[var(--c-text)]">
          <Bookmark className="h-6 w-6 text-[var(--c-primary-700)]" />
          المفضلة
        </h1>
        <p className="mt-1 text-sm text-[var(--c-text-muted)]">
          أسئلة وملفات وحلقات محفوظة ضمن المواد التي يتيحها استحقاقك الحالي.
        </p>
      </header>

      <FavoritesToolbar
        type={type}
        sort={sort}
        onTypeChange={(nextType) => updateParams({ type: nextType, page: 1 })}
        onSortChange={(nextSort) => updateParams({ sort: nextSort, page: 1 })}
      />

      {favorites.isLoading ? (
        <FavoritesSkeleton />
      ) : favorites.isError ? (
        <div
          role="alert"
          data-testid="favorites-error"
          className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center"
        >
          <h2 className="text-base font-bold text-[var(--c-text)]">تعذر تحميل المفضلة</h2>
          <p className="mt-1.5 text-sm text-[var(--c-text-muted)]">
            تتطلب المفضلة جلسة واستحقاقًا صالحين للمحتوى — تحقق من اتصالك ثم أعد المحاولة.
          </p>
          <button
            type="button"
            onClick={() => favorites.refetch()}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--c-primary-700)] px-6 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary-500)]"
          >
            <RefreshCw className="h-4 w-4" />
            إعادة المحاولة
          </button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <FavoritesEmptyState type={type} />
      ) : (
        <>
          <p className="text-xs font-medium text-[var(--c-text-muted)]" aria-live="polite">
            {data.total} عنصرًا محفوظًا
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {data.items.map((item) => (
                <FavoriteCard
                  key={item.id}
                  item={item}
                  onDelete={(target) => deleteFavorite.mutate(target)}
                  deletePending={deleteFavorite.isPending && deleteFavorite.variables?.targetId === item.targetId}
                />
              ))}
            </AnimatePresence>
          </div>

          {totalPages > 1 && (
            <nav aria-label="تصفح المفضلة" className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => updateParams({ page: page - 1 })}
                disabled={!canPrev}
                aria-label="الصفحة السابقة"
                data-testid="favorites-prev-page"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-soft)] transition-colors hover:bg-[var(--c-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary-500)]"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <span className="text-sm font-semibold text-[var(--c-text-muted)]" dir="ltr" aria-current="page">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => updateParams({ page: page + 1 })}
                disabled={!canNext}
                aria-label="الصفحة التالية"
                data-testid="favorites-next-page"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-soft)] transition-colors hover:bg-[var(--c-bg-hover)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary-500)]"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
