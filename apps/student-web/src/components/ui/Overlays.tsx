import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/utils';

/**
 * Centered Radix dialog (Push 8): focus-trapped, ESC-dismissible, scroll-locked,
 * with soft scale-in animation. Used for the activation-code modal and any
 * confirm-style surface.
 */
export function CenteredDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  widthClass = 'max-w-md',
  hideClose = false,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  widthClass?: string;
  hideClose?: boolean;
  testId?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="dialog-overlay fixed inset-0 z-[var(--z-modal)] backdrop-blur-[3px]"
          style={{ background: 'rgba(8, 26, 38, 0.55)' }}
        />
        <DialogPrimitive.Content
          data-testid={testId}
          className={cn(
            'dialog-center fixed left-1/2 top-1/2 z-[calc(var(--z-modal)+1)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-[var(--c-surface)] shadow-2xl outline-none',
            widthClass
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-6">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-lg font-bold text-[var(--c-text)]">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="mt-1 text-sm text-[var(--c-text-muted)]">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            {!hideClose && (
              <DialogPrimitive.Close
                aria-label="إغلاق"
                className="press -me-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[var(--c-text-muted)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)]"
              >
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            )}
          </div>
          <div className="px-6 pb-6 pt-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Mobile bottom sheet (Push 8): a Radix Dialog variant that slides up from the
 * bottom edge, respects the iOS safe area, and renders as a full-width sheet.
 * On ≥sm it degrades gracefully to a centered dialog via CSS.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  testId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="dialog-overlay fixed inset-0 z-[var(--z-modal)] backdrop-blur-[2px]"
          style={{ background: 'rgba(8, 26, 38, 0.50)' }}
        />
        <DialogPrimitive.Content
          data-testid={testId}
          className="sheet-up dialog-center fixed left-1/2 top-auto bottom-0 z-[calc(var(--z-modal)+1)] w-full -translate-x-1/2 rounded-t-3xl bg-[var(--c-surface)] shadow-2xl outline-none sm:bottom-auto sm:top-1/2 sm:rounded-3xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Drag handle (mobile affordance) */}
          <div className="flex justify-center pt-3 sm:hidden" aria-hidden="true">
            <div className="h-1.5 w-10 rounded-full bg-[var(--c-border-strong)]" />
          </div>
          <div className="flex items-center justify-between px-6 pb-2 pt-3">
            <DialogPrimitive.Title className="text-base font-bold text-[var(--c-text)]">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="إغلاق"
              className="press flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--c-text-muted)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)]"
            >
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-4 pb-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
