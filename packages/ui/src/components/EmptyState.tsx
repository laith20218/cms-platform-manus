import { type ComponentType, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../utils/cn';

/**
 * EmptyState — standardized zero-data surface (PR-2).
 *
 * Used where a center has no rows / no results: a calm icon, a localized
 * title, an optional supporting line and an optional primary action. Centers
 * previously hand-rolled these blocks — the primitive keeps the shape and
 * a11y semantics (`role="status"` so screen readers announce the emptiness)
 * consistent across the console.
 */

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /** Leading icon. */
  icon?: ComponentType<{ className?: string }>;
  /** Tailwind classes for the icon tint (background/text). */
  iconClassName?: string;
  /** Localized "no results" sentence. */
  title: string;
  /** Optional explanation under the title. */
  description?: string;
  /** Optional call-to-action (button/link) rendered under the text. */
  action?: ReactNode;
  dir?: 'rtl' | 'ltr';
  testId?: string;
}

export function EmptyState({
  icon: Icon,
  iconClassName,
  title,
  description,
  action,
  dir,
  testId,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      role="status"
      dir={dir}
      data-testid={testId}
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center px-6 py-12',
        className,
      )}
      {...props}
    >
      {Icon && (
        <div
          className={cn(
            'p-3 rounded-full bg-slate-100 text-slate-500',
            iconClassName,
          )}
        >
          <Icon className="w-7 h-7" />
        </div>
      )}
      <p className="text-sm font-semibold text-[color:var(--c-text)]">{title}</p>
      {description && (
        <p className="text-xs max-w-md text-[color:var(--c-text-muted)]">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
