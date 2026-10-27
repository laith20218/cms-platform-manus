import * as SelectPrimitive from '@radix-ui/react-select';
import { motion } from 'framer-motion';
import { ArrowUpDown, Check, ChevronDown, FileText, Film, ListChecks, LayoutGrid } from 'lucide-react';
import { cn } from '@/utils';
import type { FavoriteSort, FavoriteTargetType } from '../types';

/** Push 11.3 — type-filter tabs + sort dropdown. All state lives in the URL search
 *  params (shareable, back-button safe); the toolbar is a pure controlled surface.
 *
 *  Tabs use the platform's native ARIA tablist pattern (MyStudiesPage convention) —
 *  @radix-ui/react-tabs is not a dependency and the lockfile is frozen; this markup
 *  is fully WCAG 2.2 AA (roles, aria-selected, 44px targets, keyboard focusable). */

const TABS: ReadonlyArray<{ key: FavoriteTargetType | 'all'; label: string; icon: typeof LayoutGrid }> = [
  { key: 'all', label: 'الكل', icon: LayoutGrid },
  { key: 'question', label: 'الأسئلة', icon: ListChecks },
  { key: 'file', label: 'الملفات', icon: FileText },
  { key: 'episode', label: 'الحلقات', icon: Film },
];

const SORTS: ReadonlyArray<{ key: FavoriteSort; label: string }> = [
  { key: 'recent', label: 'الأحدث حفظًا' },
  { key: 'oldest', label: 'الأقدم حفظًا' },
  { key: 'alpha', label: 'أبجديًا (أ–ي)' },
];

export interface FavoritesToolbarProps {
  type: FavoriteTargetType | 'all';
  sort: FavoriteSort;
  onTypeChange: (type: FavoriteTargetType | 'all') => void;
  onSortChange: (sort: FavoriteSort) => void;
}

export function FavoritesToolbar({ type, sort, onTypeChange, onSortChange }: FavoritesToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div role="tablist" aria-label="تصفية المفضلة بالنوع" className="fade-edges -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex w-full gap-1 overflow-x-auto no-scrollbar rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-1.5 sm:w-fit">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = type === key;
            return (
              <button
                key={key}
                role="tab"
                type="button"
                aria-selected={active}
                data-testid={`favorites-tab-${key}`}
                onClick={() => onTypeChange(key)}
                className={cn(
                  'press relative inline-flex min-h-11 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm transition-colors sm:flex-none',
                  active ? 'font-bold' : 'font-medium text-[var(--c-text-muted)] hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)]',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="favorites-tab-pill"
                    className="absolute inset-0 rounded-xl shadow-sm"
                    style={{ background: 'var(--c-primary-50)', border: '1px solid var(--c-primary-200)' }}
                    transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                  />
                )}
                <Icon className={cn('relative z-[1] h-4 w-4', active && 'text-[var(--c-primary-700)]')} />
                <span className={cn('relative z-[1]', active && 'text-[var(--c-primary-700)]')}>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="shrink-0">
        <label className="sr-only" htmlFor="favorites-sort">ترتيب المفضلة</label>
        <SelectPrimitive.Root value={sort} onValueChange={(value) => onSortChange(value as FavoriteSort)}>
          <SelectPrimitive.Trigger
            id="favorites-sort"
            aria-label="ترتيب المفضلة"
            data-testid="favorites-sort"
            className="inline-flex min-h-11 items-center justify-between gap-2 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2 text-sm font-semibold text-[var(--c-text)] transition-colors hover:bg-[var(--c-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary-500)]"
          >
            <span className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 text-[var(--c-text-muted)]" />
              {SORTS.find(option => option.key === sort)?.label}
            </span>
            <SelectPrimitive.Icon>
              <ChevronDown className="h-4 w-4 text-[var(--c-text-muted)]" />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>
          <SelectPrimitive.Portal>
            <SelectPrimitive.Content
              position="popper"
              sideOffset={6}
              className="z-50 min-w-[12rem] overflow-hidden rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-lg"
            >
              <SelectPrimitive.Viewport className="p-1.5">
                {SORTS.map(({ key, label }) => (
                  <SelectPrimitive.Item
                    key={key}
                    value={key}
                    className="flex min-h-11 cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium text-[var(--c-text)] outline-none data-[highlighted]:bg-[var(--c-primary-50)] data-[highlighted]:text-[var(--c-primary-700)]"
                  >
                    {label}
                    <SelectPrimitive.ItemIndicator>
                      <Check className="h-4 w-4 text-[var(--c-primary-700)]" />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
      </div>
    </div>
  );
}
