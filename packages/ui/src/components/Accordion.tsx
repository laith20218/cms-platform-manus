import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * W15.0 — reusable accessible Accordion (no new dependencies; the lockfile is frozen
 * and @radix-ui/react-accordion is not installed). Extracted from the page-local
 * LectureAccordion of ExamCoursesPage so lecture/paragraph trees (and any future
 * nested structure) share one implementation.
 *
 * Accessibility (WCAG 2.2 AA): each item header is a native <button> (Enter/Space for
 * free) with aria-expanded + aria-controls; the panel is a role="region" labelled by
 * its header. Nesting is supported by rendering another <Accordion> inside content.
 *
 * Styling: chrome tokens default to the @cms/ui --c-* family (Card convention) but the
 * wrapper, header hover and chevron accept className overrides — pages on the --cms-*
 * family pass their own border/bg classes (tailwind-merge keeps the LAST conflict).
 */

export interface AccordionItemData {
  /** Stable id — wires aria-controls/aria-expanded and matches open-state keys. */
  id: string;
  /** Header label zone (title + subtitle…). Full row is the toggle button. */
  header: ReactNode;
  /** Optional leading zone (icon chip…). */
  headerIcon?: ReactNode;
  /** Optional trailing zone before the chevron (counts, actions…). */
  headerMeta?: ReactNode;
  /** Panel body — rendered only while open. May contain a nested <Accordion>. */
  content: ReactNode;
  disabled?: boolean;
}

export interface AccordionProps {
  items: AccordionItemData[];
  /** Uncontrolled initial open set (ids). Defaults to none open. */
  defaultOpenIds?: string[];
  /** Controlled open set — when provided, the component is fully controlled. */
  openIds?: string[];
  /** Fires with (id, nextOpen) on every toggle (both modes). */
  onToggle?: (id: string, open: boolean) => void;
  /** Wrapper chrome override (border/background for the --cms-* token family). */
  className?: string;
  /** Header-row hover override. */
  headerClassName?: string;
  /** Panel chrome override (e.g. border color for the --cms-* token family). */
  panelClassName?: string;
  /** Chevron color override. */
  chevronClassName?: string;
  /** Accessible name for the whole group. */
  label: string;
  testId?: string;
}

export function Accordion({
  items,
  defaultOpenIds,
  openIds,
  onToggle,
  className,
  headerClassName,
  panelClassName,
  chevronClassName,
  label,
  testId,
}: AccordionProps) {
  const controlled = openIds !== undefined;
  const [internalOpen, setInternalOpen] = useState<Set<string>>(() => new Set(defaultOpenIds ?? []));

  const isOpen = (id: string) =>
    controlled ? openIds.includes(id) : internalOpen.has(id);

  const toggle = (id: string) => {
    const next = !isOpen(id);
    if (!controlled) {
      setInternalOpen((previous) => {
        const nextSet = new Set(previous);
        if (next) nextSet.add(id);
        else nextSet.delete(id);
        return nextSet;
      });
    }
    onToggle?.(id, next);
  };

  return (
    <div className="space-y-3" data-testid={testId} role="group" aria-label={label}>
      {items.map((item) => {
        const open = isOpen(item.id);
        const headerId = `${item.id}-header`;
        const panelId = `${item.id}-panel`;
        return (
          <div
            key={item.id}
            className={cn(
              'rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] overflow-hidden',
              className,
            )}
          >
            <button
              type="button"
              id={headerId}
              onClick={() => toggle(item.id)}
              disabled={item.disabled}
              aria-expanded={open}
              aria-controls={panelId}
              data-testid={`accordion-header-${item.id}`}
              className={cn(
                'press w-full min-h-14 flex items-center gap-3 p-4 text-start transition-colors hover:bg-[var(--c-bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-primary-500)] disabled:cursor-not-allowed disabled:opacity-50',
                headerClassName,
              )}
            >
              {item.headerIcon}
              <div className="flex-1 min-w-0">{item.header}</div>
              {item.headerMeta}
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  'w-5 h-5 text-[var(--c-text-muted)] shrink-0 transition-transform',
                  open && 'rotate-180',
                  chevronClassName,
                )}
              />
            </button>
            {open && (
              <div
                id={panelId}
                role="region"
                aria-labelledby={headerId}
                data-testid={`accordion-panel-${item.id}`}
                className={cn('border-t border-[var(--c-border)]', panelClassName)}
              >
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
