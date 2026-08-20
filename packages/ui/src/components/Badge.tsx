import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 font-medium rounded-[6px] whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-[var(--c-neutral-100)] text-[var(--c-neutral-700)]',
        primary: 'bg-[var(--c-primary-50)] text-[var(--c-primary-700)]',
        success: 'bg-[var(--c-success-50)] text-[var(--c-success-700)]',
        danger: 'bg-[var(--c-danger-50)] text-[var(--c-danger-700)]',
        warning: 'bg-[var(--c-warning-50)] text-[var(--c-warning-700)]',
        info: 'bg-[var(--c-info-50)] text-[var(--c-info-700)]',
        glass: 'bg-[var(--c-glass)] text-[var(--c-primary-700)] backdrop-blur-md',
      },
      size: { sm: 'h-5 px-2 text-xs', md: 'h-6 px-2.5 text-xs', lg: 'h-7 px-3 text-sm' },
      shape: { pill: 'rounded-full', rounded: 'rounded-[6px]', square: 'rounded-none' },
    },
    defaultVariants: { variant: 'default', size: 'md', shape: 'rounded' },
  }
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ variant, size, shape, className, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size, shape }), className)} {...props} />;
}
