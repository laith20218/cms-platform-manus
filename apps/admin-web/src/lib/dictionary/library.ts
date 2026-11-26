/**
 * PR-3 — library dictionary section (LibraryCenter + processing surfaces).
 *
 * Strings are moved BYTE-IDENTICAL from the component ternaries/copy objects
 * into this section; the components then read them through
 * `t(locale, 'library.key')`.
 *
 * Sections:
 *   • header/tabs/fields/toolbar/list — the LibraryCenter shell, academic
 *     hierarchy filters, table columns and empty states (the legacy `copy`
 *     memo, rebuilt dictionary-sourced with the same keys);
 *   • actions — the row-actions ⋮ menu entries;
 *   • upload — the slide-in upload panel incl. the premium HTML experience
 *     (A/B/C) and its four-step timeline badges;
 *   • processing — the Ghostscript/HTML trackers, the PDF/HTML timeline
 *     furniture and the mediaProcessing.ts chip labels;
 *   • timeline — ProcessingTimeline.tsx (upload stats strip + bar labels);
 *   • errorModal — ProcessingErrorModal.tsx defaults and button labels;
 *   • confirm/metadata/errors — lifecycle dialogs, the metadata edit modal
 *     and the Arabic-only `.catch` fallbacks (now bilingual).
 *
 * Wire-status labels (type/scan/category/publication/mediaProtection) resolve
 * through the central registry in `./statuses` — byte-identical to the legacy
 * per-center helpers; only the strings the registry cannot express live here.
 */
import type { DictSection } from './types';

