import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  AlertTriangle, CircleAlert, Dumbbell, Eraser, Loader2, RotateCcw, Trophy,
} from 'lucide-react';
import { cn } from '@/utils';
import { SecurityWrapper } from '@/features/security/SecurityWrapper';
import { useMySubjects } from '@/features/my-studies/hooks/useMySubjects';
import { examApi } from '@/features/exams/services/exam-api';
import { questionApi } from '@/features/questions/services/question-api';
import { QuestionRow } from '@/components/QuestionRow';
import { ReportQuestionDialog } from '@/components/ReportQuestionDialog';
import {
  practiceApi,
  type PracticeCategoryFilter,
  type PracticeQuestion,
  type SubmitAnswerResult,
} from '../services/practice-api';
import { isEntitlementDenied } from '@/features/my-studies/services/courses-api';
import { CatalogEntitlementErrorCard } from '@/features/my-studies/components/CatalogErrorCards';

/**
 * W14.4 (B.1, D13) — the practice player over the W14.2 PracticeSession endpoints:
 * immediate feedback per answer, progress «أجبت X من Y», and the two reset actions
 * (per-question withdraw + full session wipe). Two entry modes:
 *  • /practice/exam/:examModelId — a composition run over one exam model
 *  • /practice/categorized/:subjectId?lectureId&untaggedLecture&paragraphTag&untaggedTag
 *    — a filtered run whose lens is echoed on every answer/progress call and
 *    re-verified server-side (A.4).
 * The page mounts SecurityWrapper: practice content carries the same watermark /
 * anti-copy protection as the course player (C.3 parity for new protected surfaces).
 *
 * W15.0 (P4-C2) — INLINE LIST VIEW: the one-card-at-a-time pager is gone; every
 * question renders as a shared <QuestionRow> (number + text + options + inline
 * confirm + immediate feedback), separated by subtle borders. The chip navigator
 * became scroll anchors. All per-question logic was ALREADY keyed by question id
 * (selections/feedback/restored/essayDrafts maps) — only the handlers were
 * parameterized, no state model change.
 */

type PracticeStart = {
  sessionId: string;
  questions: PracticeQuestion[];
  totalQuestions: number;
  status: string;
  score?: number | null;
  answers: { questionId: string; selectedAnswer?: string | null; isCorrect?: boolean | null }[];
};

type RestoredState = { selected: string[]; isCorrect: boolean | null };

function parseSelectedAnswer(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed;
  } catch { /* legacy comma list below */ }
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export default function PracticePage() {
  return (
    <SecurityWrapper>
      <PracticePageInner />
    </SecurityWrapper>
  );
}

