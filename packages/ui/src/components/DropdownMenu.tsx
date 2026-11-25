import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { MoreVertical } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * DropdownMenu — anchored action menu primitive for @cms/ui (Command Center P1).
 *
 * The row-action "⋮" contract for every admin data table:
 *  - portal to document.body, anchored to the trigger (flips above when the
 *    menu would overflow the viewport bottom, clamps horizontally)
 *  - trigger: aria-haspopup="menu" + aria-expanded; menu: role="menu";
 *    items: role="menuitem" (disabled items keep the role + aria-disabled)
 *  - keyboard: ↓/↑ cycle items, Home/End jump, Escape closes and restores
 *    focus to the trigger, Tab closes naturally (no trap — it is an anchored
 *    menu, not a modal; no body scroll lock either)
 *  - outside pointerdown closes
 *  - dir-aware logical alignment (start/end flip between LTR and RTL)
 *
 * Styling: Tailwind + cn() on the --c-* token aliases, same as Dialog.
 * No Radix dependency — framer-motion only.
 */

const MENU_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const ITEM_FOCUSABLE = 'button:not([disabled])';

export interface DropdownMenuItem {
  /** Stable key for list rendering (also the typeahead-free identity). */
  key: string;
  label: string;
  icon?: ReactNode;
  /** Destructive action — red text, required to be confirm-gated by callers. */
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  /** Render a separator above this item (groups actions visually). */
  dividerBefore?: boolean;
}

export interface DropdownMenuProps {
  items: DropdownMenuItem[];
  /** Trigger content (icon and/or text). Wrapped in the a11y button. */
  trigger: ReactNode;
  /** Accessible name for the trigger button (also its title). */
  triggerLabel: string;
  align?: 'start' | 'end';
  dir?: 'rtl' | 'ltr';
  testId?: string;
}

export function DropdownMenu({
  items,
  trigger,
  triggerLabel,
  align = 'end',
  dir = 'rtl',
  testId,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusRef = useRef<'first' | 'last' | null>(null);
  const enabledItems = items.filter((item) => !item.disabled);

  const close = useCallback((focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  // Position: anchor under the trigger, flip above on bottom overflow, clamp
  // horizontally. Measured after mount (menu height) via useLayoutEffect so
  // the first paint is already correct — no visible jump.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = menu.offsetHeight;
    const menuWidth = menu.offsetWidth;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const margin = 6;

    let top = rect.bottom + margin;
    if (top + menuHeight > viewportHeight - margin && rect.top - margin - menuHeight > margin) {
      top = rect.top - margin - menuHeight;
    }

    // Logical alignment: "end" hugs the inline-end edge of the trigger.
    const logicalEndX = dir === 'rtl' ? rect.left : rect.right - menuWidth;
    const logicalStartX = dir === 'rtl' ? rect.right - menuWidth : rect.left;
    let left = align === 'end' ? logicalEndX : logicalStartX;
    left = Math.min(Math.max(left, margin), Math.max(margin, viewportWidth - menuWidth - margin));

    setPosition({ top, left });
  }, [open, align, dir, items]);

  // Outside pointerdown closes (no focus steal).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  // Global Escape (keydown, capture) closes and restores focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, close]);

  const focusItemAt = (index: number) => {
    if (enabledItems.length === 0) return;
    const bounded = (index + enabledItems.length) % enabledItems.length;
    const buttons = menuRef.current?.querySelectorAll<HTMLButtonElement>(ITEM_FOCUSABLE);
    const target = buttons?.item(bounded);
    target?.focus();
  };

  // Keyboard-open moves focus into the menu AFTER it mounts (the portal DOM does
  // not exist in the keydown tick); mouse-open keeps focus on the trigger.
  useEffect(() => {
    if (!open) return;
    const target = pendingFocusRef.current;
    if (!target) return;
    pendingFocusRef.current = null;
    const focusTimer = window.setTimeout(() => {
      if (target === 'first') focusItemAt(0);
      else focusItemAt(enabledItems.length - 1);
    }, 30);
    return () => window.clearTimeout(focusTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enabledItems is derived from items; refocusing on item changes is not wanted
  }, [open]);

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      pendingFocusRef.current = 'first';
      setOpen(true);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      pendingFocusRef.current = 'last';
      setOpen(true);
    }
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (enabledItems.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItemAt(0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItemAt(enabledItems.length - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItemAt(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItemAt(enabledItems.length - 1);
    }
  };

  const handleItemKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItemAt(index + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItemAt(index - 1);
    }
  };

  const enabledIndex = (key: string) => enabledItems.findIndex((item) => item.key === key);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        title={triggerLabel}
        data-testid={testId ? `${testId}-trigger` : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[color:var(--c-text-soft)] hover:bg-[color:var(--c-ivory-100)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--c-primary-500)]"
      >
        {trigger}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              role="menu"
              dir={dir}
              data-testid={testId}
              tabIndex={-1}
              aria-label={triggerLabel}
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.14, ease: MENU_EASE }}
              onKeyDown={handleMenuKeyDown}
              style={{
                position: 'fixed',
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                zIndex: 90,
                minWidth: 190,
              }}
              className="rounded-xl border bg-white py-1.5 shadow-lg shadow-slate-900/10 border-[color:var(--c-border)]"
            >
              {items.map((item) => (
                <div key={item.key}>
                  {item.dividerBefore && <div className="my-1.5 h-px bg-[color:var(--c-border)]" role="separator" />}
                  <button
                    type="button"
                    role="menuitem"
                    aria-disabled={item.disabled || undefined}
                    data-testid={testId ? `${testId}-item-${item.key}` : undefined}
                    disabled={item.disabled}
                    onClick={() => {
                      if (item.disabled) return;
                      close(true);
                      item.onSelect?.();
                    }}
                    onKeyDown={(event) => handleItemKeyDown(event, enabledIndex(item.key))}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-sm text-start transition-colors',
                      'focus-visible:bg-[color:var(--c-ivory-100)] focus-visible:outline-none',
                      item.disabled
                        ? 'cursor-not-allowed text-[color:var(--c-text-muted)] opacity-60'
                        : item.danger
                          ? 'text-[color:var(--c-danger-600)] hover:bg-[color:var(--c-danger-50)]'
                          : 'text-[color:var(--c-text)] hover:bg-[color:var(--c-ivory-100)]',
                    )}
                  >
                    {item.icon && <span className="shrink-0 [&>svg]:w-4 [&>svg]:h-4">{item.icon}</span>}
                    <span className="truncate">{item.label}</span>
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        ,
        document.body,
      )}
    </>
  );
}

/**
 * RowActionsMenu — the table-row "⋮" dropdown (Command Center P1).
 *
 * Thin composition of DropdownMenu with the standard three-dots trigger, for
 * the five admin centers (Students, Questions, Courses, Exams, Library).
 * Destructive items (danger: true) MUST route through a ConfirmDialog in the
 * caller — this component only groups the actions; it does not confirm.
 */
export interface RowActionsMenuProps {
  items: DropdownMenuItem[];
  /** Accessible name, e.g. bilingual 'إجراءات السطر' / 'Row actions'. */
  label: string;
  align?: 'start' | 'end';
  dir?: 'rtl' | 'ltr';
  testId?: string;
}

export function RowActionsMenu({ items, label, align = 'end', dir = 'rtl', testId }: RowActionsMenuProps) {
  return (
    <DropdownMenu
      items={items}
      triggerLabel={label}
      align={align}
      dir={dir}
      testId={testId}
      trigger={<MoreVertical className="w-4 h-4" aria-hidden="true" />}
    />
  );
}