export const libraryDict = {
  // ===== Page header =====
  header: {
    eyebrow: { ar: 'إدارة المحتوى الرقمي', en: 'Digital content management' },
    title: { ar: 'مركز المكتبة والملفات', en: 'Library & Files Center' },
    desc: { ar: 'إدارة ملفات المكتبة الرقمية: رفع، نشر، أرشفة، حذف.', en: 'Manage library files: upload, publish, archive, delete.' },
  },

  // ===== Push 4: documents | courses tab bar =====
  tabs: {
    files: { ar: 'الملفات', en: 'Documents' },
    courses: { ar: 'الكورسات', en: 'Courses' },
  },

  // ===== Field labels (hierarchy filters, table columns, edit modal) =====
  fields: {
    university: { ar: 'الجامعة', en: 'University' },
    college: { ar: 'الكلية', en: 'College' },
    year: { ar: 'السنة', en: 'Year' },
    semester: { ar: 'الفصل', en: 'Semester' },
    subject: { ar: 'المادة', en: 'Subject' },
    lecture: { ar: 'المحاضرة', en: 'Lecture' },
    category: { ar: 'التصنيف', en: 'Category' },
    file: { ar: 'الملف', en: 'File' },
    title: { ar: 'العنوان', en: 'Title' },
    description: { ar: 'الوصف', en: 'Description' },
    type: { ar: 'النوع', en: 'Type' },
    size: { ar: 'الحجم', en: 'Size' },
    scan: { ar: 'الفحص', en: 'Scan' },
    created: { ar: 'تاريخ الإنشاء', en: 'Created' },
    actions: { ar: 'إجراءات', en: 'Actions' },
  },

  // ===== Toolbar (search · status/category filters · refresh) =====
  toolbar: {
    search: { ar: 'ابحث بالعنوان', en: 'Search by title' },
    categoryAll: { ar: 'التصنيف: الكل', en: 'Category: All' },
    refresh: { ar: 'تحديث', en: 'Refresh' },
    loading: { ar: 'جارٍ التحميل…', en: 'Loading…' },
    addFile: { ar: 'رفع ملف', en: 'Upload file' },
  },

  // ===== Empty states =====
  list: {
    noFiles: { ar: 'لا توجد ملفات مطابقة.', en: 'No matching files.' },
    noSubject: { ar: 'اختر مادة لعرض ملفاتها.', en: 'Select a subject to view its files.' },
    noSubjectHint: { ar: 'التدرج الأكاديمي أعلاه يقودك من الجامعة إلى المادة.', en: 'The hierarchy above leads from university down to subject.' },
    noFilesHint: { ar: 'جرّب تعديل التصفية أو الكلمة المفتاحية.', en: 'Try adjusting the filters or search keywords.' },
  },

  // ===== Row-actions ⋮ menu =====
  actions: {
    publish: { ar: 'نشر', en: 'Publish' },
    archive: { ar: 'أرشفة', en: 'Archive' },
    delete: { ar: 'حذف', en: 'Delete' },
    rowMenuLabel: { ar: 'إجراءات {{title}}', en: 'Actions for {{title}}' },
    convertToImages: { ar: 'تحويل إلى صور عالية الجودة', en: 'Convert to high-quality images' },
    convertNotice: { ar: 'هذه الميزة ستكون متاحة في التحديث القادم (Wave 12).', en: 'This feature will be available in the next update (Wave 12).' },
    editMetadata: { ar: 'تعديل البيانات', en: 'Edit metadata' },
    hardDelete: { ar: 'حذف نهائي (تجاوز الأرشفة)', en: 'Hard delete (bypass archive)' },
  },

  // ===== Slide-in upload panel =====
  upload: {
    panelEyebrow: { ar: 'رفع ملف جديد', en: 'Upload new file' },
    panelTitle: { ar: 'رفع ملف جديد', en: 'New file upload' },
    submit: { ar: 'رفع', en: 'Upload' },
    uploading: { ar: 'جارٍ الرفع…', en: 'Uploading…' },
    progress: { ar: 'التقدم', en: 'Progress' },
    selectFile: { ar: 'اختر ملفاً', en: 'Choose file' },
    fillRequired: { ar: 'الرجاء اختيار ملف ومادة وعنوان', en: 'Please select a file, subject, and title' },
    selectSubjectForm: { ar: 'اختر المادة', en: 'Select subject' },
    selectLectureForm: { ar: 'على مستوى المادة', en: 'Subject-level' },
    html: {
      previewTitle: { ar: 'معاينة تفاعلية', en: 'Interactive preview' },
      localOnly: { ar: 'محلية فقط', en: 'Local only' },
      previewFrameTitle: { ar: 'معاينة تفاعلية للدرس', en: 'Interactive lesson preview' },
      previewNote: { ar: 'المعاينة تعمل داخل متصفحك فقط — لم يُرفع أي ملف بعد، وتعمل بنفس قواعد القفص التي سيراها الطلاب.', en: 'The preview runs inside your browser only — nothing is uploaded yet, and it uses the same sandbox rules students will get.' },
      enableScripts: { ar: 'تفعيل السكربتات التفاعلية', en: 'Enable interactive scripts' },
      enableScriptsHint: { ar: 'المحتوى سيعمل داخل قفص حماية (Sandbox) ولا يمكنه الاتصال بأي سيرفر خارجي.', en: 'Content runs inside a sandbox cage and cannot contact any external server.' },
      chipCsp: { ar: 'حماية CSP مفعّلة', en: 'CSP shield on' },
      chipVirus: { ar: 'فحص فيروسي تلقائي', en: 'Virus scanned' },
      chipSandbox: { ar: 'قفص حماية معزول', en: 'Isolated sandbox' },
      sizeLabel: { ar: 'حجم الملف', en: 'File size' },
      sizeError: { ar: 'الحجم يتجاوز الحد الأقصى ({{limit}} ميجابايت) — أزل الملف واختر ملفًا أصغر.', en: 'Exceeds the {{limit}} MB limit — remove it and pick a smaller file.' },
    },
  },

  // ===== Processing trackers (Ghostscript PDF + HTML sanitize/CSP) =====
  processing: {
    pdfReadyBroken: { ar: 'تم تجهيز الملف "{{title}}" — به مشاكل في النص، تم تفعيل وضع العرض الاحتياطي.', en: 'Prepared "{{title}}" — text issues detected; fallback rendering is active.' },
    pdfReadyFixed: { ar: 'تم إصلاح خطوط الملف "{{title}}" بنجاح.', en: 'Font processing finished for "{{title}}".' },
    pdfFailedHuman: { ar: 'تعذّر إصلاح خطوط هذا الملف على الخادم. يمكن إعادة المحاولة بإعادة رفع الملف.', en: 'Font processing failed on the server. Retry by uploading the file again.' },
    htmlReady: { ar: 'تم تجهيز الدرس التفاعلي "{{title}}" بنجاح — الحماية مفعّلة وجاهز للطلاب.', en: 'Interactive lesson "{{title}}" is ready — protection applied.' },
    htmlFailedHuman: { ar: 'تعذّر تجهيز هذا الدرس التفاعلي على الخادم. يمكن إعادة المحاولة بإعادة رفع الملف.', en: 'Failed to prepare this interactive lesson on the server. Retry by uploading the file again.' },
    uploadedNotice: { ar: 'تم رفع الملف بنجاح.', en: 'File uploaded successfully.' },
    pollTimeout: { ar: 'تجاوزت المعالجة المهلة (15 دقيقة) — تم إيقاف التحديث. أعد المحاولة لاحقاً.', en: 'Processing exceeded the 15-minute watchdog — polling stopped. Retry later.' },
    pdfTitle: { ar: 'معالجة الخطوط', en: 'Font processing' },
    pdfTooltip: { ar: 'هذه الخطوة تضمن أن النص العربي سيظهر متصلاً وسليماً على جميع الأجهزة.', en: 'This step ensures Arabic text renders connected and correct on every device.' },
    pdfFailedStep: { ar: 'تعذر معالجة الملف ❌', en: 'The file could not be processed ❌' },
    errorHeadline: { ar: 'تعذر معالجة الملف', en: 'The file could not be processed' },
    htmlTitle: { ar: 'تجهيز الدرس التفاعلي', en: 'Interactive lesson processing' },
    htmlFailedStep: { ar: 'تعذر تجهيز الدرس ❌', en: 'The lesson could not be prepared ❌' },
    htmlReadyBadge: { ar: 'جاهز — الحماية مفعّلة وقفص السكربتات يعمل', en: 'Ready — protection applied, sandbox active' },
    // mediaProcessing.ts — the episode-row chip labels.
    failed: { ar: 'فشلت المعالجة', en: 'Processing failed' },
    ready: { ar: 'جاهز', en: 'Ready' },
    chip: { ar: 'المعالجة: {{rung}}', en: 'Processing: {{rung}}' },
  },

  // ===== ProcessingTimeline.tsx (upload stats strip + shared bar) =====
  timeline: {
    speed: { ar: 'السرعة', en: 'Speed' },
    eta: { ar: 'الوقت المتبقي', en: 'ETA' },
    parts: { ar: '{{uploaded}} من أصل {{total}} · {{completed}}/{{parts}} أجزاء', en: '{{uploaded}} of {{total}} · {{completed}}/{{parts}} parts' },
    barUploading: { ar: 'جارٍ رفع الملف…', en: 'Uploading the file…' },
    barProcessing: { ar: 'المعالجة على الخادم', en: 'Server-side processing' },
    uploadProgressA11y: { ar: 'تقدم الرفع', en: 'Upload progress' },
    processingProgressA11y: { ar: 'تقدم المعالجة', en: 'Processing progress' },
  },

  // ===== ProcessingErrorModal.tsx =====
  errorModal: {
    headlineDefault: { ar: 'عذراً، تعذر معالجة الفيديو.', en: 'Sorry — the video could not be processed.' },
    detailsForSupport: { ar: 'تفاصيل تقنية للدعم الفني', en: 'Technical details for support' },
    titleFallback: { ar: 'تعذّرت معالجة الفيديو', en: 'Video processing failed' },
    description: { ar: 'الرسائل المبسّطة أولاً، والتفاصيل التقنية عند الحاجة', en: 'Human message first, technical details on demand' },
    humanDefault: { ar: 'تعذّر تحويل الفيديو إلى صيغ المشاهدة. حاول إعادة المحاولة، وإن استمرت المشكلة فتواصل مع الدعم الفني مع رقم الحلقة.', en: 'The video could not be converted into watchable formats. Try again; if it keeps failing, contact support with the episode id.' },
    copied: { ar: 'تم النسخ ✓', en: 'Copied ✓' },
    copyError: { ar: 'نسخ الخطأ', en: 'Copy error' },
    retrying: { ar: 'جارٍ إعادة المحاولة…', en: 'Retrying…' },
    retry: { ar: 'إعادة المحاولة', en: 'Retry' },
  },

  // ===== Lifecycle confirm dialogs (publish/archive/hard delete) =====
  confirm: {
    publishTitle: { ar: 'نشر الملف', en: 'Publish file' },
    publishDescription: { ar: 'سيصبح الملف "{{title}}" مرئيًا لجميع الطلاب ضمن المادة وسيظهر في نتائج البحث.', en: '"{{title}}" will become visible to all students of the subject and appear in search results.' },
    archiveTitle: { ar: 'أرشفة الملف', en: 'Archive file' },
    archiveDescription: { ar: 'سيُخفى الملف "{{title}}" من اكتشاف الطلاب. يمكن استعادته بالنشر لاحقًا ولا يُحذف نهائيًا.', en: '"{{title}}" will be hidden from student discovery. It can be re-published later and is not permanently deleted.' },
    deleteTitle: { ar: 'تأكيد الحذف', en: 'Confirm delete' },
    deleteText: { ar: 'هذا الإجراء دائم. سيُحذف الملف من التخزين والقاعدة.', en: 'This is permanent. The file will be removed from storage and database.' },
    deleteButton: { ar: 'حذف نهائي', en: 'Delete permanently' },
    hardDeleteConsequence: { ar: 'سيُحذف الملف نهائيًا من قاعدة البيانات مع علاماته وتعليقاته ومشاهداته (تجاوز الأرشفة).', en: 'The file is physically deleted with its bookmarks, annotations and views (bypassing archive).' },
  },

  // ===== Metadata edit modal (PUT /library/{id}) =====
  metadata: {
    title: { ar: 'تعديل بيانات الملف', en: 'Edit file metadata' },
    descriptionPlaceholder: { ar: 'اتركه فارغًا للمسح', en: 'Leave empty to clear' },
    tagsLabel: { ar: 'الوسوم (فاصلة بين كل وسم)', en: 'Tags (comma-separated)' },
    noLecture: { ar: 'بدون محاضرة', en: 'No lecture' },
    difficulty: { ar: 'الصعوبة', en: 'Difficulty' },
    unchanged: { ar: 'بدون تغيير', en: 'Unchanged' },
    targetQuality: { ar: 'جودة التحويل المستهدفة', en: 'Transcoding target quality' },
  },

  // ===== Handler fallbacks (legacy Arabic-only — now bilingual) =====
  errors: {
    loadUniversities: { ar: 'تعذر تحميل الجامعات.', en: 'Could not load universities.' },
    loadFiles: { ar: 'تعذر تحميل الملفات.', en: 'Could not load files.' },
    validation: { ar: 'الرجاء اختيار ملف ومادة وعنوان.', en: 'Please select a file, subject, and title.' },
    htmlTooLarge: { ar: 'حجم ملف HTML يتجاوز الحد الأقصى ({{limit}} ميجابايت)', en: 'HTML file exceeds the {{limit}} MB limit' },
    upload: { ar: 'فشل رفع الملف.', en: 'File upload failed.' },
    publish: { ar: 'فشل نشر الملف.', en: 'Failed to publish the file.' },
    archive: { ar: 'فشلت أرشفة الملف.', en: 'Failed to archive the file.' },
    updateMetadata: { ar: 'فشل تحديث بيانات الملف.', en: 'Failed to update file metadata.' },
    delete: { ar: 'فشل حذف الملف.', en: 'Failed to delete the file.' },
  },
} as const satisfies DictSection;
