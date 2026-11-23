import { useMemo, useState } from 'react';
import { Check, Link2, X } from 'lucide-react';
import { cn } from '@/utils';
import {
  matchingNumberingLabel,
  isMultiMapPayload,
  type MatchingPair,
  type MatchingResult,
  type MatchingStudentPayload,
} from '@/features/questions/services/matching';

/**
 * W20.6 (owner decision 3) — the ONE shared Matching (وصل) board for every student
 * surface: the question player, bank practice, timed exams (interactive) and the
 * exam review (read-only). Purely presentational — the pairing map is CONTROLLED
 * by the parent (the QuestionRow "all interaction logic stays in page state"
 * contract), same as `selected` for choice questions.
 *
 * Pairing (C4 — zero new dependencies):
 *  • Click-then-click: tap a target card (armed, aria-pressed), then tap a prompt
 *    card — fully keyboard operable (buttons + Enter/Space) and touch friendly.
 *  • HTML5 drag-and-drop: drag a target card onto a prompt card (mouse enhancement).
 *  • Unpair: the × on the paired chip; re-dropping onto a paired prompt replaces.
 *
 * After submit (`result`): per-pair reveal — the submitted chip turns green/red and
 * a wrong pair also shows the CORRECT chip (the server-disclosed map). Review mode
 * (`review`) renders the recorded answer the same way from the review DTO.
 *
 * Accessibility residual (documented per the wave brief): drag-and-drop itself is
 * pointer-only; the click-click path is the complete keyboard equivalent — pairing,
 * unpairing and submit are all reachable without a pointer. The board announces
 * progress via a polite live region («مربوط X من Y»).
 */

interface MatchingQuestionProps {
  payload: MatchingStudentPayload;
  /** promptId → targetId (controlled — single-map mode). */
  pairs: Record<string, string>;
  onPairsChange?: (pairs: Record<string, string>) => void;
  /** Night Task 7.1 — multi-map mode: promptId → the student's selected target
   *  set (controlled). Used when payload.allowMultiMap is true. */
  multiPairs?: Record<string, string[]>;
  onMultiPairsChange?: (pairs: Record<string, string[]>) => void;
  /** Answered/locked — no further pairing changes. */
  locked?: boolean;
  /** Post-submit reveal (interactive surfaces): per-pair correctness + correct map. */
  result?: MatchingResult | null;
  /** Review mode: the recorded answer (+ the reveal-gated correct map). */
  review?: { userPairs: Record<string, string>; correctPairs: MatchingPair[] | null; multiUserPairs?: Record<string, string[]> } | null;
  testIdPrefix: string;
  questionId: string;
}

