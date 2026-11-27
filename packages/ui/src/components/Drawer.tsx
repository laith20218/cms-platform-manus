import { useCallback, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../utils/cn';
import { useModalA11y } from '../utils/useModalA11y';

/**
 * Drawer — side sheet for create/edit flows (Wave 1).
 *
 * Same a11y contract as Dialog (portal, focus trap, Esc, scroll lock, focus
 * restore, guardable dismissal) on a full-height panel. The panel is anchored
 * with LOGICAL positioning (`side` maps to inline-start/inline-end), so it
 * lands on the reading-direction side in both `dir="rtl"` and `dir="ltr"`
 * (the hand-rolled drawers it replaces were physically `right-0`-anchored and
 * landed on the wrong side in the English locale).
 *
 * Structure: sticky header (title/description/close), scrollable body, sticky
 * footer slot — the standard admin form layout.
 */

const DRAWER_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const sizes = { md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Sticky footer slot (form actions). */
  footer?: ReactNode;
  /** Identity/status chips rendered in the sticky header, beside the close control. */
  headerExtra?: ReactNode;
  /** Logical anchor side. Default `end` (inline-end). */
  side?: 'start' | 'end';
  dir?: 'rtl' | 'ltr';
  size?: keyof typeof sizes;
  dismissGuard?: boolean;
  closeLabel?: string;
  testId?: string;
  className?: string;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  headerExtra,
  side = 'end',
  dir = 'rtl',
  size = 'lg',
  dismissGuard = false,
  closeLabel = 'إغلاق اللوحة',
  testId,
  className,
}: DrawerProps) {
  const titleId = useId();
  const descriptionId = useId();

  const close = useCallback(() => {
    if (dismissGuard) return;
    onOpenChange(false);
  }, [dismissGuard, onOpenChange]);

  const { surfaceRef } = useModalA11y({ open, onClose: close });

  // Off-screen offset for the slide animation, resolved from logical side +
  // direction (side="end" in rtl slides from the left edge).
  const offscreenX = side === 'end' ? (dir === 'rtl' ? '-100%' : '100%') : dir === 'rtl' ? '100%' : '-100%';

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80]" dir={dir} data-testid={testId}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]"
            role="presentation"
            aria-hidden="true"
            onMouseDown={close}
          />
          <motion.div
            ref={surfaceRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={{ x: offscreenX }}
            animate={{ x: 0 }}
            exit={{ x: offscreenX }}
            transition={{ duration: 0.28, ease: DRAWER_EASE }}
            onMouseDown={(event) => event.stopPropagation()}
            className={cn(
              'fixed inset-y-0 flex w-full flex-col border-[color:var(--c-border)] bg-[color:var(--c-surface)] shadow-2xl outline-none',
              side === 'end' ? 'end-0 border-s' : 'start-0 border-e',
              sizes[size],
              className,
            )}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[color:var(--c-border)] bg-[color:var(--c-bg-elevated)] px-5 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-base font-bold text-[color:var(--c-text)]">{title}</h2>
                {description && (
                  <p id={descriptionId} className="mt-0.5 text-xs text-[color:var(--c-text-muted)]">{description}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {headerExtra}
                <button
                  type="button"
                  onClick={close}
                  disabled={dismissGuard}
                  aria-label={closeLabel}
                  data-testid="drawer-close"
                  className="rounded-md p-1.5 text-[color:var(--c-text-muted)] transition-colors hover:bg-slate-100 disabled:opacity-40"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="border-t border-[color:var(--c-border)] bg-[color:var(--c-bg-elevated)] px-5 py-3.5">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
