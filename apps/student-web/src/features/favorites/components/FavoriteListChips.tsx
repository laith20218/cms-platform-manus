import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Plus } from 'lucide-react';
import { CenteredDialog } from '@/components/ui/Overlays';
import { cn } from '@/utils';
import { useCreateFavoriteList } from '../hooks';
import type { FavoriteListSummary } from '../types';

/** W15.0 — the custom-lists chips row on the Favorites page: «الكل» + one chip per
 *  student-owned list (+ question count) + an «قائمة جديدة» creator dialog (name +
 *  color swatch). Selection drives ?listId= in the page URL (deep-linkable); the row
 *  reuses the platform's tablist convention (aria-selected, 44px targets, horizontal
 *  scroll with fade edges on mobile) so chips and the type tabs feel like one system. */

const PRESET_COLORS = ['#e11d48', '#f59e0b', '#10b981', '#14b8a6', '#8b5cf6', '#64748b'] as const;

export interface FavoriteListChipsProps {
  lists: FavoriteListSummary[] | undefined;
  isLoading: boolean;
  selectedListId: string | null;
  /** null = «الكل» (flat favorites view); a list id switches to list-scoped browse. */
  onSelect: (listId: string | null) => void;
}

export function FavoriteListChips({ lists, isLoading, selectedListId, onSelect }: FavoriteListChipsProps) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="fade-edges -mx-4 px-4 sm:mx-0 sm:px-0" data-testid="favorites-list-chips">
      <div className="flex w-full items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
        <div role="tablist" aria-label="قوائم المفضلة" className="flex gap-2">
          <ListChip
            testId="favorites-list-chip-all"
            active={selectedListId === null}
            color={null}
            label="الكل"
            count={null}
            onClick={() => onSelect(null)}
          />
          {(lists ?? []).map((list) => (
            <ListChip
              key={list.id}
              testId={`favorites-list-chip-${list.id}`}
              active={selectedListId === list.id}
              color={list.color}
              label={list.name}
              count={list.questionsCount}
              onClick={() => onSelect(list.id)}
            />
          ))}
          {isLoading && (lists ?? []).length === 0 && (
            <span className="sr-only" role="status">جارٍ تحميل القوائم…</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          aria-haspopup="dialog"
          data-testid="favorites-add-list-button"
          className="press inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-2xl border border-dashed border-[var(--c-border-strong)] px-3.5 py-2 text-sm font-semibold text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-400)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary-500)]"
        >
          <Plus className="h-4 w-4" />
          قائمة جديدة
        </button>
      </div>

      <CreateListDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(listId) => {
          setCreateOpen(false);
          onSelect(listId);
        }}
      />
    </div>
  );
}

function ListChip({
  testId,
  active,
  color,
  label,
  count,
  onClick,
}: {
  testId: string;
  active: boolean;
  color: string | null;
  label: string;
  count: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={testId}
      onClick={onClick}
      className={cn(
        'press relative inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl border px-3.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary-500)]',
        active
          ? 'border-[var(--c-primary-200)] font-bold text-[var(--c-primary-700)]'
          : 'border-[var(--c-border)] bg-[var(--c-surface)] font-medium text-[var(--c-text-muted)] hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)]',
      )}
    >
      {active && (
        <motion.span
          layoutId="favorites-list-chip-pill"
          className="absolute inset-0 rounded-2xl shadow-sm"
          style={{ background: 'var(--c-primary-50)' }}
          transition={{ type: 'spring', stiffness: 480, damping: 36 }}
        />
      )}
      <span
        aria-hidden="true"
        className="relative z-[1] h-2.5 w-2.5 shrink-0 rounded-full border border-black/5"
        style={{ background: color ?? 'var(--c-primary-500)' }}
      />
      <span className="relative z-[1] max-w-[10rem] truncate">{label}</span>
      {count !== null && (
        <span
          dir="ltr"
          className={cn(
            'relative z-[1] rounded-full px-1.5 py-0.5 text-[11px] font-bold',
            active ? 'bg-[var(--c-primary-100)] text-[var(--c-primary-700)]' : 'bg-[var(--c-bg-hover)] text-[var(--c-text-muted)]',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function CreateListDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (listId: string) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(PRESET_COLORS[0]);
  const createList = useCreateFavoriteList();

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed || createList.isPending) return;
    createList.mutate(
      { name: trimmed, color },
      {
        onSuccess: (created) => {
          setName('');
          setColor(PRESET_COLORS[0]);
          onCreated(created.id);
        },
      },
    );
  };

  return (
    <CenteredDialog
      open={open}
      onOpenChange={onOpenChange}
      title="قائمة مفضلة جديدة"
      description="نظّم أسئلتك في قوائم خاصة — مثل «التشريح — صعبة»."
      testId="favorites-create-list-dialog"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div>
          <label htmlFor="new-list-name" className="mb-1.5 block text-sm font-semibold text-[var(--c-text)]">
            اسم القائمة
          </label>
          <input
            id="new-list-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            required
            autoFocus
            dir="auto"
            placeholder="مثال: التشريح — صعبة"
            data-testid="favorites-create-list-name"
            className="min-h-11 w-full rounded-xl border border-[var(--c-border-strong)] bg-[var(--c-surface)] px-3.5 py-2 text-sm text-[var(--c-text)] outline-none transition-colors focus:border-[var(--c-primary-500)] focus-visible:ring-2 focus-visible:ring-[var(--c-primary-500)]"
          />
        </div>

        <div role="radiogroup" aria-label="لون القائمة" className="flex flex-wrap items-center gap-2">
          {PRESET_COLORS.map((preset) => {
            const selected = color === preset;
            return (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`لون ${preset}`}
                data-testid={`favorites-create-list-color-${preset.slice(1)}`}
                onClick={() => setColor(preset)}
                className="press flex h-11 w-11 items-center justify-center rounded-2xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary-500)]"
                style={{
                  background: preset,
                  borderColor: selected ? 'var(--c-text)' : 'transparent',
                }}
              >
                {selected && <Check className="h-5 w-5 text-white" />}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="min-h-11 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--c-text-muted)] transition-colors hover:bg-[var(--c-bg-hover)]"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={!name.trim() || createList.isPending}
            data-testid="favorites-create-list-submit"
            className="min-h-11 rounded-xl bg-[var(--c-primary-700)] px-5 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {createList.isPending ? 'جارٍ الإنشاء…' : 'إنشاء القائمة'}
          </button>
        </div>
      </form>
    </CenteredDialog>
  );
}
