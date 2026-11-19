import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import { cn } from '@/utils';
import { questionApi } from '@/features/questions/services/question-api';
// D-24 (Wave 18.3): the dialog now rides the shared Radix CenteredDialog —
// focus-trapped, ESC-dismissible, scroll-locked — instead of the untrapped
// framer overlay.
import { CenteredDialog } from '@/components/ui/Overlays';

/**
 * The shared «الإبلاغ عن خطأ» dialog: EVERY question surface (question player,
 * practice rows, …) reports errors through this one component. Self-contained:
 * owns its reason chips + textarea + mutation; the caller only supplies the
 * target question id and open state.
 * W14.5 note preserved: react-query v5 swallows mutation errors unless handled —
 * onError toasts «تعذّر إرسال البلاغ».
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
    onError: () => toast.error('تعذّر إرسال البلاغ. حاول مرة أخرى.'),
  });

  const submit = () => {
    if (!questionId || !description.trim() || reportMutation.isPending) return;
    reportMutation.mutate({ targetId: questionId, reasonType: reason, desc: description.trim() });
  };

  return (
    <CenteredDialog
      open={open && !!questionId}
      onOpenChange={onOpenChange}
      title="الإبلاغ عن خطأ"
      description="اختر سبب البلاغ واشحذ الخطأ بالتفصيل ليسهل على فريق المحتوى تصحيحه."
      testId="report-question-dialog"
    >
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
            type="button"
            onClick={() => onOpenChange(false)}
            className="min-h-11 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--cms-text-muted)] hover:bg-[var(--cms-ivory-100)]"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!description.trim() || reportMutation.isPending}
            data-testid="report-submit"
            className="min-h-11 rounded-xl px-4 py-2 text-sm font-bold text-white bg-[var(--cms-danger)] hover:opacity-90 disabled:opacity-50"
          >
            {reportMutation.isPending ? 'جاري الإرسال…' : 'إرسال البلاغ'}
          </button>
        </div>
      </div>
    </CenteredDialog>
  );
}
