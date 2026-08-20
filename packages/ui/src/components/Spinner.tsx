import { Loader2 } from 'lucide-react';
import { cn } from '../utils/cn';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = { sm: 16, md: 24, lg: 32 };

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return <Loader2 className={cn('animate-spin text-[var(--c-primary-700)]', className)} size={sizeMap[size]} />;
}
