import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, EyeOff, FileQuestion, Loader2, Unplug } from 'lucide-react';
import { examApi } from '../services/exam-api';
import { QuestionRow } from '@/components/QuestionRow';
// W16.6 error hardening — prefer the backend's Arabic ProblemDetails `detail`
// over the raw JS/axios message.
// Wave 18.1 (D-10) — the error taxonomy: network faults render connection/retry
// copy, never the policy-forbids claim; a REAL policy denial arrives as a 403
// whose Arabic ProblemDetails `detail` is shown verbatim.
import { mapApiErrorToUi } from '@/utils/api-error';

/**
 * W15.0 (P4-C3) — the exam review now renders through the SAME shared <QuestionRow>
 * as the practice/exam lists (read-only mode): non-interactive option rows with
 * server-gated correctness (showCorrectAnswers), user-answer highlights, the
 * correctness badge, and explanation blocks (showExplanations). The per-question
 * card border color coding is replaced by the row's badge (the list look is uniform).
 */
export default function ExamReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { data: review, isLoading, error, refetch } = useQuery({ queryKey: ['exam-review', sessionId], queryFn: () => examApi.getReview(sessionId!), enabled: !!sessionId });

  if (isLoading) return <div className="flex flex-col items-center gap-3 py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" /><p className="text-sm text-[var(--c-text-muted)]">جارٍ تحميل المراجعة من سجل الاختبار...</p></div>;

  if (error || !review) {
    // No session in the URL at all — an honest not-found, not a policy claim.
    const ui = sessionId
      ? mapApiErrorToUi(error, {
          network: 'حدث خطأ في الاتصال. تحقّق من الشبكة ثم أعد المحاولة.',
          forbidden: 'لا يمكنك الوصول إلى مراجعة هذا الاختبار.',
          notFound: 'سجل هذا الاختبار غير موجود أو تم حذفه.',
          business: 'تعذّر تحميل المراجعة. حاول مرة أخرى.',
        })
      : { kind: 'not-found' as const, message: 'سجل هذا الاختبار غير موجود أو تم حذفه.' };
    const isNetwork = ui.kind === 'network';
    return (
      <div
        role="alert"
        data-testid={isNetwork ? 'review-error-network' : 'review-unavailable'}
        className="max-w-lg mx-auto mt-12 rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-7 text-center"
      >
        <div className="flex h-14 w-14 mx-auto mb-3 items-center justify-center rounded-full bg-[var(--c-danger-50)]">
          {isNetwork
            ? <Unplug className="w-7 h-7 text-[var(--c-danger-500)]" aria-hidden="true" />
            : ui.kind === 'not-found'
              ? <FileQuestion className="w-7 h-7 text-[var(--c-danger-500)]" aria-hidden="true" />
              : <EyeOff className="w-7 h-7 text-[var(--c-danger-500)]" aria-hidden="true" />}
        </div>
        <h2 className="font-bold text-lg mb-2">{isNetwork ? 'تعذّر تحميل المراجعة' : 'المراجعة غير متاحة'}</h2>
        <p className="text-sm text-[var(--c-text-muted)] mb-5">{ui.message}</p>
        <div className="flex justify-center gap-2">
          {isNetwork && (
            <button type="button" onClick={() => refetch()} className="px-5 py-2.5 rounded-[10px] text-sm font-bold text-white" style={{ background: 'var(--grad-primary)' }}>
              إعادة المحاولة
            </button>
          )}
          <button onClick={() => navigate(-1)} className={`px-5 py-2.5 rounded-[10px] text-sm font-bold ${isNetwork ? 'text-[var(--c-primary-700)]' : 'text-white'}`} style={isNetwork ? undefined : { background: 'var(--grad-primary)' }}>
            العودة للنتائج
          </button>
        </div>
      </div>
    );
  }

  return <div className="space-y-4 max-w-[880px] mx-auto">
    <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)]"><ChevronLeft className="w-4 h-4" /> العودة للنتائج</button>
    <header className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5"><h1 className="text-xl font-bold">مراجعة أسئلة الاختبار</h1><p className="text-sm text-[var(--c-text-muted)] mt-1">هذه المراجعة تستخدم لقطة الأسئلة التي حُلّت داخل محاولتك، لذلك لا تتغير عند تحديث بنك الأسئلة.</p><div className="flex flex-wrap gap-2 mt-3"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${review.showCorrectAnswers ? 'bg-[var(--c-success-100)] text-[var(--c-success-700)]' : 'bg-[var(--c-neutral-100)] text-[var(--c-text-muted)]'}`}>{review.showCorrectAnswers ? 'تظهر الإجابات الصحيحة' : 'الإجابات الصحيحة مخفية'}</span><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${review.showExplanations ? 'bg-[var(--c-primary-50)] text-[var(--c-primary-700)]' : 'bg-[var(--c-neutral-100)] text-[var(--c-text-muted)]'}`}>{review.showExplanations ? 'تظهر الشروحات' : 'الشروحات مخفية'}</span></div></header>
    <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-1 sm:px-5" data-testid="review-list">
      {review.questions.map((question, index) => (
        <QuestionRow
          key={question.id}
          testIdPrefix="review"
          question={question}
          index={index}
          readOnly
          isAnswered={false}
          selected={question.options.filter(option => option.isUserAnswer).map(option => option.id)}
          reviewOptions={question.options.map(option => ({ isCorrect: option.isCorrect, isUserAnswer: option.isUserAnswer }))}
          showCorrectAnswers={review.showCorrectAnswers}
          userAnswerText={question.userAnswer ?? null}
          feedback={{
            isCorrect: question.isCorrect ?? null,
            correctAnswerText: question.correctAnswer ?? null,
            explanation: question.explanation ?? null,
          }}
        />
      ))}
    </div>
  </div>;
}
