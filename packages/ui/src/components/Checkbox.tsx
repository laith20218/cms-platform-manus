import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * Checkbox — controlled checkbox with label + indeterminate support (Wave 1).
 *
 * A real (screen-reader-invisible) <input type="checkbox"> keeps native
 * semantics — role, aria-checked (including `mixed`, set explicitly for
 * announcements) and label-click toggling come for free; the styled box is a
 * sibling span that mirrors the state and the focus ring (peer-* utilities).
 * The description sits OUTSIDE the <label> (wired via aria-describedby) so the
 * accessible name stays the label text alone. Clicking out of an indeterminate
 * state resolves to checked=true.
 */

export interface CheckboxProps {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  name?: string;
  value?: string;
  /** Accessible name when no visible label is rendered. */
  'aria-label'?: string;
  testId?: string;
  className?: string;
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  name,
  value,
  'aria-label': ariaLabel,
  testId,
  className,
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const descriptionId = useId();
  const isIndeterminate = checked === 'indeterminate';
  const isChecked = checked === true;

  // Native indeterminate is a DOM property, not an attribute — kept in sync imperatively.
  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = isIndeterminate;
  }, [isIndeterminate]);

  return (
    <div className={cn('inline-flex flex-col gap-0.5', className)}>
      <label
        className={cn(
          'inline-flex select-none items-start gap-2',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        )}
      >
        <input
          ref={inputRef}
          type="checkbox"
          className="peer sr-only"
          checked={isChecked}
          aria-checked={isIndeterminate ? 'mixed' : isChecked}
          onChange={() => onCheckedChange(isIndeterminate ? true : !isChecked)}
          disabled={disabled}
          name={name}
          value={value}
          aria-label={ariaLabel}
          aria-describedby={description ? descriptionId : undefined}
          data-testid={testId}
        />
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
            'border-[color:var(--c-border-strong)] bg-[color:var(--c-surface)]',
            'peer-focus-visible:ring-4 peer-focus-visible:ring-[rgba(25,118,210,0.15)]',
            (isChecked || isIndeterminate) && 'border-[color:var(--c-primary-700)] bg-[color:var(--c-primary-700)]',
          )}
        >
          {isChecked ? (
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          ) : isIndeterminate ? (
            <Minus className="h-3 w-3 text-white" strokeWidth={3} />
          ) : null}
        </span>
        {label && <span className="block text-xs leading-relaxed text-[color:var(--c-text)]">{label}</span>}
      </label>
      {description && (
        <span id={descriptionId} className="block ps-6 text-[10px] leading-relaxed text-[color:var(--c-text-muted)]">
          {description}
        </span>
      )}
    </div>
  );
}
