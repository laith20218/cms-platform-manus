import { type HTMLAttributes, type ElementType } from 'react';
import { cn } from '../utils/cn';

export interface BoxProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
}

export function Box({ as: Component = 'div', className, ...props }: BoxProps) {
  return <Component className={cn(className)} {...props} />;
}
