import { useState, useEffect, useCallback } from 'react';
import { useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ChevronLeft, Star, Flag, Share2, Check, X, Loader2,
  BookOpen, Clock, BarChart3, ArrowRight,
} from 'lucide-react';
import { questionApi } from './services/question-api';

interface QuestionData {
  id: string;
  text: string;
  type: string;
  difficulty: string;
  tags: string[];
  lectureTitle?: string;
  year?: number;
  reference?: string;
  options: { id: string; letter: string; text: string; imageUrl?: string }[];
  userAnswer?: { selectedOptionId: string; isCorrect: boolean; isFirstAttempt: boolean; answeredAt: string } | null;
  isFavorite: boolean;
  stats?: { attemptsCount: number; correctRate: number };
}

interface AnswerResult {
  isCorrect: boolean;
  correctOptionId: string;
  correctOptionLetter: string;
  correctAnswerText?: string | null;
  explanation: string;
  reference?: string;
  isFirstAttempt: boolean;
  updatedStats?: { questionsAnswered: number; correctAnswers: number; accuracy: number; currentStreak: number };
}

export default function QuestionPage() {
  const { lectureId, questionId } = useParams<{ lectureId?: string; questionId?: string }>();
  const [searchParams] = useSearchParams();
  const focusQuestionId = searchParams.get('focus');
  const navigate = useNavigate();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [essayAnswer, setEssayAnswer] = useState('');
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('scientific');
  const [reportDesc, setReportDesc] = useState('');
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());

  // Fetch questions by lecture
  const { data: questionsData, isLoading } = useQuery({
    queryKey: questionId ? ['questions', 'focus', questionId] : ['questions', 'lecture', lectureId],
    queryFn: () => questionId ? questionApi.getById(questionId) : questionApi.getByLecture(lectureId!),
    enabled: !!lectureId || !!questionId,
  });

  const questions = useMemo<QuestionData[]>(
    () => questionId ? (questionsData ? [questionsData as QuestionData] : []) : questionsData?.items || [],
    [questionId, questionsData],
  );
  const currentQuestion = questions[currentIndex];

  useEffect(() => {
    if (!focusQuestionId || questionId || !questions.length) return;
    const foundIndex = questions.findIndex(question => question.id === focusQuestionId);
    if (foundIndex >= 0) setCurrentIndex(foundIndex);
  }, [focusQuestionId, questionId, questions]);

  // Reset state when question changes
  useEffect(() => {
    setSelectedOption(null);
    setEssayAnswer('');
    setAnswerResult(null);
    setShowReport(false);
    setQuestionStartTime(Date.now());
  }, [currentIndex]);

  // Answer mutation
  const answerMutation = useMutation({
    mutationFn: ({ questionId, optionId, answerText }: { questionId: string; optionId?: string; answerText?: string }) => {
      const duration = Math.round((Date.now() - questionStartTime) / 1000);
      return questionApi.answer(questionId, { selectedOptionId: optionId, answerText }, duration);
    },
    onSuccess: (data: AnswerResult) => {
      setAnswerResult(data);
      if (data.isCorrect) {
        toast.success('إجابة صحيحة! 🎉');
        // Vibrate on mobile
        if (navigator.vibrate) navigator.vibrate(100);
      } else {
        toast.error('إجابة خاطئة');
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      }
    },
    onError: () => toast.error('حدث خطأ أثناء حفظ الإجابة'),
  });

  // Report mutation
  const reportMutation = useMutation({
    mutationFn: ({ questionId, reason, desc }: { questionId: string; reason: string; desc: string }) =>
      questionApi.report(questionId, reason, desc),
    onSuccess: () => {
      toast.success('تم إرسال البلاغ. شكراً لمساهمتك!');
      setShowReport(false);
      setReportDesc('');
    },
  });

  // Favorite mutation
  const favoriteMutation = useMutation({
    mutationFn: ({ questionId, isFav }: { questionId: string; isFav: boolean }) =>
      questionApi.toggleFavorite(questionId, isFav),
  });

  const handleSelectOption = useCallback((optionId: string) => {
    if (answerResult) return; // Can't change after answering
    setSelectedOption(optionId);
  }, [answerResult]);

  const handleConfirmAnswer = () => {
    if (!currentQuestion) return;
    const isEssay = currentQuestion.type.toLowerCase() === 'essay';
    if (isEssay) {
      if (!essayAnswer.trim()) return;
      answerMutation.mutate({ questionId: currentQuestion.id, answerText: essayAnswer.trim() });
      return;
    }
    if (!selectedOption) return;
    answerMutation.mutate({ questionId: currentQuestion.id, optionId: selectedOption });
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // End of lecture
      toast.success('أنهيت جميع أسئلة المحاضرة! 🎉');
      navigate(-1);
    }
  };

  const handleReport = () => {
    if (!currentQuestion || !reportDesc.trim()) return;
    reportMutation.mutate({
      questionId: currentQuestion.id,
      reason: reportReason,
      desc: reportDesc,
    });
  };

  const toggleFavorite = () => {
    if (!currentQuestion) return;
    favoriteMutation.mutate({ questionId: currentQuestion.id, isFav: currentQuestion.isFavorite });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)]" />
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="text-center py-20">
        <BookOpen className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-muted)] opacity-50" />
        <p className="text-[var(--c-text-muted)]">لا توجد أسئلة في هذه المحاضرة بعد</p>
      </div>
    );
  }

  if (!currentQuestion) return null;

  const progress = ((currentIndex + 1) / questions.length) * 100;
  const isAnswered = !!answerResult;
  const isCorrect = answerResult?.isCorrect;
  const isEssay = currentQuestion.type.toLowerCase() === 'essay';

  return (
    <div className="space-y-4 max-w-[880px] mx-auto">
      {/* Breadcrumbs + Back */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)]">
          <ChevronLeft className="w-4 h-4" />
          العودة
        </button>
        <div className="text-xs text-[var(--c-text-muted)]">
          السؤال <span className="font-bold text-[var(--c-text)]" lang="en">{currentIndex + 1}</span> من <span lang="en">{questions.length}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-[var(--c-neutral-200)] rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: isAnswered ? (isCorrect ? 'var(--grad-success)' : 'var(--grad-danger)') : 'var(--grad-primary)' }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Question Card */}
      <motion.div
        key={currentQuestion.id}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-[var(--c-surface)] border rounded-2xl overflow-hidden shadow-md ${
          isAnswered ? (isCorrect ? 'border-[var(--c-success-500)]' : 'border-[var(--c-danger-500)]') : 'border-[var(--c-border)]'
        }`}
      >
        {/* Card Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--c-border)] bg-[rgba(238,246,255,0.5)]">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center font-bold text-sm ${
              isAnswered ? (isCorrect ? 'bg-[var(--c-success-50)] text-[var(--c-success-700)]' : 'bg-[var(--c-danger-50)] text-[var(--c-danger-700)]') : 'bg-[var(--c-primary-50)] text-[var(--c-primary-700)]'
            }`} lang="en">
              {currentIndex + 1}
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--c-text-soft)]">{currentQuestion.lectureTitle || 'محاضرة'}</div>
              <div className="flex gap-1.5 mt-0.5">
                {currentQuestion.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[var(--c-primary-50)] text-[var(--c-primary-700)]">
                    #{tag}
                  </span>
                ))}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                  currentQuestion.difficulty === 'easy' ? 'bg-[var(--c-success-50)] text-[var(--c-success-700)]' :
                  currentQuestion.difficulty === 'hard' ? 'bg-[rgba(255,82,82,0.08)] text-[var(--c-danger-500)]' :
                  'bg-[rgba(255,179,0,0.10)] text-[var(--c-warning-500)]'
                }`}>
                  {currentQuestion.difficulty === 'easy' ? 'سهل' : currentQuestion.difficulty === 'hard' ? 'صعب' : 'متوسط'}
                </span>
              </div>
            </div>
          </div>
          {isAnswered && (
            <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-bold ${
              isCorrect ? 'bg-[var(--c-success-100)] text-[var(--c-success-700)]' : 'bg-[var(--c-danger-100)] text-[var(--c-danger-700)]'
            }`}>
              {isCorrect ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
              {isCorrect ? 'صحيح!' : 'خاطئ'}
            </span>
          )}
        </div>

        {/* Question Body */}
        <div className="px-6 py-5">
          {/* Question Text */}
          <p className="text-[17px] font-semibold text-[var(--c-text)] leading-relaxed mb-5">
            {currentQuestion.text}
          </p>

          {/* Options or typed answer */}
          {isEssay ? (
            <div className="space-y-2">
              <label htmlFor="essay-answer" className="block text-sm font-bold text-[var(--c-text-soft)]">اكتب إجابتك</label>
              <textarea
                id="essay-answer"
                value={essayAnswer}
                onChange={(event) => setEssayAnswer(event.target.value)}
                disabled={isAnswered}
                rows={6}
                placeholder="اكتب الإجابة التحريرية بوضوح..."
                className="w-full rounded-xl border-[1.5px] border-[var(--c-border-strong)] bg-[var(--c-surface)] p-4 text-[15px] leading-relaxed text-[var(--c-text)] outline-none transition focus:border-[var(--c-primary-500)] focus:ring-2 focus:ring-[var(--c-primary-100)] disabled:cursor-default disabled:bg-[var(--c-neutral-100)]"
              />
              <p className="text-xs text-[var(--c-text-muted)]">سيظهر الجواب النموذجي والشرح بعد التصحيح. المطابقة الآلية الحالية تقارن النص بعد توحيد المسافات وحالة الأحرف.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
            {currentQuestion.options.map((option) => {
              const isSelected = selectedOption === option.id;
              const isCorrectOption = answerResult?.correctOptionId === option.id;
              const isWrongSelection = isAnswered && isSelected && !isCorrectOption;

              return (
                <button
                  key={option.id}
                  onClick={() => handleSelectOption(option.id)}
                  disabled={isAnswered}
                  className={`w-full flex items-center gap-3.5 p-3.5 rounded-xl border-[1.5px] transition-all text-right ${
                    isCorrectOption
                      ? 'border-[var(--c-success-500)] bg-[var(--c-success-50)]'
                      : isWrongSelection
                      ? 'border-[var(--c-danger-500)] bg-[var(--c-danger-50)]'
                      : isSelected
                      ? 'border-[var(--c-primary-500)] bg-[var(--c-primary-50)] shadow-[var(--shadow-glow-primary)]'
                      : 'border-[var(--c-border-strong)] bg-[var(--c-surface)] hover:border-[var(--c-primary-300)] hover:bg-[var(--c-primary-50)]'
                  } ${isAnswered ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                >
                  <div className={`w-8 h-8 rounded-[8px] flex items-center justify-center font-bold text-[13px] shrink-0 ${
                    isCorrectOption
                      ? 'bg-[var(--c-success-500)] text-white'
                      : isWrongSelection
                      ? 'bg-[var(--c-danger-500)] text-white'
                      : isSelected
                      ? 'bg-[var(--c-primary-700)] text-white'
                      : 'bg-[var(--c-bg)] text-[var(--c-text-soft)]'
                  }`} lang="en">
                    {option.letter}
                  </div>
                  <span className="flex-1 text-[15px] font-medium text-[var(--c-text)]">{option.text}</span>
                  {isCorrectOption && (
                    <div className="w-6 h-6 rounded-full bg-[var(--c-success-500)] flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  {isWrongSelection && (
                    <div className="w-6 h-6 rounded-full bg-[var(--c-danger-500)] flex items-center justify-center">
                      <X className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
            </div>
          )}

          {/* Typed answer review */}
          {answerResult && isEssay && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] p-4">
                <p className="mb-2 text-xs font-bold text-[var(--c-text-muted)]">إجابتك</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--c-text)]">{essayAnswer}</p>
              </div>
              <div className="rounded-xl border border-[var(--c-success-300)] bg-[var(--c-success-50)] p-4">
                <p className="mb-2 text-xs font-bold text-[var(--c-success-700)]">الإجابة النموذجية</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--c-text)]">{answerResult.correctAnswerText || 'لا توجد إجابة نموذجية متاحة.'}</p>
              </div>
            </div>
          )}

          {/* Explanation (after answering) */}
          <AnimatePresence>
            {answerResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 p-5 rounded-[14px] border"
                style={{
                  background: 'linear-gradient(135deg, var(--c-primary-50), rgba(0,188,212,0.05))',
                  borderColor: 'rgba(25,118,210,0.15)',
                }}
              >
                <div className="flex items-center gap-2 mb-3 pb-3 border-b" style={{ borderColor: 'rgba(25,118,210,0.15)' }}>
                  <div className="w-8 h-8 rounded-[8px] flex items-center justify-center" style={{ background: 'var(--grad-primary)' }}>
                    <BookOpen className="w-4 h-4 text-white" />
                  </div>
                  <span className="font-bold text-[15px] text-[var(--c-primary-800)]">الشرح</span>
                </div>
                <div className="text-[14px] leading-relaxed text-[var(--c-text-soft)] whitespace-pre-wrap">
                  {answerResult.explanation}
                </div>
                {answerResult.reference && (
                  <div className="mt-3 pt-3 border-t flex items-center gap-1.5 text-xs text-[var(--c-text-muted)]" style={{ borderColor: 'rgba(25,118,210,0.15)' }}>
                    <BookOpen className="w-3.5 h-3.5" />
                    المرجع: {answerResult.reference}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Card Footer - Actions */}
        <div className="px-6 py-4 border-t border-[var(--c-border)] bg-[rgba(238,246,255,0.3)] flex items-center justify-between flex-wrap gap-3">
          {/* Left: Favorite + Report + Share */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleFavorite}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-[8px] border text-[13px] font-semibold transition-all ${
                currentQuestion.isFavorite
                  ? 'bg-[var(--c-warning-500)] text-white border-[var(--c-warning-500)]'
                  : 'border-[var(--c-border-strong)] text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)]'
              }`}
            >
              <Star className="w-3.5 h-3.5" fill={currentQuestion.isFavorite ? 'currentColor' : 'none'} />
              {currentQuestion.isFavorite ? 'في المفضلة' : 'مفضلة'}
            </button>
            <button
              onClick={() => setShowReport(!showReport)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] border border-[var(--c-border-strong)] text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)] text-[13px] font-semibold transition-all"
            >
              <Flag className="w-3.5 h-3.5" />
              إبلاغ
            </button>
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: 'سؤال من منصة CMS', text: currentQuestion?.text ?? '', url: window.location.href }).catch(() => {});
                } else {
                  navigator.clipboard?.writeText(window.location.href).then(() => toast.success('تم نسخ الرابط'));
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-[8px] border border-[var(--c-border-strong)] text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)] hover:text-[var(--c-primary-700)] text-[13px] font-semibold transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              مشاركة
            </button>
          </div>

          {/* Right: Confirm / Next */}
          <div className="flex items-center gap-2">
            {!isAnswered ? (
              <button
                onClick={handleConfirmAnswer}
                disabled={(isEssay ? !essayAnswer.trim() : !selectedOption) || answerMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] font-bold text-sm text-white transition-all disabled:opacity-50"
                style={{ background: 'var(--grad-primary)', boxShadow: '0 4px 12px rgba(25,118,210,0.25)' }}
              >
                {answerMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {isEssay ? 'تصحيح الإجابة' : 'تأكيد الإجابة'}
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] font-bold text-sm text-white transition-all"
                style={{ background: isCorrect ? 'var(--grad-success)' : 'var(--grad-primary)', boxShadow: '0 4px 12px rgba(25,118,210,0.25)' }}
              >
                {currentIndex < questions.length - 1 ? 'التالي' : 'إنهاء'}
                <ArrowRight className="w-4 h-4 rotate-180" />
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Report Dialog */}
      <AnimatePresence>
        {showReport && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'var(--c-overlay)' }}
            onClick={() => setShowReport(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--c-surface)] rounded-2xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold mb-4">الإبلاغ عن خطأ</h3>
              <div className="space-y-3">
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--c-border-strong)] bg-[var(--c-surface)] text-sm"
                >
                  <option value="scientific">خطأ علمي</option>
                  <option value="typo">خطأ إملائي</option>
                  <option value="missing_option">خيار ناقص/خاطئ</option>
                  <option value="unclear_explanation">شرح غير واضح</option>
                  <option value="other">أخرى</option>
                </select>
                <textarea
                  value={reportDesc}
                  onChange={(e) => setReportDesc(e.target.value)}
                  placeholder="اشرح الخطأ بالتفصيل..."
                  rows={4}
                  className="w-full p-3 rounded-lg border border-[var(--c-border-strong)] bg-[var(--c-surface)] text-sm resize-none"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowReport(false)} className="px-4 py-2 rounded-lg text-sm font-semibold text-[var(--c-text-muted)] hover:bg-[var(--c-neutral-100)]">إلغاء</button>
                  <button
                    onClick={handleReport}
                    disabled={!reportDesc.trim() || reportMutation.isPending}
                    className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-[var(--c-danger-500)] hover:bg-[var(--c-danger-600)] disabled:opacity-50"
                  >
                    {reportMutation.isPending ? 'جاري الإرسال...' : 'إرسال البلاغ'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Bar */}
      {answerResult?.updatedStats && (
        <div className="flex items-center justify-center gap-6 text-xs text-[var(--c-text-muted)]">
          <span className="flex items-center gap-1">
            <BarChart3 className="w-3.5 h-3.5" />
            مجابة: <strong className="text-[var(--c-text)]" lang="en">{answerResult.updatedStats.questionsAnswered}</strong>
          </span>
          <span className="flex items-center gap-1">
            <Check className="w-3.5 h-3.5 text-[var(--c-success-500)]" />
            دقة: <strong className="text-[var(--c-text)]" lang="en">{answerResult.updatedStats.accuracy.toFixed(0)}%</strong>
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-[var(--c-warning-500)]" />
            سلسلة: <strong className="text-[var(--c-text)]" lang="en">{answerResult.updatedStats.currentStreak}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
