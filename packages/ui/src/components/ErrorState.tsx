import { type ComponentType, type HTMLAttributes } from 'react';
import { CircleAlert, RotateCw } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * ErrorState — standardized failure surface (PR-2).
 *
 * Replaces the hand-rolled error banners: `role="alert"` (announced
 * immediately), localized title + description, and an optional retry button.
 * The icon tint follows the severity variant so a hard failure reads
 * differently from a soft degradation.
 */

export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  /** Localized headline (e.g. "Could not load metrics"). */
  title: string;
  /** Optional localized explanation. */
  description?: string;
  /** Severity tint — danger (default) or warning. */
  variant?: 'danger' | 'warning';
  /** Leading icon override. */
  icon?: ComponentType<{ className?: string }>;
  /** When provided together with `onRetry`, renders the retry button. */
  retryLabel?: string;
  onRetry?: () => void;
  dir?: 'rtl' | 'ltr';
  testId?: string;
}

export function ErrorState({
  title,
  description,
  variant = 'danger',
  icon: Icon,
  retryLabel,
  onRetry,
  dir,
  testId,
  className,
  ...props
}: ErrorStateProps) {
  const DefaultIcon = variant === 'warning' ? CircleAlert : CircleAlert;
  const Glyph = Icon ?? DefaultIcon;
  return (
    <div
      role="alert"
      dir={dir}
      data-testid={testId}
      className={cn(
        'flex flex-col items-center justify-center gap-2 text-center px-6 py-10',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'p-3 rounded-full',
          variant === 'warning'
            ? 'bg-[color:var(--c-warning-50)] text-[color:var(--c-warning-700)]'
            : 'bg-[color:var(--c-danger-50)] text-[color:var(--c-danger-700)]',
        )}
      >
        <Glyph className="w-7 h-7" />
      </div>
      <p className="text-sm font-semibold text-[color:var(--c-text)]">{title}</p>
      {description && (
        <p className="text-xs max-w-md text-[color:var(--c-text-muted)]">{description}</p>
      )}
      {retryLabel && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          data-testid={testId ? `${testId}-retry` : undefined}
          className="mt-2 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 bg-[color:var(--c-primary-700)]"
        >
          <RotateCw className="w-4 h-4" aria-hidden="true" />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
