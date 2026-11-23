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

/** Night Task 7.2 — the numbering styles the admin can pick (absent = legacy default). */
export type MatchingNumberingStyle = 'digits' | 'arabicLetters' | 'latinLetters';

/** The student-facing surface: prompts + targets (never the pairs).
 *  Night Task 7: carries the rules metadata (multi-map + numbering) the board
 *  needs to render and interact correctly — still zero pair leakage. */
export interface MatchingStudentPayload {
  prompts: MatchingItem[];
  targets: MatchingItem[];
  allowMultiMap?: boolean;
  promptNumbering?: MatchingNumberingStyle;
  targetNumbering?: MatchingNumberingStyle;
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

/** Night Task 7.1 — true when the question allows a prompt to match multiple targets. */
export const isMultiMapPayload = (payload: MatchingStudentPayload | null | undefined): boolean =>
  payload?.allowMultiMap === true;

/** Night Task 7.2 — the label for a list index (mirrors the admin renderer).
 *  Legacy defaults: prompts = Arabic letters, targets = digits. */
export const ARABIC_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];
export function matchingNumberingLabel(index: number, style: MatchingNumberingStyle | null | undefined): string {
  if (style === 'arabicLetters') return ARABIC_LETTERS[index] ?? String(index + 1);
  if (style === 'latinLetters') {
    let n = index;
    let label = '';
    do { label = String.fromCharCode(65 + (n % 26)) + label; n = Math.floor(n / 26) - 1; } while (n >= 0);
    return label;
  }
  return String(index + 1);
}

/** Night Task 7.1 — serializes the multi-map pairing (promptId → target set). */
export function serializeMatchingAnswerMulti(pairs: Record<string, string[]>): string {
  const flat: MatchingPair[] = [];
  for (const [promptId, targets] of Object.entries(pairs)) {
    for (const targetId of targets) flat.push({ promptId, targetId });
  }
  return JSON.stringify(flat);
}

/** Parses a recorded multi-map answer (promptId → target set). Malformed input
 *  yields an empty map — never a crash (same discipline as the single parser). */
export function parseMatchingAnswerMulti(raw: string | null | undefined): Record<string, string[]> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const map: Record<string, string[]> = {};
      for (const item of parsed) {
        if (
          item && typeof item === 'object'
          && typeof item.promptId === 'string'
          && typeof item.targetId === 'string'
        ) {
          (map[item.promptId] ??= []).push(item.targetId);
        }
      }
      return map;
    }
  } catch {
    // Not matching-shaped JSON — treat as no recorded pairing.
  }
  return {};
}

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
