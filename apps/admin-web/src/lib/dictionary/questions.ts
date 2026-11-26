/**
 * PR-3 — questions dictionary section (QuestionsCenter + QuestionImportModal
 * + the shared lib/questionLabels glossary).
 *
 * Strings are moved BYTE-IDENTICAL from the component ternaries into this
 * section; the components read them through `t(locale, 'questions.<key>')`.
 *
 * Section map:
 *   • statusDraft / statusReview / statusPublished / statusArchived — the
 *     legacy status-chip labels. The registry's `publication` domain answers
 *     for published/archived on the wire; «review» and the legacy
 *     unknown-value→«Draft» default keep dedicated entries so no rendered
 *     byte changes (the registry would say «Unspecified» for unknown values).
 *   • typeOptions / difficultyOptions — static select labels shared by the
 *     toolbar filters and the editor (the wire-value glossary for actual
 *     question rows lives in the status registry: questionType /
 *     questionDifficulty, consumed through lib/questionLabels).
 *   • errors / notices / validation / upload — async fallbacks and toasts
 *     (the legacy Arabic-only catch fallbacks gained an English side).
 *   • header / filters / empty / toolbar / bulk / table / actions / pager —
 *     the list surfaces (pager holds the English labels; the Pagination
 *     component's own defaults are the Arabic side, byte-mirrored here).
 *   • editor / matching / options / settings / actionBar / confirm /
 *     preview / hardDelete — the slide-in editor and its dialogs.
 *   • rowError — QuestionImportModal CSV row-error interpolation.
 */
import type { DictSection } from './types';

