import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, BookOpen, CheckCircle2, KeyRound, Loader2, Lock, X } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { clearEntitlementToken } from '@/features/entitlements/services/entitlement-api';

/** Normalizes free-typed codes into XXXX-XXXX-XXXX-XXXX (16 significant chars). */
function normalizeCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
  return (cleaned.match(/.{1,4}/g) ?? []).join('-');
}

/**
 * Push 6 Task 3: the subject card in the subjects browser no longer navigates
 * to a dead "locked" page for unentitled subjects — it opens this modal over
 * the page and asks for the activation code directly. On success the student
 * is routed into /my-studies?subjectId=…&tab=exams with the fresh grant.
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

  // Escape closes the modal.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const redeemMutation = useMutation({
    mutationFn: async (codeStr: string) => {
      const res = await apiClient.post('/subscriptions/redeem', { code: codeStr });
      return res.data;
    },
    onSuccess: async () => {
      // The signed entitlement token and the entitled-subjects cache are stale now.
      clearEntitlementToken();
      await queryClient.invalidateQueries({ queryKey: ['my-subjects-entitled'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      setTimeout(() => {
        onClose();
        navigate(`/my-studies?subjectId=${subject.id}&tab=exams`);
      }, 900);
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (code.replace(/-/g, '').length < 16 || redeemMutation.isPending) return;
    redeemMutation.mutate(code);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-label={`تفعيل مادة ${subject.nameAr}`}
      data-testid="activation-modal"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="relative p-6 pb-5 text-center" style={{ background: 'var(--c-primary-50)' }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="absolute top-3 end-3 w-8 h-8 rounded-lg flex items-center justify-center text-[var(--c-text-muted)] hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)] transition-colors"
            data-testid="activation-modal-close"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center text-white shadow-md" style={{ background: 'var(--grad-primary)' }}>
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-[var(--c-text)]">هذه المادة تحتاج كود تفعيل</h2>
          <p className="text-sm text-[var(--c-text-muted)] mt-1">
            مادة <strong className="text-[var(--c-primary-700)]">{subject.nameAr}</strong> مقفلة حالياً — أدخل كود الاشتراك لفتح محتواها فوراً.
          </p>
        </div>

        {/* Body */}
        <form onSubmit={submit} className="p-6 pt-5 space-y-4">
          <div>
            <label htmlFor="activation-code-input" className="block text-sm font-semibold mb-2 text-[var(--c-text)]">
              كود الاشتراك
            </label>
            <div className="relative">
              <KeyRound className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-text-faint)]" />
              <input
                id="activation-code-input"
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                dir="ltr"
                value={code}
                onChange={(event) => setCode(normalizeCode(event.target.value))}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                disabled={redeemMutation.isPending || redeemMutation.isSuccess}
                className="w-full ps-10 pe-3 py-3 rounded-xl border-2 border-[var(--c-border)] bg-[var(--c-bg)] text-center text-lg font-bold tracking-wider focus:outline-none focus:border-[var(--c-primary-500)] transition-colors disabled:opacity-60"
                style={{ color: 'var(--c-text)' }}
                data-testid="activation-code-input"
              />
            </div>
            <p className="text-xs text-center mt-2 text-[var(--c-text-faint)]">الصيغة: XXXX-XXXX-XXXX-XXXX</p>
          </div>

          {redeemMutation.isError && (
            <div className="flex items-start gap-2 p-3 rounded-xl border border-[var(--c-danger)] bg-[var(--c-danger-50)]" data-testid="activation-modal-error">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[var(--c-danger)]" />
              <p className="text-xs leading-relaxed text-[var(--c-text)]">
                {(redeemMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                  ?? 'فشل تفعيل الكود — تأكد من أنه صحيح وغير منتهي وغير مستخدم.'}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={code.replace(/-/g, '').length < 16 || redeemMutation.isPending || redeemMutation.isSuccess}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white shadow-md transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100"
            style={{ background: 'var(--grad-primary)' }}
            data-testid="activation-modal-submit"
          >
            {redeemMutation.isPending ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> جارٍ التفعيل…</>
            ) : redeemMutation.isSuccess ? (
              <><CheckCircle2 className="w-5 h-5" /> تم التفعيل! جارٍ فتح المادة…</>
            ) : (
              <><KeyRound className="w-5 h-5" /> تفعيل وفتح المادة</>
            )}
          </button>

          <p className="text-xs text-center text-[var(--c-text-faint)] leading-relaxed">
            <BookOpen className="w-3.5 h-3.5 inline-block me-1 -mt-0.5" />
            الكود يُفعَّل لمرة واحدة ويرتبط بحسابك — يمكنك إدخال عدة أكواد لفتح مواد مختلفة.
          </p>
        </form>
      </motion.div>
    </div>
  );
}
