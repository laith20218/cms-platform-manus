/**
 * W22.1 — the ONE shared question-type + difficulty label map for the admin
 * centers (ExamsCenter question picker/rows + QuestionsCenter bank rows).
 *
 * Contract (recon R-01/R-02/R-06): question types and difficulties must NEVER
 * fall through to the raw enum wire value («Mcq», «Matching», «Easy», …) in an
 * Arabic-mode admin surface. Every member of QuestionType/Difficulty carries
 * the established W21.1 glossary — the same strings QuestionsCenter has shown
 * since its Matching editor wave — and an unknown value renders the explicit
 * fallback «نوع غير معروف» / «غير محدد» instead of leaking the raw string.
 *
 * PR-3: the maps live in the central status registry
 * (lib/dictionary → statuses: questionType / questionDifficulty domains).
 * The registry output is byte-identical to the previously local switch maps —
 * verified per member in both locales AND for the unknown-value fallback —
 * so this module stays the stable import surface for both centers; the
 * exported signatures are unchanged.
 */

import { localeOf, statusLabel } from './dictionary';

/** Question type wire values (CMS.Domain QuestionType — JsonStringEnumConverter, no policy). */
export type QuestionTypeValue =
  | 'Mcq'
  | 'TrueFalse'
  | 'MultipleSelect'
  | 'Essay'
  | 'Matching';

/**
 * The question-type label. Known enum members map to the W21.1 glossary;
 * an unknown value (future backend member, legacy row) renders the explicit
 * «نوع غير معروف» fallback — never the bare enum.
 */
export function questionTypeLabel(type: string, isArabic: boolean): string {
  return statusLabel(localeOf(isArabic), 'questionType', type);
}

/**
 * The difficulty label (Easy/Medium/Hard wire strings). An unknown value
 * renders «غير محدد» — never the raw string.
 */
export function questionDifficultyLabel(difficulty: string, isArabic: boolean): string {
  return statusLabel(localeOf(isArabic), 'questionDifficulty', difficulty);
}
