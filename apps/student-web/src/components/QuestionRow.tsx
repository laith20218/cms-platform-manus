import { BookOpen, Check, Flag, ListChecks, Loader2, RotateCcw, Star, Tag, X } from 'lucide-react';
import { cn } from '@/utils';

/**
 * W15.0 (P4) — the ONE shared inline question row. Replaces the per-feature "one card
 * at a time" pagers: Practice, Exam run, and Exam review now render a CONTINUOUS list
 * (question number + text + options + optional explanation) with a subtle separator
 * (border-b) instead of a card wrapper, per the workorder.
 *
 * Contract bridging (DIAG-4): three DTO families (PracticeQuestion / ExamQuestion /
 * ExamReviewQuestion) normalize into QuestionRowData at the page boundary — the row is
 * purely presentational; ALL interaction logic (selection maps, feedback, mutations)
 * stays in page state keyed by question id.
 *
 * Token family: --cms-* (the workorder's prescribed separator). Exam pages render
 * these rows inside their existing --c-* chrome — the row look is deliberately uniform.
 *
 * Accessibility: options stay BUTTONS with role=radio/checkbox + aria-checked (44px+
 * targets); read-only review renders non-interactive rows; confirm-gated reveal is
 * preserved (correctness only after feedback exists); every row testid is namespaced
 * by question id so multi-row queries stay unambiguous.
 */

export interface QuestionRowOptionData {
  id: string;
  letter: string;
  text: string;
  imageUrl?: string | null;
}

export interface QuestionRowData {
  id: string;
  number?: number | null;
  text: string;
  /** 'Mcq' | 'MultipleSelect' | 'TrueFalse' | 'Essay' (case-insensitive essay check). */
  type: string;
  paragraphTag?: string | null;
  options: QuestionRowOptionData[];
  images?: { id: string; imageUrl: string; altText?: string | null }[];
}

export interface QuestionRowFeedback {
  /** null/undefined = recorded but ungraded (essay comparison pending). */
  isCorrect?: boolean | null;
  /** Server-revealed correct option ids (green highlight). */
  correctOptionIds?: string[] | null;
  correctAnswerText?: string | null;
  explanation?: string | null;
  reference?: string | null;
}

export interface QuestionRowProps {
  question: QuestionRowData;
  /** 0-based position in the list (rendered 1-based). */
  index: number;
  total?: number | null;

  // ===== answering (interactive mode) =====
  isAnswered: boolean;
  selected: string[];
  pending?: boolean;
  onSelect?: (optionId: string) => void;
  /** Confirm-gated reveal: correctness shows only after the server answers. */
  onConfirm?: () => void;
  feedback?: QuestionRowFeedback | null;
  /** Resumed-session state: answered in a previous visit (banner, no details). */
  previouslyAnswered?: { isCorrect: boolean | null } | null;
  onReset?: () => void;
  resetPending?: boolean;

  // ===== essay =====
  essayDraft?: string;
  onEssayChange?: (value: string) => void;

  // ===== review (read-only mode) =====
  readOnly?: boolean;
  /** Aligned by index with question.options — per-option correctness + user answer. */
  reviewOptions?: { isCorrect: boolean; isUserAnswer: boolean }[];
  showCorrectAnswers?: boolean;
  /** Essay review: the recorded free-text answer. */
  userAnswerText?: string | null;

  // ===== per-question actions (W15.0 P4-C4) =====
  showBookmark?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  favoritePending?: boolean;
  onReport?: () => void;

  /** Testid namespace (default 'question-row' → question-row-row-{id} etc.). */
  testIdPrefix?: string;
}

