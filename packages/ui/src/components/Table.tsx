import { forwardRef, type HTMLAttributes, type TableHTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';
import { cn } from '../utils/cn';

/**
 * Table shell — dense-but-scannable admin table primitives (Wave 1).
 *
 * Composable styled wrappers (no logic): TableShell clips + scrolls wide
 * tables on narrow screens, TH/TD default to `text-start` (logical — flips
 * with direction), TBody rows get a subtle hover affordance. All wrappers
 * forward refs and spread props, so per-center tables keep their own cells.
 */

export interface TableShellProps extends HTMLAttributes<HTMLDivElement> {}

export function TableShell({ className, children, ...props }: TableShellProps) {
  return (
    <div
      className={cn('w-full overflow-x-auto rounded-xl border border-[color:var(--c-border)] bg-[color:var(--c-surface)]', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export const Table = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />,
);
Table.displayName = 'Table';

export const THead = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead
      ref={ref}
      className={cn('border-b border-[color:var(--c-border)] bg-[color:var(--c-bg-elevated)]', className)}
      {...props}
    />
  ),
);
THead.displayName = 'THead';

export const TBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn('divide-y divide-[color:var(--c-border)]', className)} {...props} />,
);
TBody.displayName = 'TBody';

export const TR = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => <tr ref={ref} className={cn('transition-colors hover:bg-[color:var(--c-bg)]', className)} {...props} />,
);
TR.displayName = 'TR';

export const TH = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn('px-3 py-2.5 text-start text-[10px] font-semibold uppercase tracking-wider text-[color:var(--c-text-soft)]', className)}
      {...props}
    />
  ),
);
TH.displayName = 'TH';

export const TD = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('px-3 py-2.5 align-middle text-xs text-[color:var(--c-text)]', className)} {...props} />
  ),
);
TD.displayName = 'TD';
