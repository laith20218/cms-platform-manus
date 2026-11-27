import { useCallback, type ReactNode } from 'react';
import { LoaderCircle, RotateCcw, TriangleAlert, Inbox } from 'lucide-react';
import { cn } from '../utils/cn';
import { Drawer } from './Drawer';
import { Skeleton } from './Skeleton';

/**
 * DetailDrawer — the ONE read-only detail surface for row/entity details
 * (student, admin, role, security/audit event, settings history, library
 * file, exam results, access-code redemptions, server/provider details).
 *
 * It wraps the shared Drawer shell (portal, focus trap, Esc, scroll lock,
 * focus restore, RTL logical anchoring) and normalizes the four body
 * states every detail surface must own:
 *
 *   loading → skeleton rows (no layout jump, no fake values)
 *   ready   → children
 *   empty   → honest zero-data notice (never an alarm)
 *   error   → honest failure + Retry (never fabricated content)
 *
 * Sticky header (title/description/status chip) and sticky footer (safe
 * lifecycle actions) come from the Drawer contract; `headerExtra` carries
 * identity chips (avatar, status, metadata) next to the close control.
 */

export type DetailDrawerStatus = 'loading' | 'ready' | 'empty' | 'error';

const stateSizes = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;

export interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Stable, human-readable identity of the inspected record. */
  title: string;
  /** Secondary context line (record kind, phone, scope…). */
  description?: string;
  /** Identity/status chips rendered in the sticky header beside the close control. */
  headerExtra?: ReactNode;
  /** Body state — drives skeleton / content / empty / error. */
  status: DetailDrawerStatus;
  children?: ReactNode;
  /** Sticky footer with safe (non-destructive) lifecycle actions. */
  footer?: ReactNode;
  /** Error state wiring. */
  onRetry?: () => void;
  errorTitle?: string;
  errorDescription?: string;
  retryLabel?: string;
  /** Empty state wiring. */
  emptyTitle?: string;
  emptyDescription?: string;
  /** Loading a11y label (role=status). */
  loadingLabel?: string;
  dir?: 'rtl' | 'ltr';
  size?: keyof typeof stateSizes;
  dismissGuard?: boolean;
  closeLabel?: string;
  testId?: string;
  className?: string;
}

/**
 * Skeleton body for the loading state — 6 shimmer rows with varied widths so
 * the surface reserves a stable height (no shift when data lands).
 */
function DetailSkeleton({ rows = 6, ariaLabel }: { rows?: number; ariaLabel?: string }) {
  return (
    <div className="space-y-4" role="status" aria-label={ariaLabel} data-testid="detail-drawer-loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="space-y-2" aria-hidden="true">
          <Skeleton style={{ height: 10, width: index % 3 === 0 ? '38%' : '24%' }} />
          <Skeleton style={{ height: 14, width: index % 2 === 0 ? '92%' : '74%' }} />
        </div>
      ))}
    </div>
  );
}

export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  headerExtra,
  status,
  children,
  footer,
  onRetry,
  errorTitle = 'تعذّر تحميل التفاصيل',
  errorDescription = 'حدث خطأ أثناء جلب البيانات. يمكنك إعادة المحاولة.',
  retryLabel = 'إعادة المحاولة',
  emptyTitle = 'لا توجد بيانات',
  emptyDescription = 'لم يتم العثور على سجلات لهذا العنصر بعد.',
  loadingLabel = 'جارٍ تحميل التفاصيل…',
  dir = 'rtl',
  size = 'lg',
  dismissGuard = false,
  closeLabel = 'إغلاق اللوحة',
  testId,
  className,
}: DetailDrawerProps) {
  const retry = useCallback(() => { onRetry?.(); }, [onRetry]);

  let body: ReactNode = null;
  if (status === 'loading') {
    body = <DetailSkeleton ariaLabel={loadingLabel} />;
  } else if (status === 'error') {
    body = (
      <div
        className="flex flex-col items-center gap-3 py-10 text-center"
        role="alert"
        data-testid="detail-drawer-error"
      >
        <span
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border"
          style={{ borderColor: 'var(--c-danger-border, var(--c-border))', color: 'var(--c-danger)' }}
        >
          <TriangleAlert className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>{errorTitle}</p>
          <p className="text-xs" style={{ color: 'var(--c-text-muted)' }}>{errorDescription}</p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={retry}
            data-testid="detail-drawer-retry"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors"
            style={{ borderColor: 'var(--c-border)', color: 'var(--c-text)', background: 'var(--c-surface)' }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {retryLabel}
          </button>
        )}
      </div>
    );
  } else if (status === 'empty') {
    body = (
      <div className="flex flex-col items-center gap-2 py-10 text-center" role="status" data-testid="detail-drawer-empty">
        <span
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border"
          style={{ borderColor: 'var(--c-border)', color: 'var(--c-text-muted)' }}
        >
          <Inbox className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-sm font-bold" style={{ color: 'var(--c-text)' }}>{emptyTitle}</p>
        <p className="text-xs" style={{ color: 'var(--c-text-muted)' }}>{emptyDescription}</p>
      </div>
    );
  } else {
    body = children;
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      headerExtra={headerExtra}
      footer={footer}
      dir={dir}
      size={size}
      dismissGuard={dismissGuard}
      closeLabel={closeLabel}
      testId={testId}
      className={cn('detail-drawer', className)}
    >
      {body}
    </Drawer>
  );
}
