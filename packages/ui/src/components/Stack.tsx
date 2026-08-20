import { type HTMLAttributes } from 'react';
import { cn } from '../utils/cn';

interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'column';
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around';
}

const gapMap = { none: 'gap-0', xs: 'gap-1', sm: 'gap-2', md: 'gap-3', lg: 'gap-4', xl: 'gap-6' };
const alignMap = { start: 'items-start', center: 'items-center', end: 'items-end', stretch: 'items-stretch' };
const justifyMap = { start: 'justify-start', center: 'justify-center', end: 'justify-end', between: 'justify-between', around: 'justify-around' };

export function Stack({ direction = 'column', gap = 'md', align, justify, className, ...props }: StackProps) {
  return (
    <div className={cn('flex', direction === 'row' ? 'flex-row' : 'flex-col', gapMap[gap], align && alignMap[align], justify && justifyMap[justify], className)} {...props} />
  );
}
