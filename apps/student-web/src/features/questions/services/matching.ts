/**
 * Wave 20.6 (owner decision 3) — the Matching (وصل) question contracts shared by
 * every student surface: the question player (QuestionPage), bank practice
 * (PracticePage), timed exams (ExamPage) and exam review (ExamReviewPage).
 *
 * The API contract (W20.5, camelCase):
 *  • student payloads expose `matching` / `matchingItems` = { prompts, targets }
 *    ONLY — the correct pairs never leak before the reveal;
 *  • the post-answer result carries `matchingResult` = per-pair correctness +
 *    the full correct map (the reveal moment);
 *  • the submitted answer rides the SAME string field as choice answers
 *    (selectedOptionId / selectedAnswer / answer) as a JSON array of
 *    { promptId, targetId } objects.
 */

export interface MatchingItem {
  id: string;
  text: string;
  sortOrder: number;
}

export interface MatchingPair {
  promptId: string;
  targetId: string;
}

/** The student-facing surface: prompts + targets (never the pairs). */
export interface MatchingStudentPayload {
  prompts: MatchingItem[];
  targets: MatchingItem[];
}

/** Per-pair grading result disclosed after answering. */
export interface MatchingPairResult {
  promptId: string;
  submittedTargetId: string | null;
  correctTargetId: string;
  isCorrect: boolean;
}

/** The post-answer reveal: per-pair correctness + the correct map. */
export interface MatchingResult {
  isCorrect: boolean;
  pairs: MatchingPairResult[];
  correctPairs: MatchingPair[];
}

export const isMatchingType = (type: string | null | undefined) =>
  (type ?? '').toLowerCase() === 'matching';

/** Serializes the in-progress pairing (promptId → targetId) to the wire format. */
export function serializeMatchingAnswer(pairs: Record<string, string>): string {
  return JSON.stringify(
    Object.entries(pairs).map(([promptId, targetId]) => ({ promptId, targetId })),
  );
}

/** Parses a stored/recorded matching answer back to a promptId → targetId map.
 *  Anything unparseable yields an empty map — the honest state for a malformed
 *  record, never a crash (the same discipline as parseSelectedAnswer). */
export function parseMatchingAnswer(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const map: Record<string, string> = {};
      for (const item of parsed) {
        if (
          item && typeof item === 'object'
          && typeof item.promptId === 'string'
          && typeof item.targetId === 'string'
        ) {
          map[item.promptId] = item.targetId;
        }
      }
      return map;
    }
  } catch {
    // Not matching-shaped JSON — treat as no recorded pairing.
  }
  return {};
}

/** True when every prompt has a target attached — the submit gate. */
export function isMatchingComplete(
  payload: MatchingStudentPayload,
  pairs: Record<string, string>,
): boolean {
  return payload.prompts.every((prompt) => Boolean(pairs[prompt.id]));
}
