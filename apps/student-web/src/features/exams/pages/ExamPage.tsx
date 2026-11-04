import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { AlertTriangle, Clock, Flag, Loader2, Target, TrendingUp, XCircle } from 'lucide-react';
import { examApi, type ExamQuestion, type ExamResult, type ExamSession } from '../services/exam-api';
import { QuestionRow } from '@/components/QuestionRow';

type Phase = 'loading' | 'exam' | 'submitting' | 'results' | 'error';

function sessionStorageKey(examId: string) { return `cms-exam-session:${examId}`; }
function remainingSeconds(expiresAt: string) { return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)); }
function parseSavedAnswer(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) return parsed;
  } catch { /* Legacy one-option values are handled below. */ }
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

export default function ExamPage() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [session, setSession] = useState<ExamSession | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');

  const hydrateSession = useCallback((data: ExamSession) => {
    const restoredAnswers = Object.fromEntries(data.questions.map(question => [question.id, parseSavedAnswer(question.savedAnswer)]).filter(([, answer]) => answer.length > 0));
    setSession(data); setAnswers(restoredAnswers); setTimeLeft(remainingSeconds(data.expiresAt));
  }, []);

  const loadResult = useCallback(async (sessionId: string) => {
    const data = await examApi.getResults(sessionId);
    setResult(data); setPhase('results');
  }, []);

  const openAttempt = useCallback(async () => {
    if (!examId) return;
    setPhase('loading'); setLoadError('');
    try {
      const storedSessionId = sessionStorage.getItem(sessionStorageKey(examId!));
      let data: ExamSession;
      if (storedSessionId) {
        try { data = await examApi.getSession(storedSessionId); }
        catch { data = await examApi.start(examId!); }
      } else {
        data = await examApi.start(examId!);
      }
      sessionStorage.setItem(sessionStorageKey(examId!), data.sessionId);
      hydrateSession(data);
      if (data.status === 'Completed' || data.status === 'TimedOut') await loadResult(data.sessionId);
      else if (data.status === 'Cancelled') { sessionStorage.removeItem(sessionStorageKey(examId!)); navigate(-1); }
      else setPhase('exam');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'تعذّر بدء الاختبار.'); setPhase('error');
    }
  }, [examId, hydrateSession, loadResult, navigate]);

  useEffect(() => {
    void openAttempt();
  }, [openAttempt]);

  // W14.4 (C.1, D9) — retake: clears the stored session pointer and starts a FRESH
  // attempt (attempt limits are re-enforced server-side; a 403 surfaces as a toast).
  const retakeAttempt = useCallback(async () => {
    if (!examId) return;
    sessionStorage.removeItem(sessionStorageKey(examId));
    setSession(null); setResult(null); setAnswers({});
    await openAttempt();
  }, [examId, openAttempt]);

  useEffect(() => {
    if (phase !== 'exam' || !session) return;
    const tick = () => setTimeLeft(remainingSeconds(session.expiresAt));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [phase, session]);

  useEffect(() => {
    if (phase !== 'exam' || !session || timeLeft > 0) return;
    setPhase('submitting');
    void examApi.submit(session.sessionId)
      .then(data => { setResult(data); setPhase('results'); })
      .catch(error => { setLoadError(error instanceof Error ? error.message : 'تعذر تثبيت انتهاء الوقت.'); setPhase('error'); });
  }, [phase, session, timeLeft]);

  const answeredCount = useMemo(() => Object.values(answers).filter(answer => answer.length > 0).length, [answers]);

  const saveSelection = useCallback(async (question: ExamQuestion, selected: string[], index: number) => {
    if (!session) return;
    setSavingQuestionId(question.id);
    try {
      const response = await examApi.saveAnswer(session.sessionId, question.id, selected.length ? JSON.stringify(selected) : null, index, selected.length === 0);
      setTimeLeft(remainingSeconds(response.expiresAt));
      if (response.status !== 'InProgress') await loadResult(session.sessionId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حفظ الإجابة. تحقق من اتصالك ثم أعد المحاولة.');
    } finally { setSavingQuestionId(null); }
  }, [loadResult, session]);

  // W15.0 (P4-C3): the inline list has no "current" index — each selection saves with
  // ITS OWN question index (the workorder's contract), so the resume order tracks the
  // last question the student actually answered.
  const handleSelectOption = useCallback((question: ExamQuestion, optionId: string, index: number) => {
    const current = answers[question.id] ?? [];
    const next = question.type === 'MultipleSelect'
      ? (current.includes(optionId) ? current.filter(id => id !== optionId) : [...current, optionId])
      : [optionId];
    setAnswers(previous => ({ ...previous, [question.id]: next }));
    void saveSelection(question, next, index);
  }, [answers, saveSelection]);

  const submit = useCallback(async () => {
    if (!session) return;
    setShowSubmitConfirm(false); setPhase('submitting');
    try {
      const data = await examApi.submit(session.sessionId);
      setResult(data); setPhase('results');
      if (data.isResultVisible && data.passed) toast.success('تم تسليم الاختبار بنجاح.');
      else if (data.isResultVisible) toast.message('تم تسليم الاختبار. يمكنك متابعة الدراسة والمحاولة لاحقاً إن كانت متاحة.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر تسليم الاختبار.'); setPhase('exam');
    }
  }, [session]);

  const cancelAttempt = useCallback(async () => {
    if (!session || answeredCount > 0 || !window.confirm('هل تريد إلغاء الاختبار قبل الإجابة؟ لن تُحتسب هذه المحاولة.')) return;
    try {
      await examApi.cancel(session.sessionId);
      if (examId) sessionStorage.removeItem(sessionStorageKey(examId));
      toast.message('أُلغيت المحاولة ولم تُحتسب.'); navigate(-1);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'تعذر إلغاء المحاولة.'); }
  }, [answeredCount, examId, navigate, session]);

  if (phase === 'loading' || phase === 'submitting') return <div className="flex flex-col items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--c-primary-700)] mb-3" /><p className="text-sm text-[var(--c-text-muted)]">{phase === 'submitting' ? 'جارٍ تثبيت النتيجة من الخادم...' : 'جارٍ تحضير الاختبار من الخادم...'}</p></div>;
  if (phase === 'error') return <div className="max-w-lg mx-auto mt-12 rounded-2xl border border-[var(--c-danger-200)] bg-[var(--c-surface)] p-7 text-center"><XCircle className="w-9 h-9 mx-auto mb-3 text-[var(--c-danger-500)]" /><h2 className="font-bold text-lg mb-2">تعذّر فتح الاختبار</h2><p className="text-sm text-[var(--c-text-muted)] mb-5">{loadError}</p><button onClick={() => navigate(-1)} className="px-5 py-2.5 rounded-[10px] text-sm font-bold text-white" style={{ background: 'var(--grad-primary)' }}>العودة للمادة</button></div>;
  if (phase === 'results' && result) return <ExamResults result={result} onBack={() => { if (examId) sessionStorage.removeItem(sessionStorageKey(examId)); navigate(-1); }} onReview={() => navigate(`/exams/${result.sessionId}/review`)} onRetake={() => void retakeAttempt()} />;
  if (!session || session.questions.length === 0) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isTimeLow = timeLeft < 300;

  return <div className="space-y-4 max-w-[900px] mx-auto">
    <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border backdrop-blur-xl" style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)' }}>
      <div className="flex-1"><h2 className="text-sm font-bold text-[var(--c-text)] truncate">{session.examTitle}</h2><div className="text-xs text-[var(--c-text-muted)] mt-0.5">مجاب: <span className="font-bold text-[var(--c-primary-700)]" lang="en">{answeredCount}</span> من <span lang="en">{session.totalQuestions}</span></div></div>
      <div className="flex items-center gap-2"><div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm ${isTimeLow ? 'bg-[var(--c-danger-50)] text-[var(--c-danger-700)] animate-pulse' : 'bg-[var(--c-primary-50)] text-[var(--c-primary-700)]'}`}><Clock className="w-4 h-4" /><span lang="en">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</span></div>{answeredCount === 0 && <button onClick={() => void cancelAttempt()} className="hidden sm:inline text-xs font-semibold text-[var(--c-danger-600)] hover:underline">إلغاء المحاولة</button>}</div>
    </div>
    <div className="h-1.5 bg-[var(--c-neutral-200)] rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={session.totalQuestions} aria-valuenow={answeredCount} aria-label="تقدم الاختبار"><motion.div className="h-full rounded-full" style={{ background: 'var(--grad-primary)' }} animate={{ width: `${(answeredCount / Math.max(1, session.totalQuestions)) * 100}%` }} transition={{ duration: 0.3 }} /></div>
    {/* W15.0 (P4-C3) — the question LIST: every exam question renders as a shared
        <QuestionRow> (no pager). Selections still autosave immediately with the
        question's OWN index; NO correctness is shown during the run (server-gated
        to the post-submit review). */}
    <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-1 shadow-md sm:px-6" data-testid="exam-list">
      {session.questions.map((question, index) => (
        <QuestionRow
          key={question.id}
          testIdPrefix="exam"
          question={question}
          index={index}
          total={session.totalQuestions}
          isAnswered={(answers[question.id] ?? []).length > 0}
          selected={answers[question.id] ?? []}
          pending={savingQuestionId === question.id}
          onSelect={(optionId) => handleSelectOption(question, optionId, index)}
        />
      ))}
    </div>

    {/* Submit CTA — always visible under the list (was the last-question footer). */}
    <div className="flex items-center justify-center">
      <button onClick={() => setShowSubmitConfirm(true)} className="flex items-center gap-1.5 px-5 py-2.5 rounded-[10px] font-bold text-sm text-white transition-all" style={{ background: 'var(--grad-success)', boxShadow: '0 4px 12px rgba(0,200,83,0.25)' }}><Flag className="w-4 h-4" />تسليم الاختبار</button>
    </div>
    <AnimatePresence>{showSubmitConfirm && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--c-overlay)' }} onClick={() => setShowSubmitConfirm(false)}><motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-[var(--c-surface)] rounded-2xl p-6 max-w-md w-full" onClick={event => event.stopPropagation()}><div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 mx-auto" style={{ background: 'rgba(255,179,0,0.10)' }}><AlertTriangle className="w-6 h-6 text-[var(--c-warning-500)]" /></div><h3 className="text-lg font-bold text-center mb-2">تأكيد التسليم</h3><p className="text-sm text-[var(--c-text-muted)] text-center mb-1">أجبت على <strong className="text-[var(--c-text)]" lang="en">{answeredCount}</strong> من <strong className="text-[var(--c-text)]" lang="en">{session.totalQuestions}</strong> سؤال.</p>{answeredCount < session.totalQuestions && <p className="text-xs text-[var(--c-danger-500)] text-center mb-4">هناك {session.totalQuestions - answeredCount} سؤال غير مجاب.</p>}<div className="flex gap-2 justify-center mt-4"><button onClick={() => setShowSubmitConfirm(false)} className="px-5 py-2.5 rounded-[10px] text-sm font-semibold text-[var(--c-text-muted)] hover:bg-[var(--c-neutral-100)] transition-colors">متابعة الحل</button><button onClick={() => void submit()} className="px-5 py-2.5 rounded-[10px] text-sm font-bold text-white bg-[var(--c-success-500)] hover:bg-[var(--c-success-600)] transition-colors">تسليم نهائي</button></div></motion.div></motion.div>}</AnimatePresence>
  </div>;
}

function ExamResults({ result, onBack, onReview, onRetake }: { result: ExamResult; onBack: () => void; onReview: () => void; onRetake: () => void }) {
  if (!result.isResultVisible || result.score == null || result.passed == null) return <div className="space-y-5 max-w-[680px] mx-auto"><section className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-3xl p-8 text-center shadow-lg"><Clock className="w-12 h-12 mx-auto mb-4 text-[var(--c-primary-700)]" /><h1 className="text-xl font-bold mb-2">تم تثبيت محاولتك</h1><p className="text-sm text-[var(--c-text-muted)]">اختار المسؤول عدم إظهار النتيجة مباشرة. تم حفظ إجاباتك ووقت الاختبار بأمان على الخادم.</p></section><div className="flex gap-3 justify-center"><button onClick={onBack} className="px-5 py-2.5 rounded-[10px] text-sm font-semibold border border-[var(--c-border-strong)] text-[var(--c-text-soft)]">العودة للمادة</button>{result.canReview && <button onClick={onReview} className="px-5 py-2.5 rounded-[10px] text-sm font-bold text-white" style={{ background: 'var(--grad-primary)' }}>مراجعة الاختبار</button>}</div></div>;
  const passed = result.passed; const scoreColor = passed ? 'var(--c-success-500)' : 'var(--c-danger-500)';
  const canRetake = result.remainingAttempts == null || result.remainingAttempts > 0;
  const strongTopics = result.strongTopics ?? [];
  const attempts = result.attempts ?? [];
  return <div className="space-y-6 max-w-[680px] mx-auto"><motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-3xl p-8 text-center shadow-lg"><div className="relative w-32 h-32 mx-auto mb-4"><svg viewBox="0 0 120 120" className="w-full h-full -rotate-90"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--c-neutral-200)" strokeWidth="10" /><motion.circle cx="60" cy="60" r="52" fill="none" stroke={scoreColor} strokeWidth="10" strokeLinecap="round" strokeDasharray={2 * Math.PI * 52} initial={{ strokeDashoffset: 2 * Math.PI * 52 }} animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - result.score / 100) }} transition={{ duration: 1, ease: 'easeOut' }} /></svg><div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-3xl font-extrabold" style={{ color: scoreColor }} lang="en">{result.score.toFixed(0)}%</span><span className={`text-xs font-bold ${passed ? 'text-[var(--cms-success-700)]' : 'text-[var(--c-danger-700)]'}`}>{passed ? 'نجاح' : 'لم يتحقق حد النجاح'}</span></div></div><h1 className="text-xl font-bold mb-2">{result.status === 'TimedOut' ? 'انتهى الوقت وثُبتت النتيجة' : passed ? 'تم تسليم الاختبار بنجاح' : 'تم تسليم الاختبار'}</h1><div className="grid grid-cols-4 gap-3 mt-6"><Metric value={result.correctAnswers} label="صحيح" color="text-[var(--c-success-500)]" /><Metric value={result.wrongCount} label="خاطئ" color="text-[var(--c-danger-500)]" dataTestId="result-wrong-count" /><Metric value={result.unansweredQuestions} label="غير مجاب" color="text-[var(--c-text-muted)]" /><Metric value={`${Math.floor(result.durationSeconds / 60)}:${String(result.durationSeconds % 60).padStart(2, '0')}`} label="المدة" color="text-[var(--c-text)]" /></div></motion.div>{result.comparison && <section className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5"><h3 className="text-sm font-bold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[var(--c-primary-700)]" />مقارنة</h3>{[['نتيجتك', result.comparison.yourScore, 'var(--c-primary-700)'], ['المتوسط', result.comparison.averageScore, 'var(--c-text-muted)'], ['الأعلى', result.comparison.topScore, 'var(--cms-success-700)']].map(([label, value, color]) => <div key={String(label)} className="flex items-center gap-3 mb-2"><span className="text-xs w-16 text-[var(--c-text-muted)]">{label}</span><div className="flex-1 h-2 bg-[var(--c-neutral-200)] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Number(value)}%`, background: String(color) }} /></div><span className="text-xs font-bold w-10 text-end" style={{ color: String(color) }} lang="en">{Number(value).toFixed(0)}%</span></div>)}</section>}{strongTopics.length > 0 && <section className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5" data-testid="result-strong-topics"><h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-[var(--c-success-500)]" />المواضيع الأقوى</h3>{strongTopics.map(topic => <div key={topic.tag} className="flex items-center gap-3 mb-2"><span className="text-xs font-medium w-20">#{topic.tag}</span><div className="flex-1 h-2 bg-[var(--c-neutral-200)] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${topic.accuracy}%`, background: 'var(--c-success-500)' }} /></div><span className="text-xs font-bold w-10 text-end" lang="en">{topic.accuracy.toFixed(0)}%</span></div>)}</section>}{result.weakestTopics.length > 0 && <section className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5" data-testid="result-weakest-topics"><h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-[var(--c-warning-500)]" />المواضيع الأضعف</h3>{result.weakestTopics.map(topic => <div key={topic.tag} className="flex items-center gap-3 mb-2"><span className="text-xs font-medium w-20">#{topic.tag}</span><div className="flex-1 h-2 bg-[var(--c-neutral-200)] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${topic.accuracy}%`, background: topic.accuracy < 40 ? 'var(--c-danger-500)' : 'var(--c-warning-500)' }} /></div><span className="text-xs font-bold w-10 text-end" lang="en">{topic.accuracy.toFixed(0)}%</span></div>)}</section>}{attempts.length > 1 && <section className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-5" data-testid="result-attempts"><h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Clock className="w-4 h-4 text-[var(--c-primary-700)]" />سجل المحاولات</h3><ul className="divide-y divide-[var(--c-border)]">{attempts.map((attempt, index) => <li key={attempt.sessionId} className="flex items-center justify-between gap-3 py-2.5" data-testid={`result-attempt-${index}`}><div className="flex items-center gap-2 min-w-0"><span className="text-xs font-bold text-[var(--c-text-soft)] shrink-0" lang="en">#{attempts.length - index}</span><span className="text-xs text-[var(--c-text-muted)]" lang="en">{new Date(attempt.startedAt).toLocaleDateString('ar')}</span>{attempt.isCurrent && <span className="rounded-full bg-[var(--c-primary-50)] px-2 py-0.5 text-[11px] font-bold text-[var(--cms-teal-800)]">هذه المحاولة</span>}</div><div className="flex items-center gap-2 shrink-0">{attempt.score != null && <span className="text-xs font-extrabold" style={{ color: attempt.passed ? 'var(--cms-success-700)' : 'var(--c-danger-500)' }} lang="en">{Math.round(attempt.score)}%</span>}{attempt.status === 'TimedOut' && <span className="text-[11px] font-semibold text-[var(--cms-warning-700)]">انتهى الوقت</span>}{attempt.status === 'Completed' && attempt.passed && <span className="text-[11px] font-semibold text-[var(--cms-success-700)]">نجاح</span>}</div></li>)}</ul></section>}<div className="flex gap-3 justify-center flex-wrap">{canRetake && <button onClick={onRetake} data-testid="result-retake" className="px-5 py-2.5 rounded-[10px] text-sm font-bold text-white" style={{ background: 'var(--grad-primary)' }}>إعادة المحاولة{result.remainingAttempts != null && <span lang="en"> ({result.remainingAttempts})</span>}</button>}<button onClick={onBack} className="px-5 py-2.5 rounded-[10px] text-sm font-semibold border border-[var(--c-border-strong)] text-[var(--c-text-soft)] hover:bg-[var(--c-primary-50)]">العودة للمادة</button>{result.canReview && <button onClick={onReview} className="px-5 py-2.5 rounded-[10px] text-sm font-bold text-white" style={{ background: 'var(--grad-primary)' }}>مراجعة الأسئلة</button>}</div></div>;
}
function Metric({ value, label, color, dataTestId }: { value: string | number; label: string; color: string; dataTestId?: string }) { return <div className="text-center" data-testid={dataTestId}><div className={`text-2xl font-extrabold ${color}`} lang="en">{value}</div><div className="text-xs text-[var(--c-text-muted)]">{label}</div></div>; }
