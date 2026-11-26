import { type HTMLAttributes } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * Breadcrumbs — standardized location indicator (PR-2).
 *
 * Renders a `<nav aria-label>` + ordered list; the last item is the current
 * page (`aria-current="page"`). The separator chevron flips with `dir` so RTL
 * and LTR both read correctly (reading order = items order, no manual
 * reversal needed by callers).
 */

export interface BreadcrumbItem {
  /** Visible label. */
  label: string;
  /** Optional href — when absent the crumb renders as plain text. */
  href?: string;
}

export interface BreadcrumbsProps extends HTMLAttributes<HTMLElement> {
  /** Crumbs in reading order; the last one is the current page. */
  items: BreadcrumbItem[];
  /** Accessible name for the nav landmark (localized by the caller). */
  navLabel: string;
  dir?: 'rtl' | 'ltr';
  testId?: string;
}

export function Breadcrumbs({
  items,
  navLabel,
  dir,
  testId,
  className,
  ...props
}: BreadcrumbsProps) {
  const Separator = dir === 'rtl' ? ChevronLeft : ChevronRight;
  return (
    <nav
      dir={dir}
      aria-label={navLabel}
      data-testid={testId}
      className={cn('flex items-center gap-1.5 min-w-0', className)}
      {...props}
    >
      <ol className="flex items-center gap-1.5 min-w-0 list-none m-0 p-0">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5 min-w-0">
              {item.href && !isLast ? (
                <a
                  href={item.href}
                  className="text-[13px] text-[color:var(--c-text-muted)] hover:text-[color:var(--c-text)] truncate"
                >
                  {item.label}
                </a>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={cn(
                    'text-[13px] truncate',
                    isLast
                      ? 'font-semibold text-[color:var(--c-text)]'
                      : 'text-[color:var(--c-text-muted)]',
                  )}
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <Separator
                  aria-hidden="true"
                  className="w-3.5 h-3.5 shrink-0 text-[color:var(--c-text-muted)] opacity-60"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
