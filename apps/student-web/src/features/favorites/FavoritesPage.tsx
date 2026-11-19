import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { BookOpenCheck, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { FavoritesToolbar } from './components/FavoritesToolbar';
import { FavoriteCard } from './components/FavoriteCard';
import { FavoriteListChips } from './components/FavoriteListChips';
import { FavoritesSkeleton } from './components/FavoritesSkeleton';
import { FavoritesEmptyState } from './components/FavoritesEmptyState';
import { ListReadingSheet } from './components/ListReadingSheet';
import { useFavoritesList, useDeleteFavorite, useFavoriteLists, useQuestionsInFavoriteList, useRemoveQuestionFromFavoriteList } from './hooks';
import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';
import type { FavoriteSort, FavoriteTargetType } from './types';

/** Push 11.3 — the advanced favorites page. ALL list state (type tab, sort, page) lives in
 *  the URL search params (?type=&sort=&page=) — shareable, back-button safe — and feeds
 *  React Query via ['favorites', 'list', params]. Skeleton → per-tab empty state → grid →
 *  pagination; deletes are optimistic with rollback (hooks.ts). Replaces the pre-11.3
 *  features/questions/FavoritesPage (the 11.2-DIAG H1 stale-cache empty page).
 *
 *  W15.0 — custom lists: a chips row (?listId=) switches the page into LIST-SCOPED
 *  browse mode (only that list's questions, newest membership first; type tabs and
 *  sort hide — a list holds questions only). «الكل» returns to the flat view unchanged.
 *
 *  W17.4 — flat mode gains a SUBJECT filter (?subjectId=, server-side — the C3
 *  param on GET /favorites) and list mode gains the reading-queue sheet
 *  («قراءة متسلسلة»): the whole list on screen, same window, sequential
 *  stepper + per-question deep links. */

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
  const [readingOpen, setReadingOpen] = useState(false);

  const type = parseTypeParam(searchParams.get('type'));
  const sort = parseSortParam(searchParams.get('sort'));
  const page = parsePageParam(searchParams.get('page'));
  const rawListId = searchParams.get('listId');
  // W17.4 — flat-mode subject scope (server-side filter; ?subjectId=).
  const subjectIdParam = searchParams.get('subjectId');

  // W15.0 — the custom-lists chips row + list-scoped browse.
  const listsQuery = useFavoriteLists();
  const lists = listsQuery.data;
  // A stale/foreign ?listId= (deleted elsewhere, hand-typed) falls back to «الكل» silently.
  const activeListId = rawListId && (lists ?? []).some((list) => list.id === rawListId) ? rawListId : null;
  const activeList = activeListId ? lists?.find((list) => list.id === activeListId) ?? null : null;

  const listParams = {
    type: type === 'all' ? undefined : type,
    sort,
    page,
    pageSize: PAGE_SIZE,
    // W17.4 — flat-mode subject scope rides the same query key (server-side filter).
    subjectId: activeListId ? undefined : subjectIdParam ?? undefined,
  };
  const favorites = useFavoritesList(listParams);
  const deleteFavorite = useDeleteFavorite();

  const listQuestions = useQuestionsInFavoriteList(
    activeListId ? { listId: activeListId, page, pageSize: PAGE_SIZE } : null,
  );
  const removeFromList = useRemoveQuestionFromFavoriteList();

  // W17.4 — the subject filter's option list (entitled subjects; the same
  // cache every study surface reads).
  const mySubjects = useMySubjects();

  // The active surface in list mode is the list-questions query; in flat mode, the flat one.
  const activeQuery = activeListId ? listQuestions : favorites;

  // Keep the URL canonical (params outside the valid domains fall back silently).
  // listId is only canonicalizable once the lists have LOADED — while the chips query
  // is in flight we cannot yet tell valid from stale, so the param is kept verbatim
  // (otherwise this effect would strip a perfectly good deep link in the first paint).
  useEffect(() => {
    const canonicalListId = rawListId == null ? null : listsQuery.isLoading ? rawListId : activeListId;
    const next = new URLSearchParams();
    if (canonicalListId) next.set('listId', canonicalListId);
    if (type !== 'all') next.set('type', type);
    if (sort !== 'recent') next.set('sort', sort);
    if (page !== 1) next.set('page', String(page));
    // W17.4 — the subject scope is flat-mode state (hidden in list mode, like type/sort).
    if (!canonicalListId && subjectIdParam) next.set('subjectId', subjectIdParam);
    const canonical = next.toString();
    if (canonical !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [rawListId, listsQuery.isLoading, activeListId, type, sort, page, subjectIdParam, searchParams, setSearchParams]);

  const data = activeQuery.data;
  const totalPages = data?.totalPages ?? 1;
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const updateParams = (patch: { listId?: string | null; type?: FavoriteTargetType | 'all'; sort?: FavoriteSort; page?: number; subjectId?: string | null }) => {
    const next = new URLSearchParams();
    const nextListId = patch.listId !== undefined ? patch.listId : activeListId;
    const nextType = patch.type ?? type;
    const nextSort = patch.sort ?? sort;
    const nextPage = patch.page ?? page;
    const nextSubjectId = patch.subjectId !== undefined ? patch.subjectId : subjectIdParam;
    if (nextListId) next.set('listId', nextListId);
    if (nextType !== 'all') next.set('type', nextType);
    if (nextSort !== 'recent') next.set('sort', nextSort);
    if (nextPage !== 1) next.set('page', String(nextPage));
    if (!nextListId && nextSubjectId) next.set('subjectId', nextSubjectId);
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

      <FavoriteListChips
        lists={lists}
        isLoading={listsQuery.isLoading}
        selectedListId={activeListId}
        onSelect={(listId) => updateParams({ listId, page: 1 })}
      />

      {activeListId ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--c-text)]">
            <BookmarkCheck className="h-4 w-4 shrink-0 text-[var(--c-primary-700)]" />
            <span className="truncate">{activeList?.name ?? 'القائمة'}</span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {/* W17.4 — the reading queue: the whole list on screen, same window. */}
            <button
              type="button"
              onClick={() => setReadingOpen(true)}
              data-testid="favorites-reading-trigger"
              aria-label={`قراءة متسلسلة لقائمة ${activeList?.name ?? ''}`}
              className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--c-primary-300)] bg-[var(--c-primary-50)] px-3.5 text-sm font-bold text-[var(--c-primary-700)] transition-colors hover:border-[var(--c-primary-500)]"
            >
              <BookOpenCheck className="h-4 w-4" />
              قراءة متسلسلة
            </button>
            <button
              type="button"
              onClick={() => updateParams({ listId: null, page: 1 })}
              data-testid="favorites-back-to-all"
              className="text-sm font-semibold text-[var(--c-primary-700)] underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary-500)] rounded-lg px-1 py-0.5"
            >
              عرض الكل
            </button>
          </div>
        </div>
      ) : (
        <FavoritesToolbar
          type={type}
          sort={sort}
          onTypeChange={(nextType) => updateParams({ type: nextType, page: 1 })}
          onSortChange={(nextSort) => updateParams({ sort: nextSort, page: 1 })}
          subjectId={subjectIdParam}
          subjects={mySubjects.data ?? []}
          onSubjectChange={(nextSubjectId) => updateParams({ subjectId: nextSubjectId, page: 1 })}
        />
      )}

      {activeQuery.isLoading ? (
        <FavoritesSkeleton />
      ) : activeQuery.isError ? (
        <div
          role="alert"
          data-testid="favorites-error"
          className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center"
        >
          <h2 className="text-base font-bold text-[var(--c-text)]">تعذّر تحميل المفضلة</h2>
          <p className="mt-1.5 text-sm text-[var(--c-text-muted)]">
            تتطلب المفضلة جلسة واستحقاقًا صالحين للمحتوى — تحقق من اتصالك ثم أعد المحاولة.
          </p>
          <button
            type="button"
            onClick={() => activeQuery.refetch()}
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--c-primary-700)] px-6 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary-500)]"
          >
            <RefreshCw className="h-4 w-4" />
            إعادة المحاولة
          </button>
        </div>
      ) : !data || data.items.length === 0 ? (
        activeListId ? (
          <div
            data-testid="favorites-list-empty"
            className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center"
          >
            <h2 className="text-base font-bold text-[var(--c-text)]">لا توجد أسئلة في هذه القائمة بعد</h2>
            <p className="mt-1.5 text-sm text-[var(--c-text-muted)]">
              أضف أسئلة من صفحة أي سؤال — اضغط زر المفضلة واختر هذه القائمة.
            </p>
          </div>
        ) : (
          <FavoritesEmptyState type={type} />
        )
      ) : (
        <>
          <p className="text-xs font-medium text-[var(--c-text-muted)]" aria-live="polite">
            {activeListId ? `${data.total} سؤالاً في القائمة` : `${data.total} عنصرًا محفوظًا`}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {data.items.map((item) => (
                <FavoriteCard
                  key={item.id}
                  item={item}
                  onDelete={(target) =>
                    activeListId
                      ? removeFromList.mutate({ listId: activeListId, questionId: target.targetId })
                      : deleteFavorite.mutate(target)}
                  deletePending={
                    activeListId
                      ? removeFromList.isPending && removeFromList.variables?.questionId === item.targetId
                      : deleteFavorite.isPending && deleteFavorite.variables?.targetId === item.targetId
                  }
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
      {/* W17.4 — the list reading-queue sheet (kept outside the conditional so
          closing it never unmounts mid-animation). */}
      {activeListId && readingOpen && (
        <ListReadingSheet listId={activeListId} listName={activeList?.name ?? 'القائمة'} onClose={() => setReadingOpen(false)} />
      )}
    </section>
  );
}