function PracticePageInner() {
  const { examModelId, subjectId: routeSubjectId } = useParams<{ examModelId?: string; subjectId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mySubjects = useMySubjects();

  const filter: PracticeCategoryFilter | undefined = useMemo(() => {
    if (!routeSubjectId) return undefined;
    const lectureId = searchParams.get('lectureId');
    const paragraphTag = searchParams.get('paragraphTag');
    const untaggedLecture = searchParams.get('untaggedLecture') === 'true';
    const untaggedTag = searchParams.get('untaggedTag') === 'true';
    if (!lectureId && !paragraphTag && !untaggedLecture && !untaggedTag) return undefined;
    return { lectureId: lectureId ?? null, untaggedLecture, paragraphTag: paragraphTag ?? null, untaggedTag };
  }, [routeSubjectId, searchParams]);

  const [start, setStart] = useState<PracticeStart | null>(null);
  const [phase, setPhase] = useState<'loading' | 'running' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [feedback, setFeedback] = useState<Record<string, SubmitAnswerResult>>({});
  const [restored, setRestored] = useState<Record<string, RestoredState>>({});
  const [essayDrafts, setEssayDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [resettingAll, setResettingAll] = useState(false);
  const [showResetAllConfirm, setShowResetAllConfirm] = useState(false);
  // W15.0 (P4-C4): per-question bookmark + report — the PracticeQuestion DTO carries no
  // isFavorite flag, so the toggle starts from false and lives optimistically.
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, boolean>>({});
  const [reportQuestionId, setReportQuestionId] = useState<string | null>(null);

  const isCategorized = Boolean(routeSubjectId);

  // Header context: subject name (categorized) or exam title (exam model).
  const subjectName = useMemo(
    () => (mySubjects.data ?? []).find((s) => s.id === routeSubjectId)?.nameAr ?? null,
    [mySubjects.data, routeSubjectId]
  );
  const treeQuery = useQuery({
    queryKey: ['practice-categorized-tree', routeSubjectId],
    queryFn: () => practiceApi.getCategorizedTree(routeSubjectId!),
    enabled: isCategorized && !!routeSubjectId,
  });
  const examQuery = useQuery({
    queryKey: ['practice-exam-model', examModelId],
    queryFn: () => examApi.getById(examModelId!),
    enabled: !isCategorized && !!examModelId,
  });

  const headerTitle = isCategorized
    ? (subjectName ? `تدريب — ${subjectName}` : 'تدريب مصنّف')
    : (examQuery.data?.titleAr ?? 'تدريب على نموذج');

  const headerSubtitle = useMemo(() => {
    if (!isCategorized) return 'أسئلة النموذج كاملة مع تصحيح فوري';
    const lectureLabel = filter?.untaggedLecture
      ? 'غير مصنف'
      : (treeQuery.data?.lectures ?? []).find((l) => l.lectureId === filter?.lectureId)?.lectureTitle ?? null;
    const tagLabel = filter?.untaggedTag ? 'غير مصنف' : filter?.paragraphTag ?? null;
    if (lectureLabel && tagLabel) return `${lectureLabel} ← ${tagLabel}`;
    if (lectureLabel) return lectureLabel;
    if (tagLabel) return `وسم: ${tagLabel}`;
    return 'كل أسئلة المادة القابلة للتدريب';
  }, [isCategorized, filter, treeQuery.data]);

  const bootstrap = useCallback(async () => {
    if (isCategorized ? !routeSubjectId : !examModelId) return;
    setPhase('loading');
    setLoadError('');
    try {
      const data = isCategorized
        ? await practiceApi.startCategorized(routeSubjectId!, filter)
        : await practiceApi.startExamModel(examModelId!);
      const restoredMap: Record<string, RestoredState> = {};
      for (const answer of data.answers ?? []) {
        restoredMap[answer.questionId] = {
          selected: parseSelectedAnswer(answer.selectedAnswer),
          isCorrect: answer.isCorrect ?? null,
        };
      }
      setStart({
        sessionId: data.sessionId,
        questions: data.questions ?? [],
        totalQuestions: data.totalQuestions,
        status: data.status,
        score: data.score ?? null,
        answers: data.answers ?? [],
      });
      setRestored(restoredMap);
      setSelections(Object.fromEntries(Object.entries(restoredMap).map(([id, state]) => [id, state.selected])));
      setFeedback({});
      setPhase('running');
    } catch (error) {
      if (error instanceof Error && isEntitlementDenied(error)) {
        setLoadError('__ENTITLEMENT__');
      } else {
        setLoadError(error instanceof Error ? error.message : 'تعذّر بدء جلسة التدريب.');
      }
      setPhase('error');
    }
  }, [examModelId, filter, isCategorized, routeSubjectId]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const questions = start?.questions ?? [];

  const answeredIds = useMemo(() => {
    const ids = new Set<string>(Object.keys(restored));
    for (const [id, result] of Object.entries(feedback)) {
      if (result) ids.add(id);
    }
    return ids;
  }, [restored, feedback]);

  const answeredCount = answeredIds.size;

  const refreshProgress = useCallback(async () => {
    if (!start) return;
    try {
      const progress = await practiceApi.getProgress(start.sessionId, filter);
      setStart((previous) =>
        previous ? { ...previous, status: progress.status, score: progress.score ?? null, totalQuestions: progress.totalQuestions } : previous
      );
    } catch { /* progress refresh is best-effort; the next answer resyncs */ }
  }, [filter, start]);

  // W15.0 (P4-C2): submit/reset are parameterized by QUESTION — the list view has no
  // "current" index anymore; every row owns its own confirm/reset flow.
  const submitAnswer = useCallback(async (question: PracticeQuestion) => {
    if (!start) return;
    const isEssay = question.type.toLowerCase() === 'essay';
    const selected = selections[question.id] ?? [];
    const essayText = (essayDrafts[question.id] ?? '').trim();
    if (isEssay ? !essayText : selected.length === 0) {
      toast.message(isEssay ? 'اكتب إجابتك أولاً.' : 'اختر إجابة أولاً.');
      return;
    }
    setPending(question.id);
    try {
      const payload = isEssay
        ? essayText
        : question.type === 'MultipleSelect'
          ? JSON.stringify(selected)
          : selected[0];
      const result = await practiceApi.submitAnswer(start.sessionId, question.id, payload, filter);
      setFeedback((previous) => ({ ...previous, [question.id]: result }));
      setRestored((previous) => {
        const next = { ...previous };
        delete next[question.id];
        return next;
      });
      void refreshProgress();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر إرسال الإجابة. أعد المحاولة.');
    } finally {
      setPending(null);
    }
  }, [essayDrafts, filter, refreshProgress, selections, start]);

  const resetQuestion = useCallback(async (question: PracticeQuestion) => {
    if (!start) return;
    setPending(`reset:${question.id}`);
    try {
      await practiceApi.resetQuestion(start.sessionId, question.id);
      setFeedback((previous) => {
        const next = { ...previous };
        delete next[question.id];
        return next;
      });
      setRestored((previous) => {
        const next = { ...previous };
        delete next[question.id];
        return next;
      });
      setSelections((previous) => ({ ...previous, [question.id]: [] }));
      setEssayDrafts((previous) => ({ ...previous, [question.id]: '' }));
      void refreshProgress();
      toast.message('أُعيد ضبط السؤال — يمكنك المحاولة من جديد.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر إعادة ضبط السؤال.');
    } finally {
      setPending(null);
    }
  }, [refreshProgress, start]);

  const toggleSelection = useCallback((question: PracticeQuestion, optionId: string) => {
    const isMultiple = question.type === 'MultipleSelect';
    setSelections((previous) => {
      const current = previous[question.id] ?? [];
      const next = isMultiple
        ? (current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId])
        : [optionId];
      return { ...previous, [question.id]: next };
    });
  }, []);

  // W15.0 (P4-C4): the flat-favorite toggle ported from QuestionPage (same endpoints,
  // optimistic override + rollback + ['favorites'] invalidation).
  const favoriteMutation = useMutation({
    mutationFn: ({ questionId, isFav }: { questionId: string; isFav: boolean }) =>
      questionApi.toggleFavorite(questionId, isFav),
    onMutate: ({ questionId, isFav }) => {
      setFavoriteOverrides((previous) => ({ ...previous, [questionId]: !isFav }));
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      toast.success(variables.isFav ? 'أُزيل السؤال من المفضلة' : 'أُضيف السؤال إلى المفضلة');
    },
    onError: (_error, variables) => {
      setFavoriteOverrides((previous) => {
        const next = { ...previous };
        delete next[variables.questionId];
        return next;
      });
      toast.error('تعذّر تحديث المفضلة. تحقق من اتصالك واستحقاقك.');
    },
  });

  const resetAll = useCallback(async () => {
    if (!start) return;
    setShowResetAllConfirm(false);
    setResettingAll(true);
    try {
      await practiceApi.resetAll(start.sessionId);
      setFeedback({});
      setRestored({});
      setSelections({});
      setEssayDrafts({});
      void refreshProgress();
      toast.message('أُعيد ضبط الجلسة بالكامل.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذّر إعادة ضبط الجلسة.');
    } finally {
      setResettingAll(false);
    }
  }, [refreshProgress, start]);

  // ===== shell states =====
  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--cms-teal-700)] mb-3" aria-hidden="true" />
        <p className="text-sm text-[var(--cms-text-muted)]">جارٍ تحضير جلسة التدريب…</p>
      </div>
    );
  }

  if (phase === 'error') {
    if (loadError === '__ENTITLEMENT__') {
      return <CatalogEntitlementErrorCard variant="no-grants" onRetry={() => void bootstrap()} testId="practice-denied" />;
    }
    return (
      <div className="max-w-lg mx-auto mt-12 rounded-2xl border border-[var(--cms-line-strong)] bg-[var(--cms-surface)] p-7 text-center" role="alert">
        <CircleAlert className="w-9 h-9 mx-auto mb-3 text-[var(--cms-danger)]" aria-hidden="true" />
        <h2 className="font-bold text-lg mb-2">تعذّر فتح التدريب</h2>
        <p className="text-sm text-[var(--cms-text-muted)] mb-5">{loadError || 'حدث خطأ غير متوقع.'}</p>
        <div className="flex justify-center gap-2">
          <button type="button" onClick={() => void bootstrap()} className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--cms-line-strong)] px-5 text-sm font-bold text-[var(--cms-text)]">
            <RotateCcw className="w-4 h-4" aria-hidden="true" /> إعادة المحاولة
          </button>
          <button type="button" onClick={() => navigate(-1)} className="press inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-bold text-white" style={{ background: 'var(--cms-teal-700)' }}>
            العودة
          </button>
        </div>
      </div>
    );
  }

  if (!start || questions.length === 0) {
    return (
      <div className="max-w-lg mx-auto mt-12 rounded-2xl border border-dashed border-[var(--cms-line-strong)] bg-[var(--cms-surface)] p-8 text-center">
        <Dumbbell className="w-9 h-9 mx-auto mb-3 text-[var(--cms-text-muted)]" aria-hidden="true" />
        <h2 className="font-bold text-lg mb-2">لا توجد أسئلة في هذه الجلسة</h2>
        <p className="text-sm text-[var(--cms-text-muted)] mb-5">قد تكون الأسئلة غير منشورة بعد — جرّب تصنيفاً آخر.</p>
        <button type="button" onClick={() => navigate('/exam-courses?tab=categorized')} className="press inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-bold text-white" style={{ background: 'var(--cms-teal-700)' }}>
          العودة إلى التصنيفات
        </button>
      </div>
    );
  }

  const isCompleted = start.status === 'Completed';

  return (
    <div className="max-w-[900px] mx-auto space-y-4">
      {/* Session header — title, progress, score, resets. */}
      <div className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-[var(--cms-text)] truncate flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-[var(--cms-teal-700)] shrink-0" aria-hidden="true" />
              {headerTitle}
            </h1>
            <p className="text-xs text-[var(--cms-text-muted)] mt-0.5">{headerSubtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {isCompleted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--cms-success-50)] px-3 py-1 text-xs font-bold text-[var(--cms-success)]" data-testid="practice-completed-badge">
                <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
                اكتملت <span lang="en">{start.score != null ? `${Math.round(start.score)}%` : ''}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowResetAllConfirm(true)}
              disabled={resettingAll || answeredCount === 0}
              data-testid="practice-reset-all"
              className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--cms-line-strong)] px-3.5 text-xs font-bold text-[var(--cms-text-soft)] transition-colors hover:border-[var(--cms-danger)] hover:text-[var(--cms-danger)] disabled:opacity-50"
              aria-label="إعادة ضبط كل إجابات الجلسة"
            >
              {resettingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Eraser className="w-3.5 h-3.5" aria-hidden="true" />}
              إعادة ضبط الكل
            </button>
          </div>
        </div>

        {/* Progress: أجبت X من Y + bar + counts. */}
        <div className="mt-3" data-testid="practice-progress">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-[var(--cms-text-soft)]">
              أجبت <strong className="text-[var(--cms-teal-700)]" lang="en">{answeredCount}</strong> من <strong lang="en">{start.totalQuestions}</strong>
            </span>
            <span className="text-[var(--cms-text-muted)]" lang="en">{Math.round((answeredCount / Math.max(1, start.totalQuestions)) * 100)}%</span>
          </div>
          <div className="h-2 bg-[var(--cms-ivory-200)] rounded-full overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={start.totalQuestions} aria-valuenow={answeredCount} aria-label="تقدم التدريب">
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'var(--cms-teal-600)' }}
              animate={{ width: `${(answeredCount / Math.max(1, start.totalQuestions)) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      </div>

      {/* W15.0 (P4-C2) — the question LIST: one shared <QuestionRow> per question
          (number + text + options + inline confirm + immediate feedback), separated
          by subtle borders instead of the old single-card pager. */}
      <div
        className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] px-4 py-1 shadow-sm sm:px-5"
        data-testid="practice-list"
      >
        {questions.map((question, index) => (
          <QuestionRow
            key={question.id}
            testIdPrefix="practice"
            question={question}
            index={index}
            total={start.totalQuestions}
            isAnswered={answeredIds.has(question.id)}
            selected={selections[question.id] ?? []}
            pending={pending === question.id}
            onSelect={(optionId) => toggleSelection(question, optionId)}
            onConfirm={() => void submitAnswer(question)}
            feedback={feedback[question.id] ?? null}
            previouslyAnswered={restored[question.id] ?? null}
            onReset={() => void resetQuestion(question)}
            resetPending={pending === `reset:${question.id}`}
            essayDraft={essayDrafts[question.id] ?? ''}
            onEssayChange={(value) => setEssayDrafts((previous) => ({ ...previous, [question.id]: value }))}
            showBookmark
            isFavorite={favoriteOverrides[question.id] ?? false}
            onToggleFavorite={() => favoriteMutation.mutate({ questionId: question.id, isFav: favoriteOverrides[question.id] ?? false })}
            favoritePending={favoriteMutation.isPending && favoriteMutation.variables?.questionId === question.id}
            onReport={() => setReportQuestionId(question.id)}
          />
        ))}
      </div>

      {/* Chip navigator — now SCROLL ANCHORS over the inline list. */}
      <div className="flex items-center justify-center gap-1.5 flex-wrap" data-testid="practice-navigator">
        {questions.map((question, index) => {
          const answered = answeredIds.has(question.id);
          return (
            <button
              key={question.id}
              type="button"
              onClick={() =>
                document.getElementById(`practice-row-${question.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              aria-label={`الانتقال إلى السؤال ${index + 1}${answered ? ' — مجاب' : ''}`}
              data-testid={`practice-chip-${question.id}`}
              className={cn(
                'w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center transition-all',
                answered
                  ? 'bg-[var(--cms-success-50)] text-[var(--cms-success)]'
                  : 'bg-[var(--cms-ivory-100)] text-[var(--cms-text-muted)] hover:bg-[var(--cms-teal-50)]'
              )}
              lang="en"
            >
              {index + 1}
            </button>
          );
        })}
      </div>

      {/* W15.0 (P4-C4): the shared report dialog (extracted from QuestionPage). */}
      <ReportQuestionDialog
        questionId={reportQuestionId}
        open={reportQuestionId !== null}
        onOpenChange={(open) => { if (!open) setReportQuestionId(null); }}
      />

      {/* Reset-all confirm. */}
      <AnimatePresence>
        {showResetAllConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(11,34,53,0.55)' }}
            onClick={() => setShowResetAllConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--cms-surface)] rounded-2xl p-6 max-w-md w-full"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-label="تأكيد إعادة ضبط الجلسة"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 mx-auto bg-[var(--cms-warning-50)]">
                <AlertTriangle className="w-6 h-6 text-[var(--cms-warning)]" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-bold text-center mb-2">إعادة ضبط كل الإجابات؟</h3>
              <p className="text-sm text-[var(--cms-text-muted)] text-center mb-1">
                ستمسح جميع إجاباتك في هذه الجلسة (<span lang="en">{answeredCount}</span> من <span lang="en">{start.totalQuestions}</span>) وتبدأ من جديد.
              </p>
              <p className="text-xs text-[var(--cms-text-muted)] text-center mb-4">يُعاد فتح الجلسة وتصفير النتيجة المسجلة.</p>
              <div className="flex gap-2 justify-center">
                <button
                  type="button"
                  onClick={() => setShowResetAllConfirm(false)}
                  className="press inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-semibold text-[var(--cms-text-muted)] hover:bg-[var(--cms-ivory-100)]"
                >
                  متابعة الحل
                </button>
                <button
                  type="button"
                  onClick={() => void resetAll()}
                  disabled={resettingAll}
                  data-testid="practice-reset-all-confirm"
                  className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl px-5 text-sm font-bold text-white bg-[var(--cms-danger)]"
                >
                  {resettingAll ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Eraser className="w-4 h-4" aria-hidden="true" />}
                  إعادة الضبط
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
