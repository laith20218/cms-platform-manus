import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../utils/cn';

const cardVariants = cva('rounded-2xl overflow-hidden transition-all duration-300', {
  variants: {
    variant: {
      content: 'bg-[var(--c-surface)] border border-[var(--c-border)] shadow-sm',
      glass: 'bg-[var(--c-glass)] border border-[var(--c-border-glass)] backdrop-blur-xl',
      stat: 'bg-[var(--c-surface)] border border-[var(--c-border)] p-5',
    },
    interactive: { true: 'cursor-pointer hover:shadow-lg hover:-translate-y-0.5', false: '' },
  },
  defaultVariants: { variant: 'content', interactive: false },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ variant, interactive, className, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, interactive }), className)} {...props} />;
}
