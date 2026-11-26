/**
 * PR-3 — academic dictionary section (filled by the center migration).
 * Strings are moved BYTE-IDENTICAL from the component ternaries/copy
 * objects into this section; the component then reads them through
 * `t(locale, 'academic.key')`.
 *
 * Covers AcademicCenter (institutional hierarchy explorer: 5-column board,
 * quick-create forms, lecture strip + full lecture form, archive/restore and
 * publish confirms).
 */
import type { DictSection } from './types';

export const academicDict = {
  // ===== Shared action labels (reused across stage rows, lecture cards, dialogs) =====
  cancel: { ar: 'إلغاء', en: 'Cancel' },
  save: { ar: 'حفظ', en: 'Save' },
  add: { ar: 'إضافة', en: 'Add' },
  publish: { ar: 'نشر', en: 'Publish' },
  archive: { ar: 'أرشفة', en: 'Archive' },
  restore: { ar: 'استعادة', en: 'Restore' },
  archived: { ar: 'مؤرشف', en: 'Archived' },

  // ===== Page header =====
  header: {
    eyebrow: { ar: 'البنية الأكاديمية', en: 'Academic Structure' },
    title: { ar: 'من الجامعة إلى المحاضرة', en: 'University to lecture' },
    subtitle: { ar: 'تنقّل عبر الهرم الأكاديمي، أضف العناصر، وأرشف أو استعد حسب الحاجة.', en: 'Navigate the academic hierarchy, add items, and archive or restore as needed.' },
    hideArchived: { ar: 'إخفاء المؤرشف', en: 'Hide archived' },
    showArchived: { ar: 'إظهار المؤرشف', en: 'Show archived' },
  },

  // ===== Stage column titles (5-column board) =====
  stages: {
    universities: { ar: 'الجامعات', en: 'Universities' },
    colleges: { ar: 'الكليات', en: 'Colleges' },
    years: { ar: 'السنوات', en: 'Years' },
    semesters: { ar: 'الفصول', en: 'Semesters' },
    subjects: { ar: 'المواد', en: 'Subjects' },
  },

  // ===== Stage list empty states =====
  stageList: {
    // Legacy wording — no trailing period and «أولاً» spelling; distinct from
    // the thrown `errors.parentFirst` below.
    selectParentFirst: { ar: 'اختر العنصر الأب أولاً', en: 'Select parent first' },
    noItems: { ar: 'لا توجد عناصر بعد', en: 'No items yet' },
  },

  // ===== Quick-create form (inline per-stage) =====
  quickForm: {
    arabicName: { ar: 'الاسم العربي', en: 'Arabic name' },
    englishName: { ar: 'الاسم الإنجليزي (اختياري)', en: 'English name (optional)' },
    order: { ar: 'الترتيب', en: 'Order' },
    subjectCode: { ar: 'رمز المادة (اختياري)', en: 'Subject code (optional)' },
  },

  // ===== Lecture strip =====
  lectures: {
    eyebrow: { ar: 'المحاضرات', en: 'Lectures' },
    forSubject: { ar: 'محاضرات المادة المحددة', en: 'Lectures for selected subject' },
    selectSubject: { ar: 'اختر مادة لعرض محاضراتها', en: 'Select a subject to view lectures' },
    add: { ar: 'إضافة محاضرة', en: 'Add lecture' },
    empty: { ar: 'لا توجد محاضرات بعد.', en: 'No lectures yet.' },
    selectToBegin: { ar: 'اختر مادة للبدء.', en: 'Select a subject to begin.' },
    duration: { ar: '{{count}} د', en: '{{count}} min' },
    instructor: { ar: 'المحاضر: {{name}}', en: 'Instructor: {{name}}' },
    source: { ar: 'المصدر: {{name}}', en: 'Source: {{name}}' },
    draft: { ar: 'مسودة', en: 'Draft' },
    published: { ar: 'منشور', en: 'Published' },
  },

  // ===== Full lecture create form =====
  lectureForm: {
    newLecture: { ar: 'محاضرة جديدة', en: 'New lecture' },
    addToHierarchy: { ar: 'إضافة محاضرة إلى الهيكل', en: 'Add a lecture to the hierarchy' },
    arabicTitle: { ar: 'العنوان العربي', en: 'Arabic title' },
    englishTitle: { ar: 'العنوان الإنجليزي', en: 'English title' },
    lectureNumber: { ar: 'رقم المحاضرة', en: 'Lecture number' },
    duration: { ar: 'المدة بالدقائق', en: 'Duration (minutes)' },
    instructorName: { ar: 'اسم المحاضر', en: 'Instructor name' },
    sourceReference: { ar: 'المصدر أو المرجع', en: 'Source / reference' },
    description: { ar: 'وصف المحاضرة', en: 'Lecture description' },
  },

  // ===== Publish-lecture confirm =====
  publishConfirm: {
    title: { ar: 'نشر المحاضرة', en: 'Publish lecture' },
    description: { ar: 'ستصبح المحاضرة "{{title}}" متاحة للطلاب المخوّلين بالمادة، وستظهر في قائمة محاضراتها.', en: '"{{title}}" will become available to students entitled to the subject and appear in its lecture list.' },
  },

  // ===== Archive / restore confirm =====
  archiveConfirm: {
    restoreTitle: { ar: 'استعادة "{{name}}"؟', en: 'Restore "{{name}}"?' },
    archiveTitle: { ar: 'أرشفة "{{name}}"؟', en: 'Archive "{{name}}"?' },
    restoreText: { ar: 'سيُعاد إظهار العنصر للطلاب ضمن صلاحياتهم.', en: 'The item will become visible to students within their scope.' },
    archiveText: { ar: 'سيُخفى العنصر عن الطلاب دون حذفه نهائياً.', en: 'The item will be hidden from students without permanent deletion.' },
  },

  // ===== Toasts (success notices) =====
  toasts: {
    itemRestored: { ar: 'تمت استعادة العنصر الأكاديمي.', en: 'Academic item restored.' },
    itemArchived: { ar: 'تمت أرشفة العنصر الأكاديمي وإخفاؤه عن الطلاب.', en: 'Academic item archived and hidden from students.' },
    lecturePublished: { ar: 'تم نشر المحاضرة وأصبحت متاحة للطلاب المخوّلين.', en: 'Lecture published for entitled students.' },
    itemSaved: { ar: 'تم حفظ العنصر الأكاديمي.', en: 'Academic item saved.' },
    lectureSaved: { ar: 'تم حفظ المحاضرة.', en: 'Lecture saved.' },
  },

  // ===== Inline operator-facing errors =====
  errors: {
    parentFirst: { ar: 'اختر العنصر الأب أولًا.', en: 'Select the parent item first.' },
  },
} as const satisfies DictSection;
