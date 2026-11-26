import { type ComponentType, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../utils/cn';

/**
 * PageHeader — standardized center header for the admin console (PR-2).
 *
 * Every center page renders the same shape: icon chip, eyebrow line, title
 * (+ optional count badge), description, and an actions slot. Adopting the
 * primitive keeps center headers consistent across the console; callers keep
 * full visual control through `iconClassName` and `className` (the icon tint
 * is deliberately neutral by default so the primitive carries no domain hue).
 */

export interface PageHeaderProps extends HTMLAttributes<HTMLElement> {
  /** Small uppercase line above the title (e.g. "Central administration"). */
  eyebrow?: string;
  /** Page title (rendered as the header's h2). */
  title: string;
  /** Optional numeric count rendered as a badge beside the title. */
  count?: number | string;
  /** Supporting sentence under the title. */
  description?: string;
  /** Leading icon chip. */
  icon?: ComponentType<{ className?: string }>;
  /** Tailwind classes for the icon chip (background/text tint). */
  iconClassName?: string;
  /** Right-aligned action area (buttons, links). */
  actions?: ReactNode;
  /** Text direction of the header. */
  dir?: 'rtl' | 'ltr';
  testId?: string;
}

export function PageHeader({
  eyebrow,
  title,
  count,
  description,
  icon: Icon,
  iconClassName,
  actions,
  dir,
  testId,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <header
      dir={dir}
      data-testid={testId}
      className={cn('flex items-start justify-between gap-4 flex-wrap', className)}
      {...props}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div
            className={cn('p-2.5 rounded-xl shrink-0 bg-slate-100 text-slate-600', iconClassName)}
          >
            <Icon className="w-6 h-6" />
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p
              className="text-xs font-semibold uppercase tracking-wider text-[color:var(--c-text-muted)]"
            >
              {eyebrow}
            </p>
          )}
          <h2 className="text-2xl font-bold flex items-center gap-2 text-[color:var(--c-text)]">
            {title}
            {count !== undefined && (
              <span
                data-testid={testId ? `${testId}-count` : undefined}
                className="inline-flex items-center justify-center min-w-[28px] h-6 px-2 rounded-full text-xs font-semibold bg-[color:var(--c-primary-50)] text-[color:var(--c-primary-700)]"
              >
                {count}
              </span>
            )}
          </h2>
          {description && (
            <p className="text-sm mt-1 max-w-2xl text-[color:var(--c-text-soft)]">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-start gap-2">{actions}</div>}
    </header>
  );
}
