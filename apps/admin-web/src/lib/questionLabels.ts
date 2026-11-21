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
 * The maps are byte-identical to the (previously local) QuestionsCenter
 * helpers; this module exists so ExamsCenter and QuestionsCenter can never
 * drift apart again.
 */

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
  switch (type) {
    case 'Mcq': return isArabic ? 'اختيار من متعدد' : 'MCQ';
    case 'TrueFalse': return isArabic ? 'صح أو خطأ' : 'True / False';
    case 'MultipleSelect': return isArabic ? 'اختيارات متعددة' : 'Multiple select';
    case 'Essay': return isArabic ? 'تحريري' : 'Essay';
    case 'Matching': return isArabic ? 'وصل' : 'Matching';
    default: return isArabic ? 'نوع غير معروف' : 'Unknown type';
  }
}

/**
 * The difficulty label (Easy/Medium/Hard wire strings). An unknown value
 * renders «غير محدد» — never the raw string.
 */
export function questionDifficultyLabel(difficulty: string, isArabic: boolean): string {
  switch (difficulty) {
    case 'Easy': return isArabic ? 'سهل' : 'Easy';
    case 'Medium': return isArabic ? 'متوسط' : 'Medium';
    case 'Hard': return isArabic ? 'صعب' : 'Hard';
    default: return isArabic ? 'غير محدد' : 'Unspecified';
  }
}
