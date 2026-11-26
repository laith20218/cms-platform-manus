#!/usr/bin/env node
/**
 * PR-3-B runtime byte-identity check — the migrated questionLabels /
 * publicationLabel semantics vs. the legacy switch/ternary implementations,
 * for every known member, the fallbacks, and the publication wrapper inputs.
 */
const { statusLabel } = require('/home/z/cms-platform-manus/.agent-tmp/statuses.cjs');
const {
  questionTypeLabel,
  questionDifficultyLabel,
} = require('/home/z/cms-platform-manus/.agent-tmp/questionLabels-bundled.cjs');
const { questionsDict } = require('/home/z/cms-platform-manus/.agent-tmp/questions-bundled.cjs');

let failures = 0;
function check(actual, expected, label) {
  if (actual !== expected) {
    console.log(`MISMATCH ${label}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
    failures++;
  }
}

// ---- legacy questionTypeLabel switch (byte-identical expectations) ----
const legacyType = {
  Mcq: ['اختيار من متعدد', 'MCQ'],
  TrueFalse: ['صح أو خطأ', 'True / False'],
  MultipleSelect: ['اختيارات متعددة', 'Multiple select'],
  Essay: ['تحريري', 'Essay'],
  Matching: ['وصل', 'Matching'],
  SomethingNew: ['نوع غير معروف', 'Unknown type'],
  '': ['نوع غير معروف', 'Unknown type'],
  mcq: ['نوع غير معروف', 'Unknown type'],
};
for (const [value, [ar, en]] of Object.entries(legacyType)) {
  check(questionTypeLabel(value, true), ar, `type ${JSON.stringify(value)} ar`);
  check(questionTypeLabel(value, false), en, `type ${JSON.stringify(value)} en`);
}

// ---- legacy questionDifficultyLabel switch ----
const legacyDifficulty = {
  Easy: ['سهل', 'Easy'],
  Medium: ['متوسط', 'Medium'],
  Hard: ['صعب', 'Hard'],
  Weird: ['غير محدد', 'Unspecified'],
  '': ['غير محدد', 'Unspecified'],
  easy: ['غير محدد', 'Unspecified'],
};
for (const [value, [ar, en]] of Object.entries(legacyDifficulty)) {
  check(questionDifficultyLabel(value, true), ar, `difficulty ${JSON.stringify(value)} ar`);
  check(questionDifficultyLabel(value, false), en, `difficulty ${JSON.stringify(value)} en`);
}

// ---- legacy QuestionsCenter statusLabel → new publicationLabel wrapper ----
// Legacy: v = status.toLowerCase(); published/archived/review explicit,
// EVERYTHING else (incl. draft, unpublished, unknown) → مسودة / Draft.
function legacyStatus(status, isArabic) {
  const value = status.toLowerCase();
  if (value === 'published') return isArabic ? 'منشور' : 'Published';
  if (value === 'archived') return isArabic ? 'مؤرشف' : 'Archived';
  if (value === 'review') return isArabic ? 'مراجعة' : 'Review';
  return isArabic ? 'مسودة' : 'Draft';
}
// The new wrapper as shipped in QuestionsCenter (module-level, mirrors source).
function publicationLabel(status, isArabic) {
  const locale = isArabic ? 'ar' : 'en';
  const value = status.toLowerCase();
  if (value === 'published' || value === 'archived') return statusLabel(locale, 'publication', value);
  if (value === 'review') return questionsDict.statusReview[locale];
  return questionsDict.statusDraft[locale];
}
for (const status of [
  'published', 'Published', 'PUBLISHED', 'archived', 'Archived',
  'review', 'Review', 'draft', 'Draft', 'unpublished', 'Unpublished',
  'something-else', '', '  published  ',
]) {
  for (const isArabic of [true, false]) {
    check(
      publicationLabel(status, isArabic),
      legacyStatus(status, isArabic),
      `publication ${JSON.stringify(status)} isArabic=${isArabic}`,
    );
  }
}

console.log(failures === 0
  ? 'OK — questionTypeLabel / questionDifficultyLabel / publicationLabel outputs are byte-identical to the legacy implementations for every tested input.'
  : `FAIL — ${failures} mismatch(es).`);
process.exit(failures === 0 ? 0 : 1);
