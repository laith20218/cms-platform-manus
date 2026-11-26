#!/usr/bin/env node
/**
 * PR-3-B interpolation check — the flattened {{token}} entries must render
 * byte-identically to the legacy template literals for representative values.
 */
const { t } = require('/home/z/cms-platform-manus/.agent-tmp/dictionary-bundled.cjs');

let failures = 0;
function check(actual, expected, label) {
  if (actual !== expected) {
    console.log(`MISMATCH ${label}:\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`);
    failures++;
  }
}

// legacy: isArabic ? `تم تنفيذ الإجراء على ${s} من ${r} سؤال.` : `Applied to ${s} of ${r} questions.`
check(
  t('ar', 'questions.notices.bulkApplied', { succeeded: 3, requested: 5 }),
  'تم تنفيذ الإجراء على 3 من 5 سؤال.',
  'bulkApplied ar',
);
check(
  t('en', 'questions.notices.bulkApplied', { succeeded: 3, requested: 5 }),
  'Applied to 3 of 5 questions.',
  'bulkApplied en',
);

// legacy: isArabic ? `فشل رفع الملف إلى التخزين (${put.status}).` : `Storage upload failed (${put.status}).`
check(t('ar', 'questions.upload.storageFailed', { status: 403 }), 'فشل رفع الملف إلى التخزين (403).', 'storageFailed ar');
check(t('en', 'questions.upload.storageFailed', { status: 500 }), 'Storage upload failed (500).', 'storageFailed en');

// legacy: isArabic ? `تم تحديد ${selectedIds.size} سؤال` : `${selectedIds.size} selected`
check(t('ar', 'questions.bulk.selected', { count: 4 }), 'تم تحديد 4 سؤال', 'bulk.selected ar');
check(t('en', 'questions.bulk.selected', { count: 12 }), '12 selected', 'bulk.selected en');

// legacy: isArabic ? `اختر ${field.label}` : `Select ${field.label.toLowerCase()}`
check(
  t('ar', 'questions.filters.select', { label: 'الجامعة', labelLower: 'university' }),
  'اختر الجامعة',
  'filters.select ar',
);
check(
  t('en', 'questions.filters.select', { label: 'University', labelLower: 'university' }),
  'Select university',
  'filters.select en',
);

// legacy: isArabic ? `تحديد السؤال: ${text}` : `Select question: ${text}`
check(
  t('ar', 'questions.table.selectQuestion', { text: 'سؤال عن الفسيولوجيا' }),
  'تحديد السؤال: سؤال عن الفسيولوجيا',
  'selectQuestion ar',
);

// legacy: isArabic ? `إجراءات: ${text}` : `Actions: ${text}`
check(t('en', 'questions.actions.menuLabel', { text: 'Question about cells' }), 'Actions: Question about cells', 'menuLabel en');

// legacy: isArabic ? `الإجابة الصحيحة للعنصر ${label}` : `Correct target for prompt ${index + 1}`
check(
  t('ar', 'questions.matching.pairSelectLabel', { label: 'أ', index: 1 }),
  'الإجابة الصحيحة للعنصر أ',
  'pairSelectLabel ar',
);
check(
  t('en', 'questions.matching.pairSelectLabel', { label: 'أ', index: 1 }),
  'Correct target for prompt 1',
  'pairSelectLabel en',
);

// legacy pager: `Page ${p} of ${tp}`
check(t('en', 'questions.pager.pageOf', { page: 2, totalPages: 3 }), 'Page 2 of 3', 'pager.pageOf en');
check(t('ar', 'questions.pager.pageOf', { page: 2, totalPages: 3 }), 'صفحة 2 من 3', 'pager.pageOf ar');

// legacy import modal: `السطر ${row}: ${msg}` / `Row ${row}: ${msg}`
check(t('ar', 'questions.rowError', { row: '2', message: 'نص السؤال فارغ' }), 'السطر 2: نص السؤال فارغ', 'rowError ar');
check(t('en', 'questions.rowError', { row: '2', message: 'question text is empty' }), 'Row 2: question text is empty', 'rowError en');

console.log(failures === 0
  ? 'OK — every flattened {{token}} entry renders byte-identically to its legacy template literal.'
  : `FAIL — ${failures} mismatch(es).`);
process.exit(failures === 0 ? 0 : 1);
