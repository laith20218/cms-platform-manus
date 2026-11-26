/**
 * PR-4 — the UNIVERSAL student-view question renderer for the admin web.
 *
 * Mirrors the student web's `QuestionRow` presentation contract (W15.0 P4):
 * option BUTTONS with role=radio/checkbox and 44px targets, letter chips,
 * the essay textarea + post-answer reveal, and the وصل board — but fully
 * presentational and LOCAL: the answer simulation never calls the answer API,
 * never creates an attempt, grade, notification, or analytics event. The
 * grading helpers mirror the backend contracts exactly (exact-string essay,
 * exact-set multi-select, all-or-nothing matching).
 *
 * Labels ride the admin dictionary (Arabic + English) through `t()`; layout
 * uses logical CSS so one tree serves both directions (dir comes from props).
 */
import { useState } from 'react';
import { BookOpen, Check, RotateCcw, Tag, X } from 'lucide-react';
import { t, localeOf } from '../../lib/dictionary';
import {
  gradeEssay, gradeMatching, gradeMultiChoice, gradeSingleChoice,
  type PreviewQuestion,
} from './previewTypes';

export interface QuestionPreviewBodyProps {
  question: PreviewQuestion;
  isArabic: boolean;
  /** Namespacing for testids (default 'preview' → preview-option-{id} etc.). */
  testIdPrefix?: string;
}

interface FeedbackState {
  isCorrect: boolean;
  essayAnswer?: string;
}

