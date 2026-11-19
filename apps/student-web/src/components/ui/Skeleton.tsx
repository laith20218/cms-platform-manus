import { cn } from '@/utils';

interface SkeletonProps {
  className?: string;
  count?: number;
}

/** Shimmer skeleton block — matches admin-web's .skeleton animation pattern. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-lg bg-[var(--c-neutral-100)]', className)}
      style={{ background: 'linear-gradient(90deg, var(--c-neutral-100) 25%, var(--c-neutral-50) 50%, var(--c-neutral-100) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }}
    />
  );
}

/** Skeleton card for dashboard stats. */
export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[var(--c-border)] p-5 bg-[var(--c-surface)]">
      <Skeleton className="w-12 h-12 rounded-xl mb-3" />
      <Skeleton className="w-20 h-6 mb-2" />
      <Skeleton className="w-32 h-4" />
    </div>
  );
}
