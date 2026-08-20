import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2',
    'font-medium rounded-[10px]',
    'transition-all duration-200',
    'focus-visible:outline-none focus-visible:ring-4',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
    'active:scale-[0.98]',
    'whitespace-nowrap select-none',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-[var(--c-primary-700)] text-white shadow-md hover:bg-[var(--c-primary-600)] hover:shadow-lg active:bg-[var(--c-primary-800)]',
        secondary: 'bg-transparent text-[var(--c-primary-700)] border border-[var(--c-primary-700)] hover:bg-[var(--c-primary-50)]',
        ghost: 'bg-transparent text-[var(--c-primary-700)] hover:bg-[var(--c-primary-50)]',
        danger: 'bg-[var(--c-danger-500)] text-white shadow-md hover:bg-[var(--c-danger-600)]',
        success: 'bg-[var(--c-success-500)] text-white shadow-md hover:bg-[var(--c-success-600)]',
        glass: 'bg-[var(--c-glass)] border border-[var(--c-border-glass)] text-[var(--c-primary-700)] backdrop-blur-xl',
        link: 'bg-transparent text-[var(--c-primary-700)] underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-6 px-2 text-xs gap-1',
        sm: 'h-8 px-3 text-sm gap-1.5',
        md: 'h-10 px-4 text-sm gap-2',
        lg: 'h-12 px-6 text-base gap-2',
        xl: 'h-14 px-8 text-lg gap-3',
      },
      fullWidth: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', fullWidth: false },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'start' | 'end';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, size, fullWidth, loading, icon, iconPosition = 'start', children, className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" size={size === 'xs' ? 14 : 16} />}
      {!loading && icon && iconPosition === 'start' && icon}
      {children}
      {!loading && icon && iconPosition === 'end' && icon}
    </button>
  )
);

Button.displayName = 'Button';
