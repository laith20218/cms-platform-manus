import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Clock, ChevronLeft, ChevronRight, Flag, Check,
  Loader2, AlertTriangle, Target, TrendingUp,
} from 'lucide-react';
import { examApi } from '../services/exam-api';

interface ExamQuestion {
  id: string;
  number: number;
  text: string;
  options: { id: string; letter: string; text: string }[];
}

interface ExamSession {
  sessionId: string;
  examId: string;
  examTitle: string;
  totalQuestions: number;
  durationMinutes: number;
  expiresAt: string;
  questions: ExamQuestion[];
}

interface ExamResult {
  sessionId: string;
  score: number;
  passed: boolean;
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  durationSeconds: number;
  weakestTopics: { tag: string; accuracy: number }[];
  comparison: { yourScore: number; averageScore: number; topScore: number };
}

type Phase = 'loading' | 'exam' | 'submitting' | 'results';

export default function ExamPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<ExamSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { optionId: string; duration: number }>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [questionStart, setQuestionStart] = useState(Date.now());
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // Start exam
  const { mutate: startExam } = useMutation({
    mutationFn: () => examApi.start(examId!, 'test'),
    onSuccess: (data: ExamSession) => {
      setSession(data);
      setTimeLeft(data.durationMinutes * 60);
      setPhase('exam');
      setQuestionStart(Date.now());
    },
    onError: () => {
      toast.error('تعذّر بدء الاختبار');
      navigate(-1);
    },
  });

  useEffect(() => {
    if (examId) startExam();
  }, [examId, startExam]);

  // Track question duration
  useEffect(() => {
    setQuestionStart(Date.now());
  }, [currentIndex]);

  const handleSelectOption = useCallback((questionId: string, optionId: string) => {
    const duration = Math.round((Date.now() - questionStart) / 1000);
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { optionId, duration: (prev[questionId]?.duration || 0) + duration },
    }));
  }, [questionStart]);

  // Submit exam
  const { mutate: submitExam } = useMutation({
    mutationFn: () => {
      const answerList = Object.entries(answers).map(([questionId, data]) => ({
        questionId,
        selectedOptionId: data.optionId,
        durationSeconds: data.duration,
      }));
      return examApi.submit(session!.sessionId, answerList);
    },
    onSuccess: (data: ExamResult) => {
      setResult(data);
      setPhase('results');
      if (data.passed) {
        toast.success('🎉 نجحت في الاختبار!');
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
      } else {
        toast.error('لم تنجح هذه المرة. واصل الدراسة!');
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      }
    },
    onError: () => toast.error('تعذّر تسليم الاختبار'),
  });

  const handleSubmit = useCallback(() => {
    setShowSubmitConfirm(false);
    setPhase('submitting');
    submitExam();
  }, [submitExam]);

  useEffect(() => {
    if (phase !== 'exam') return;
    if (timeLeft === 0) {
      handleSubmit();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((previous) => Math.max(previous - 1, 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, timeLeft, handleSubmit]);

  // ===== Loading =====
  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)] mb-3" />
        <p className="text-sm text-[var(--c-text-muted)]">جاري تحضير الاختبار...</p>
      </div>
    );
  }

  // ===== Results =====
  if (phase === 'results' && result) {
    return <ExamResults result={result} onBack={() => navigate(-1)} onReview={() => navigate(`/exams/${result.sessionId}/review`)} />;
  }

  // ===== Submitting =====
  if (phase === 'submitting') {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)] mb-3" />
        <p className="text-sm text-[var(--c-text-muted)]">جاري تصحيح الاختبار...</p>
      </div>
    );
  }

  // ===== Exam =====
  if (!session) return null;

  const currentQuestion = session.questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const isLastQuestion = currentIndex === session.questions.length - 1;
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isTimeLow = timeLeft < 300; // < 5 minutes

  return (
    <div className="space-y-4 max-w-[900px] mx-auto">
      {/* Header: Timer + Progress */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border backdrop-blur-xl" style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)' }}>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-[var(--c-text)] truncate">{session.examTitle}</h2>
          <div className="text-xs text-[var(--c-text-muted)] mt-0.5">
            السؤال <span className="font-bold" lang="en">{currentIndex + 1}</span> من <span lang="en">{session.totalQuestions}</span>
            {' • '}
            مجاب: <span className="font-bold text-[var(--c-primary-700)]" lang="en">{answeredCount}</span>
          </div>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm ${isTimeLow ? 'bg-[var(--c-danger-50)] text-[var(--c-danger-700)] animate-pulse' : 'bg-[var(--c-primary-50)] text-[var(--c-primary-700)]'}`}>
          <Clock className="w-4 h-4" />
          <span lang="en">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-[var(--c-neutral-200)] rounded-full overflow-hidden">
        <motion.div className="h-full rounded-full" style={{ background: 'var(--grad-primary)' }} animate={{ width: `${((currentIndex + 1) / session.totalQuestions) * 100}%` }} transition={{ duration: 0.3 }} />
      </div>

      {/* Question Card */}
      <motion.div key={currentQuestion.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-6 shadow-md">
        <p className="text-[17px] font-semibold text-[var(--c-text)] leading-relaxed mb-5">
          {currentQuestion.text}
        </p>
        <div className="space-y-2.5">
          {currentQuestion.options.map((option) => {
            const isSelected = answers[currentQuestion.id]?.optionId === option.id;
            return (
              <button
                key={option.id}
                onClick={() => handleSelectOption(currentQuestion.id, option.id)}
                className={`w-full flex items-center gap-3.5 p-3.5 rounded-xl border-[1.5px] transition-all text-right ${
                  isSelected
                    ? 'border-[var(--c-primary-500)] bg-[var(--c-primary-50)] shadow-[var(--shadow-glow-primary)]'
                    : 'border-[var(--c-border-strong)] bg-[var(--c-surface)] hover:border-[var(--c-primary-300)] hover:bg-[var(--c-primary-50)]'
                }`}
              >
                <div className={`w-8 h-8 rounded-[8px] flex items-center justify-center font-bold text-[13px] shrink-0 ${isSelected ? 'bg-[var(--c-primary-700)] text-white' : 'bg-[var(--c-bg)] text-[var(--c-text-soft)]'}`} lang="en">
                  {option.letter}
                </div>
                <span className="flex-1 text-[15px] font-medium text-[var(--c-text)]">{option.text}</span>
                {isSelected && <Check className="w-5 h-5 text-[var(--c-primary-700)]" />}
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
          disabled={currentIndex === 0}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-[10px] border border-[var(--c-border-strong)] text-sm font-semibold text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <ChevronRight className="w-4 h-4" />
          السابق
        </button>

        {/* Question Grid (quick navigation) */}
        <div className="hidden md:flex items-center gap-1.5 flex-wrap justify-center max-w-[400px]">
          {session.questions.map((q, i) => {
            const isAnswered = !!answers[q.id];
            const isCurrent = i === currentIndex;
            return (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(i)}
                className={`w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center transition-all ${
                  isCurrent
                    ? 'bg-[var(--c-primary-700)] text-white'
                    : isAnswered
                    ? 'bg-[var(--c-success-100)] text-[var(--c-success-700)]'
                    : 'bg-[var(--c-neutral-100)] text-[var(--c-text-muted)] hover:bg-[var(--c-primary-50)]'
                }`}
                lang="en"
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        {isLastQuestion ? (
          <button
            onClick={() => setShowSubmitConfirm(true)}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-[10px] font-bold text-sm text-white transition-all"
            style={{ background: 'var(--grad-success)', boxShadow: '0 4px 12px rgba(0,200,83,0.25)' }}
          >
            <Flag className="w-4 h-4" />
            تسليم الاختبار
          </button>
        ) : (
          <button
            onClick={() => setCurrentIndex(Math.min(session.questions.length - 1, currentIndex + 1))}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-[10px] font-bold text-sm text-white transition-all"
            style={{ background: 'var(--grad-primary)', boxShadow: '0 4px 12px rgba(25,118,210,0.25)' }}
          >
            التالي
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Submit Confirmation Modal */}
      <AnimatePresence>
        {showSubmitConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--c-overlay)' }} onClick={() => setShowSubmitConfirm(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-[var(--c-surface)] rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 mx-auto" style={{ background: 'rgba(255,179,0,0.10)' }}>
                <AlertTriangle className="w-6 h-6 text-[var(--c-warning-500)]" />
              </div>
              <h3 className="text-lg font-bold text-center mb-2">تأكيد التسليم</h3>
              <p className="text-sm text-[var(--c-text-muted)] text-center mb-1">
                أجبت على <strong className="text-[var(--c-text)]" lang="en">{answeredCount}</strong> من <strong className="text-[var(--c-text)]" lang="en">{session.totalQuestions}</strong> سؤال.
              </p>
              {answeredCount < session.totalQuestions && (
                <p className="text-xs text-[var(--c-danger-500)] text-center mb-4">
                  هناك {session.totalQuestions - answeredCount} سؤال غير مجاب.
                </p>
              )}
              <div className="flex gap-2 justify-center mt-4">
                <button onClick={() => setShowSubmitConfirm(false)} className="px-5 py-2.5 rounded-[10px] text-sm font-semibold text-[var(--c-text-muted)] hover:bg-[var(--c-neutral-100)] transition-colors">
                  متابعة الحل
                </button>
                <button onClick={handleSubmit} className="px-5 py-2.5 rounded-[10px] text-sm font-bold text-white bg-[var(--c-success-500)] hover:bg-[var(--c-success-600)] transition-colors">
                  تسليم نهائي
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ===== Results Component =====
function ExamResults({ result, onBack, onReview }: { result: ExamResult; onBack: () => void; onReview: () => void }) {
  const passed = result.passed;
  const scoreColor = passed ? 'var(--c-success-500)' : 'var(--c-danger-500)';

  return (
    <div className="space-y-6 max-w-[680px] mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-3xl p-8 text-center shadow-lg">
        {/* Score Ring */}
        <div className="relative w-32 h-32 mx-auto mb-4">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--c-neutral-200)" strokeWidth="10" />
            <motion.circle
              cx="60" cy="60" r="52" fill="none" stroke={scoreColor} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 52}
              initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - result.score / 100) }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-extrabold" style={{ color: scoreColor }} lang="en">{result.score.toFixed(0)}%</span>
            <span className={`text-xs font-bold ${passed ? 'text-[var(--c-success-700)]' : 'text-[var(--c-danger-700)]'}`}>{passed ? 'نجاح' : 'رسوب'}</span>
          </div>
        </div>

        <h1 className="text-xl font-bold mb-2">
          {passed ? '🎉 أحسنت! نجحت في الاختبار' : '💪 لم تنجح هذه المرة'}
        </h1>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="text-center">
            <div className="text-2xl font-extrabold text-[var(--c-success-500)]" lang="en">{result.correctAnswers}</div>
            <div className="text-xs text-[var(--c-text-muted)]">صحيح</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-extrabold text-[var(--c-danger-500)]" lang="en">{result.answeredQuestions - result.correctAnswers}</div>
            <div className="text-xs text-[var(--c-text-muted)]">خاطئ</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-extrabold text-[var(--c-text)]" lang="en">{Math.floor(result.durationSeconds / 60)}:{String(result.durationSeconds % 60).padStart(2, '0')}</div>
            <div className="text-xs text-[var(--c-text-muted)]">المدة</div>
          </div>
        </div>
      </motion.div>

      {/* Comparison */}
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[var(--c-primary-700)]" /> مقارنة</h3>
        <div className="space-y-2">
          {[
            { label: 'نتيجتك', value: result.comparison.yourScore, color: 'var(--c-primary-700)' },
            { label: 'المتوسط', value: result.comparison.averageScore, color: 'var(--c-text-muted)' },
            { label: 'الأعلى', value: result.comparison.topScore, color: 'var(--c-success-500)' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <span className="text-xs w-16 text-[var(--c-text-muted)]">{item.label}</span>
              <div className="flex-1 h-2 bg-[var(--c-neutral-200)] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${item.value}%`, background: item.color }} />
              </div>
              <span className="text-xs font-bold w-10 text-end" style={{ color: item.color }} lang="en">{item.value.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Weak Topics */}
      {result.weakestTopics.length > 0 && (
        <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-[var(--c-warning-500)]" /> المواضيع الأضعف</h3>
          <div className="space-y-2">
            {result.weakestTopics.map((topic) => (
              <div key={topic.tag} className="flex items-center gap-3">
                <span className="text-xs font-medium w-20">#{topic.tag}</span>
                <div className="flex-1 h-2 bg-[var(--c-neutral-200)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${topic.accuracy}%`, background: topic.accuracy < 40 ? 'var(--c-danger-500)' : 'var(--c-warning-500)' }} />
                </div>
                <span className="text-xs font-bold w-10 text-end" lang="en">{topic.accuracy.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-center">
        <button onClick={onBack} className="px-5 py-2.5 rounded-[10px] text-sm font-semibold border border-[var(--c-border-strong)] text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] transition-colors">
          العودة للمادة
        </button>
        <button onClick={onReview} className="px-5 py-2.5 rounded-[10px] text-sm font-bold text-white transition-all" style={{ background: 'var(--grad-primary)' }}>
          مراجعة الأسئلة
        </button>
      </div>
    </div>
  );
}
