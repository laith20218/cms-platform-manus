import { useEffect, useRef } from 'react';
import { Bell, EyeOff, X } from 'lucide-react';

/**
 * Night Task 8 — the bank practice «تنويه» modal.
 *
 * Shown when the student presses تدريب (Practice) in a bank bundle that
 * carries admin notice content (the exam-course Description). Two honest
 * actions per the brief:
 *   • «إخفاء» — hide for THIS visit (reappears on the next section entry);
 *   • «عدم العرض مرة أخرى» — persist per student + section (server
 *     preference; localStorage fallback on write failure).
 * The floating «تنويه» button reopens this modal anytime.
 */
export function BankNoticeModal({
  open,
  title,
  notice,
  onHide,
  onNeverShowAgain,
  onContinue,
  neverPending = false,
}: {
  open: boolean;
  title: string;
  notice: string;
  onHide: () => void;
  onNeverShowAgain: () => void;
  /** Proceed with the deferred practice navigation. */
  onContinue: () => void;
  neverPending?: boolean;
}) {
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) continueRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onContinue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onContinue]);

  if (!open) return null;

  return (
    <div dir="rtl" className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="تنويه قبل بدء التدريب" data-testid="bank-notice-modal">
      <button
        type="button"
        aria-label="إغلاق التنويه"
        tabIndex={-1}
        onClick={onContinue}
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] cursor-default"
        data-testid="bank-notice-backdrop"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--c-border-strong)] bg-[var(--cms-surface)] p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--grad-primary)' }}>
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[var(--cms-text-muted)]">قبل بدء التدريب</p>
            <h3 className="text-base font-extrabold text-[var(--cms-text)]">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onContinue}
            aria-label="إغلاق"
            className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[var(--cms-text-soft)] hover:bg-[var(--c-primary-50)] transition-colors"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <p className="mt-4 whitespace-pre-line rounded-xl border border-[var(--c-border)] bg-[var(--c-primary-50)] p-4 text-[14.5px] leading-relaxed text-[var(--cms-text-soft)]" data-testid="bank-notice-text">
          {notice}
        </p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onHide}
            data-testid="bank-notice-hide"
            className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--c-border-strong)] px-4 py-2 text-sm font-bold text-[var(--cms-text-soft)] transition-colors hover:bg-[var(--c-bg-hover)]"
          >
            <EyeOff className="w-4 h-4" aria-hidden="true" />
            إخفاء
          </button>
          <button
            type="button"
            onClick={onNeverShowAgain}
            disabled={neverPending}
            data-testid="bank-notice-never"
            className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--c-border-strong)] px-4 py-2 text-sm font-bold text-[var(--cms-text-muted)] transition-colors hover:bg-[var(--c-bg-hover)] disabled:opacity-50"
          >
            عدم العرض مرة أخرى
          </button>
          <button
            ref={continueRef}
            type="button"
            onClick={onContinue}
            data-testid="bank-notice-continue"
            className="press inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold text-white"
            style={{ background: 'var(--grad-primary)' }}
          >
            متابعة التدريب
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-[var(--c-text-faint)]">
          «إخفاء» لهذه الزيارة فقط — «عدم العرض مرة أخرى» يُحفظ لحسابك في هذا القسم.
        </p>
      </div>
    </div>
  );
}
