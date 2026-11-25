import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * Select — styled native select (Wave 1).
 *
 * Deliberately a native <select> under a styled shell: admin filters are
 * dense, and native semantics give keyboard operation, screen-reader
 * announcements and RTL layout for free. Label + hint are wired via
 * htmlFor/aria-describedby; `error` drives aria-invalid + danger ring.
 */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'children'> {
  label?: string;
  /** Declarative options; alternatively pass <option> children. */
  options?: SelectOption[];
  children?: ReactNode;
  error?: boolean;
  size?: 'sm' | 'md';
  hint?: string;
  testId?: string;
}

const sizeClasses = {
  sm: 'h-8 text-xs',
  md: 'h-10 text-sm',
} as const;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, children, error = false, size = 'md', hint, id: idProp, className, testId, ...props }, ref) => {
    const autoId = useId();
    const id = idProp ?? autoId;
    const hintId = `${id}-hint`;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-[color:var(--c-text-soft)]">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={id}
            data-testid={testId}
            aria-invalid={error || undefined}
            aria-describedby={hint ? hintId : undefined}
            className={cn(
              'w-full appearance-none rounded-[10px] border bg-[color:var(--c-surface)] ps-3 pe-8',
              'text-[color:var(--c-text)] transition-all duration-200',
              'focus:outline-none focus:ring-4',
              'disabled:cursor-not-allowed disabled:opacity-50',
              sizeClasses[size],
              error
                ? 'border-[color:var(--c-danger-500)] focus:border-[color:var(--c-danger-500)] focus:ring-[rgba(255,82,82,0.15)]'
                : 'border-[color:var(--c-border-strong)] focus:border-[color:var(--c-primary-400)] focus:ring-[rgba(25,118,210,0.15)]',
              className,
            )}
            {...props}
          >
            {children ??
              options?.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--c-text-muted)]"
          />
        </div>
        {hint && (
          <p
            id={hintId}
            className={cn('mt-1 text-[10px]', error ? 'text-[color:var(--c-danger-500)]' : 'text-[color:var(--c-text-muted)]')}
          >
            {hint}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
