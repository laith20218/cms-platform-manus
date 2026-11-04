import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import { cn } from '@/utils';
import { questionApi } from '@/features/questions/services/question-api';

/**
 * W15.0 (P4-C4) — the shared «الإبلاغ عن خطأ» dialog, extracted from QuestionPage's
 * inline markup so EVERY question surface (question player, practice rows, …) can
 * report errors with one component. Self-contained: owns its reason chips + textarea
 * + mutation; the caller only supplies the target question id and open state.
 * W14.5 note preserved: react-query v5 swallows mutation errors unless handled —
 * onError toasts «تعذر إرسال البلاغ».
 */

const REPORT_REASONS = [
  { key: 'scientific', label: 'خطأ علمي' },
  { key: 'typo', label: 'خطأ إملائي' },
  { key: 'missing_option', label: 'خيار ناقص/خاطئ' },
  { key: 'unclear_explanation', label: 'شرح غير واضح' },
  { key: 'other', label: 'أخرى' },
] as const;

export interface ReportQuestionDialogProps {
  /** The question to report; null closes (no target). */
  questionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReportQuestionDialog({ questionId, open, onOpenChange }: ReportQuestionDialogProps) {
  const [reason, setReason] = useState<string>('scientific');
  const [description, setDescription] = useState('');

  // Fresh form per target question.
  useEffect(() => {
    if (open) {
      setReason('scientific');
      setDescription('');
    }
  }, [open, questionId]);

  const reportMutation = useMutation({
    mutationFn: ({ targetId, reasonType, desc }: { targetId: string; reasonType: string; desc: string }) =>
      questionApi.report(targetId, reasonType, desc),
    onSuccess: () => {
      toast.success('تم إرسال البلاغ. شكراً لمساهمتك!');
      onOpenChange(false);
    },
    onError: () => toast.error('تعذر إرسال البلاغ. حاول مرة أخرى.'),
  });

  const submit = () => {
    if (!questionId || !description.trim() || reportMutation.isPending) return;
    reportMutation.mutate({ targetId: questionId, reasonType: reason, desc: description.trim() });
  };

  return (
    <AnimatePresence>
      {open && questionId && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(11,34,53,0.55)' }}
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            className="bg-[var(--cms-surface)] rounded-2xl p-6 max-w-md w-full"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="الإبلاغ عن خطأ"
          >
            <h3 className="text-lg font-bold mb-4 text-[var(--cms-text)] flex items-center gap-2">
              <Flag className="w-5 h-5 text-[var(--cms-danger)]" aria-hidden="true" />
              الإبلاغ عن خطأ
            </h3>
            <div className="space-y-3">
              <div role="radiogroup" aria-label="سبب البلاغ" className="flex flex-wrap gap-2" data-testid="report-reasons">
                {REPORT_REASONS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="radio"
                    aria-checked={reason === item.key}
                    onClick={() => setReason(item.key)}
                    className={cn(
                      'press min-h-11 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all',
                      reason === item.key
                        ? 'border-[var(--cms-teal-600)] bg-[var(--cms-teal-50)] text-[var(--cms-teal-800)]'
                        : 'border-[var(--cms-line-strong)] text-[var(--cms-text-soft)] hover:border-[var(--cms-teal-500)]',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="اشرح الخطأ بالتفصيل..."
                rows={4}
                aria-label="تفاصيل البلاغ"
                className="w-full p-3 rounded-lg border border-[var(--cms-line-strong)] bg-[var(--cms-surface)] text-sm text-[var(--cms-text)] resize-none outline-none focus:border-[var(--cms-teal-600)]"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => onOpenChange(false)}
                  className="min-h-11 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--cms-text-muted)] hover:bg-[var(--cms-ivory-100)]"
                >
                  إلغاء
                </button>
                <button
                  onClick={submit}
                  disabled={!description.trim() || reportMutation.isPending}
                  data-testid="report-submit"
                  className="min-h-11 rounded-xl px-4 py-2 text-sm font-bold text-white bg-[var(--cms-danger)] hover:opacity-90 disabled:opacity-50"
                >
                  {reportMutation.isPending ? 'جاري الإرسال...' : 'إرسال البلاغ'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
