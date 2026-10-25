import type { ReactNode } from 'react';
import { cn } from '@/utils';
import { usePlayerProtection } from './usePlayerProtection';

/**
 * Push 10.1 — Standalone protection wrapper.
 *
 * Drops the player-scoped deterrents over any surface (useful for future
 * inline players). The PlayerShell composes this internally over its stage,
 * so most call sites never need it directly.
 */
export function PlayerProtection({
  children,
  className,
  enabled = true,
}: {
  children: ReactNode;
  className?: string;
  enabled?: boolean;
}) {
  const { setContainer } = usePlayerProtection({ enabled });
  return (
    <div ref={setContainer} className={cn('select-none', className)}>
      {children}
    </div>
  );
}
