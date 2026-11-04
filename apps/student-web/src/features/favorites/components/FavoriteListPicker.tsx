import { useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { ListPlus, Loader2, Plus, Star } from 'lucide-react';
import { cn } from '@/utils';
import { useCreateFavoriteList, useFavoriteLists, useToggleQuestionInFavoriteList } from '../hooks';

/** W15.0 — the QuestionPage list picker. The former binary star button now opens a Radix
 *  Popover: a «المفضلة العامة» checkbox (the flat favorite, unchanged semantics) + one
 *  checkbox per custom list (server-resolved membership via ?questionId=, optimistic
 *  toggles with rollback in hooks) + an inline «قائمة جديدة» creator that adds the
 *  question to the fresh list immediately.
 *
 *  Accessibility: Radix Popover (focus management, ESC, aria-expanded on the trigger),
 *  content labelled as a dialog, NATIVE checkbox inputs with visible labels (WCAG 2.2 AA),
 *  44px row targets, and a mobile-safe width (w-80 clamped by collisionPadding). */

export interface FavoriteListPickerProps {
  questionId: string;
  /** Current flat-favorite state (QuestionPage's override → cached value). */
  isFavorite: boolean;
  /** Toggles the FLAT favorite (existing mutation, unchanged semantics). */
  onToggleFlatFavorite: () => void;
  flatPending: boolean;
}

export function FavoriteListPicker({ questionId, isFavorite, onToggleFlatFavorite, flatPending }: FavoriteListPickerProps) {
  const [open, setOpen] = useState(false);
  const [newListName, setNewListName] = useState('');

  // Membership flags come server-side in the same round-trip (GetFavoriteLists ?questionId=).
  const listsQuery = useFavoriteLists(open ? questionId : undefined);
  const lists = listsQuery.data;
  const toggleInList = useToggleQuestionInFavoriteList();
  const createList = useCreateFavoriteList();

  const inAnyList = (lists ?? []).some((list) => list.containsQuestion === true);
  const triggerActive = isFavorite || inAnyList;

  const submitNewList = () => {
    const trimmed = newListName.trim();
    if (!trimmed || createList.isPending) return;
    createList.mutate(
      { name: trimmed },
      {
        onSuccess: (created) => {
          setNewListName('');
          // Add the CURRENT question to the fresh list right away.
          toggleInList.mutate({ listId: created.id, questionId, next: true });
        },
      },
    );
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        aria-haspopup="dialog"
        aria-label={triggerActive ? 'إدارة المفضلة والقوائم' : 'إضافة إلى المفضلة أو قائمة'}
        data-testid="question-favorite-button"
        disabled={flatPending}
        className={cn(
          'flex items-center gap-1.5 px-3 py-2 rounded-[8px] border text-[13px] font-semibold transition-all disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-primary-500)]',
          triggerActive
            ? 'bg-[var(--c-warning-500)] text-white border-[var(--c-warning-500)]'
            : 'border-[var(--c-border-strong)] text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)]',
        )}
      >
        <Star className="w-3.5 h-3.5" fill={triggerActive ? 'currentColor' : 'none'} />
        {triggerActive ? 'في المفضلة' : 'مفضلة'}
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          role="dialog"
          aria-label="إضافة السؤال إلى المفضلة أو قائمة"
          data-testid="favorite-list-picker"
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-2 shadow-lg outline-none"
        >
          {/* Flat favorite — the original binary toggle, unchanged semantics. */}
          <label
            data-testid="favorite-list-picker-flat"
            className="flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-[var(--c-bg-hover)]"
          >
            <input
              type="checkbox"
              checked={isFavorite}
              onChange={onToggleFlatFavorite}
              className="h-[18px] w-[18px] shrink-0 accent-[var(--c-warning-500)]"
              data-testid="favorite-list-picker-flat-checkbox"
            />
            <Star className="h-4 w-4 shrink-0 text-[var(--c-warning-500)]" fill="currentColor" />
            <span className="text-sm font-semibold text-[var(--c-text)]">المفضلة العامة</span>
          </label>

          <div className="my-1.5 border-t border-[var(--c-border)]" />

          <p className="flex items-center gap-1.5 px-3 pb-1 pt-0.5 text-xs font-bold text-[var(--c-text-muted)]">
            <ListPlus className="h-3.5 w-3.5" />
            قوائمي
          </p>

          {listsQuery.isLoading && (lists ?? []).length === 0 ? (
            <div className="flex min-h-11 items-center justify-center gap-2 text-sm text-[var(--c-text-muted)]" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ تحميل القوائم…
            </div>
          ) : (lists ?? []).length === 0 ? (
            <p className="px-3 pb-2 pt-1 text-xs leading-5 text-[var(--c-text-muted)]">
              لا توجد قوائم بعد — أنشئ أول قائمة من الحقل أدناه.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto" data-testid="favorite-list-picker-lists">
              {(lists ?? []).map((list) => {
                const checked = list.containsQuestion === true;
                return (
                  <label
                    key={list.id}
                    data-testid={`favorite-list-picker-item-${list.id}`}
                    className="flex min-h-11 cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-[var(--c-bg-hover)]"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={toggleInList.isPending && toggleInList.variables?.listId === list.id}
                      onChange={() => toggleInList.mutate({ listId: list.id, questionId, next: !checked })}
                      className="h-[18px] w-[18px] shrink-0 accent-[var(--c-primary-700)]"
                      data-testid={`favorite-list-picker-checkbox-${list.id}`}
                    />
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/5"
                      style={{ background: list.color ?? 'var(--c-primary-500)' }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--c-text)]" title={list.name}>
                      {list.name}
                    </span>
                    <span
                      dir="ltr"
                      className="shrink-0 rounded-full bg-[var(--c-bg-hover)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--c-text-muted)]"
                    >
                      {list.questionsCount}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Create-and-add: the new list gets this question as its first member. */}
          <form
            className="mt-1.5 flex items-center gap-2 border-t border-[var(--c-border)] px-2 pb-1 pt-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              submitNewList();
            }}
          >
            <label htmlFor="favorite-picker-new-list" className="sr-only">
              اسم قائمة جديدة
            </label>
            <input
              id="favorite-picker-new-list"
              type="text"
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              maxLength={100}
              placeholder="قائمة جديدة…"
              dir="auto"
              data-testid="favorite-list-picker-new-name"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--c-border-strong)] bg-[var(--c-surface)] px-3 py-2 text-sm text-[var(--c-text)] outline-none transition-colors focus:border-[var(--c-primary-500)]"
            />
            <button
              type="submit"
              disabled={!newListName.trim() || createList.isPending}
              aria-label="إنشاء القائمة وإضافة السؤال إليها"
              data-testid="favorite-list-picker-new-submit"
              className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--c-primary-700)] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {createList.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </form>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