export function MatchingQuestion({
  payload,
  pairs,
  onPairsChange,
  multiPairs,
  onMultiPairsChange,
  locked = false,
  result = null,
  review = null,
  testIdPrefix,
  questionId,
}: MatchingQuestionProps) {
  const [armedTargetId, setArmedTargetId] = useState<string | null>(null);
  // Night Task 7.1 — multi-map mode drives its own controlled state.
  const multi = isMultiMapPayload(payload);
  const effectiveMultiPairs = multiPairs ?? {};

  const prompts = useMemo(
    () => [...payload.prompts].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    [payload.prompts],
  );
  const targets = useMemo(
    () => [...payload.targets].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    [payload.targets],
  );

  const interactive = !locked && !result && !review && Boolean(multi ? onMultiPairsChange : onPairsChange);
  const targetText = useMemo(
    () => new Map(targets.map((target) => [target.id, target.text])),
    [targets],
  );

  // Review + submitted states resolve the per-pair view the same way:
  // submittedMap (what the student sent) + correctMap (the reveal, when granted).
  const submittedMap: Record<string, string> = review ? review.userPairs : pairs;
  const resultMap = result?.pairs
    ? Object.fromEntries(result.pairs.map((pair) => [pair.promptId, pair]))
    : {};
  const correctMap = useMemo(() => {
    if (result) {
      return Object.fromEntries(result.correctPairs.map((pair) => [pair.promptId, pair.targetId]));
    }
    if (review?.correctPairs) {
      return Object.fromEntries(review.correctPairs.map((pair) => [pair.promptId, pair.targetId]));
    }
    return null;
  }, [result, review]);

  const promptLabel = (index: number) => matchingNumberingLabel(index, payload.promptNumbering ?? 'arabicLetters');
  const targetLabel = (index: number) => matchingNumberingLabel(index, payload.targetNumbering ?? 'digits');

  const pairedCount = multi
    ? prompts.filter((prompt) => (effectiveMultiPairs[prompt.id] ?? []).length > 0).length
    : prompts.filter((prompt) => Boolean(pairs[prompt.id])).length;
  // The header counter: in-progress pairing while interactive, the recorded/graded
  // submission once revealed (review) or answered.
  const shownCount = review || result
    ? Object.keys(submittedMap).length
    : pairedCount;

  const pairTarget = (promptId: string, targetId: string | null) => {
    if (!interactive) return;
    if (multi) {
      if (!onMultiPairsChange) return;
      const current = effectiveMultiPairs[promptId] ?? [];
      // Click-click on a prompt with an armed target TOGGLES it in the set.
      const next = targetId
        ? (current.includes(targetId)
            ? current.filter((id) => id !== targetId)
            : [...current, targetId])
        : [];
      const nextMap = { ...effectiveMultiPairs };
      if (next.length > 0) nextMap[promptId] = next; else delete nextMap[promptId];
      onMultiPairsChange(nextMap);
      setArmedTargetId(null);
      return;
    }
    if (!onPairsChange) return;
    const next = { ...pairs };
    if (targetId) next[promptId] = targetId;
    else delete next[promptId];
    onPairsChange(next);
    setArmedTargetId(null);
  };

  const toggleArmed = (targetId: string) => {
    if (!interactive) return;
    setArmedTargetId((current) => (current === targetId ? null : targetId));
  };

  const handlePromptClick = (promptId: string) => {
    if (!interactive) return;
    if (armedTargetId) {
      pairTarget(promptId, armedTargetId);
      return;
    }
    // tap a paired prompt with nothing armed → unpair (single) / clear set (multi)
    if (multi) {
      if ((effectiveMultiPairs[promptId] ?? []).length > 0) pairTarget(promptId, null);
    } else if (pairs[promptId]) {
      pairTarget(promptId, null);
    }
  };

  const handleDrop = (promptId: string, draggedId: string | undefined) => {
    if (!draggedId) return;
    pairTarget(promptId, draggedId);
  };

  return (
    <div data-testid={`${testIdPrefix}-matching-${questionId}`} className="w-full">
      {/* Column headers + live progress. */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-[var(--cms-text-soft)]">
          اربط كل عنصر بما يقابله
        </span>
        {(interactive || locked || review) && (
          <span
            className="text-xs font-semibold text-[var(--cms-text-muted)]"
            aria-live="polite"
            data-testid={`${testIdPrefix}-matching-count-${questionId}`}
            lang="en"
          >
            {shownCount} / {prompts.length}
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* ===== Prompts (right column in RTL) ===== */}
        <div className="space-y-2.5">
          {prompts.map((prompt, index) => {
            const pairedTargetId = submittedMap[prompt.id];
            // Night Task 7.1 — the multi-map submitted/correct SETS per prompt.
            const submittedSet = review?.multiUserPairs?.[prompt.id]
              ?? (multi ? effectiveMultiPairs[prompt.id] : undefined);
            const correctSet = multi && (result || review?.correctPairs)
              ? [...(result?.correctPairs ?? review?.correctPairs ?? [])]
                  .filter((pair) => pair.promptId === prompt.id)
                  .map((pair) => pair.targetId)
              : undefined;
            const pairResult = resultMap[prompt.id];
            const revealCorrect = correctMap?.[prompt.id];
            const multiAnswered = (submittedSet ?? []).length > 0;
            // Submitted verdict: the API result wins; review computes it from the
            // revealed map when available (null map = correctness withheld).
            const isPairCorrect = result
              ? pairResult?.isCorrect
              : correctMap
                ? pairedTargetId != null && pairedTargetId === revealCorrect
                : undefined;
            const isMultiCorrect = result
              ? pairResult?.isCorrect
              : correctSet
                ? Boolean(submittedSet && correctSet.length === submittedSet.length && correctSet.every((id) => submittedSet.includes(id)))
                : undefined;
            // ONE exclusive tone per card — a fallback-neutral string emitted
            // alongside the verdict tone would win tailwind-merge's conflict
            // resolution and erase the green/red reveal.
            const verdict = multi ? isMultiCorrect : isPairCorrect;
            const answeredHere = multi ? multiAnswered : Boolean(pairedTargetId);
            const cardTone = verdict === true
              ? 'border-[var(--cms-success)] bg-[var(--cms-success-50)]'
              : verdict === false && (answeredHere || result || review)
                ? 'border-[var(--cms-danger)] bg-[var(--cms-danger-50)]'
                : answeredHere
                  ? 'border-[var(--cms-teal-600)] bg-[var(--cms-teal-50)]'
                  : interactive && armedTargetId
                    ? 'border-[var(--cms-teal-500)] bg-[var(--cms-teal-50)] border-dashed'
                    : 'border-[var(--cms-line-strong)] bg-[var(--cms-surface)]';

            return (
              <div
                key={prompt.id}
                onDragOver={(event) => { if (interactive) event.preventDefault(); }}
                onDrop={(event) => {
                  if (!interactive) return;
                  event.preventDefault();
                  handleDrop(prompt.id, event.dataTransfer.getData('text/plain') || undefined);
                }}
              >
                <div
                  className={cn(
                    'relative rounded-xl border-[1.5px] p-3.5 transition-all',
                    cardTone,
                    !interactive && 'cursor-default',
                  )}
                  data-testid={`${testIdPrefix}-matching-prompt-${prompt.id}`}
                >
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-start gap-3 text-start',
                      interactive ? 'cursor-pointer' : 'cursor-default',
                    )}
                    disabled={!interactive}
                    aria-label={`ربط العنصر ${promptLabel(index)}${answeredHere ? ' — مربوط' : ''}`}
                    data-testid={`${testIdPrefix}-matching-pairzone-${prompt.id}`}
                    onClick={() => handlePromptClick(prompt.id)}
                  >
                    <span
                      className={cn(
                        'w-8 h-8 rounded-[8px] flex items-center justify-center font-bold text-[13px] shrink-0',
                        verdict === true
                          ? 'bg-[var(--cms-success)] text-white'
                          : verdict === false && (answeredHere || result || review)
                            ? 'bg-[var(--cms-danger)] text-white'
                            : 'bg-[var(--cms-ivory-100)] text-[var(--cms-text-soft)]',
                      )}
                      aria-hidden="true"
                    >
                      {promptLabel(index)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-medium text-[var(--cms-text)] leading-relaxed">
                        {prompt.text}
                      </span>
                      {multi ? (
                        <>
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            {(submittedSet ?? []).length > 0 ? (submittedSet ?? []).map((selectedId) => (
                              <span
                                key={selectedId}
                                className={cn(
                                  'inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold',
                                  verdict === true && 'bg-[var(--cms-success-100)] text-[var(--cms-success-700)]',
                                  verdict === false && (answeredHere || result || review) && 'bg-[var(--cms-danger-100)] text-[var(--cms-danger-700)]',
                                  verdict == null && 'bg-[var(--cms-teal-50)] text-[var(--cms-teal-800)]',
                                )}
                                data-testid={`${testIdPrefix}-matching-submitted-${prompt.id}-${selectedId}`}
                              >
                                <Link2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                                <span className="truncate">{targetText.get(selectedId) ?? '—'}</span>
                                {verdict === true && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                                {verdict === false && (answeredHere || result || review) && <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                                {interactive && (
                                  <button
                                    type="button"
                                    aria-label="إزالة هذا الربط"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      if (!onMultiPairsChange) return;
                                      const nextList = (effectiveMultiPairs[prompt.id] ?? []).filter((id) => id !== selectedId);
                                      const nextMap = { ...effectiveMultiPairs };
                                      if (nextList.length > 0) nextMap[prompt.id] = nextList; else delete nextMap[prompt.id];
                                      onMultiPairsChange(nextMap);
                                    }}
                                    className="ms-0.5 rounded p-0.5 hover:bg-black/5"
                                  >
                                    <X className="w-3 h-3" aria-hidden="true" />
                                  </button>
                                )}
                              </span>
                            )) : interactive ? (
                              <span className="block text-xs text-[var(--cms-text-muted)]">
                                {armedTargetId ? 'انقر هنا للإضافة' : 'اختر كل الإجابات الصحيحة لهذا العنصر'}
                              </span>
                            ) : (
                              <span className="block text-xs text-[var(--cms-text-muted)]">لم يُربط</span>
                            )}
                          </span>
                          {/* Multi reveal: the correct SET for a wrong prompt. */}
                          {verdict === false && (correctSet ?? []).length > 0 && (
                            <span className="mt-1.5 flex flex-wrap items-center gap-1 text-xs font-bold text-[var(--cms-success-700)]">
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              الصحيح:
                              {(correctSet ?? []).map((id) => (
                                <span key={id} className="rounded bg-[var(--cms-success-100)] px-1.5 py-0.5">{targetText.get(id) ?? '—'}</span>
                              ))}
                            </span>
                          )}
                        </>
                      ) : pairedTargetId ? (
                        <span
                          className={cn(
                            'mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold',
                            verdict === true && 'bg-[var(--cms-success-100)] text-[var(--cms-success-700)]',
                            verdict === false && (answeredHere || result || review) && 'bg-[var(--cms-danger-100)] text-[var(--cms-danger-700)]',
                            verdict == null && 'bg-[var(--cms-teal-50)] text-[var(--cms-teal-800)]',
                          )}
                          data-testid={`${testIdPrefix}-matching-submitted-${prompt.id}`}
                        >
                          <Link2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate">{targetText.get(pairedTargetId) ?? '—'}</span>
                          {verdict === true && <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                          {verdict === false && (answeredHere || result || review) && <X className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
                        </span>
                      ) : interactive ? (
                        <span className="mt-2 block text-xs text-[var(--cms-text-muted)]">
                          {armedTargetId ? 'انقر هنا للربط' : 'اسحب بطاقة هنا أو انقر البطاقة ثم هنا'}
                        </span>
                      ) : (
                        <span className="mt-2 block text-xs text-[var(--cms-text-muted)]">لم يُربط</span>
                      )}
                      {/* A wrong submitted pair ALSO shows the correct target (reveal — single mode). */}
                      {!multi && verdict === false && revealCorrect && (
                        <span className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-[var(--cms-success-700)]">
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          الصحيح: {targetText.get(revealCorrect) ?? '—'}
                        </span>
                      )}
                    </span>
                  </button>

                  {/* Unpair — a SIBLING of the card button (never nested buttons). */}
                  {interactive && !multi && pairedTargetId && (
                    <button
                      type="button"
                      onClick={() => pairTarget(prompt.id, null)}
                      aria-label="فك الربط"
                      data-testid={`${testIdPrefix}-matching-remove-${prompt.id}`}
                      className="press absolute top-2 left-2 flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--cms-line-strong)] bg-[var(--cms-surface)] text-[var(--cms-text-soft)] hover:border-[var(--cms-danger)] hover:text-[var(--cms-danger)]"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ===== Targets pool (left column in RTL) ===== */}
        <div className="space-y-2.5">
          {targets.map((target, index) => {
            const isPairedSomewhere = multi
              ? Object.values(effectiveMultiPairs).some((ids) => ids.includes(target.id))
              : Object.values(pairs).includes(target.id);
            const isArmed = armedTargetId === target.id;
            return (
              <button
                key={target.id}
                type="button"
                draggable={interactive}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/plain', target.id);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => toggleArmed(target.id)}
                disabled={!interactive}
                aria-pressed={isArmed}
                aria-label={`بطاقة: ${target.text}`}
                data-testid={`${testIdPrefix}-matching-target-${target.id}`}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl border-[1.5px] p-3.5 text-start transition-all',
                  isArmed
                    ? 'border-[var(--cms-teal-600)] bg-[var(--cms-teal-50)] shadow-[0_0_0_3px_var(--cms-teal-100)]'
                    : 'border-[var(--cms-line-strong)] bg-[var(--cms-surface)]',
                  !multi && isPairedSomewhere && interactive && 'opacity-45',
                  interactive && !isArmed && 'hover:border-[var(--cms-teal-500)] cursor-grab',
                  !interactive && 'cursor-default',
                )}
              >
                <span
                  className="w-8 h-8 rounded-[8px] flex items-center justify-center font-bold text-[13px] shrink-0 bg-[var(--cms-ivory-100)] text-[var(--cms-text-soft)]"
                  aria-hidden="true"
                >
                  {targetLabel(index)}
                </span>
                <span className="flex-1 text-[15px] font-medium text-[var(--cms-text)] leading-relaxed">
                  {target.text}
                </span>
                {isArmed && (
                  <span className="text-xs font-bold text-[var(--cms-teal-800)] shrink-0">محدد</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {interactive && (
        <p className="mt-3 text-xs text-[var(--cms-text-muted)]">
          {multi
            ? 'انقر البطاقة ثم انقر العنصر لإضافتها — يمكن اختيار أكثر من إجابة لكل عنصر، ويعمل بلوحة المفاتيح أيضاً.'
            : 'اسحب البطاقة على العنصر، أو انقر البطاقة ثم انقر العنصر — يعمل بلوحة المفاتيح أيضاً.'}
        </p>
      )}
    </div>
  );
}