export function QuestionPreviewBody({ question, isArabic, testIdPrefix = 'preview' }: QuestionPreviewBodyProps) {
  const locale = localeOf(isArabic);
  const prefix = testIdPrefix;
  const [selected, setSelected] = useState<string[]>([]);
  const [essayDraft, setEssayDraft] = useState('');
  const [matchingPairs, setMatchingPairs] = useState<Record<string, string>>({});
  const [activePrompt, setActivePrompt] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const isEssay = question.type.toLowerCase() === 'essay';
  const isMultiple = question.type === 'MultipleSelect';
  const isMatching = question.type.toLowerCase() === 'matching' && Boolean(question.matching);
  const hasOptions = question.options.length > 0;
  const answered = feedback !== null;

  const correctIds = question.options.filter(option => option.isCorrect).map(option => option.id);
  const correctMap = new Map((question.matching?.pairs ?? []).map(pair => [pair.promptId, pair.targetId]));

  const canConfirm = isMatching
    ? Boolean(question.matching) && question.matching!.prompts.every(prompt => Boolean(matchingPairs[prompt.id]))
    : isEssay
      ? Boolean(essayDraft.trim())
      : selected.length > 0;

  function handleSelect(optionId: string) {
    if (answered) return;
    if (isMultiple) {
      setSelected(current => current.includes(optionId) ? current.filter(id => id !== optionId) : [...current, optionId]);
    } else {
      setSelected([optionId]);
    }
  }

  function handleConfirm() {
    if (isMatching && question.matching) {
      setFeedback({ isCorrect: gradeMatching(matchingPairs, question.matching) });
    } else if (isEssay) {
      setFeedback({ isCorrect: gradeEssay(essayDraft, question.correctAnswerText), essayAnswer: essayDraft });
    } else if (isMultiple) {
      setFeedback({ isCorrect: gradeMultiChoice(selected, correctIds) });
    } else {
      setFeedback({ isCorrect: gradeSingleChoice(selected[0], question.correctOptionId) });
    }
  }

  function handleReset() {
    setSelected([]);
    setEssayDraft('');
    setMatchingPairs({});
    setActivePrompt(null);
    setFeedback(null);
  }

  function handleMatchingPick(promptId: string, targetId: string) {
    if (answered) return;
    setMatchingPairs(current => {
      const next = { ...current };
      // A target can serve only one prompt in the single-map board.
      const owner = Object.keys(next).find(key => next[key] === targetId);
      if (owner) delete next[owner];
      next[promptId] = targetId;
      return next;
    });
    setActivePrompt(null);
  }

  const optionState = (optionId: string): 'correct' | 'wrong' | 'selected' | 'idle' => {
    const isSelected = selected.includes(optionId);
    if (answered) {
      const isCorrectOption = correctIds.includes(optionId);
      if (isCorrectOption) return 'correct';
      if (isSelected && !isCorrectOption) return 'wrong';
      return 'idle';
    }
    return isSelected ? 'selected' : 'idle';
  };

  const correctText = isEssay
    ? question.correctAnswerText
    : question.options.find(option => option.id === question.correctOptionId)?.text ?? null;

  return (
    <article
      data-testid={`${prefix}-row-${question.id}`}
      aria-label={question.number ? t(locale, 'questions.preview.previewBadge') + ` — ${question.number}` : undefined}
      className="border-b pb-4 mb-4 last:border-b-0 last:pb-0 last:mb-0"
      style={{ borderColor: 'var(--cms-line)' }}
    >
      {/* Row header: number + paragraph tag. */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          {question.number != null && (
            <span
              className="w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0"
              style={{ background: 'var(--cms-ivory-100)', color: 'var(--cms-text-soft)' }}
              lang="en"
              aria-hidden="true"
            >
              {question.number}
            </span>
          )}
          {question.paragraphTag && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}
            >
              <Tag className="w-3 h-3" aria-hidden="true" />
              {question.paragraphTag}
            </span>
          )}
        </div>
      </div>

      {/* Question text + images (missing media degrades to an honest note). */}
      <p className="text-[15px] font-semibold leading-relaxed mb-3" style={{ color: 'var(--cms-text)' }}>
        {question.text}
      </p>
      {question.images.length > 0 && (
        <div className="grid gap-3 mb-3">
          {question.images.map((image, index) => (
            <PreviewImageCard
              key={`${image.sortOrder}-${index}`}
              imageUrl={image.imageUrl}
              altText={image.altText ?? t(locale, 'questions.preview.imageAlt')}
              missingText={t(locale, 'questions.preview.missingImage')}
              testId={`${prefix}-image-${index}`}
            />
          ))}
        </div>
      )}

      {/* Matching board — click a prompt, then its target (the student flow). */}
      {isMatching && question.matching ? (
        <div className="space-y-3" data-testid={`${prefix}-matching-${question.id}`}>
          <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
            {t(locale, 'questions.preview.matchingHint')}
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-bold mb-2" style={{ color: 'var(--cms-text-soft)' }}>
                {t(locale, 'questions.preview.matchingPrompts')}
              </p>
              <div className="space-y-2">
                {question.matching.prompts.map(prompt => {
                  const paired = matchingPairs[prompt.id];
                  const state = answered
                    ? correctMap.get(prompt.id) === paired ? 'correct' : 'wrong'
                    : paired ? 'selected' : activePrompt === prompt.id ? 'active' : 'idle';
                  return (
                    <button
                      key={prompt.id}
                      type="button"
                      onClick={() => !answered && setActivePrompt(activePrompt === prompt.id ? null : prompt.id)}
                      disabled={answered}
                      aria-pressed={activePrompt === prompt.id}
                      data-testid={`${prefix}-matching-prompt-${prompt.id}`}
                      className={`w-full text-start p-3 rounded-xl border-[1.5px] min-h-11 transition-all ${state === 'correct' ? '' : state === 'wrong' ? '' : state === 'selected' || state === 'active' ? '' : ''}`}
                      style={{
                        borderColor: state === 'correct' ? 'var(--cms-success)'
                          : state === 'wrong' ? 'var(--cms-danger)'
                          : state === 'selected' || state === 'active' ? 'var(--cms-teal-600)'
                          : 'var(--cms-line-strong)',
                        background: state === 'correct' ? 'var(--cms-success-50)'
                          : state === 'wrong' ? 'var(--cms-danger-50)'
                          : state === 'selected' || state === 'active' ? 'var(--cms-teal-50)'
                          : 'var(--cms-surface)',
                        color: 'var(--cms-text)',
                      }}
                    >
                      <span className="text-sm font-medium">{prompt.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold mb-2" style={{ color: 'var(--cms-text-soft)' }}>
                {t(locale, 'questions.preview.matchingTargets')}
              </p>
              <div className="space-y-2">
                {question.matching.targets.map(target => {
                  const owner = Object.keys(matchingPairs).find(promptId => matchingPairs[promptId] === target.id);
                  const state = answered
                    ? owner
                      ? (correctMap.get(owner) === target.id ? 'correct' : 'wrong')
                      : 'idle'
                    : owner ? 'taken' : activePrompt ? 'pickable' : 'idle';
                  return (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => activePrompt && handleMatchingPick(activePrompt, target.id)}
                      disabled={answered || !activePrompt}
                      data-testid={`${prefix}-matching-target-${target.id}`}
                      className="w-full text-start p-3 rounded-xl border-[1.5px] min-h-11 transition-all"
                      style={{
                        borderColor: state === 'correct' ? 'var(--cms-success)'
                          : state === 'wrong' ? 'var(--cms-danger)'
                          : state === 'pickable' ? 'var(--cms-teal-600)'
                          : 'var(--cms-line-strong)',
                        background: state === 'correct' ? 'var(--cms-success-50)'
                          : state === 'wrong' ? 'var(--cms-danger-50)'
                          : state === 'pickable' ? 'var(--cms-teal-50)'
                          : 'var(--cms-surface)',
                        color: 'var(--cms-text)',
                        opacity: state === 'taken' && !answered ? 0.55 : 1,
                      }}
                    >
                      <span className="text-sm font-medium">{target.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {/* Pair chips + post-answer per-pair reveal. */}
          {Object.keys(matchingPairs).length > 0 && (
            <ul className="flex flex-wrap gap-2" data-testid={`${prefix}-matching-pairs-${question.id}`}>
              {question.matching.prompts.filter(prompt => matchingPairs[prompt.id]).map(prompt => {
                const target = question.matching!.targets.find(item => item.id === matchingPairs[prompt.id]);
                const isPairCorrect = answered && correctMap.get(prompt.id) === matchingPairs[prompt.id];
                const actualTarget = question.matching!.targets.find(item => item.id === correctMap.get(prompt.id));
                return (
                  <li
                    key={prompt.id}
                    data-testid={`${prefix}-matching-pair-${prompt.id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
                    style={{
                      borderColor: answered ? (isPairCorrect ? 'var(--cms-success)' : 'var(--cms-danger)') : 'var(--cms-line-strong)',
                      background: answered ? (isPairCorrect ? 'var(--cms-success-50)' : 'var(--cms-danger-50)') : 'var(--cms-ivory-100)',
                      color: 'var(--cms-text-soft)',
                    }}
                  >
                    {answered ? (isPairCorrect ? <Check className="w-3 h-3" aria-hidden="true" /> : <X className="w-3 h-3" aria-hidden="true" />) : null}
                    <span>
                      {t(locale, 'questions.preview.matchingPair', { prompt: prompt.text, target: target?.text ?? '—' })}
                      {answered && !isPairCorrect && actualTarget && (
                        <span className="ms-1 font-semibold">
                          {t(locale, 'questions.preview.matchingPairWrong', { target: actualTarget.text })}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : isEssay ? (
        <div>
          <label htmlFor={`${prefix}-essay-${question.id}`} className="text-sm font-semibold mb-2 block" style={{ color: 'var(--cms-text-soft)' }}>
            {t(locale, 'questions.preview.essayPlaceholder')}
          </label>
          <textarea
            id={`${prefix}-essay-${question.id}`}
            value={answered ? (feedback?.essayAnswer ?? '') : essayDraft}
            onChange={(event) => !answered && setEssayDraft(event.target.value)}
            disabled={answered}
            rows={4}
            placeholder={t(locale, 'questions.preview.essayPlaceholder')}
            data-testid={`${prefix}-essay-${question.id}`}
            className="w-full rounded-xl border p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-70"
            style={{ borderColor: 'var(--cms-line-strong)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
          />
          <p className="text-xs mt-1" style={{ color: 'var(--cms-text-muted)' }}>
            {t(locale, 'questions.preview.essayGradingNote')}
          </p>
        </div>
      ) : hasOptions ? (
        <div className="space-y-2.5" role={isMultiple ? 'group' : 'radiogroup'} aria-label={t(locale, 'questions.toolbar.tagsLabel')}>
          {question.options.map(option => {
            const state = optionState(option.id);
            return (
              <div
                key={option.id}
                data-testid={`${prefix}-option-${option.id}`}
                onClick={() => !answered && handleSelect(option.id)}
                role={isMultiple ? 'checkbox' : 'radio'}
                aria-checked={selected.includes(option.id)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if ((event.key === 'Enter' || event.key === ' ') && !answered) {
                    event.preventDefault();
                    handleSelect(option.id);
                  }
                }}
                className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border-[1.5px] transition-all text-start min-h-11"
                style={{
                  borderColor: state === 'correct' ? 'var(--cms-success)'
                    : state === 'wrong' ? 'var(--cms-danger)'
                    : state === 'selected' ? 'var(--cms-teal-600)'
                    : 'var(--cms-line-strong)',
                  background: state === 'correct' ? 'var(--cms-success-50)'
                    : state === 'wrong' ? 'var(--cms-danger-50)'
                    : state === 'selected' ? 'var(--cms-teal-50)'
                    : 'var(--cms-surface)',
                  cursor: answered ? 'default' : 'pointer',
                }}
              >
                <span
                  className="w-8 h-8 rounded-[8px] flex items-center justify-center font-bold text-[13px] shrink-0"
                  style={{
                    background: state === 'correct' ? 'var(--cms-success)' : state === 'selected' || state === 'wrong' ? 'var(--cms-teal-700)' : 'var(--cms-ivory-100)',
                    color: state === 'correct' || state === 'selected' || state === 'wrong' ? 'var(--cms-text-inverse)' : 'var(--cms-text-soft)',
                  }}
                  lang="en"
                >
                  {option.letter}
                </span>
                <span className="flex-1 text-[15px] font-medium" style={{ color: 'var(--cms-text)' }}>{option.text}</span>
                {option.imageUrl && (
                  <PreviewImageCard
                    imageUrl={option.imageUrl}
                    altText={option.text}
                    missingText={t(locale, 'questions.preview.missingImage')}
                    testId={`${prefix}-option-image-${option.id}`}
                    compact
                  />
                )}
                {state === 'correct' && <Check className="w-5 h-5 shrink-0" style={{ color: 'var(--cms-success)' }} aria-hidden="true" />}
                {state === 'wrong' && <X className="w-5 h-5 shrink-0" style={{ color: 'var(--cms-danger)' }} aria-hidden="true" />}
              </div>
            );
          })}
          {isMultiple && !answered && (
            <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
              {t(locale, 'questions.preview.essayGradingNote')}
            </p>
          )}
        </div>
      ) : (
        <div
          className="rounded-xl border border-dashed p-4 text-sm"
          style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
          data-testid={`${prefix}-options-unavailable`}
        >
          {t(locale, 'questions.preview.optionsUnavailable')}
        </div>
      )}

      {/* Post-answer reveal — mirrors the student feedback block. */}
      {feedback && (
        <div role="status" className="mt-3 space-y-2" data-testid={`${prefix}-feedback-${question.id}`}>
          <div
            className="rounded-xl p-3.5 font-bold text-sm flex items-center gap-2"
            style={{
              background: feedback.isCorrect ? 'var(--cms-success-50)' : 'var(--cms-danger-50)',
              color: feedback.isCorrect ? 'var(--cms-success)' : 'var(--cms-danger)',
            }}
            data-testid={`${prefix}-feedback-banner-${question.id}`}
          >
            {feedback.isCorrect
              ? <><Check className="w-4 h-4" aria-hidden="true" />{t(locale, 'questions.preview.resultCorrect')}</>
              : <><X className="w-4 h-4" aria-hidden="true" />{t(locale, 'questions.preview.resultIncorrect')}</>}
          </div>
          {/* The student answer — displayed beneath the submitted answer. */}
          {isEssay && (
            <p className="text-sm" style={{ color: 'var(--cms-text-soft)' }} data-testid={`${prefix}-your-answer-${question.id}`}>
              {feedback.essayAnswer?.trim()
                ? t(locale, 'questions.preview.yourAnswer', { answer: feedback.essayAnswer })
                : t(locale, 'questions.preview.yourAnswerEmpty')}
            </p>
          )}
          {/* Expected answer per the existing contract. */}
          {isEssay && (
            <div className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}>
              <strong style={{ color: 'var(--cms-text)' }}>
                {t(locale, 'questions.preview.modelAnswer', { answer: question.correctAnswerText ?? t(locale, 'questions.preview.noModelAnswer') })}
              </strong>
            </div>
          )}
          {!isEssay && !isMatching && correctText && (
            <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }} data-testid={`${prefix}-correct-answer-${question.id}`}>
              {t(locale, 'questions.preview.correctAnswerLine', { answer: correctText })}
            </p>
          )}
          {isEssay && <p className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'questions.preview.essaySavedNotice')}</p>}
          {/* Explanation — the same post-answer surface students see. */}
          {question.explanation && (
            <div className="rounded-xl border p-3.5" data-testid={`${prefix}-explanation-${question.id}`} style={{ borderColor: 'var(--cms-line)' }}>
              <div className="flex items-center gap-1.5 text-xs font-bold mb-1.5" style={{ color: 'var(--cms-teal-700)' }}>
                <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                {t(locale, 'questions.preview.explanationTitle')}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--cms-text-soft)' }}>{question.explanation}</p>
              {question.reference && (
                <p className="mt-2 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                  {t(locale, 'questions.preview.referenceLine', { reference: question.reference })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Confirm / reset — the simulation controls. */}
      {!answered ? (
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
            {t(locale, 'questions.preview.simulateHint')}
          </span>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            data-testid={`${prefix}-confirm-${question.id}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors disabled:opacity-50"
            style={{ background: 'var(--cms-teal-700)', color: 'var(--cms-text-inverse)' }}
          >
            <Check className="w-4 h-4" aria-hidden="true" />
            {t(locale, 'questions.preview.confirmAnswer')}
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={handleReset}
            data-testid={`${prefix}-reset-${question.id}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-xs font-bold transition-colors"
            style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            {t(locale, 'questions.preview.changeAnswer')}
          </button>
        </div>
      )}
    </article>
  );
}

/** Image with an honest missing-media fallback (student parity + PR-4 safety). */
function PreviewImageCard({
  imageUrl,
  altText,
  missingText,
  testId,
  compact = false,
}: {
  imageUrl: string;
  altText: string;
  missingText: string;
  testId: string;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        data-testid={`${testId}-missing`}
        className={`rounded-xl border border-dashed flex items-center justify-center text-xs ${compact ? 'p-2 max-h-20 w-24' : 'p-6'}`}
        style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-muted)' }}
      >
        {missingText}
      </div>
    );
  }
  return (
    <img
      data-testid={testId}
      src={imageUrl}
      alt={altText}
      loading="lazy"
      onError={() => setFailed(true)}
      className={compact ? 'rounded-lg max-h-20 w-24 object-contain border' : 'rounded-xl max-h-80 object-contain border'}
      style={{ borderColor: 'var(--cms-line)' }}
    />
  );
}
