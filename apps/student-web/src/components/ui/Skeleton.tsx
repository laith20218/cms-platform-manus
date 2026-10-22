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

/** Skeleton row for table/list items. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3">
      <Skeleton className="w-10 h-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="w-3/4 h-4" />
        <Skeleton className="w-1/2 h-3" />
      </div>
      <Skeleton className="w-16 h-6 rounded-full" />
    </div>
  );
}

/** Grid of skeleton cards. */
export function SkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}
