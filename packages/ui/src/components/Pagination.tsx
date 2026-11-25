import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

/**
 * Pagination — shared pager for server-side lists (Wave 1).
 *
 * Replaces the four divergent hand-rolled pagers in admin-web. Logical
 * chevrons flip with `dir` (in RTL, "previous" points to the right). Arabic
 * defaults for every label; override per locale via `labels`.
 */

export interface PaginationLabels {
  prev?: string;
  next?: string;
  navLabel?: string;
  /** Page indicator text. */
  pageOf?: (page: number, totalPages: number) => string;
}

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  labels?: PaginationLabels;
  dir?: 'rtl' | 'ltr';
  disabled?: boolean;
  testId?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  labels,
  dir = 'rtl',
  disabled = false,
  testId,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const prevLabel = labels?.prev ?? 'السابق';
  const nextLabel = labels?.next ?? 'التالي';
  const navLabel = labels?.navLabel ?? 'تصفح الصفحات';
  const pageOf = labels?.pageOf ?? ((p: number, tp: number) => `صفحة ${p} من ${tp}`);

  const prevDisabled = disabled || page <= 1;
  const nextDisabled = disabled || page >= totalPages;
  const PrevIcon = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const NextIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <nav aria-label={navLabel} dir={dir} data-testid={testId} className="flex items-center justify-between gap-3 pt-3">
      <span className="font-mono text-[10px] text-[color:var(--c-text-muted)]">{pageOf(page, totalPages)}</span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={prevDisabled}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          aria-label={prevLabel}
          icon={<PrevIcon className="h-3.5 w-3.5" aria-hidden="true" />}
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={nextDisabled}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          aria-label={nextLabel}
          icon={<NextIcon className="h-3.5 w-3.5" aria-hidden="true" />}
        />
      </div>
    </nav>
  );
}
