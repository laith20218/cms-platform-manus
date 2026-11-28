import { useEffect, useId, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Dialog } from './Dialog';

/**
 * ConfirmDialog — explicit confirmation for consequential operator actions
 * (Wave 1). Built on the accessible Dialog primitive.
 *
 * Interaction contract (admin UX standards):
 *  - destructive/delegating actions get consequence text, never a silent fire
 *  - `variant="danger"` renders the consequence inside a red callout
 *  - `requireAcknowledge` keeps the confirm button disabled until the operator
 *    checks an explicit "I understand" box (high-risk actions)
 *  - `requireReason` keeps the confirm button disabled until a reason of at
 *    least `minLength` characters is provided (revoke/disable flows), and
 *    passes the trimmed reason to `onConfirm(reason)`
 *  - `busy` locks every dismissal path (Esc/backdrop/close) and both buttons
 *
 * Arabic-first defaults for every label; override per locale via props.
 * Stable test ids: `confirm-dialog-confirm` / `confirm-dialog-cancel` /
 * `confirm-dialog-reason`.
 */

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Consequence text — what will actually happen. */
  description?: string;
  onConfirm: (reason?: string) => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | 'secondary';
  /** While true: buttons lock and Esc/backdrop/close stay silent. */
  busy?: boolean;
  /** High-risk gate: confirm stays disabled until the checkbox is checked. */
  requireAcknowledge?: { label: string };
  /** Mandatory reason gate: confirm stays disabled until minLength is met. */
  requireReason?: { label?: string; placeholder?: string; minLength?: number };
  /** PR-5 — optional extra content between the consequence text and the gates
   * (usage/dependency chips, retention warnings, …). Rendered as-is. */
  children?: ReactNode;
  dir?: 'rtl' | 'ltr';
  testId?: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  variant = 'primary',
  busy = false,
  requireAcknowledge,
  requireReason,
  children,
  dir = 'rtl',
  testId,
}: ConfirmDialogProps) {
  const reasonId = useId();
  const consequenceId = useId();
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const reasonMin = requireReason?.minLength ?? 4;

  // Reset the gates whenever the dialog (re)opens or closes.
  useEffect(() => {
    setReason('');
    setAcknowledged(false);
  }, [open]);

  const reasonOk = !requireReason || reason.trim().length >= reasonMin;
  const ackOk = !requireAcknowledge || acknowledged;
  const canConfirm = reasonOk && ackOk;

  const confirm = () => {
    if (!canConfirm || busy) return;
    onConfirm(requireReason ? reason.trim() : undefined);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={variant === 'danger' ? undefined : description}
      ariaDescribedBy={variant === 'danger' && description ? consequenceId : undefined}
      dir={dir}
      size="sm"
      dismissGuard={busy}
      testId={testId}
    >
      <div className="space-y-4 px-5 py-4">
        {variant === 'danger' && description && (
          <div className="flex items-start gap-2.5 rounded-[10px] border border-[color:var(--c-danger-500)] bg-[color:var(--c-danger-50)] p-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--c-danger-500)]" />
            <p id={consequenceId} className="text-xs leading-relaxed text-[color:var(--c-danger-500)]">{description}</p>
          </div>
        )}

        {children}

        {requireAcknowledge && (
          <label className="flex cursor-pointer select-none items-start gap-2.5">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              disabled={busy}
              className="mt-0.5 h-4 w-4 accent-[color:var(--c-primary-700)]"
            />
            <span className="text-xs leading-relaxed text-[color:var(--c-text-soft)]">{requireAcknowledge.label}</span>
          </label>
        )}

        {requireReason && (
          <div className="space-y-1.5">
            <label htmlFor={reasonId} className="block text-xs font-medium text-[color:var(--c-text-soft)]">
              {requireReason.label ?? 'السبب'}
              <span aria-hidden="true" className="text-[color:var(--c-danger-500)]"> *</span>
            </label>
            <textarea
              id={reasonId}
              data-testid="confirm-dialog-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
              placeholder={requireReason.placeholder ?? 'اكتب السبب…'}
              rows={3}
              className="w-full rounded-[10px] border border-[color:var(--c-border-strong)] bg-[color:var(--c-surface)] px-3 py-2 text-xs text-[color:var(--c-text)] placeholder:text-[color:var(--c-text-faint)] focus:border-[color:var(--c-danger-500)] focus:outline-none focus:ring-4 focus:ring-[rgba(255,82,82,0.15)] disabled:opacity-50"
            />
            <p dir="ltr" className="font-mono text-[10px] text-[color:var(--c-text-muted)]">
              {reason.trim().length}/{reasonMin}
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 rounded-b-2xl border-t border-[color:var(--c-border)] bg-[color:var(--c-bg-elevated)] px-5 py-3.5">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onOpenChange(false)}
          disabled={busy}
          data-testid="confirm-dialog-cancel"
        >
          {cancelLabel}
        </Button>
        <Button
          variant={variant === 'danger' ? 'danger' : variant}
          size="sm"
          loading={busy}
          disabled={!canConfirm}
          onClick={confirm}
          data-testid="confirm-dialog-confirm"
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
