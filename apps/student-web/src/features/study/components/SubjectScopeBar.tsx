import * as SelectPrimitive from '@radix-ui/react-select';
import { useSearchParams } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/utils';
import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';

/**
 * W17.1 — the study hub's subject scope control for the content / library /
 * courses tabs.
 *
 * Problem: those tabs honored ?subjectId= deep links only — once inside the
 * hub there was no visible way to see WHICH subject's content was on screen,
 * nor to switch scope («كل موادي» vs one subject) without leaving the tab.
 *
 * Decision: ONE compact Radix select, the same visual recipe as the bank
 * cascade's subject level (label prefix + chevron + 44px trigger + checked
 * option list), rendered by StudyPage in a stable slot above the tab panel.
 * It edits ?subjectId= in place (preserving tab + every other param), so the
 * URL stays the deep-linkable source of truth. Options are the ENTITLED
 * subjects (my-subjects) — the tab bodies answer a stale/unentitled pick with
 * their own activation gates, exactly like the bank (D2, no dead ends).
 *
 * `allowAll=false` (content tab): content is inherently per-subject — the
 * picker offers subjects only, no «كل موادي» row.
 */
export function SubjectScopeBar({ allowAll = true }: { allowAll?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const subjectId = searchParams.get('subjectId');
  const mySubjects = useMySubjects();
  const subjects = mySubjects.data ?? [];

  // Zero entitled subjects (or still loading into an empty grant state) → the
  // hosting tab renders its own locked/empty state; a lone select above it
  // would only add noise.
  if (subjects.length === 0) return null;

  const selected = subjects.find((s) => s.id === subjectId) ?? null;
  const placeholder = allowAll ? 'كل موادي' : 'اختر مادة';

  const pick = (next: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set('subjectId', next);
    else params.delete('subjectId');
    setSearchParams(params, { replace: true });
  };

  return (
    <section className="mb-4" aria-label="نطاق المادة" data-testid="study-scope-bar">
      <SelectPrimitive.Root
        value={subjectId ?? ''}
        onValueChange={(next) => pick(next === '__all__' ? null : next)}
      >
        <SelectPrimitive.Trigger
          aria-label="المادة"
          data-testid="study-scope-select"
          className={cn(
            'press inline-flex min-h-11 min-w-[9.5rem] max-w-full items-center justify-between gap-2 rounded-xl border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-primary-700)]',
            selected
              ? 'border-[var(--c-primary-600)] bg-[var(--c-primary-50)] text-[var(--c-primary-800)]'
              : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-soft)] hover:border-[var(--c-primary-500)]',
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn('shrink-0', selected ? 'text-[var(--c-primary-800)]' : 'text-[var(--c-text-muted)]')}>المادة:</span>
            <span className="truncate" data-testid="study-scope-value">
              {selected?.nameAr ?? placeholder}
            </span>
          </span>
          <SelectPrimitive.Icon>
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--c-text-muted)]" aria-hidden="true" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={6}
            className="z-[calc(var(--z-modal)+2)] max-h-72 min-w-[12rem] overflow-hidden rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-lg"
          >
            <SelectPrimitive.Viewport className="p-1.5">
              {allowAll && (
                <SelectPrimitive.Item
                  value="__all__"
                  data-testid="study-scope-option-all"
                  className="flex min-h-11 cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--c-text-soft)] outline-none data-[highlighted]:bg-[var(--c-bg-hover)]"
                >
                  كل موادي
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4 text-[var(--c-primary-700)]" aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              )}
              {subjects.map((subject) => (
                <SelectPrimitive.Item
                  key={subject.id}
                  value={subject.id}
                  data-testid={`study-scope-option-${subject.id}`}
                  className="flex min-h-11 cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium outline-none data-[highlighted]:bg-[var(--c-primary-50)] data-[highlighted]:text-[var(--c-primary-800)]"
                >
                  <span className="min-w-0 truncate">{subject.nameAr}</span>
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4 text-[var(--c-primary-700)]" aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </section>
  );
}
