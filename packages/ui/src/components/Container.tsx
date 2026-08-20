import { type HTMLAttributes } from 'react';
import { cn } from '../utils/cn';

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
}

const sizeMap = {
  xs: 'max-w-[480px]',
  sm: 'max-w-[640px]',
  md: 'max-w-[768px]',
  lg: 'max-w-[1024px]',
  xl: 'max-w-[1280px]',
  '2xl': 'max-w-[1440px]',
  full: 'max-w-full',
};

export function Container({ size = 'lg', className, ...props }: ContainerProps) {
  return <div className={cn('mx-auto w-full px-4 md:px-6', sizeMap[size], className)} {...props} />;
}
