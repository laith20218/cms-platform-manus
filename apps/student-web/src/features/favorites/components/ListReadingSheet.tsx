import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ListChecks, Loader2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/Overlays';
import { useListReadingQueue } from '../hooks';
import type { FavoriteItem } from '../types';

/**
 * W17.4 — the reading-queue sheet for ONE favorites list (Owner: «long list in
 * same window»). Opens over the favorites page in list mode and keeps the
 * whole queue on screen: a sequentially numbered, smoothly scrolling list of
 * the list's questions (stem + subject chip), a prev/next stepper that
 * scrolls to the current question, and an «عرض السؤال» deep link per row
 * (the existing question route — no new viewer invented).
 *
 * W19.2 (D-32) — pages now ACCUMULATE via useListReadingQueue (the old
 * per-page query replaced each page: past 100 rows the numbering restarted,
 * the stepper index pointed into the wrong page, and the remaining-count
 * math broke). ONE position counter (index+1 / total, aria-live); the old
 * duplicate «index / loaded» span is gone. At the loaded boundary a single
 * «التالي» tap advances immediately AND fetches the next page — no more
 * double-tap.
 */
export function ListReadingSheet({
  listId,
  listName,
  onClose,
}: {
  listId: string;
  listName: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const rowsRef = useRef<(HTMLLIElement | null)[]>([]);

  const query = useListReadingQueue(listId);
  const items: FavoriteItem[] = query.data?.pages.flatMap((page) => page.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const hasMore = query.hasNextPage === true;

  // Keep the current question in view as the stepper moves (smooth scroll).
  // Also keyed on items.length: a boundary tap advances optimistically before
  // the row exists — this re-scrolls once the fetched page appends it.
  useEffect(() => {
    rowsRef.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [index, items.length]);

  const goPrev = () => setIndex((current) => Math.max(0, current - 1));
  // D-32: one tap at the loaded boundary advances AND fetches — the position
  // moves immediately (the aria-live counter announces it) and the row
  // appears when the fetch lands. If the fetch fails the counter stays
  // honest (position N+1 of total) and «التالي»/«تحميل المزيد» retry.
  const goNext = () => {
    if (index < items.length - 1) {
      setIndex((current) => current + 1);
    } else if (hasMore && !query.isFetchingNextPage) {
      setIndex((current) => current + 1);
      void query.fetchNextPage();
    }
  };

  return (
    <BottomSheet open onOpenChange={(next) => { if (!next) onClose(); }} title={`قراءة متسلسلة — ${listName}`} testId="favorites-reading-sheet">
      {query.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--c-primary-700)]" />
          <p className="text-sm text-[var(--c-text-muted)]">جارٍ تحميل أسئلة القائمة…</p>
        </div>
      ) : query.isError ? (
        /* W19.2 — error ≠ empty: a failed queue load must never render the
           «لا توجد أسئلة» empty message. */
        <div
          data-testid="reading-sheet-error"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4"
        >
          <p className="text-sm text-[var(--c-text-muted)]">تعذّر تحميل أسئلة القائمة</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="press min-h-11 rounded-xl bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-[var(--c-text-muted)]">لا توجد أسئلة في هذه القائمة بعد.</p>
      ) : (
        <>
          <p className="mb-2 text-xs font-medium text-[var(--c-text-muted)]" aria-live="polite" data-testid="reading-sheet-position">
            {index + 1} / {total} سؤالاً
          </p>
          <ol className="max-h-[55vh] space-y-1.5 overflow-y-auto pe-1" data-testid="reading-sheet-list">
            {items.map((item, itemIndex) => {
              const current = itemIndex === index;
              return (
                <li
                  key={item.id}
                  ref={(node) => { rowsRef.current[itemIndex] = node; }}
                  data-testid={`reading-sheet-item-${itemIndex}`}
                  className={`rounded-2xl border p-3 transition-colors ${current
                    ? 'border-[var(--c-primary-300)] bg-[var(--c-primary-50)]'
                    : 'border-[var(--c-border)] bg-[var(--c-surface)]'}`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${current ? 'bg-[var(--c-primary-700)] text-white' : 'bg-[var(--c-bg-hover)] text-[var(--c-text-muted)]'}`}
                      lang="en"
                    >
                      {itemIndex + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-3 text-sm font-semibold leading-6 text-[var(--c-text)]">{item.title}</p>
                      {item.subtitle && <p className="mt-0.5 truncate text-xs text-[var(--c-text-muted)]">{item.subtitle}</p>}
                    </div>
                    <Link
                      to={`/subjects/${item.subjectId}/questions/${item.targetId}`}
                      data-testid={`reading-sheet-open-${itemIndex}`}
                      aria-label={`عرض السؤال ${itemIndex + 1}`}
                      className="press inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-3 text-xs font-bold text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-400)] hover:text-[var(--c-primary-700)]"
                    >
                      <ListChecks className="h-3.5 w-3.5" />
                      عرض
                    </Link>
                  </div>
                </li>
              );
            })}
            {hasMore && (
              <li className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => void query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                  data-testid="reading-sheet-load-more"
                  className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--c-border)] px-4 text-sm font-semibold text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-400)] disabled:opacity-50"
                >
                  {query.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronLeft className="h-4 w-4" />}
                  تحميل المزيد ({total - items.length} متبقية)
                </button>
              </li>
            )}
          </ol>

          {/* The stepper — optional by spec; included because scanning a long
              queue benefits: one tap advances + scrolls to the next question.
              W19.2 (D-32): the duplicate «index / loaded» counter is gone —
              the aria-live position above is the single position source. */}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--c-border)] pt-3">
            <button
              type="button"
              onClick={goPrev}
              disabled={index === 0}
              aria-label="السؤال السابق"
              data-testid="reading-sheet-prev"
              className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 text-sm font-bold text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-400)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
              السابق
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={index >= items.length - 1 && !hasMore}
              aria-label="السؤال التالي"
              data-testid="reading-sheet-next"
              className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background: 'var(--c-primary-700)' }}
            >
              التالي
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  );
}
