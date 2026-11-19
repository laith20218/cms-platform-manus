import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, BookOpen, CheckCircle2, KeyRound, Loader2, Lock, X } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { apiClient } from '@/services/api-client';
import { clearEntitlementToken } from '@/features/entitlements/services/entitlement-api';
// Wave 18.2 (D-03/D-04): the format rules + cache reset now live in ONE place —
// utils/activation-code.ts and the page-aligned invalidation set below.
import {
  normalizeActivationCode,
  activationCodeIsSubmittable,
} from '@/utils/activation-code';

/**
 * Activation-code modal (Push 6 flow, Push 8 Radix rebuild): an unentitled
 * subject card opens this elegant focus-trapped dialog (Radix Dialog) over
 * the page. On success the student is routed into /my-studies?subjectId=…
 * with the fresh grant.
 */
export function ActivationCodeModal({
  subject,
  onClose,
}: {
  subject: { id: string; nameAr: string };
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');

  const redeemMutation = useMutation({
    mutationFn: async (codeStr: string) => {
      const res = await apiClient.post('/subscriptions/redeem', { code: codeStr });
      return res.data;
    },
    onSuccess: async () => {
      // The signed entitlement token and the entitled-subjects cache are stale now.
      // Wave 18.2 (D-04): ['subscriptions'] removed — no query uses that key.
      clearEntitlementToken();
      await queryClient.invalidateQueries({ queryKey: ['my-subjects-entitled'] });
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      setTimeout(() => {
        onClose();
        // W17.3 — post-activation lands on the SUBJECT page (/subjects/{id}; the
        // route accepts GUIDs): it renders only the surfaces the fresh grant
        // actually covers, whatever its scope — safer than assuming a questions
        // grant (was /exams?subjectId=, the W16.1a destination retired in W17.0).
        navigate(`/subjects/${subject.id}`);
      }, 900);
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    // 12 = legacy no-dash codes, 16 = standard codes, 22+ = prefixed admin codes
    // (shared rule with the activation page — utils/activation-code.ts).
    if (!activationCodeIsSubmittable(code) || redeemMutation.isPending) return;
    redeemMutation.mutate(code);
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="dialog-overlay fixed inset-0 z-[var(--z-modal)] backdrop-blur-[3px]"
          style={{ background: 'rgba(8, 26, 38, 0.55)' }}
        />
        <DialogPrimitive.Content
          data-testid="activation-modal"
          className="dialog-center fixed left-1/2 top-1/2 z-[calc(var(--z-modal)+1)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl bg-[var(--c-surface)] shadow-2xl outline-none"
        >
          {/* Header — calm brand surface with the lock badge */}
          <div className="relative p-6 pb-5 text-center" style={{ background: 'var(--c-primary-50)' }}>
            <DialogPrimitive.Close
              aria-label="إغلاق"
              data-testid="activation-modal-close"
              className="press absolute end-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl text-[var(--c-text-muted)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)]"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
            <div
              className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-md"
              style={{ background: 'var(--c-primary-700)' }}
            >
              <Lock className="h-7 w-7" />
            </div>
            <DialogPrimitive.Title className="text-lg font-bold text-[var(--c-text)]">
              هذه المادة تحتاج كود تفعيل
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-sm text-[var(--c-text-muted)]">
              مادة <strong className="text-[var(--c-primary-700)]">{subject.nameAr}</strong> مقفلة حالياً — أدخل كود الاشتراك لفتح محتواها فوراً.
            </DialogPrimitive.Description>
          </div>

          {/* Body */}
          <form onSubmit={submit} className="space-y-4 p-6 pt-5">
            <div>
              <label htmlFor="activation-code-input" className="mb-2 block text-sm font-semibold text-[var(--c-text)]">
                كود الاشتراك
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--c-text-faint)]" />
                <input
                  id="activation-code-input"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  dir="ltr"
                  value={code}
                  onChange={(event) => setCode(normalizeActivationCode(event.target.value))}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  disabled={redeemMutation.isPending || redeemMutation.isSuccess}
                  aria-label="كود الاشتراك — 12 محرفاً على الأقل وقد يتضمن بادئة إضافية"
                  className="w-full rounded-2xl border-2 border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-3.5 text-center text-lg font-bold tracking-wider transition-colors focus:border-[var(--c-primary-500)] focus:outline-none disabled:opacity-60 ps-10"
                  style={{ color: 'var(--c-text)' }}
                  data-testid="activation-code-input"
                />
              </div>
              <p className="mt-2 text-center text-xs text-[var(--c-text-faint)]">الصيغة: XXXX-XXXX-XXXX-XXXX — وقد تتضمن الكودات بادئة إضافية</p>
            </div>

            {redeemMutation.isError && (
              <div
                className="flex items-start gap-2 rounded-2xl border border-[var(--c-danger)] bg-[var(--c-danger-50)] p-3"
                data-testid="activation-modal-error"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--c-danger)]" />
                <p className="text-xs leading-relaxed text-[var(--c-text)]">
                  {(redeemMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                    ?? 'فشل تفعيل الكود — تأكد من أنه صحيح وغير منتهي وغير مستخدم.'}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={!activationCodeIsSubmittable(code) || redeemMutation.isPending || redeemMutation.isSuccess}
              className="press inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-bold text-white shadow-md disabled:opacity-50"
              style={{ background: 'var(--c-primary-700)' }}
              data-testid="activation-modal-submit"
            >
              {redeemMutation.isPending ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> جارٍ التفعيل…</>
              ) : redeemMutation.isSuccess ? (
                <><CheckCircle2 className="h-5 w-5" /> تم التفعيل! جارٍ فتح المادة…</>
              ) : (
                <><KeyRound className="h-5 w-5" /> تفعيل وفتح المادة</>
              )}
            </button>

            <p className="text-center text-xs leading-relaxed text-[var(--c-text-faint)]">
              <BookOpen className="me-1 -mt-0.5 inline-block h-3.5 w-3.5" />
              الكود يُفعَّل لمرة واحدة ويرتبط بحسابك — يمكنك إدخال عدة أكواد لفتح مواد مختلفة.
            </p>

            {/* W17.3 — the explicit escape to the full activation page: students
                without a code in hand get the Owner-mandated «الذهاب لتفعيل كود»
                path; the inline field above stays the primary, fastest flow. */}
            <p className="border-t border-[var(--c-border)] pt-3 text-center text-xs text-[var(--c-text-muted)]">
              ليس لديك كود بعد؟{' '}
              <Link
                to="/activate-code"
                data-testid="activation-modal-goto-page"
                className="font-bold text-[var(--c-primary-700)] hover:underline"
              >
                الذهاب لتفعيل كود
              </Link>
            </p>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
