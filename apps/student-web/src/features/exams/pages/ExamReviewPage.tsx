import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, EyeOff, Loader2 } from 'lucide-react';
import { examApi } from '../services/exam-api';
import { QuestionRow } from '@/components/QuestionRow';

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
  const { data: review, isLoading, error } = useQuery({ queryKey: ['exam-review', sessionId], queryFn: () => examApi.getReview(sessionId!), enabled: !!sessionId });

  if (isLoading) return <div className="flex flex-col items-center gap-3 py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" /><p className="text-sm text-[var(--c-text-muted)]">جارٍ تحميل المراجعة من سجل الاختبار...</p></div>;
  if (error || !review) return <div className="max-w-lg mx-auto mt-12 rounded-2xl border border-[var(--c-danger-200)] bg-[var(--c-surface)] p-7 text-center"><EyeOff className="w-9 h-9 mx-auto mb-3 text-[var(--c-danger-500)]" /><h2 className="font-bold text-lg mb-2">المراجعة غير متاحة</h2><p className="text-sm text-[var(--c-text-muted)] mb-5">{error instanceof Error ? error.message : 'لا تسمح سياسة هذا الاختبار بالمراجعة حالياً.'}</p><button onClick={() => navigate(-1)} className="px-5 py-2.5 rounded-[10px] text-sm font-bold text-white" style={{ background: 'var(--grad-primary)' }}>العودة للنتائج</button></div>;

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