export const questionsDict = {
  // ===== Legacy status chip labels (byte-identical to the pre-PR-3 helper) =====
  statusDraft: { ar: 'مسودة', en: 'Draft' },
  statusReview: { ar: 'مراجعة', en: 'Review' },
  statusPublished: { ar: 'منشور', en: 'Published' },
  statusArchived: { ar: 'مؤرشف', en: 'Archived' },

  // ===== Static select option labels (toolbar filters + editor) =====
  typeOptions: {
    mcq: { ar: 'اختيار من متعدد', en: 'MCQ' },
    trueFalse: { ar: 'صح أو خطأ', en: 'True / False' },
    multipleSelect: { ar: 'اختيارات متعددة', en: 'Multiple select' },
    essay: { ar: 'تحريري', en: 'Essay' },
    matching: { ar: 'وصل', en: 'Matching' },
  },
  difficultyOptions: {
    easy: { ar: 'سهل', en: 'Easy' },
    medium: { ar: 'متوسط', en: 'Medium' },
    hard: { ar: 'صعب', en: 'Hard' },
  },

  // ===== Async error fallbacks (legacy Arabic-only → both locales) =====
  errors: {
    loadUniversities: { ar: 'تعذر تحميل الجامعات.', en: 'Failed to load universities.' },
    loadQuestions: { ar: 'تعذر تحميل الأسئلة.', en: 'Failed to load questions.' },
    loadColleges: { ar: 'تعذر تحميل الكليات.', en: 'Failed to load colleges.' },
    loadYears: { ar: 'تعذر تحميل السنوات.', en: 'Failed to load academic years.' },
    loadSemesters: { ar: 'تعذر تحميل الفصول.', en: 'Failed to load semesters.' },
    loadSubjects: { ar: 'تعذر تحميل المواد.', en: 'Failed to load subjects.' },
    loadLectures: { ar: 'تعذر تحميل المحاضرات.', en: 'Failed to load lectures.' },
    openQuestion: { ar: 'تعذر فتح السؤال.', en: 'Failed to open the question.' },
    saveQuestion: { ar: 'تعذر حفظ السؤال.', en: 'Failed to save the question.' },
    updateStatus: { ar: 'تعذر تحديث حالة السؤال.', en: 'Failed to update the question status.' },
    deleteQuestion: { ar: 'تعذر حذف السؤال.', en: 'Failed to delete the question.' },
    openPreview: { ar: 'تعذر فتح المعاينة.', en: 'Failed to open the preview.' },
    duplicateQuestion: { ar: 'تعذر تكرار السؤال.', en: 'Failed to duplicate the question.' },
    bulkAction: { ar: 'تعذر تنفيذ الإجراء الجماعي.', en: 'Failed to apply the bulk action.' },
    uploadImage: { ar: 'تعذر رفع الصورة.', en: 'Failed to upload the image.' },
  },

  // ===== Toasts / confirmations =====
  notices: {
    contextReset: { ar: 'تمت إعادة تعيين السياق المحفوظ.', en: 'Saved context reset.' },
    questionUpdated: { ar: 'تم تحديث السؤال.', en: 'Question updated.' },
    savedAddAnother: { ar: 'تم حفظ السؤال. أضف السؤال التالي — السياق محفوظ.', en: 'Question saved. Add the next one — context kept.' },
    savedDraft: { ar: 'تم حفظ السؤال كمسودة.', en: 'Question saved as a draft.' },
    unpublished: { ar: 'تم إلغاء نشر السؤال وعاد مسودة.', en: 'Question unpublished and returned to draft.' },
    published: { ar: 'تم نشر السؤال.', en: 'Question published.' },
    archived: { ar: 'تمت أرشفة السؤال.', en: 'Question archived.' },
    questionDeleted: { ar: 'تم حذف السؤال.', en: 'Question deleted.' },
    duplicated: { ar: 'تم تكرار السؤال كمسودة جديدة.', en: 'Question duplicated as a new draft.' },
    bulkApplied: { ar: 'تم تنفيذ الإجراء على {{succeeded}} من {{requested}} سؤال.', en: 'Applied to {{succeeded}} of {{requested}} questions.' },
    imageAttached: { ar: 'تم إرفاق الصورة بالخيار.', en: 'Image attached to the option.' },
  },

  // ===== Editor-side validation =====
  validation: {
    pickSubjectFirst: { ar: 'اختر المادة أولاً.', en: 'Pick a subject first.' },
    writeQuestionText: { ar: 'اكتب نص السؤال.', en: 'Write the question text.' },
    writeModelAnswer: { ar: 'اكتب الإجابة النموذجية للسؤال التحريري.', en: 'Provide the model answer for the essay question.' },
    twoOptionsAndCorrect: { ar: 'أدخل خيارين على الأقل وحدد إجابة صحيحة.', en: 'Provide at least two options and mark a correct answer.' },
    writeExplanation: { ar: 'اكتب شرح السؤال العلمي.', en: 'Write the scientific explanation.' },
  },

  // ===== Option image upload =====
  upload: {
    notAnImage: { ar: 'الملف المرفق ليس صورة.', en: 'The attached file is not an image.' },
    exceedsSizeLimit: { ar: 'حجم الصورة يتجاوز 5 ميغابايت.', en: 'The image exceeds the 5 MB limit.' },
    optionImageTitle: { ar: 'صورة خيار سؤال', en: 'Question option image' },
    storageFailed: { ar: 'فشل رفع الملف إلى التخزين ({{status}}).', en: 'Storage upload failed ({{status}}).' },
    publicUrlMissing: { ar: 'تم رفع الصورة، لكن رابطها العام غير قابل للتوليد — اضبط VITE_R2_PUBLIC_BASE ثم أعد الإرفاق، أو الصق رابط الصورة يدوياً.', en: 'Image uploaded, but its public URL cannot be derived — set VITE_R2_PUBLIC_BASE and re-attach, or paste the image URL manually.' },
  },

  // ===== Page header =====
  header: {
    sectionLabel: { ar: 'إدارة المحتوى الأكاديمي', en: 'Academic content management' },
    title: { ar: 'بنك الأسئلة', en: 'Question Bank' },
    subtitle: { ar: 'أدارة أسئلة المادة، الإجابات النموذجية، والشرح العلمي.', en: 'Manage subject questions, model answers, and scientific explanations.' },
    newQuestion: { ar: 'سؤال جديد', en: 'New question' },
    importQuestions: { ar: 'استيراد أسئلة', en: 'Import questions' },
  },

  // ===== Academic hierarchy filters =====
  filters: {
    university: { ar: 'الجامعة', en: 'University' },
    college: { ar: 'الكلية', en: 'College' },
    year: { ar: 'السنة', en: 'Year' },
    semester: { ar: 'الفصل', en: 'Semester' },
    subject: { ar: 'المادة', en: 'Subject' },
    select: { ar: 'اختر {{label}}', en: 'Select {{labelLower}}' },
  },

  // ===== Empty states =====
  empty: {
    pickSubject: { ar: 'اختر مادة لفتح بنك أسئلتها.', en: 'Select a subject to open its question bank.' },
    hierarchyHint: { ar: 'التدرج الأكاديمي أعلاه يقودك من الجامعة إلى المادة.', en: 'The hierarchy above leads from university down to subject.' },
    noQuestions: { ar: 'لا توجد أسئلة', en: 'No questions' },
    noQuestionsFiltered: { ar: 'لا توجد أسئلة ضمن هذه التصفية.', en: 'No questions match these filters.' },
  },

  // ===== List toolbar =====
  toolbar: {
    searchPlaceholder: { ar: 'ابحث في نص السؤال', en: 'Search question text' },
    allTypes: { ar: 'كل الأنواع', en: 'All types' },
    allStatuses: { ar: 'كل الحالات', en: 'All statuses' },
    // PR-4 — the completed question-bank filter bar.
    allDifficulties: { ar: 'كل الصعوبات', en: 'All difficulties' },
    allLectures: { ar: 'كل المحاضرات', en: 'All lectures' },
    allTags: { ar: 'كل الوسوم', en: 'All tags' },
    allAuthors: { ar: 'كل المؤلفين', en: 'All authors' },
    subjectLevelLecture: { ar: 'على مستوى المادة', en: 'Subject-level' },
    tagsLabel: { ar: 'الوسوم', en: 'Tags' },
    authorLabel: { ar: 'المؤلف', en: 'Author' },
    lectureLabel: { ar: 'المحاضرة', en: 'Lecture' },
    difficultyLabel: { ar: 'الصعوبة', en: 'Difficulty' },
    createdFromLabel: { ar: 'أُنشئ من', en: 'Created from' },
    createdToLabel: { ar: 'أُنشئ إلى', en: 'Created to' },
    updatedFromLabel: { ar: 'حُدّث من', en: 'Updated from' },
    updatedToLabel: { ar: 'حُدّث إلى', en: 'Updated to' },
    sortLabel: { ar: 'الترتيب', en: 'Sort' },
    sortUpdatedAt: { ar: 'آخر تحديث', en: 'Last updated' },
    sortCreatedAt: { ar: 'تاريخ الإنشاء', en: 'Created' },
    sortAttempts: { ar: 'عدد المحاولات', en: 'Attempts' },
    sortText: { ar: 'النص أبجدياً', en: 'Text (alphabetical)' },
    orderAsc: { ar: 'تصاعدي', en: 'Ascending' },
    orderDesc: { ar: 'تنازلي', en: 'Descending' },
    clearFilters: { ar: 'مسح التصفية', en: 'Clear filters' },
  },

  // ===== Bulk actions bar =====
  bulk: {
    toolbarLabel: { ar: 'إجراءات جماعية', en: 'Bulk actions' },
    selected: { ar: 'تم تحديد {{count}} سؤال', en: '{{count}} selected' },
    publishSelected: { ar: 'نشر المحدد', en: 'Publish selected' },
    archiveSelected: { ar: 'أرشفة المحدد', en: 'Archive selected' },
    clearSelection: { ar: 'إلغاء التحديد', en: 'Clear selection' },
    // PR-4 — bulk tagging through the existing tag vocabulary.
    tagSelected: { ar: 'وسم المحدد', en: 'Tag selected' },
    tagDialogTitle: { ar: 'وسم الأسئلة المحددة', en: 'Tag selected questions' },
    tagDialogBody: { ar: 'سيُطبّق الوسم على {{count}} سؤالاً محدداً. الوسوم الموجودة تبقى كما هي، والوسم الجديد يُضاف دون تكرار.', en: 'The tags will be applied to {{count}} selected questions. Existing tags stay; new tags are added without duplication.' },
    tagDialogRemoveNote: { ar: 'إزالة وسم تحذفه من الأسئلة المحددة فقط — لا تؤثر على أسئلة أخرى تستخدمه.', en: 'Removing a tag deletes it from the selected questions only — other questions using it are untouched.' },
    tagAddLabel: { ar: 'وسوم تُضاف (مفصولة بفواصل)', en: 'Tags to add (comma-separated)' },
    tagAddPlaceholder: { ar: 'مثال: مراجعة، قلب', en: 'e.g. reviewed, cardiology' },
    tagRemoveLabel: { ar: 'وسوم تُزال (اختياري)', en: 'Tags to remove (optional)' },
    tagRemovePlaceholder: { ar: 'اتركه فارغاً للإضافة فقط', en: 'Leave empty to only add' },
    tagConfirm: { ar: 'تطبيق الوسم على {{count}} سؤال', en: 'Apply tags to {{count}} questions' },
    tagValidation: { ar: 'أدخل وسيماً واحداً صالحاً على الأقل (50 حرفاً كحد أقصى لكل وسم).', en: 'Enter at least one valid tag (max 50 characters each).' },
    tagApplied: { ar: 'تم تحديث وسوم {{succeeded}} من {{requested}} سؤال.', en: 'Tags updated on {{succeeded}} of {{requested}} questions.' },
    // PR-4 — CSV export (authorized backend contract).
    exportCsv: { ar: 'تصدير CSV', en: 'Export CSV' },
    exporting: { ar: 'جارٍ التصدير…', en: 'Exporting…' },
    exportFailed: { ar: 'تعذر تصدير الأسئلة.', en: 'Failed to export questions.' },
    exportReady: { ar: 'تم تصدير الأسئلة إلى ملف CSV.', en: 'Questions exported to a CSV file.' },
  },

  // ===== Question table =====
  table: {
    selectAll: { ar: 'تحديد كل الأسئلة', en: 'Select all questions' },
    colQuestion: { ar: 'نص السؤال', en: 'Question' },
    colType: { ar: 'النوع', en: 'Type' },
    colDifficulty: { ar: 'الصعوبة', en: 'Difficulty' },
    colStatus: { ar: 'الحالة', en: 'Status' },
    colLecture: { ar: 'المحاضرة', en: 'Lecture' },
    colTags: { ar: 'الوسوم', en: 'Tags' },
    colAttempts: { ar: 'المحاولات', en: 'Attempts' },
    colCorrectRate: { ar: 'نسبة الإصابة', en: 'Correct rate' },
    colActions: { ar: 'إجراءات', en: 'Actions' },
    selectQuestion: { ar: 'تحديد السؤال: {{text}}', en: 'Select question: {{text}}' },
    subjectLevel: { ar: 'على مستوى المادة', en: 'Subject-level' },
    optionsCountSuffix: { ar: 'خيارات', en: 'opts' },
    noAttempts: { ar: 'لا توجد محاولات بعد', en: 'No attempts yet' },
  },

  // ===== Row menu + action bar + confirm buttons =====
  actions: {
    edit: { ar: 'تعديل', en: 'Edit' },
    menuLabel: { ar: 'إجراءات: {{text}}', en: 'Actions: {{text}}' },
    preview: { ar: 'معاينة (كما يراها الطالب)', en: 'Preview (student view)' },
    duplicate: { ar: 'تكرار كمسودة جديدة', en: 'Duplicate as new draft' },
    publish: { ar: 'نشر', en: 'Publish' },
    archive: { ar: 'أرشفة', en: 'Archive' },
    unpublish: { ar: 'إلغاء النشر', en: 'Unpublish' },
    delete: { ar: 'حذف', en: 'Delete' },
    hardDelete: { ar: 'حذف نهائي (تجاوز الأرشفة)', en: 'Hard delete (bypass archive)' },
  },

  // ===== Shared pager (English labels; the component default is Arabic) =====
  pager: {
    prev: { ar: 'السابق', en: 'Previous' },
    next: { ar: 'التالي', en: 'Next' },
    navLabel: { ar: 'تصفح الصفحات', en: 'Question list pagination' },
    pageOf: { ar: 'صفحة {{page}} من {{totalPages}}', en: 'Page {{page}} of {{totalPages}}' },
  },

  // ===== Slide-in editor =====
  editor: {
    tabs: {
      content: { ar: 'المحتوى', en: 'Content' },
      explanation: { ar: 'الشرح والمراجع', en: 'Explanation & reference' },
      classification: { ar: 'التصنيف والوسوم', en: 'Classification & tags' },
      settings: { ar: 'الإعدادات', en: 'Settings' },
    },
    tablistLabel: { ar: 'أقسام محرر السؤال', en: 'Question editor sections' },
    editTitle: { ar: 'تعديل السؤال', en: 'Edit question' },
    questionTextLabel: { ar: 'نص السؤال', en: 'Question text' },
    typeLocked: { ar: 'لا يمكن تغيير النوع بعد الإنشاء.', en: 'Type cannot change after creation.' },
    modelAnswerTitle: { ar: 'الإجابة النموذجية', en: 'Essay model answer' },
    modelAnswerPlaceholder: { ar: 'هذه الإجابة ستظهر للطالب تحت جوابه بعد التصحيح.', en: 'This answer appears under the student response after grading.' },
    gradingNote: { ar: 'يُجرى التصحيح الآلي بمطابقة النص بعد توحيد المسافات وحالة الأحرف.', en: 'Automatic grading normalizes whitespace and letter case.' },
    explanationLabel: { ar: 'الشرح', en: 'Explanation' },
    explanationPlaceholder: { ar: 'اكتب التوضيح العلمي للسؤال وإجابته.', en: 'Write the scientific explanation shown after grading.' },
    referenceLabel: { ar: 'المرجع (اختياري)', en: 'Reference (optional)' },
    lectureLabel: { ar: 'المحاضرة (اختياري)', en: 'Lecture (optional)' },
    subjectLevelOption: { ar: 'سؤال عام للمادة', en: 'Subject-level question' },
    tagsLabel: { ar: 'الوسوم (مفصولة بفواصل)', en: 'Tags (comma-separated)' },
    yearLabel: { ar: 'سنة الامتحان (اختياري)', en: 'Exam year (optional)' },
    yearPlaceholder: { ar: 'مثال: 2024', en: 'e.g. 2024' },
    paragraphTagLabel: { ar: 'وسم الفقرة (اختياري — موقع السؤال في المنهاج)', en: 'Paragraph tag (optional — position in curriculum)' },
    paragraphTagPlaceholder: { ar: 'مثال: الفصل الأول', en: 'e.g. Chapter 1' },
    usageTitle: { ar: 'الاستخدام', en: 'Usage' },
  },

  // ===== W21.1 Matching (وصل) board =====
  matching: {
    // PR-3 — validateMatching() messages (lib/matchingEditor), byte-identical.
    validation: {
      minItems: { ar: 'سؤال الوصل يتطلب عنصرين على الأقل في كل قائمة.', en: 'A matching question needs at least two items in each list.' },
      emptyText: { ar: 'نص عنصر الوصل لا يمكن أن يكون فارغاً.', en: 'A matching item cannot have empty text.' },
      multiUnpaired: { ar: 'اربط كل عنصر من القائمة الأولى بإجابة صحيحة واحدة على الأقل.', en: 'Pair every prompt with at least one correct target.' },
      multiDuplicate: { ar: 'كل إجابة من القائمة الثانية تبقى صحيحة لعنصر واحد فقط.', en: 'Every target stays correct for at most one prompt.' },
      unequalCounts: { ar: 'يجب أن يتساوى عدد عناصر القائمتين — حالياً {{prompts}} مقابل {{targets}}.', en: 'Both lists must have the same number of items — currently {{prompts}} vs {{targets}}.' },
      unpaired: { ar: 'اربط كل عنصر من القائمة الأولى بإجابته الصحيحة.', en: 'Pair every prompt with its correct target.' },
      duplicate: { ar: 'كل عنصر من القائمة الثانية يُستخدم مرة واحدة بالضبط — لا يمكن ربط عنصرين بالإجابة نفسها.', en: 'Every target is used exactly once — two prompts cannot share one answer.' },
    },
    itemsTitle: { ar: 'عناصر الوصل', en: 'Matching items' },
    hintMulti: { ar: 'علّم لكل عنصر كل الإجابات الصحيحة له — إجابة واحدة على الأقل.', en: 'Tick every correct target for each prompt — at least one.' },
    hintSingle: { ar: 'اربط كل عنصر من القائمة الأولى بإجابته في القائمة الثانية.', en: 'Pair every prompt with its target — each side used exactly once.' },
    multiMapToggle: { ar: 'إجابة متعددة لكل عنصر (وصل متعدد)', en: 'Multi-map (prompt → several targets)' },
    promptNumbering: { ar: 'ترقيم القائمة الأولى:', en: 'Prompt numbering:' },
    targetNumbering: { ar: 'ترقيم القائمة الثانية:', en: 'Target numbering:' },
    numbering: {
      arabicLetters: { ar: 'أ ب ج', en: 'أ ب ج (Arabic)' },
      digits: { ar: '1 2 3', en: '1 2 3 (digits)' },
      latinLetters: { ar: 'A B C', en: 'A B C (Latin)' },
    },
    list1Title: { ar: 'القائمة الأولى — العناصر', en: 'List 1 — prompts' },
    list2Title: { ar: 'القائمة الثانية — الإجابات', en: 'List 2 — targets' },
    promptPlaceholder: { ar: 'نص العنصر', en: 'Prompt text' },
    targetPlaceholder: { ar: 'نص الإجابة', en: 'Target text' },
    removePrompt: { ar: 'حذف العنصر', en: 'Remove prompt' },
    removeTarget: { ar: 'حذف الإجابة', en: 'Remove target' },
    addPrompt: { ar: 'إضافة عنصر', en: 'Add prompt' },
    addTarget: { ar: 'إضافة إجابة', en: 'Add target' },
    newItem: { ar: '(عنصر جديد)', en: '(new item)' },
    paired: { ar: 'مربوط', en: 'paired' },
    pairSelectLabel: { ar: 'الإجابة الصحيحة للعنصر {{label}}', en: 'Correct target for prompt {{index}}' },
    selectTargetPlaceholder: { ar: 'اختر الإجابة الصحيحة…', en: 'Select the correct target…' },
    takenSuffix: { ar: ' — مستخدم لعنصر آخر', en: ' — taken' },
    gradingMulti: { ar: 'قاعدة التصحيح (وصل متعدد): يُحسب العنصر صحيحاً فقط إذا اختار الطالب مجموعة إجاباته الصحيحة كاملة بلا زيادة — والدرجة الكاملة تتطلب كل العناصر صحيحة.', en: 'Multi-map grading: a prompt is correct only when the student selects exactly its full set of correct targets; full marks need every prompt correct.' },
    gradingSingle: { ar: 'قاعدة التصحيح: تُحسب الإجابة صحيحة فقط إذا تطابقت كل الأزواج — يُعرض للطالب بعد التصحيح الزوج الصحيح لكل عنصر أخطأ فيه.', en: 'Grading is all-or-nothing across pairs — after grading the student sees the correct target for every wrong pair.' },
  },

  // ===== Options editor =====
  options: {
    title: { ar: 'الخيارات', en: 'Options' },
    hintTrueFalse: { ar: 'حدد الإجابة الصحيحة ثم أضف الشرح.', en: 'Choose the correct answer, then add the explanation.' },
    hintDefault: { ar: 'حدد خياراً صحيحاً واحداً على الأقل.', en: 'Mark at least one correct option.' },
    moveUp: { ar: 'أعلى', en: 'Up' },
    moveDown: { ar: 'أسفل', en: 'Down' },
    remove: { ar: 'حذف', en: 'Remove' },
    imageAlt: { ar: 'صورة الخيار', en: 'Option image' },
    removeImage: { ar: 'إزالة الصورة', en: 'Remove image' },
    uploading: { ar: 'جارٍ الرفع…', en: 'Uploading…' },
    uploadImage: { ar: 'رفع صورة', en: 'Upload image' },
    imageUrlPlaceholder: { ar: 'أو الصق رابط الصورة العام', en: 'or paste a public image URL' },
    addOption: { ar: 'إضافة خيار', en: 'Add option' },
  },

  // ===== Editor settings tab =====
  settings: {
    publishStatusTitle: { ar: 'حالة النشر', en: 'Publish status' },
    draftNewQuestion: { ar: 'مسودة (سؤال جديد)', en: 'Draft (new question)' },
    actionBarNote: { ar: 'أزرار النشر/الأرشفة/إلغاء النشر في شريط الإجراءات أسفل المحرر.', en: 'Publish / archive / unpublish buttons live in the action bar below.' },
    explanationScopeNote: { ar: 'ملاحظة: إظهار الشرح بعد التصحيح إعداد على مستوى الاختبار وليس لكل سؤال — يُضبط عند إنشاء الاختبار في مركز الاختبارات.', en: 'Note: showing explanations after grading is an exam-level setting, not per-question — configure it when creating the exam in the Exams Center.' },
  },

  // ===== Editor action bar =====
  actionBar: {
    close: { ar: 'إغلاق', en: 'Close' },
    resetContextTitle: { ar: 'مسح السياق المحفوظ (الشلال والنوع والوسوم والسنة ووسم الفقرة)', en: 'Clear the saved context (cascade, type, tags, year, paragraph tag)' },
    resetContext: { ar: 'إعادة تعيين السياق', en: 'Reset context' },
    saveAddAnotherTitle: { ar: 'حفظ السؤال والبدء بالتالي مع الاحتفاظ بالسياق (الشلال، النوع، الصعوبة، الوسوم، السنة، وسم الفقرة)', en: 'Save this question and start the next with the context kept (cascade, type, difficulty, tags, year, paragraph tag)' },
    saveAddAnother: { ar: 'حفظ وإضافة آخر', en: 'Save & add another' },
    saveChanges: { ar: 'حفظ التعديل', en: 'Save changes' },
    saveAsDraft: { ar: 'حفظ كمسودة', en: 'Save as draft' },
  },

  // ===== Confirm dialog (publish / archive / unpublish / delete) =====
  confirm: {
    publishTitle: { ar: 'نشر السؤال', en: 'Publish question' },
    archiveTitle: { ar: 'أرشفة السؤال', en: 'Archive question' },
    unpublishTitle: { ar: 'إلغاء نشر السؤال', en: 'Unpublish question' },
    deleteTitle: { ar: 'حذف السؤال', en: 'Delete question' },
    publishBody: { ar: 'سيُتاح السؤال للطلاب المخوّلين ضمن مادته.', en: 'The question will become available to entitled students within its subject.' },
    archiveBody: { ar: 'سيُخفى السؤال من الطلاب لكنه يبقى في قاعدة البيانات.', en: 'The question will be hidden from students but kept in the database.' },
    unpublishBody: { ar: 'سيعود السؤال إلى مسودة ويُخفى عن الطلاب حتى إعادة نشره.', en: 'The question returns to draft and stays hidden from students until republished.' },
    deleteBody: { ar: 'هذا الإجراء دائم. سيُحذف السؤال نهائياً من قاعدة البيانات.', en: 'This action is permanent. The question will be removed permanently.' },
    cancel: { ar: 'إلغاء', en: 'Cancel' },
  },

  // ===== W14.3 B.3 + PR-4: universal question preview (student-view simulation) =====
  preview: {
    title: { ar: 'معاينة السؤال', en: 'Question preview' },
    imageAlt: { ar: 'صورة مرفقة بالسؤال', en: 'Question image' },
    // PR-4 — the preview is now the UNIVERSAL student-view simulation: the same
    // renderer family the student web rides, with badges and a local (never
    // persisted) answer simulation.
    previewBadge: { ar: 'وضع المعاينة', en: 'Preview mode' },
    previewNotice: { ar: 'هذه معاينة كما يراها الطالب — لا يُسجَّل أي دخول أو محاولة أو درجة أو إشعار.', en: 'Previewed exactly as the student sees it — no attempt, grade, notification, or analytics is recorded.' },
    simulateHint: { ar: 'جرّب الإجابة كما سيفعل الطالب — ستظهر النتيجة والتصحيح والشرح هنا فقط.', en: 'Try answering as a student would — the result, correction, and explanation appear here only.' },
    confirmAnswer: { ar: 'تأكيد الإجابة', en: 'Confirm answer' },
    changeAnswer: { ar: 'تغيير الإجابة', en: 'Change answer' },
    resultCorrect: { ar: 'إجابة صحيحة', en: 'Correct answer' },
    resultIncorrect: { ar: 'إجابة غير صحيحة', en: 'Incorrect answer' },
    yourAnswer: { ar: 'إجابتك: {{answer}}', en: 'Your answer: {{answer}}' },
    yourAnswerEmpty: { ar: 'إجابتك: لم تُسجل إجابة.', en: 'Your answer: no answer recorded.' },
    modelAnswer: { ar: 'الإجابة النموذجية: {{answer}}', en: 'Model answer: {{answer}}' },
    correctAnswerLine: { ar: 'الإجابة الصحيحة: {{answer}}', en: 'Correct answer: {{answer}}' },
    noModelAnswer: { ar: 'لا توجد إجابة نموذجية متاحة.', en: 'No model answer available.' },
    essayPlaceholder: { ar: 'اكتب إجابتك هنا كما سيفعل الطالب…', en: 'Type your answer here as the student would…' },
    essaySavedNotice: { ar: 'سُجّلت إجابتك — قارنها بالإجابة النموذجية.', en: 'Your answer is recorded — compare it with the model answer.' },
    essayGradingNote: { ar: 'يُحاكي التصحيح قاعدة الإنتاج الفعلية: مطابقة نصية تامة بعد توحيد المسافات وحالة الأحرف.', en: 'The simulation mirrors production grading: exact text match after whitespace and case normalization.' },
    explanationTitle: { ar: 'الشرح', en: 'Explanation' },
    referenceLine: { ar: 'المرجع: {{reference}}', en: 'Reference: {{reference}}' },
    // Matching preview board.
    matchingPrompts: { ar: 'القائمة الأولى — العناصر', en: 'List 1 — prompts' },
    matchingTargets: { ar: 'القائمة الثانية — الإجابات', en: 'List 2 — targets' },
    matchingHint: { ar: 'اختر عنصراً من القائمة الأولى ثم إجابته من القائمة الثانية — كما يفعل الطالب.', en: 'Pick a prompt, then its target — exactly as the student does.' },
    matchingSelectedPrompt: { ar: 'العنصر المحدد: {{text}}', en: 'Selected prompt: {{text}}' },
    matchingPair: { ar: '{{prompt}} ← {{target}}', en: '{{prompt}} ← {{target}}' },
    matchingPairCorrect: { ar: 'صحيح', en: 'correct' },
    matchingPairWrong: { ar: 'خطأ — الصحيح: {{target}}', en: 'wrong — correct: {{target}}' },
    matchingReset: { ar: 'إعادة تعيين الأزواج', en: 'Reset pairs' },
    missingImage: { ar: 'تعذر تحميل الصورة — المسار غير متاح.', en: 'Image failed to load — path unavailable.' },
    optionsUnavailable: { ar: 'خيارات هذا السؤال غير متوفرة.', en: 'The options of this question are unavailable.' },
    matchingUnavailable: { ar: 'عناصر سؤال الوصل غير متوفرة.', en: 'The matching items of this question are unavailable.' },
  },

  // ===== Hard delete dialog consequence =====
  hardDelete: {
    consequence: { ar: 'سيُحذف السؤال نهائيًا مع خياراته وصوره وسجلّ استخدامه في الاختبارات والممارسة (تجاوز الأرشفة).', en: 'The question is physically deleted with its options, images and usage history (bypassing archive).' },
  },

  // ===== QuestionImportModal — CSV row-error interpolation =====
  rowError: { ar: 'السطر {{row}}: {{message}}', en: 'Row {{row}}: {{message}}' },
} as const satisfies DictSection;
