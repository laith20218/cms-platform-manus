/**
 * PR-3 — exams dictionary section (ExamsCenter + ExamCoursesCenter).
 *
 * Every entry is moved BYTE-IDENTICAL from the two centers' inline
 * `isArabic ? '…' : '…'` ternaries; the components read them through
 * `t(locale, 'exams.<key>')`. Arabic-only `.catch`/throw fallbacks gained a
 * concise English translation (a dictionary entry must carry both locales);
 * their Arabic text is unchanged. Copy shared verbatim by both files (the
 * academic cascade labels, hierarchy hint, load errors) lives here once.
 *
 * Status vocabulary: exam/bundle publication status rides the central
 * registry's `publication` domain; the legacy default-Draft answer for
 * unknown wire values stays a local entry (`status.draft`) so this
 * migration changes no rendered output.
 */
import type { DictSection } from './types';

export const examsDict = {
  // ExamsCenter page header.
  header: {
    kicker: { ar: 'إدارة المحتوى الأكاديمي', en: 'Academic content management' },
    title: { ar: 'الاختبارات', en: 'Exams' },
    subtitle: { ar: 'تصميم الاختبارات، نشرها، وقراءة نتائجها.', en: 'Design, publish, and audit exam outcomes.' },
    newExam: { ar: 'اختبار جديد', en: 'New exam' },
  },

  // Academic hierarchy filter bar (shared verbatim by both centers).
  filters: {
    university: { ar: 'الجامعة', en: 'University' },
    college: { ar: 'الكلية', en: 'College' },
    year: { ar: 'السنة', en: 'Year' },
    semester: { ar: 'الفصل', en: 'Semester' },
    subject: { ar: 'المادة', en: 'Subject' },
    select: { ar: 'اختر {{label}}', en: 'Select {{label}}' },
    pickSubject: { ar: 'اختر مادة لفتح إدارة اختباراتِها.', en: 'Select a subject to manage its exams.' },
    hierarchyHint: { ar: 'التدرج الأكاديمي أعلاه يقودك من الجامعة إلى المادة.', en: 'The hierarchy above leads from university down to subject.' },
  },

  // Exams list toolbar.
  toolbar: {
    searchPlaceholder: { ar: 'ابحث بعنوان الاختبار أو رابطه', en: 'Search title or slug' },
    statusFilterA11y: { ar: 'تصفية حالة الاختبار', en: 'Filter by exam status' },
    allStatuses: { ar: 'كل الحالات', en: 'All statuses' },
  },

  // W2 pager — English overrides only; Arabic rides the @cms/ui Pagination defaults.
  pager: {
    prev: { ar: 'السابق', en: 'Previous' },
    next: { ar: 'التالي', en: 'Next' },
    navLabel: { ar: 'تصفح الصفحات', en: 'Exam list pagination' },
    pageOf: { ar: 'صفحة {{page}} من {{total}}', en: 'Page {{page}} of {{total}}' },
  },

  // Legacy default-Draft answer for wire values the old switch did not know (the registry would answer «غير محدد»/«Unspecified» there, which would change pre-PR-3 output).
  status: {
    draft: { ar: 'مسودة', en: 'Draft' },
  },

  // EXAM types only (W22.1) — question types ride lib/questionLabels.
  examType: {
    final: { ar: 'نهائي', en: 'Final' },
    midterm: { ar: 'نصفي', en: 'Midterm' },
    quiz: { ar: 'قصير', en: 'Quiz' },
    practice: { ar: 'تدريبي', en: 'Practice' },
  },

  // Attempt/result session statuses (ExamSessionStatus + legacy Abandoned/Expired aliases).
  resultStatus: {
    inProgress: { ar: 'قيد الأداء', en: 'In progress' },
    completed: { ar: 'مكتمل', en: 'Completed' },
    cancelled: { ar: 'ملغى', en: 'Cancelled' },
    timedOut: { ar: 'انتهى وقته', en: 'Timed out' },
    unknown: { ar: 'غير معروف', en: 'Unknown' },
  },

  // Question report classification labels (D12).
  reportType: {
    typo: { ar: 'خطأ في الصياغة', en: 'Typo' },
    wrongAnswer: { ar: 'الإجابة الصحيحة خاطئة', en: 'Wrong answer' },
    badImage: { ar: 'صورة غير سليمة', en: 'Bad image' },
    other: { ar: 'أخرى', en: 'Other' },
  },

  // Question report triage statuses (D12).
  reportStatus: {
    reviewing: { ar: 'قيد المراجعة', en: 'Reviewing' },
    resolved: { ar: 'تم الحل', en: 'Resolved' },
    rejected: { ar: 'مرفوض', en: 'Rejected' },
    closed: { ar: 'مغلق', en: 'Closed' },
    pending: { ar: 'قيد الانتظار', en: 'Pending' },
  },

  // Byte-identical pairs reused by more than one surface of the two centers.
  shared: {
    noAttempts: { ar: 'لا توجد محاولات بعد.', en: 'No attempts yet.' },
    type: { ar: 'النوع', en: 'Type' },
    subjectWide: { ar: 'على مستوى المادة', en: 'Subject-wide' },
    durationMinutes: { ar: 'المدة (دقيقة)', en: 'Duration (min)' },
    attempts: { ar: 'المحاولات', en: 'Attempts' },
  },

  // Count/unit words that ride next to interpolated numbers.
  units: {
    questions: { ar: 'سؤال', en: 'questions' },
    minutes: { ar: 'دقيقة', en: 'min' },
  },

  // W14.3 D10 per-exam stats dashboard.
  stats: {
    title: { ar: 'إحصائيات: {{title}}', en: 'Stats: {{title}}' },
    subtitle: { ar: 'مؤشرات المحاولات والدرجات وتحليل كل سؤال.', en: 'Attempt metrics, score analytics, and per-question breakdown.' },
    openQuestionBank: { ar: 'فتح بنك الأسئلة', en: 'Open question bank' },
    closeA11y: { ar: 'إغلاق الإحصائيات', en: 'Close stats' },
    metricsHint: { ar: 'ستظهر المؤشرات هنا بعد أول محاولة طالب.', en: 'Metrics appear here after the first student attempt.' },
    startedCard: { ar: 'بدأت', en: 'Started' },
    attemptsCard: { ar: 'محاولات', en: 'Attempts' },
    completedCard: { ar: 'أكملت', en: 'Completed' },
    inProgressCard: { ar: 'قيد التنفيذ', en: 'In progress' },
    timedOutCard: { ar: 'انتهت مهلتها', en: 'Timed out' },
    cancelledCard: { ar: 'ملغاة', en: 'Cancelled' },
    passVsFail: { ar: 'النجاح مقابل الرسوب', en: 'Pass vs fail' },
    noGradedResults: { ar: 'لا توجد نتائج مصححة بعد.', en: 'No graded results yet.' },
    pass: { ar: 'ناجح', en: 'Pass' },
    fail: { ar: 'راسب', en: 'Fail' },
    scores: { ar: 'الدرجات (من المصححة آلياً)', en: 'Scores (auto-graded)' },
    mean: { ar: 'المعدل', en: 'Mean' },
    median: { ar: 'الوسيط', en: 'Median' },
    avgDuration: { ar: 'متوسط زمن الحل', en: 'Average duration' },
    durationValue: { ar: '{{minutes}} دقيقة {{seconds}} ثانية', en: '{{minutes}} min {{seconds}} sec' },
    distribution: { ar: 'توزيع الدرجات', en: 'Score distribution' },
    questionStatsTitle: { ar: 'إحصائيات الأسئلة ({{count}})', en: 'Question stats ({{count}})' },
    noQuestions: { ar: 'لا توجد أسئلة في هذا الاختبار.', en: 'This exam has no questions.' },
    questionCol: { ar: 'السؤال', en: 'Question' },
    correctCol: { ar: 'إجابات صحيحة', en: '% correct' },
    mostCommonWrongCol: { ar: 'أكثر خيار خاطئ', en: 'Most common wrong' },
    avgTimeCol: { ar: 'متوسط الزمن', en: 'Avg time' },
    flagCol: { ar: 'تنبيه', en: 'Flag' },
    secondsValue: { ar: '{{seconds}} ث', en: '{{seconds}} s' },
    needsReview: { ar: 'يحتاج مراجعة', en: 'Needs review' },
  },

  // Exams table + empty states.
  list: {
    empty: { ar: 'لا توجد اختبارات', en: 'No exams' },
    emptyFiltered: { ar: 'لا توجد اختبارات ضمن هذه التصفية.', en: 'No exams match this filter.' },
    titleCol: { ar: 'عنوان الاختبار', en: 'Exam title' },
    questionsCol: { ar: 'عدد الأسئلة', en: 'Questions' },
    fromWord: { ar: 'من', en: 'From' },
    untilWord: { ar: 'إلى', en: 'Until' },
    maxAttemptsWord: { ar: 'حد المحاولات', en: 'Max attempts' },
    avgScoreWord: { ar: 'المعدل', en: 'Avg' },
  },

  // Row ⋮ menu entries; the shared verbs (edit/publish/archive/delete) come from the core `common.*` section.
  rowActions: {
    menuLabel: { ar: 'إجراءات {{title}}', en: 'Actions for {{title}}' },
    stats: { ar: 'الإحصائيات', en: 'Stats' },
    unpublish: { ar: 'إلغاء النشر (إعادة إلى مسودة)', en: 'Unpublish (revert to draft)' },
    hardDelete: { ar: 'حذف نهائي (تجاوز الأرشفة)', en: 'Hard delete (bypass archive)' },
  },

  // W14.3 D12 question reports triage.
  reports: {
    title: { ar: 'بلاغات الأسئلة', en: 'Question reports' },
    subtitle: { ar: 'بلاغات الطلاب عن أخطاء الأسئلة — ضمن نطاقك الأكاديمي.', en: 'Student reports about question errors — within your academic scope.' },
    statusFilterA11y: { ar: 'تصفية الحالة', en: 'Filter by status' },
    typeFilterA11y: { ar: 'تصفية النوع', en: 'Filter by type' },
    allTypes: { ar: 'كل الأنواع', en: 'All types' },
    closeA11y: { ar: 'إغلاق البلاغات', en: 'Close reports' },
    emptyFiltered: { ar: 'لا توجد بلاغات ضمن هذه التصفية.', en: 'No reports match this filter.' },
    resolutionNotes: { ar: 'ملاحظات الحل:', en: 'Resolution notes:' },
    screenshot: { ar: 'لقطة الشاشة', en: 'Screenshot' },
    resolveButton: { ar: 'حل البلاغ', en: 'Resolve' },
    rejectButton: { ar: 'رفض البلاغ', en: 'Reject' },
    resolveDialog: { ar: 'حل البلاغ', en: 'Resolve report' },
    rejectDialog: { ar: 'رفض البلاغ', en: 'Reject report' },
    notesLabel: { ar: 'ملاحظات الحل (اختياري)', en: 'Resolution notes (optional)' },
    resolveAction: { ar: 'حل', en: 'Resolve' },
    rejectAction: { ar: 'رفض', en: 'Reject' },
    resolvedToast: { ar: 'تم حل البلاغ وتوثيق الملاحظات.', en: 'Report resolved with notes recorded.' },
    rejectedToast: { ar: 'تم رفض البلاغ وتوثيق الملاحظات.', en: 'Report rejected with notes recorded.' },
  },

  // Slide-in exam editor.
  editor: {
    editTitle: { ar: 'تعديل الاختبار', en: 'Edit exam' },
    basicInfo: { ar: 'المعلومات الأساسية', en: 'Basic info' },
    titleArLabel: { ar: 'عنوان الاختبار (بالعربية)', en: 'Exam title (Arabic)' },
    titleEnLabel: { ar: 'العنوان الإنجليزي (اختياري)', en: 'English title (optional)' },
    slugLabel: { ar: 'الرابط المختصر', en: 'Slug' },
    lectureLabel: { ar: 'المحاضرة (اختياري)', en: 'Lecture (optional)' },
    descriptionLabel: { ar: 'الوصف (اختياري)', en: 'Description (optional)' },
    availabilityTitle: { ar: 'الإتاحة والتوقيت', en: 'Availability & timing' },
    passingScoreLabel: { ar: 'درجة النجاح %', en: 'Passing score %' },
    displayOrderLabel: { ar: 'ترتيب العرض', en: 'Display order' },
    maxAttemptsLabel: { ar: 'الحد الأقصى للمحاولات', en: 'Max attempts' },
    unlimitedPlaceholder: { ar: 'غير محدود', en: 'Unlimited' },
    availableFromLabel: { ar: 'متاح من', en: 'Available from' },
    availableUntilLabel: { ar: 'متاح حتى', en: 'Available until' },
    policiesTitle: { ar: 'سياسات الاختبار', en: 'Exam policies' },
    shuffleQuestions: { ar: 'ترتيب الأسئلة عشوائي', en: 'Shuffle questions' },
    shuffleOptions: { ar: 'ترتيب الخيارات عشوائي', en: 'Shuffle options' },
    showResultsAfterSubmission: { ar: 'إظهار النتيجة بعد التسليم', en: 'Show results after submission' },
    allowReview: { ar: 'السماح بالمراجعة', en: 'Allow review' },
    showCorrectAnswers: { ar: 'عرض الإجابة الصحيحة', en: 'Show correct answers' },
    showExplanations: { ar: 'عرض الشرح', en: 'Show explanations' },
    saveDraft: { ar: 'حفظ كمسودة', en: 'Save as draft' },
  },

  // Question builder (selected ↔ candidates).
  compose: {
    title: { ar: 'بناء الأسئلة', en: 'Question builder' },
    selectedTitle: { ar: 'أسئلة مختارة', en: 'Selected questions' },
    selectedEmpty: { ar: 'أضف أسئلة منشورة من القائمة المقابلة.', en: 'Add published questions from the candidate list.' },
    availableTitle: { ar: 'أسئلة متاحة', en: 'Available questions' },
    availableSubtitle: { ar: 'المنشورة والمصححة آلياً', en: 'Published, auto-graded' },
    searchPlaceholder: { ar: 'ابحث في نص السؤال', en: 'Search question text' },
    noCandidates: { ar: 'لا توجد أسئلة مؤهلة.', en: 'No eligible questions.' },
    moveUp: { ar: 'أعلى', en: 'Up' },
    moveDown: { ar: 'أسفل', en: 'Down' },
    remove: { ar: 'إزالة', en: 'Remove' },
  },

  // Per-exam results panel.
  results: {
    title: { ar: 'النتائج', en: 'Results' },
    studentCol: { ar: 'الطالب', en: 'Student' },
    scoreCol: { ar: 'الدرجة', en: 'Score' },
    resultCol: { ar: 'النتيجة', en: 'Result' },
    answeredCol: { ar: 'الإجابات', en: 'Answered' },
    correctCol: { ar: 'إجابات صحيحة', en: 'Correct answers' },
    startedCol: { ar: 'البداية', en: 'Started' },
    passed: { ar: 'ناجح', en: 'Passed' },
    failed: { ar: 'راسب', en: 'Failed' },
  },

  // W-coverage student-view preview dialog.
  preview: {
    asStudent: { ar: 'معاينة كطالب', en: 'Preview as student' },
    loading: { ar: 'جارٍ تحميل المعاينة…', en: 'Loading preview…' },
    durationChip: { ar: 'المدة: {{minutes}} دقيقة', en: 'Duration: {{minutes}} min' },
    questionsChip: { ar: 'الأسئلة: {{count}}', en: 'Questions: {{count}}' },
    note: { ar: 'هذه المعاينة كما يراها الطالب: مرتبة الأسئلة وخياراتها دون أي مؤشر للإجابات الصحيحة.', en: 'This is the student view: ordered questions and options, with no correctness indicators.' },
  },

  // Lifecycle confirm dialog (publish / unpublish / archive / delete).
  confirm: {
    publishTitle: { ar: 'نشر الاختبار', en: 'Publish exam' },
    archiveTitle: { ar: 'أرشفة الاختبار', en: 'Archive exam' },
    unpublishTitle: { ar: 'إلغاء نشر الاختبار', en: 'Unpublish exam' },
    deleteTitle: { ar: 'حذف الاختبار', en: 'Delete exam' },
    publishText: { ar: 'لا يقبل النشر إلا الأسئلة المنشورة والمؤهلة.', en: 'Only published, eligible questions can be used.' },
    archiveText: { ar: 'سيُخفى الاختبار من قائمة الطلاب.', en: 'The exam will be removed from student discovery.' },
    unpublishText: { ar: 'سيُعاد الاختبار إلى مسودة ويُخفى من الطلاب الجدد. الجلسات القائمة تحتفظ بلقطتها الحالية ولا تتأثر.', en: 'The exam reverts to draft and disappears for new students. Existing sessions keep their snapshot and are unaffected.' },
    deleteText: { ar: 'هذا الإجراء دائم. سيُحذف الاختبار نهائياً.', en: 'This action is permanent. The exam will be removed permanently.' },
    unpublishAction: { ar: 'إلغاء النشر', en: 'Unpublish' },
  },

  // onNotice messages.
  toasts: {
    savedDraft: { ar: 'تم حفظ تكوين الاختبار وترتيب أسئلته كمسودة.', en: 'Exam configuration and question order saved as a draft.' },
    published: { ar: 'تم نشر الاختبار.', en: 'Exam published.' },
    unpublished: { ar: 'تم إلغاء نشر الاختبار وإعادته إلى مسودة.', en: 'Exam unpublished and reverted to draft.' },
    archived: { ar: 'تمت أرشفة الاختبار.', en: 'Exam archived.' },
    deleted: { ar: 'تم حذف الاختبار.', en: 'Exam deleted.' },
  },

  // onError fallbacks. The Arabic-only catch/throw fallbacks gained a concise English translation in PR-3; the Arabic text is byte-identical.
  errors: {
    previewLoad: { ar: 'تعذر تحميل معاينة الاختبار.', en: 'Could not load the exam preview.' },
    availabilityWindow: { ar: 'يجب أن ينتهي نطاق الإتاحة بعد بدايته.', en: 'Availability end must be after its start.' },
    loadUniversities: { ar: 'تعذر تحميل الجامعات.', en: 'Could not load universities.' },
    loadColleges: { ar: 'تعذر تحميل الكليات.', en: 'Could not load colleges.' },
    loadYears: { ar: 'تعذر تحميل السنوات.', en: 'Could not load years.' },
    loadSemesters: { ar: 'تعذر تحميل الفصول.', en: 'Could not load semesters.' },
    loadSubjects: { ar: 'تعذر تحميل المواد.', en: 'Could not load subjects.' },
    loadLectures: { ar: 'تعذر تحميل المحاضرات.', en: 'Could not load lectures.' },
    loadExams: { ar: 'تعذر تحميل الاختبارات.', en: 'Could not load exams.' },
    loadCandidates: { ar: 'تعذر تحميل الأسئلة المؤهلة للاختبار.', en: 'Could not load exam-eligible questions.' },
    openExam: { ar: 'تعذر فتح الاختبار.', en: 'Could not open the exam.' },
    missingExamId: { ar: 'لم يعُد الخادم بمعرف الاختبار.', en: 'The server did not return an exam id.' },
    saveExam: { ar: 'تعذر حفظ الاختبار.', en: 'Could not save the exam.' },
    updateStatus: { ar: 'تعذر تحديث حالة الاختبار.', en: 'Could not update the exam status.' },
    deleteExam: { ar: 'تعذر حذف الاختبار.', en: 'Could not delete the exam.' },
    loadResults: { ar: 'تعذر تحميل نتائج الاختبار.', en: 'Could not load the exam results.' },
    loadStats: { ar: 'تعذر تحميل إحصائيات الاختبار.', en: 'Could not load the exam statistics.' },
    loadReports: { ar: 'تعذر تحميل بلاغات الأسئلة.', en: 'Could not load question reports.' },
    actOnReport: { ar: 'تعذر تنفيذ إجراء البلاغ.', en: 'Could not apply the report action.' },
  },

  // Command Center P1 physical-delete consequence (SuperAdmin).
  hardDelete: {
    consequence: { ar: 'سيُحذف الاختبار نهائيًا من قاعدة البيانات (تجاوز الأرشفة) مع جلساته ونتائجه المرتبطة.', en: 'The exam is physically deleted (bypassing archive) with its sessions and results.' },
  },

  // ExamCoursesCenter (W14.3 D1 exam-course bundles).
  examCourses: {
    header: {
      kicker: { ar: 'الدورات الامتحانية', en: 'Exam courses' },
      title: { ar: 'باقات الاختبارات القابلة للبيع', en: 'Purchasable exam bundles' },
      subtitle: { ar: 'أنشئ دورات امتحانية لمادة واحدة، رتّب اختباراتها، وانشرها في المتجر.', en: 'Create per-subject bundles, order their exams, and publish them to the storefront.' },
      newBundle: { ar: 'دورة جديدة', en: 'New bundle' },
    },

    filters: {
      pickSubject: { ar: 'اختر مادة لإدارة دوراتها الامتحانية.', en: 'Select a subject to manage its exam bundles.' },
    },

    // Bundle course types (R78 wire values).
    courseType: {
      first: { ar: 'دورة أولى', en: 'First diet' },
      second: { ar: 'دورة ثانية', en: 'Second diet' },
      supplementary: { ar: 'دورة تكميلية', en: 'Supplementary' },
      model: { ar: 'دورة نموذجية', en: 'Model papers' },
      practice: { ar: 'دورة تدريبية', en: 'Practice drills' },
    },

    // `deleted` is an ExamCourses-only wire value (published/archived/draft ride the publication registry).
    status: {
      deleted: { ar: 'محذوف', en: 'Deleted' },
    },

    semester: {
      first: { ar: 'الفصل الأول', en: 'Semester 1' },
      second: { ar: 'الفصل الثاني', en: 'Semester 2' },
      third: { ar: 'الفصل الثالث / صيفي', en: 'Semester 3 / summer' },
      generic: { ar: 'الفصل {{value}}', en: 'Semester {{value}}' },
    },

    pricing: {
      label: { ar: 'السعر', en: 'Pricing' },
      free: { ar: 'مجاني', en: 'Free' },
      paid: { ar: 'مدفوع', en: 'Paid' },
    },

    modelWord: { ar: 'نموذج', en: 'Model' },
    editor: {
      backToList: { ar: 'رجوع إلى القائمة', en: 'Back to list' },
      newTitle: { ar: 'دورة امتحانية جديدة', en: 'New exam bundle' },
      editTitle: { ar: 'تعديل: {{name}}', en: 'Edit: {{name}}' },
      createBundle: { ar: 'إنشاء الدورة', en: 'Create bundle' },
      saveChanges: { ar: 'حفظ التعديلات', en: 'Save changes' },
      metadataTitle: { ar: 'بيانات الدورة', en: 'Bundle metadata' },
      nameArLabel: { ar: 'الاسم بالعربية *', en: 'Arabic name *' },
      nameArPlaceholder: { ar: 'مثال: دورة امتحانات نصف السنة', en: 'e.g. Midterm exams bundle' },
      nameEnLabel: { ar: 'الاسم بالإنجليزية', en: 'English name' },
      descriptionLabel: { ar: 'الوصف', en: 'Description' },
      yearLabel: { ar: 'السنة *', en: 'Year *' },
      semesterLabel: { ar: 'الفصل *', en: 'Semester *' },
      typeLabel: { ar: 'نوع الدورة *', en: 'Bundle type *' },
      sortOrderLabel: { ar: 'ترتيب الظهور', en: 'Display sort order' },
      coverLabel: { ar: 'صورة الغلاف', en: 'Cover image' },
      coverAlt: { ar: 'غلاف الدورة', en: 'Bundle cover' },
      removeCoverA11y: { ar: 'إزالة الغلاف', en: 'Remove cover' },
      uploadImage: { ar: 'رفع صورة', en: 'Upload image' },
      coverUrlPlaceholder: { ar: 'أو الصق رابط الصورة', en: 'or paste an image URL' },
      examsTitle: { ar: 'اختبارات الدورة ({{count}})', en: 'Bundle exams ({{count}})' },
      addExam: { ar: 'إضافة اختبار', en: 'Add exam' },
      noExams: { ar: 'لا توجد اختبارات في الدورة بعد — أضف أول اختبار من بنك المادة.', en: 'No exams in this bundle yet — add the first one from the subject bank.' },
      moveUp: { ar: 'تحريك لأعلى', en: 'Move up' },
      moveDown: { ar: 'تحريك لأسفل', en: 'Move down' },
      removeExam: { ar: 'إزالة الاختبار', en: 'Remove exam' },
      createFirstHint: { ar: 'أنشئ الدورة أولاً — بعدها يمكنك إضافة اختبارات المادة وترتيبها.', en: 'Create the bundle first — then you can add and order the subject exams.' },
    },

    list: {
      empty: { ar: 'لا توجد دورات امتحانية', en: 'No exam bundles' },
      emptyHint: { ar: 'أنشئ أول دورة لهذه المادة بزر «دورة جديدة».', en: 'Create the first bundle for this subject with "New bundle".' },
      bundleCol: { ar: 'الدورة', en: 'Bundle' },
      yearSemesterCol: { ar: 'السنة / الفصل', en: 'Year / Semester' },
      examsCol: { ar: 'الاختبارات', en: 'Exams' },
    },

    actions: {
      manage: { ar: 'إدارة الدورة', en: 'Manage bundle' },
      preview: { ar: 'معاينة', en: 'Preview' },
    },

    // Exam picker modal (edit mode).
    picker: {
      dialogA11y: { ar: 'إضافة اختبار إلى الدورة', en: 'Add exam to bundle' },
      title: { ar: 'إضافة اختبار من بنك المادة', en: 'Add an exam from the subject bank' },
      searchPlaceholder: { ar: 'ابحث بعنوان الاختبار', en: 'Search by exam title' },
      empty: { ar: 'لا توجد اختبارات متاحة للإضافة — كل اختبارات المادة مضافة بالفعل.', en: 'Nothing left to add — every subject exam is already in the bundle.' },
      add: { ar: 'إضافة', en: 'Add' },
    },

    // Student storefront preview modal.
    preview: {
      dialogA11y: { ar: 'معاينة: {{name}}', en: 'Preview: {{name}}' },
      examsTitle: { ar: 'اختبارات الدورة ({{count}}) — بترتيب ظهورها للطالب', en: 'Bundle exams ({{count}}) — in student order' },
      noExams: { ar: 'لا توجد اختبارات في هذه الدورة بعد.', en: 'No exams in this bundle yet.' },
    },

    confirm: {
      publishTitle: { ar: 'نشر الدورة الامتحانية', en: 'Publish bundle' },
      archiveTitle: { ar: 'أرشفة الدورة الامتحانية', en: 'Archive bundle' },
      deleteTitle: { ar: 'حذف الدورة الامتحانية', en: 'Delete bundle' },
      publishText: { ar: 'ستصبح الدورة ظاهرة في متجر الطلاب حسب اشتراكاتهم.', en: 'The bundle becomes visible in the student storefront per subscriptions.' },
      archiveText: { ar: 'ستُخفى الدورة من قائمة الطلاب مع الحفاظ على بياناتها.', en: 'The bundle is hidden from students; its data is preserved.' },
      deleteText: { ar: 'هذا الإجراء دائم. سيُحذف محتوى الدورة من المتجر.', en: 'This action is permanent. The bundle content is removed from the storefront.' },
    },

    toasts: {
      saved: { ar: 'تم حفظ بيانات الدورة.', en: 'Bundle saved.' },
      created: { ar: 'تم إنشاء الدورة الامتحانية — أضف اختباراتها من زر إدارة الاختبارات.', en: 'Bundle created — manage its exams next.' },
      published: { ar: 'تم نشر الدورة — ستظهر للطلاب المخوّلين.', en: 'Bundle published for entitled students.' },
      archived: { ar: 'تمت أرشفة الدورة وإخفاؤها عن الطلاب.', en: 'Bundle archived and hidden from students.' },
      deleted: { ar: 'تم حذف الدورة الامتحانية.', en: 'Bundle deleted.' },
      examAdded: { ar: 'تمت إضافة الاختبار إلى الدورة.', en: 'Exam added to the bundle.' },
      examRemoved: { ar: 'تمت إزالة الاختبار من الدورة.', en: 'Exam removed from the bundle.' },
      coverAttached: { ar: 'تم إرفاق صورة الغلاف.', en: 'Cover image attached.' },
    },

    errors: {
      invalidYear: { ar: 'السنة يجب أن تكون رقماً صحيحاً (2000-2100).', en: 'Year must be a valid number (2000-2100).' },
      notAnImage: { ar: 'الملف المرفق ليس صورة.', en: 'The attached file is not an image.' },
      imageTooLarge: { ar: 'حجم الصورة يتجاوز 5 ميغابايت.', en: 'The image exceeds the 5 MB limit.' },
      storageUpload: { ar: 'فشل رفع الملف إلى التخزين ({{status}}).', en: 'Storage upload failed ({{status}}).' },
      missingPublicBase: { ar: 'تم رفع الصورة، لكن رابطها العام غير قابل للتوليد — اضبط VITE_R2_PUBLIC_BASE ثم أعد الإرفاق، أو الصق رابط الصورة يدوياً.', en: 'Image uploaded, but its public URL cannot be derived — set VITE_R2_PUBLIC_BASE and re-attach, or paste the image URL manually.' },
      loadCourses: { ar: 'تعذر تحميل الدورات الامتحانية.', en: 'Could not load exam bundles.' },
      loadPicker: { ar: 'تعذر تحميل قائمة الاختبارات.', en: 'Could not load the exam list.' },
      saveCourse: { ar: 'تعذر حفظ الدورة الامتحانية.', en: 'Could not save the exam bundle.' },
      lifecycle: { ar: 'تعذر تنفيذ الإجراء.', en: 'Could not apply the action.' },
      deleteCourse: { ar: 'تعذر حذف الدورة.', en: 'Could not delete the bundle.' },
      loadDetail: { ar: 'تعذر تحميل بيانات الدورة.', en: 'Could not load the bundle details.' },
      loadPreview: { ar: 'تعذر تحميل معاينة الدورة.', en: 'Could not load the bundle preview.' },
      addExam: { ar: 'تعذر إضافة الاختبار.', en: 'Could not add the exam.' },
      removeExam: { ar: 'تعذر إزالة الاختبار.', en: 'Could not remove the exam.' },
      reorder: { ar: 'تعذر إعادة الترتيب.', en: 'Could not reorder the exams.' },
      uploadCover: { ar: 'تعذر رفع صورة الغلاف.', en: 'Could not upload the cover image.' },
    },

    cover: {
      defaultTitle: { ar: 'غلاف دورة امتحانية', en: 'Exam-course cover' },
    },

  },
} as const satisfies DictSection;
