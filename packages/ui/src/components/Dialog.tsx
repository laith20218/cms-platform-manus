import { useCallback, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../utils/cn';
import { useModalA11y } from '../utils/useModalA11y';

/**
 * Dialog — accessible modal primitive for @cms/ui (Wave 1).
 *
 * Contract ported from admin-web's AccessibleModal (the app's proven surface):
 *  - portal to document.body (escapes transformed/overflow-clipped parents)
 *  - role="dialog" + aria-modal + aria-labelledby/aria-describedby
 *  - focus trap (Tab/Shift+Tab cycle inside; initial focus on the panel)
 *  - Escape closes; focus restored to the invoker; body scroll lock
 *  - backdrop click dismiss (guardable via dismissGuard for busy submits)
 *
 * Styling: Tailwind + cn() on the --c-* token aliases (DESIGN_SYSTEM.md CP5:
 * logical utilities only). No Radix dependency — framer-motion only.
 * Note: arbitrary color values are type-hinted (`bg-[color:var(--c-*)]`)
 * because a bare `bg-[var(--c-*)]` is ambiguous (color vs position/size) for
 * Tailwind's candidate parser.
 */

const MODAL_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Heading (rendered as the dialog's h2 + aria-labelledby). */
  title: string;
  /** Secondary line (aria-describedby when present). */
  description?: string;
  /** ID of an existing description element outside the dialog header. */
  ariaDescribedBy?: string;
  children: ReactNode;
  /** Text direction of the portalled surface (it escapes the caller's dir scope). */
  dir?: 'rtl' | 'ltr';
  size?: keyof typeof sizes;
  /** When true, backdrop clicks, Escape and the close button stay silent (busy submit). */
  dismissGuard?: boolean;
  closeLabel?: string;
  testId?: string;
  className?: string;
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  ariaDescribedBy,
  children,
  dir = 'rtl',
  size = 'md',
  dismissGuard = false,
  closeLabel = 'إغلاق النافذة',
  testId,
  className,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  const close = useCallback(() => {
    if (dismissGuard) return;
    onOpenChange(false);
  }, [dismissGuard, onOpenChange]);

  const { surfaceRef } = useModalA11y({ open, onClose: close });

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6" dir={dir} data-testid={testId}>
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
            aria-describedby={ariaDescribedBy ?? (description ? descriptionId : undefined)}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.24, ease: MODAL_EASE }}
            onMouseDown={(event) => event.stopPropagation()}
            className={cn(
              'relative z-10 w-full rounded-2xl border bg-[color:var(--c-surface)] shadow-2xl outline-none',
              'border-[color:var(--c-border)]',
              sizes[size],
              className,
            )}
          >
            <div className="flex items-start justify-between gap-3 rounded-t-2xl border-b border-[color:var(--c-border)] bg-[color:var(--c-bg-elevated)] px-5 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-base font-bold text-[color:var(--c-text)]">{title}</h2>
                {description && (
                  <p id={descriptionId} className="mt-0.5 text-xs text-[color:var(--c-text-muted)]">{description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                disabled={dismissGuard}
                aria-label={closeLabel}
                data-testid="dialog-close"
                className="shrink-0 rounded-md p-1.5 text-[color:var(--c-text-muted)] transition-colors hover:bg-slate-100 disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
