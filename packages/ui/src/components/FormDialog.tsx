import { useId, type FormEvent, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Dialog } from './Dialog';

/**
 * FormDialog — the ONE short-form surface (create/edit, re-authentication,
 * focused decisions, compact workflows) on the shared Dialog shell.
 *
 * Contract (Command Center P2):
 *  - semantic dialog role + aria-modal + labelled title/description
 *  - focus trap / focus return / Escape / deliberate backdrop (Dialog)
 *  - native <form> + onSubmit that CANNOT double-submit while busy
 *  - Cancel (secondary) and the primary action in the standard footer slot;
 *    the danger variant is visually separated (red, own tone) and never sits
 *    unlabelled beside safe actions
 *  - busy state swaps the submit label to an honest «جارٍ …» label so the
 *    button never goes blank or spinner-only
 *  - dismissGuard while busy: backdrop/Escape stay silent
 *
 * Complex multi-step editors stay full pages; details belong in DetailDrawer.
 */

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Submit handler — receives the native form event; busy disables re-entry. */
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** Primary action label (e.g. حفظ التغييرات). */
  submitLabel: string;
  /** Honest busy label (e.g. جارٍ الحفظ…) — replaces the label while busy. */
  submitBusyLabel?: string;
  cancelLabel?: string;
  /** true → the submit renders in the danger tone (visually separated). */
  danger?: boolean;
  busy?: boolean;
  /** Extra disable condition for the submit (validation beyond native). */
  submitDisabled?: boolean;
  /** Optional secondary surface action rendered before Cancel (e.g. عرض التفاصيل). */
  secondaryAction?: ReactNode;
  /** Optional leading icon node for the submit button. */
  submitIcon?: ReactNode;
  dir?: 'rtl' | 'ltr';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  testId?: string;
  className?: string;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  submitLabel,
  submitBusyLabel,
  cancelLabel = 'إلغاء',
  danger = false,
  busy = false,
  submitDisabled = false,
  secondaryAction,
  submitIcon,
  dir = 'rtl',
  size = 'md',
  testId,
  className,
}: FormDialogProps) {
  const statusId = useId();

  const submitText = busy && submitBusyLabel ? submitBusyLabel : submitLabel;
  const disabled = busy || submitDisabled;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      dir={dir}
      size={size}
      dismissGuard={busy}
      testId={testId}
      className={className}
    >
      <form
        onSubmit={(event) => { if (busy) { event.preventDefault(); return; } onSubmit(event); }}
        className="flex max-h-[calc(100vh-14rem)] flex-col"
      >
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <p id={statusId} className="sr-only" role="status" data-testid="form-dialog-status">
          {busy ? submitText : ''}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--c-border)] bg-[color:var(--c-bg-elevated)] px-5 py-3.5">
          {secondaryAction}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            data-testid="form-dialog-cancel"
            className="rounded-lg border border-[color:var(--c-border)] px-4 py-2 text-sm font-medium text-[color:var(--c-text)] transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={disabled}
            data-testid="form-dialog-submit"
            className={
              danger
                ? 'inline-flex min-w-32 items-center justify-center gap-2 rounded-lg bg-[color:var(--c-danger)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
                : 'inline-flex min-w-32 items-center justify-center gap-2 rounded-lg bg-[color:var(--c-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
            }
          >
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : submitIcon}
            {submitText}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
