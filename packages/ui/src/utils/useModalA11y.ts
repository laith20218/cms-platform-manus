import { useEffect, useRef } from 'react';

/**
 * useModalA11y — shared overlay a11y contract for @cms/ui (Wave 1).
 *
 * Ported from admin-web's AccessibleModal (the app's proven implementation):
 *  - focus capture (panel gets initial focus; first control takes over on Tab)
 *  - Tab/Shift+Tab focus trap while open
 *  - Escape closes (callers guard it via their `onClose` wrapper)
 *  - focus restored to the invoker on close
 *  - body scroll lock while open
 *
 * PR-2: exported from the package barrel — AdminsCenter's DialogLayer and
 * NotificationCompose predate @cms/ui Dialog and retrofit this contract
 * directly. New surfaces should compose Dialog/Drawer instead.
 */

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

function isVisibleEnough(el: HTMLElement) {
  // Browsers: full CSS visibility check. jsdom (tests): no layout engine,
  // checkVisibility is undefined — treat as visible so the trap is testable.
  return typeof el.checkVisibility === 'function' ? el.checkVisibility() : true;
}

export interface UseModalA11yOptions {
  open: boolean;
  onClose: () => void;
}

export function useModalA11y({ open, onClose }: UseModalA11yOptions) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Body scroll lock + focus capture/restore.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Initial focus lands on the surface (first control inside takes over on Tab).
    const focusTimer = window.setTimeout(() => surfaceRef.current?.focus(), 30);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  // Escape + Tab focus trap (the surface is the only tabbables scope while open).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const surface = surfaceRef.current;
      if (!surface) return;
      const focusable = Array.from(surface.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisibleEnough);
      if (focusable.length === 0) {
        event.preventDefault();
        surface.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === surface)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (active !== surface && !surface.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  return { surfaceRef };
}
