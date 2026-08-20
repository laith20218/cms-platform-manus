import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, X, ChevronLeft, BookOpen, Loader2 } from 'lucide-react';
import { examApi } from '../services/exam-api';

export default function ExamReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const { data: review, isLoading } = useQuery({
    queryKey: ['exam-review', sessionId],
    queryFn: () => examApi.getReview(sessionId!),
    enabled: !!sessionId,
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" /></div>;
  }

  if (!review) return null;

  return (
    <div className="space-y-4 max-w-[880px] mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)]">
        <ChevronLeft className="w-4 h-4" /> العودة للنتائج
      </button>

      <h1 className="text-xl font-bold">مراجعة الأسئلة</h1>

      {review.questions.map((q, i) => (
        <motion.div key={q.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
          className={`bg-[var(--c-surface)] border rounded-2xl p-5 ${q.isCorrect ? 'border-[var(--c-success-500)]' : 'border-[var(--c-danger-500)]'}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-[var(--c-text-soft)]" lang="en">سؤال {i + 1}</span>
            <span className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${q.isCorrect ? 'bg-[var(--c-success-100)] text-[var(--c-success-700)]' : 'bg-[var(--c-danger-100)] text-[var(--c-danger-700)]'}`}>
              {q.isCorrect ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              {q.isCorrect ? 'صحيح' : 'خاطئ'}
            </span>
          </div>

          <p className="text-[15px] font-semibold mb-3">{q.text}</p>

          <div className="space-y-2">
            {q.options.map((opt) => (
              <div key={opt.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${
                opt.isCorrect ? 'border-[var(--c-success-500)] bg-[var(--c-success-50)]' :
                opt.isUserAnswer ? 'border-[var(--c-danger-500)] bg-[var(--c-danger-50)]' :
                'border-[var(--c-border)]'
              }`}>
                <span className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold" lang="en">{opt.letter}</span>
                <span className="flex-1 text-sm">{opt.text}</span>
                {opt.isCorrect && <Check className="w-4 h-4 text-[var(--c-success-500)]" />}
                {opt.isUserAnswer && !opt.isCorrect && <X className="w-4 h-4 text-[var(--c-danger-500)]" />}
              </div>
            ))}
          </div>

          {q.explanation && (
            <div className="mt-3 p-3 rounded-lg bg-[var(--c-primary-50)] border border-[rgba(25,118,210,0.15)]">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--c-primary-800)] mb-1">
                <BookOpen className="w-3.5 h-3.5" /> الشرح
              </div>
              <p className="text-sm text-[var(--c-text-soft)] leading-relaxed">{q.explanation}</p>
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
