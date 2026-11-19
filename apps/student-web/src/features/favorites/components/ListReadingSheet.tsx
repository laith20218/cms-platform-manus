import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ListChecks, Loader2 } from 'lucide-react';
import { BottomSheet } from '@/components/ui/Overlays';
import { useQuestionsInFavoriteList } from '../hooks';
import type { FavoriteItem } from '../types';

/**
 * W17.4 — the reading-queue sheet for ONE favorites list (Owner: «long list in
 * same window»). Opens over the favorites page in list mode and keeps the
 * whole queue on screen: a sequentially numbered, smoothly scrolling list of
 * the list's questions (stem + subject chip), a prev/next stepper that
 * scrolls to the current question, and an «عرض السؤال» deep link per row
 * (the existing question route — no new viewer invented).
 *
 * Data: the same listQuestionsInList endpoint the grid reads, one large page
 * (100) — study lists are human-curated; a load-more covers the rare tail.
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
  const [page, setPage] = useState(1);
  const [index, setIndex] = useState(0);
  const rowsRef = useRef<(HTMLLIElement | null)[]>([]);

  const query = useQuestionsInFavoriteList({ listId, page, pageSize: 100 });
  const items: FavoriteItem[] = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const hasMore = page * 100 < total;

  // Keep the current question in view as the stepper moves (smooth scroll).
  useEffect(() => {
    rowsRef.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [index]);

  const goPrev = () => setIndex((current) => Math.max(0, current - 1));
  const goNext = () => {
    if (index < items.length - 1) setIndex((current) => current + 1);
    else if (hasMore && !query.isFetching) setPage((current) => current + 1);
  };

  return (
    <BottomSheet open onOpenChange={(next) => { if (!next) onClose(); }} title={`قراءة متسلسلة — ${listName}`} testId="favorites-reading-sheet">
      {query.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12" role="status">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--c-primary-700)]" />
          <p className="text-sm text-[var(--c-text-muted)]">جارٍ تحميل أسئلة القائمة…</p>
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
                  onClick={() => setPage((current) => current + 1)}
                  disabled={query.isFetching}
                  data-testid="reading-sheet-load-more"
                  className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--c-border)] px-4 text-sm font-semibold text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-400)] disabled:opacity-50"
                >
                  {query.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronLeft className="h-4 w-4" />}
                  تحميل المزيد ({total - items.length} متبقية)
                </button>
              </li>
            )}
          </ol>

          {/* The stepper — optional by spec; included because scanning a long
              queue benefits: one tap advances + scrolls to the next question. */}
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
            <span className="text-xs font-semibold text-[var(--c-text-muted)]" dir="ltr" aria-hidden="true">
              {index + 1} / {items.length}
            </span>
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
