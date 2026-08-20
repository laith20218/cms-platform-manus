import { forwardRef, type InputHTMLAttributes } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '../utils/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  success?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const sizes = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-3 text-sm',
  lg: 'h-12 px-4 text-base',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error = false, success = false, leftIcon, rightIcon, size = 'md', ...props }, ref) => (
    <div className="relative">
      {leftIcon && (
        <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-[var(--c-text-muted)]">
          {leftIcon}
        </div>
      )}
      <input
        ref={ref}
        className={cn(
          'w-full rounded-[10px] border bg-[var(--c-surface)] text-[var(--c-text)] transition-all duration-200',
          'placeholder:text-[var(--c-text-faint)]',
          'focus:outline-none focus:ring-4',
          sizes[size as keyof typeof sizes] || sizes.md,
          leftIcon && 'ps-10',
          rightIcon && 'pe-10',
          error
            ? 'border-[var(--c-danger-500)] focus:border-[var(--c-danger-500)] focus:ring-[rgba(255,82,82,0.15)]'
            : success
            ? 'border-[var(--c-success-500)] focus:border-[var(--c-success-500)] focus:ring-[rgba(0,200,83,0.15)]'
            : 'border-[var(--c-border-strong)] focus:border-[var(--c-primary-400)] focus:ring-[rgba(25,118,210,0.15)]',
          className
        )}
        aria-invalid={error}
        {...props}
      />
      {rightIcon && (
        <div className="absolute inset-y-0 end-0 flex items-center pe-3 text-[var(--c-text-muted)]">
          {rightIcon}
        </div>
      )}
      {error && !rightIcon && <AlertCircle className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--c-danger-500)]" size={20} />}
      {success && !rightIcon && <CheckCircle2 className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--c-success-500)]" size={20} />}
    </div>
  )
);

Input.displayName = 'Input';
