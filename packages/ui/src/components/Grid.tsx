import { type HTMLAttributes } from 'react';
import { cn } from '../utils/cn';

interface GridProps extends HTMLAttributes<HTMLDivElement> {
  cols?: 1 | 2 | 3 | 4 | 5 | 6 | 12;
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg';
}

const colsMap = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5', 6: 'grid-cols-6', 12: 'grid-cols-12' };
const gapMap = { none: 'gap-0', xs: 'gap-1', sm: 'gap-2', md: 'gap-4', lg: 'gap-6' };

export function Grid({ cols = 3, gap = 'md', className, ...props }: GridProps) {
  return <div className={cn('grid', colsMap[cols], gapMap[gap], className)} {...props} />;
}
