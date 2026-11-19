import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router-dom';
import { Ticket, Loader2, CheckCircle2, AlertCircle, ChevronRight, KeyRound } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { getApiErrorMessage } from '@/utils/api-error';
import { clearEntitlementToken } from '@/features/entitlements/services/entitlement-api';
// Wave 18.2 (D-03): the SAME format contract as ActivationCodeModal — standard
// 16-char codes AND prefixed admin codes (22+), 12 significant chars minimum.
import {
  normalizeActivationCode,
  activationCodeIsSubmittable,
  ACTIVATION_CODE_MIN_SIGNIFICANT,
} from '@/utils/activation-code';

export default function ActivateCodePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [formatError, setFormatError] = useState('');

  const redeemMutation = useMutation({
    mutationFn: async (codeStr: string) => {
      const res = await apiClient.post('/subscriptions/redeem', { code: codeStr });
      return res.data;
    },
    onSuccess: () => {
      toast.success('تم تفعيل الكود بنجاح!');
      // Wave 18.2 (D-04): the exact same cache reset as ActivationCodeModal —
      // the signed entitlement token and the entitled-subjects caches are stale
      // now. (The dead ['subscriptions'] invalidation is removed: no query in
      // the app uses that key — grep-proven.)
      clearEntitlementToken();
      queryClient.invalidateQueries({ queryKey: ['my-subjects-entitled'] });
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      // ['stats'] is a prefix of the dashboard/progress key ['stats','me','all'].
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      setTimeout(() => navigate('/dashboard'), 1500);
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, 'فشل تفعيل الكود'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // D-03: reject codes shorter than the real format BEFORE hitting the API.
    if (!activationCodeIsSubmittable(code)) {
      setFormatError(`الكود أقصر من الصيغة المقبولة — أدخل ${ACTIVATION_CODE_MIN_SIGNIFICANT} محرفاً على الأقل (المعذّرة: الصيغة XXXX-XXXX-XXXX-XXXX وقد تتضمن بادئة إضافية).`);
      return;
    }
    setFormatError('');
    redeemMutation.mutate(code);
  };

  const submittable = activationCodeIsSubmittable(code);

  return (
    <div className="max-w-md mx-auto py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
          <Ticket className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--cms-text)]">تفعيل كود الاشتراك</h1>
          <p className="text-sm text-[var(--cms-text-muted)]">أدخل كود الاشتراك لفتح المحتوى</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6">
          <label htmlFor="activate-code-input" className="block text-sm font-semibold mb-4 text-[var(--cms-text)]">كود الاشتراك</label>
          {/* D-03: one flexible field (same as the modal) — the old fixed 4×4
              boxes capped input at 16 chars and silently truncated prefixed
              admin codes. */}
          <div className="relative">
            <KeyRound className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cms-text-faint)]" />
            <input
              id="activate-code-input"
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              value={code}
              onChange={(e) => {
                setCode(normalizeActivationCode(e.target.value));
                setFormatError('');
              }}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              disabled={redeemMutation.isPending}
              data-testid="activate-code-input"
              aria-invalid={formatError ? true : undefined}
              aria-describedby={formatError ? 'activate-code-format-error' : undefined}
              className="w-full rounded-2xl border-2 border-[var(--c-border-strong)] bg-[var(--cms-surface-2)] px-3 py-3.5 text-center text-lg font-bold tracking-wider outline-none transition-colors focus:border-[var(--c-primary-500)] disabled:opacity-60 ps-10"
              style={{ color: 'var(--cms-text)' }}
            />
          </div>
          {formatError ? (
            <p id="activate-code-format-error" role="alert" data-testid="activate-code-format-error" className="mt-3 text-xs font-semibold text-center" style={{ color: 'var(--cms-danger)' }}>
              {formatError}
            </p>
          ) : (
            <p className="text-xs text-center mt-3 text-[var(--cms-text-muted)]">الصيغة: XXXX-XXXX-XXXX-XXXX — وقد تتضمن الكودات بادئة إضافية</p>
          )}
        </div>
        <button
          type="submit"
          disabled={!submittable || redeemMutation.isPending}
          data-testid="activate-code-submit"
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-[var(--cms-text-inverse)] transition-colors disabled:opacity-50"
          style={{ background: 'var(--cms-teal-700)' }}
        >
          {redeemMutation.isPending ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> جارٍ التفعيل…</>
          ) : redeemMutation.isSuccess ? (
            <><CheckCircle2 className="w-5 h-5" /> تم التفعيل!</>
          ) : (
            <><Ticket className="w-5 h-5" /> تفعيل</>
          )}
        </button>
        {redeemMutation.isError && (
          <div className="flex items-start gap-2 p-4 rounded-xl border" style={{ background: 'var(--cms-danger-50)', borderColor: 'var(--cms-danger)' }} role="alert">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: 'var(--cms-danger)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--cms-danger)' }}>فشل التفعيل</p>
              <p className="text-xs mt-1 text-[var(--cms-text-muted)]">{getApiErrorMessage(redeemMutation.error, 'تأكد من أن الكود صحيح وغير منتهي وغير مستخدم.')}</p>
            </div>
          </div>
        )}
      </form>
      {/* D-44: ChevronRight = "back" in RTL (the W17.2 PathTrail convention). */}
      <Link to="/dashboard" data-testid="activate-code-back" className="flex items-center gap-1 mt-6 text-sm text-[var(--cms-text-muted)] hover:text-[var(--cms-teal-700)] transition-colors">
        <ChevronRight className="w-4 h-4" /> العودة للوحة التحكم
      </Link>
    </div>
  );
}
