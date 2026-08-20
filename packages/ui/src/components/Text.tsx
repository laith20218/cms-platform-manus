import { type HTMLAttributes } from 'react';
import { cn } from '../utils/cn';

type TextVariant = 'display' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body' | 'bodyLg' | 'bodySm' | 'caption' | 'overline';
type TextColor = 'default' | 'soft' | 'muted' | 'faint' | 'brand' | 'success' | 'danger' | 'warning' | 'onPrimary';
type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold' | 'extrabold';

interface TextProps extends HTMLAttributes<HTMLElement> {
  variant?: TextVariant;
  color?: TextColor;
  weight?: TextWeight;
  align?: 'start' | 'center' | 'end';
  truncate?: boolean;
}

const variantMap: Record<TextVariant, string> = {
  display: 'text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight',
  h1: 'text-3xl md:text-4xl lg:text-5xl font-bold leading-tight',
  h2: 'text-2xl md:text-3xl lg:text-4xl font-bold leading-snug',
  h3: 'text-xl md:text-2xl lg:text-3xl font-semibold leading-snug',
  h4: 'text-lg md:text-xl lg:text-2xl font-semibold',
  h5: 'text-base md:text-lg font-semibold',
  h6: 'text-sm md:text-base font-semibold',
  body: 'text-sm md:text-base leading-relaxed',
  bodyLg: 'text-base md:text-lg leading-relaxed',
  bodySm: 'text-xs md:text-sm leading-relaxed',
  caption: 'text-xs leading-normal',
  overline: 'text-xs font-semibold uppercase tracking-wider',
};

const colorMap: Record<TextColor, string> = {
  default: 'text-[var(--c-text)]',
  soft: 'text-[var(--c-text-soft)]',
  muted: 'text-[var(--c-text-muted)]',
  faint: 'text-[var(--c-text-faint)]',
  brand: 'text-[var(--c-primary-700)]',
  success: 'text-[var(--c-success-700)]',
  danger: 'text-[var(--c-danger-700)]',
  warning: 'text-[var(--c-warning-700)]',
  onPrimary: 'text-white',
};

const weightMap: Record<TextWeight, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
  extrabold: 'font-extrabold',
};

const alignMap = { start: 'text-start', center: 'text-center', end: 'text-end' };

export function Text({ variant = 'body', color = 'default', weight, align, truncate, className, ...props }: TextProps) {
  return (
    <span
      className={cn(
        variantMap[variant],
        colorMap[color],
        weight && weightMap[weight],
        align && alignMap[align],
        truncate && 'truncate',
        className
      )}
      {...props}
    />
  );
}