export function QuestionRow({
  question,
  index,
  total,
  isAnswered,
  selected,
  pending,
  onSelect,
  onConfirm,
  feedback,
  previouslyAnswered,
  onReset,
  resetPending,
  essayDraft,
  onEssayChange,
  readOnly,
  reviewOptions,
  showCorrectAnswers,
  userAnswerText,
  showBookmark,
  isFavorite,
  onToggleFavorite,
  favoritePending,
  onReport,
  testIdPrefix = 'question-row',
}: QuestionRowProps) {
  const prefix = testIdPrefix;
  const isEssay = question.type.toLowerCase() === 'essay';
  const isMultiple = question.type === 'MultipleSelect';
  const hasOptions = question.options.length > 0;
  const answered = isAnswered || readOnly === true;
  const canInteract = !readOnly && !answered && !pending;

  const optionState = (optionId: string, optionIndex: number): 'correct' | 'wrong' | 'selected' | 'idle' => {
    const isSelected = selected.includes(optionId);
    if (readOnly) {
      const review = reviewOptions?.[optionIndex];
      if (review) {
        const knownCorrectness = feedback?.isCorrect != null;
        if (showCorrectAnswers && review.isCorrect) return 'correct';
        if (review.isUserAnswer && !review.isCorrect && knownCorrectness) return 'wrong';
        return review.isUserAnswer ? 'selected' : 'idle';
      }
      return isSelected ? 'selected' : 'idle';
    }
    const isCorrectOption = feedback?.correctOptionIds?.includes(optionId) ?? false;
    if (isCorrectOption) return 'correct';
    if (feedback && isSelected && !isCorrectOption) return 'wrong';
    return isSelected ? 'selected' : 'idle';
  };

  return (
    <article
      id={`${prefix}-row-${question.id}`}
      data-testid={`${prefix}-row-${question.id}`}
      aria-label={`السؤال ${index + 1}`}
      className="border-b border-[var(--cms-line)] py-4 last:border-b-0"
    >
      {/* Row header: number + paragraph tag + status + actions. */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span
            className="w-7 h-7 rounded-lg bg-[var(--cms-ivory-100)] text-[var(--cms-text-soft)] text-xs font-bold flex items-center justify-center shrink-0"
            lang="en"
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <span className="text-xs font-bold text-[var(--cms-text-soft)]" lang="en">
            سؤال {question.number ?? index + 1}{total != null ? ` / ${total}` : ''}
          </span>
          {question.paragraphTag && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--cms-teal-50)] px-2.5 py-0.5 text-xs font-semibold text-[var(--cms-teal-800)]">
              <Tag className="w-3 h-3" aria-hidden="true" />
              {question.paragraphTag}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Read-only correctness badge (review). */}
          {readOnly && feedback?.isCorrect != null && (
            <span
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold',
                feedback.isCorrect
                  ? 'bg-[var(--cms-success-50)] text-[var(--cms-success-700)]'
                  : 'bg-[var(--cms-danger-50)] text-[var(--cms-danger-700)]',
              )}
            >
              {feedback.isCorrect ? <Check className="w-3 h-3" aria-hidden="true" /> : <X className="w-3 h-3" aria-hidden="true" />}
              {feedback.isCorrect ? 'إجابتك صحيحة' : 'إجابتك غير صحيحة'}
            </span>
          )}
          {readOnly && feedback?.isCorrect == null && (
            <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-[var(--cms-ivory-100)] text-[var(--cms-text-muted)]">
              تفاصيل التصحيح محجوبة
            </span>
          )}

          {/* Per-question withdraw (practice only). */}
          {!readOnly && answered && onReset && (
            <button
              type="button"
              onClick={onReset}
              disabled={resetPending}
              data-testid={`${prefix}-reset-question-${question.id}`}
              className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--cms-line-strong)] px-3.5 text-xs font-bold text-[var(--cms-text-soft)] transition-colors hover:border-[var(--cms-danger)] hover:text-[var(--cms-danger)]"
              aria-label="إعادة ضبط هذا السؤال"
            >
              {resetPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />}
              إعادة ضبط السؤال
            </button>
          )}

          {/* Per-question actions (P4-C4): bookmark + report, when wired. */}
          {showBookmark && onToggleFavorite && !readOnly && (
            <button
              type="button"
              onClick={onToggleFavorite}
              disabled={favoritePending}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
              data-testid={`${prefix}-favorite-${question.id}`}
              className={cn(
                'press inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-bold transition-colors disabled:opacity-60',
                isFavorite
                  ? 'border-[var(--cms-warning-600)] bg-[var(--cms-warning-50)] text-[var(--cms-warning-700)]'
                  : 'border-[var(--cms-line-strong)] text-[var(--cms-text-soft)] hover:border-[var(--cms-teal-500)] hover:text-[var(--cms-teal-800)]',
              )}
            >
              <Star className="w-3.5 h-3.5" fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
              {isFavorite ? 'في المفضلة' : 'مفضلة'}
            </button>
          )}
          {onReport && !readOnly && (
            <button
              type="button"
              onClick={onReport}
              data-testid={`${prefix}-report-${question.id}`}
              className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--cms-line-strong)] px-3.5 text-xs font-bold text-[var(--cms-text-soft)] transition-colors hover:border-[var(--cms-teal-500)] hover:text-[var(--cms-teal-800)]"
              aria-label="الإبلاغ عن خطأ في هذا السؤال"
            >
              <Flag className="w-3.5 h-3.5" aria-hidden="true" />
              إبلاغ
            </button>
          )}
        </div>
      </div>

      {/* Text + images. */}
      <p className="text-[15px] font-semibold text-[var(--cms-text)] leading-relaxed mb-3">{question.text}</p>
      {(question.images ?? []).length > 0 && (
        <div className="grid gap-3 mb-3">
          {(question.images ?? []).map((image) => (
            <img
              key={image.id}
              src={image.imageUrl}
              alt={image.altText ?? 'صورة مرفقة بالسؤال'}
              loading="lazy"
              className="rounded-xl max-h-80 object-contain border border-[var(--cms-line)]"
            />
          ))}
        </div>
      )}

      {/* Essay: textarea (interactive) or recorded answer (review). */}
      {isEssay ? (
        readOnly ? (
          <div className="rounded-xl border border-[var(--cms-line)] p-3 text-sm text-[var(--cms-text-soft)]">
            <strong className="text-[var(--cms-text)]">إجابتك:</strong> {userAnswerText || 'لم تُسجل إجابة.'}
            {showCorrectAnswers && feedback?.correctAnswerText && (
              <p className="mt-2">
                <strong className="text-[var(--cms-text)]">الإجابة النموذجية:</strong> {feedback.correctAnswerText}
              </p>
            )}
          </div>
        ) : (
          <div>
            <label htmlFor={`${prefix}-essay-${question.id}`} className="text-sm font-semibold text-[var(--cms-text-soft)] mb-2 block">
              اكتب إجابتك:
            </label>
            <textarea
              id={`${prefix}-essay-${question.id}`}
              value={essayDraft ?? ''}
              onChange={(event) => onEssayChange?.(event.target.value)}
              disabled={answered}
              rows={4}
              className="w-full rounded-xl border border-[var(--cms-line-strong)] bg-[var(--cms-surface)] p-3 text-sm text-[var(--cms-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cms-teal-700)] disabled:opacity-70"
              placeholder="اكتب إجابتك هنا…"
              data-testid={`${prefix}-essay-${question.id}`}
            />
          </div>
        )
      ) : hasOptions ? (
        <div className="space-y-2.5" role={readOnly ? undefined : isMultiple ? 'group' : 'radiogroup'} aria-label="الخيارات">
          {question.options.map((option, optionIndex) => {
            const state = optionState(option.id, optionIndex);
            const sharedClass = cn(
              'w-full flex items-center gap-3.5 p-3.5 rounded-xl border-[1.5px] transition-all text-start',
              state === 'correct'
                ? 'border-[var(--cms-success)] bg-[var(--cms-success-50)]'
                : state === 'wrong'
                  ? 'border-[var(--cms-danger)] bg-[var(--cms-danger-50)]'
                  : state === 'selected'
                    ? 'border-[var(--cms-teal-600)] bg-[var(--cms-teal-50)]'
                    : 'border-[var(--cms-line-strong)] bg-[var(--cms-surface)] hover:border-[var(--cms-teal-500)]',
              readOnly ? 'cursor-default' : 'disabled:cursor-default',
            );

            const inner = (
              <>
                <span
                  className={cn(
                    'w-8 h-8 rounded-[8px] flex items-center justify-center font-bold text-[13px] shrink-0',
                    state === 'correct'
                      ? 'bg-[var(--cms-success)] text-white'
                      : state === 'selected' || state === 'wrong'
                        ? 'bg-[var(--cms-teal-700)] text-white'
                        : 'bg-[var(--cms-ivory-100)] text-[var(--cms-text-soft)]',
                  )}
                  lang="en"
                >
                  {option.letter}
                </span>
                <span className="flex-1 text-[15px] font-medium text-[var(--cms-text)]">{option.text}</span>
                {state === 'correct' && <Check className="w-5 h-5 text-[var(--cms-success)] shrink-0" aria-hidden="true" />}
                {state === 'wrong' && <X className="w-5 h-5 text-[var(--cms-danger)] shrink-0" aria-hidden="true" />}
              </>
            );

            return readOnly ? (
              <div key={option.id} data-testid={`${prefix}-option-${option.id}`} className={sharedClass}>
                {inner}
              </div>
            ) : (
              <button
                key={option.id}
                type="button"
                role={isMultiple ? 'checkbox' : 'radio'}
                aria-checked={selected.includes(option.id)}
                disabled={!canInteract}
                onClick={() => onSelect?.(option.id)}
                data-testid={`${prefix}-option-${option.id}`}
                className={sharedClass}
              >
                {inner}
              </button>
            );
          })}
          {isMultiple && !readOnly && !answered && (
            <p className="text-xs text-[var(--cms-text-muted)]">يمكن اختيار أكثر من إجابة — تُصحَّح بالمطابقة الكاملة.</p>
          )}
        </div>
      ) : null}

      {/* Review: the correct-answer line under options. */}
      {readOnly && showCorrectAnswers && feedback?.correctAnswerText && hasOptions && (
        <p className="text-xs text-[var(--cms-text-muted)] mt-3">
          <strong>الإجابة الصحيحة:</strong> {feedback.correctAnswerText}
        </p>
      )}

      {/* Immediate feedback (practice) / explanation (review). */}
      {(feedback || previouslyAnswered) && (
        <div role="status" className="mt-3" data-testid={`${prefix}-feedback-${question.id}`}>
          {feedback ? (
            <>
              <div
                className={cn(
                  'rounded-xl p-3.5 font-bold text-sm flex items-center gap-2',
                  feedback.isCorrect === true
                    ? 'bg-[var(--cms-success-50)] text-[var(--cms-success)]'
                    : feedback.isCorrect === false
                      ? 'bg-[var(--cms-danger-50)] text-[var(--cms-danger)]'
                      : 'bg-[var(--cms-teal-50)] text-[var(--cms-teal-800)]',
                )}
              >
                {feedback.isCorrect === true && <><Check className="w-4 h-4" aria-hidden="true" />إجابة صحيحة</>}
                {feedback.isCorrect === false && <><X className="w-4 h-4" aria-hidden="true" />إجابة خاطئة — الخيار الصحيح مظلل بالأخضر</>}
                {feedback.isCorrect == null && <><ListChecks className="w-4 h-4" aria-hidden="true" />سُجلت إجابتك — قارنها بالإجابة النموذجية</>}
              </div>
              {feedback.isCorrect == null && feedback.correctAnswerText && (
                <div className="mt-2 rounded-xl border border-[var(--cms-line)] p-3 text-sm text-[var(--cms-text-soft)]">
                  <strong className="text-[var(--cms-text)]">الإجابة النموذجية:</strong> {feedback.correctAnswerText}
                </div>
              )}
              {feedback.explanation && (
                <div className="mt-2 rounded-xl border border-[var(--cms-line)] p-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--cms-teal-800)] mb-1.5">
                    <BookOpen className="w-3.5 h-3.5" aria-hidden="true" /> الشرح
                  </div>
                  <p className="text-sm text-[var(--cms-text-soft)] leading-relaxed whitespace-pre-wrap">{feedback.explanation}</p>
                  {feedback.reference && (
                    <p className="mt-2 text-xs text-[var(--cms-text-muted)]">المرجع: {feedback.reference}</p>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl p-3.5 text-sm font-semibold bg-[var(--cms-ivory-100)] text-[var(--cms-text-soft)] flex items-center gap-2">
              <ListChecks className="w-4 h-4 shrink-0" aria-hidden="true" />
              أجبت هذا السؤال سابقاً
              {previouslyAnswered?.isCorrect === true && <span className="text-[var(--cms-success)]">— صحيحة</span>}
              {previouslyAnswered?.isCorrect === false && <span className="text-[var(--cms-danger)]">— خاطئة</span>}
              {previouslyAnswered?.isCorrect == null && <span>— بانتظار المقارنة</span>}
              <span className="text-xs font-medium text-[var(--cms-text-muted)]">(أعد الضبط لإجابته من جديد)</span>
            </div>
          )}
        </div>
      )}

      {/* Inline confirm (workorder C2 decision: moved INSIDE each row). */}
      {!readOnly && !answered && onConfirm && (
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs text-[var(--cms-text-muted)]">التصحيح فوري — إجابتك تُحفظ على الخادم.</span>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending || (isEssay ? !essayDraft?.trim() : selected.length === 0)}
            data-testid={`${prefix}-confirm-${question.id}`}
            className="press inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cms-teal-700)] disabled:opacity-50"
            style={{ background: 'var(--cms-teal-700)' }}
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
            {isEssay ? 'تسجيل الإجابة' : 'تأكيد الإجابة'}
          </button>
        </div>
      )}
    </article>
  );
}
