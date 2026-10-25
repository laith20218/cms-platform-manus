import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { cn } from '@/utils';

/**
 * Push 10.1 — LazyPlayerMount.
 *
 * Every real player (video / audio / PDF / HTML) will ship as its own
 * code-split chunk and mount through this wrapper:
 *
 *  1. `active`  — the host surface gate (the PlayerShell is open).
 *  2. IntersectionObserver — the mount slot is actually on-screen.
 *
 * Both must be true before the chunk is even requested: nothing player-
 * related downloads or renders while the modal is closed. While the chunk
 * loads, a premium skeleton/spinner holds the layout.
 */

export interface LazyPlayerMountProps {
  /** Mount gate — true only while the host surface (e.g. PlayerShell) is open. */
  active: boolean;
  /**
   * Dynamic import of the player chunk. MUST be a stable module-level
   * function (`const loadVideoPlayer = () => import('./VideoPlayer')`) so
   * React.lazy is created exactly once.
   */
  loader: () => Promise<{ default: ComponentType }>;
  /** Props forwarded to the lazily mounted player component. */
  playerProps?: Record<string, unknown>;
  /** Custom loading surface; defaults to the premium PlayerLoading block. */
  fallback?: ReactNode;
  className?: string;
  testId?: string;
}

export function LazyPlayerMount({
  active,
  loader,
  playerProps,
  fallback,
  className,
  testId,
}: LazyPlayerMountProps) {
  const gateRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Created exactly once per stable loader reference.
  const Player = useMemo(() => lazy(loader), [loader]);

  useEffect(() => {
    if (visible) return;
    const el = gateRef.current;
    if (!el) return;
    // Test environments (jsdom) have no IntersectionObserver — mount directly.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // Start fetching slightly before the slot is fully on-screen.
      { rootMargin: '120px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  const mounted = active && visible;

  return (
    <div ref={gateRef} data-testid={testId} className={cn('relative w-full', className)}>
      {mounted ? (
        <Suspense fallback={fallback ?? <PlayerLoading label="جارٍ تحضير المشغّل…" />}>
          <Player {...playerProps} />
        </Suspense>
      ) : (
        (fallback ?? <PlayerLoading label="بانتظار فتح المشغّل…" />)
      )}
    </div>
  );
}

/**
 * Premium loading surface for the dark player shell: spinner + label +
 * breathing skeleton bars (reuses the app's pulse rhythm on dark surfaces).
 */
export function PlayerLoading({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="player-loading"
      className="flex aspect-video w-full flex-col items-center justify-center gap-5 rounded-3xl border border-white/10 bg-white/[0.03] px-6"
    >
      <LoaderCircle className="h-12 w-12 animate-spin text-teal-300/80" strokeWidth={1.5} />
      <p className="text-sm font-medium text-slate-300">{label}</p>
      <div className="flex w-full max-w-xs items-center gap-2" aria-hidden="true">
        <div className="h-1.5 flex-1 animate-pulse rounded-full bg-white/10" />
        <div className="h-1.5 w-8 animate-pulse rounded-full bg-white/20" />
        <div className="h-1.5 flex-1 animate-pulse rounded-full bg-white/10" />
      </div>
    </div>
  );
}
