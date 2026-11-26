/** PR-2 — the admin command palette (Ctrl/Cmd+K), completed.
 *
 * Replaces the inline palette from Command Center P1 with a proper
 * WAI-ARIA combobox-in-dialog surface:
 *  - role="dialog" + aria-modal + labelled
 *  - input is a combobox controlling a listbox (aria-controls /
 *    aria-activedescendant); options are role="option" + aria-selected
 *  - ArrowUp/ArrowDown/Home/End move the active option (wrapping), Enter
 *    selects, Escape closes
 *  - Tab is trapped (single-field surface — the list is navigated with
 *    arrows per the combobox pattern, so Tab must not leak to the page)
 *  - focus is captured on open and restored to the invoker on close;
 *    body scroll is locked while open
 *  - RTL-safe centering: `left-0 right-0 mx-auto` instead of the old
 *    insetInlineStart 50% + translateX(-50%) (which mis-centers in RTL)
 *
 * Permission-awareness: the caller passes an already-filtered item list
 * (App composes navGroups through can() + superOnly) — the palette never
 * decides authorization itself.
 */

import { useEffect, useId, useMemo, useRef, useState, type ComponentType } from 'react';
import { Search, SearchX } from 'lucide-react';

export interface CommandPaletteItem {
  /** Stable key (the View key). */
  key: string;
  /** Localized label (Arabic primary). */
  label: string;
  /** Localized group heading (nav group label). */
  group: string;
  icon: ComponentType<{ size?: number | string; className?: string }>;
}

export interface CommandPaletteLabels {
  /** Dialog accessible name. */
  dialogLabel: string;
  /** Input placeholder. */
  placeholder: string;
  /** No-results line. */
  noResults: string;
  /** Screen-reader hint for the keyboard shortcut. */
  openHint: string;
}

export interface CommandPaletteProps {
  items: CommandPaletteItem[];
  /** Key of the currently active view (highlighted option). */
  activeKey?: string | null;
  onSelect: (key: string) => void;
  onClose: () => void;
  labels: CommandPaletteLabels;
  isArabic: boolean;
}

export function CommandPalette({ items, activeKey, onSelect, onClose, labels, isArabic }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q)
        || item.key.toLowerCase().includes(q)
        || item.group.toLowerCase().includes(q),
    );
  }, [items, query]);

  // Reset the active index whenever the result set changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query, items]);

  // On mount (the palette only mounts while open): capture the invoker for
  // focus restore, focus the input, lock body scroll.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  const choose = (index: number) => {
    const item = filtered[index];
    if (!item) return;
    onSelect(item.key);
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      // Combobox-with-listbox pattern: the list is arrow-navigable; keep Tab
      // inside the single-field surface so focus never leaks to the page.
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (filtered.length === 0 ? 0 : (current + 1) % filtered.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (filtered.length === 0 ? 0 : (current - 1 + filtered.length) % filtered.length));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, filtered.length - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      choose(activeIndex);
    }
  };

  // Group the flat list into sections (heading between item groups).
  const sections = useMemo(() => {
    const out: Array<{ group: string; items: Array<{ item: CommandPaletteItem; index: number }> }> = [];
    filtered.forEach((item, index) => {
      const last = out[out.length - 1];
      if (last && last.group === item.group) last.items.push({ item, index });
      else out.push({ group: item.group, items: [{ item, index }] });
    });
    return out;
  }, [filtered]);

  const optionId = (index: number) => `${listId}-option-${index}`;

  return (
    <>
      <div
        className="sidebar-backdrop"
        style={{ zIndex: 60 }}
        role="presentation"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.dialogLabel}
        data-testid="command-palette"
        dir={isArabic ? 'rtl' : 'ltr'}
        className="fixed top-[18%] left-0 right-0 mx-auto z-[70] w-[92%] max-w-[520px] rounded-xl overflow-hidden"
        style={{ background: 'var(--cms-surface)', boxShadow: 'var(--cms-shadow-xl)' }}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-center gap-2 px-4 py-3 border-b"
          style={{ borderColor: 'var(--cms-line)' }}
        >
          <Search size={18} style={{ color: 'var(--cms-text-muted)' }} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={filtered.length > 0 ? optionId(activeIndex) : undefined}
            aria-label={labels.openHint}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={labels.placeholder}
            data-testid="command-input"
            className="flex-1 border-none bg-transparent outline-none text-sm"
            style={{ color: 'var(--cms-text)' }}
          />
          <kbd
            aria-hidden="true"
            className="text-[10px] rounded border px-1.5 py-0.5"
            style={{ color: 'var(--cms-text-muted)', borderColor: 'var(--cms-line)' }}
          >
            ESC
          </kbd>
        </div>
        <div id={listId} role="listbox" aria-label={labels.dialogLabel} className="max-h-[320px] overflow-y-auto p-1">
          {sections.map((section) => (
            <div key={section.group}>
              <div
                className="px-3.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: 'var(--cms-text-muted)' }}
              >
                {section.group}
              </div>
              {section.items.map(({ item, index }) => {
                const isActive = index === activeIndex;
                const isCurrentView = item.key === activeKey;
                return (
                  <button
                    key={item.key}
                    id={optionId(index)}
                    role="option"
                    aria-selected={isActive}
                    type="button"
                    tabIndex={-1}
                    data-testid={`command-option-${item.key}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(index)}
                    className="flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-md text-sm font-medium text-start cursor-pointer"
                    style={{
                      background: isActive ? 'var(--cms-teal-50)' : 'transparent',
                      color: isCurrentView ? 'var(--cms-teal-700)' : 'var(--cms-text)',
                    }}
                  >
                    <item.icon size={16} aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div
              className="flex items-center justify-center gap-2 py-6 text-[13px]"
              style={{ color: 'var(--cms-text-muted)' }}
            >
              <SearchX size={16} aria-hidden="true" />
              {labels.noResults}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
