import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Push 10.4 — AccessibleModal (admin-web).
 *
 * The task book asks for "a Radix Dialog" surface in the upload failure flow,
 * but admin-web carries no Radix packages and the 10.4 lockfile exception
 * covers hls.js ONLY — so this primitive replicates the Radix Dialog contract
 * by hand on the center's existing framer-motion stack:
 *
 *  - Portal to document.body (escapes any transformed/overflow-clipped parent)
 *  - role="dialog" + aria-modal + aria-labelledby/aria-describedby
 *  - focus trap (Tab/Shift+Tab cycle inside the card; initial focus on the
 *    card itself), Escape closes, focus restored to the invoker on close
 *  - body scroll lock while open
 *  - backdrop click dismiss (guardable for busy states)
 *  - AnimatePresence scale/fade with the shell's easing
 */

const MODAL_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export interface AccessibleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Heading (rendered as the dialog's h2 + aria-labelledby). */
  title: string;
  /** Secondary line (aria-describedby when present). */
  description?: string;
  isArabic: boolean;
  children: ReactNode;
  /** Right-to-left visual direction (logical CSS handles the layout). */
  maxWidth?: string;
  /** When true, backdrop clicks and Escape stay silent (busy submit). */
  dismissGuard?: boolean;
  testId?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

export function AccessibleModal({
  open,
  onOpenChange,
  title,
  description,
  isArabic,
  children,
  maxWidth = 'max-w-lg',
  dismissGuard = false,
  testId,
}: AccessibleModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    if (dismissGuard) return;
    onOpenChange(false);
  }, [dismissGuard, onOpenChange]);

  // Body scroll lock + focus capture/restore.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Initial focus lands on the card (first control inside takes over on Tab).
    const focusTimer = window.setTimeout(() => cardRef.current?.focus(), 30);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  // Escape + focus trap (the card is the only tabbables scope while open).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const card = cardRef.current;
      if (!card) return;
      const focusable = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) {
        event.preventDefault();
        card.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === card)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (active !== card && !card.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, close]);

  const dir = isArabic ? 'rtl' : 'ltr';

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
          dir={dir}
          data-testid={testId}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute inset-0 bg-slate-950/55 backdrop-blur-[3px]"
            role="presentation"
            onMouseDown={close}
            aria-hidden="true"
          />
          <motion.div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.24, ease: MODAL_EASE }}
            onMouseDown={(event) => event.stopPropagation()}
            className={[
              'relative z-10 w-full rounded-2xl border bg-white shadow-2xl outline-none',
              maxWidth,
            ].filter(Boolean).join(' ')}
            style={{ borderColor: 'var(--cms-line)' }}
          >
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)', borderRadius: '0.9rem 0.9rem 0 0' }}>
              <div className="min-w-0">
                <h2 id={titleId} className="text-base font-bold" style={{ color: 'var(--cms-text)' }}>
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="mt-0.5 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                disabled={dismissGuard}
                aria-label={isArabic ? 'إغلاق النافذة' : 'Close dialog'}
                data-testid="modal-close"
                className="shrink-0 rounded-md p-1.5 transition-colors hover:bg-slate-100 disabled:opacity-40"
                style={{ color: 'var(--cms-text-muted)' }}
              >
                <X className="w-5 h-5" />
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
