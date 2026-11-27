/**
 * PR-3 — courses dictionary section (filled by the center migration).
 * Strings are moved BYTE-IDENTICAL from the component ternaries/copy
 * objects into this section; the components then read them through
 * `t(locale, 'courses.key')`.
 *
 * Sections:
 *   • flat keys      — CoursesCenter toolbar/table/course-form copy (the main
 *                      component's `copy` object, key for key) + the shared
 *                      episode vocabulary reused by the EpisodesManager
 *                      `buildCopy()` builder;
 *   • courseStatus   — the course badge labels (the local statusLabel helper);
 *   • confirm        — lifecycle/delete/hard-delete dialogs + row actions;
 *   • feedback       — toasts and catch fallbacks;
 *   • manager        — EpisodesManager `buildCopy()` keys that differ from the
 *                      shared flat vocabulary;
 *   • upload         — SinglePutUploadPanel (copy2 + the state-machine copy);
 *   • episodeEdit    — EpisodeEditModal;
 *   • metadataFields — EpisodeMetadataFields;
 *   • content        — ContentCenter.
 */
import type { DictSection } from './types';

export const coursesDict = {
  // ===== CoursesCenter — toolbar, table, course form drawers (`copy` object) =====
  title: { ar: 'الكورسات', en: 'Courses' },
  desc: { ar: 'إنشاء وإدارة كورسات الفيديو وحلقاتها (رفع وسائط حتى 2.5GB أو يوتيوب).', en: 'Create and manage video courses and their episodes (media upload up to 2.5GB, or YouTube).' },
  create: { ar: 'إنشاء كورس', en: 'Create course' },
  refresh: { ar: 'تحديث', en: 'Refresh' },
  // PR-5 — server-side list filters (search + status) and the shared pager.
  filterSearch: { ar: 'ابحث في الكورسات بالعنوان…', en: 'Search courses by title…' },
  filterAll: { ar: 'كل الحالات', en: 'All statuses' },
  pagerPrev: { ar: 'السابق', en: 'Previous' },
  pagerNext: { ar: 'التالي', en: 'Next' },
  pagerNavLabel: { ar: 'تصفح صفحات الكورسات', en: 'Browse course pages' },
  pagerPageOf: { ar: 'صفحة {{page}} من {{total}}', en: 'Page {{page}} of {{total}}' },
  episodes: { ar: 'حلقات', en: 'Episodes' },
  episodesCount: { ar: 'الحلقات', en: 'Episodes' },
  views: { ar: 'مشاهدات', en: 'Views' },
  created: { ar: 'تاريخ الإنشاء', en: 'Created' },
  status: { ar: 'الحالة', en: 'Status' },
  subject: { ar: 'المادة', en: 'Subject' },
  actions: { ar: 'إجراءات', en: 'Actions' },
  publish: { ar: 'نشر', en: 'Publish' },
  archive: { ar: 'أرشفة', en: 'Archive' },
  delete: { ar: 'حذف', en: 'Delete' },
  edit: { ar: 'تعديل', en: 'Edit' },
  noSubject: { ar: 'اختر مادة من التدرج الأكاديمي أعلاه لعرض كورساتها أو إنشاء كورس جديد.', en: 'Pick a subject in the hierarchy above to list or create its courses.' },
  noCourses: { ar: 'لا توجد كورسات في هذه المادة بعد.', en: 'No courses in this subject yet.' },
  formTitle: { ar: 'عنوان الكورس', en: 'Course title' },
  formDesc: { ar: 'الوصف', en: 'Description' },
  formCover: { ar: 'رابط صورة الغلاف (اختياري)', en: 'Cover image URL (optional)' },
  save: { ar: 'حفظ', en: 'Save' },
  cancel: { ar: 'إلغاء', en: 'Cancel' },
  createCourse: { ar: 'إنشاء كورس جديد', en: 'Create new course' },
  editCourse: { ar: 'تعديل الكورس', en: 'Edit course' },
  // Shared episode vocabulary (main copy + EpisodesManager buildCopy — byte-identical).
  addEpisode: { ar: 'إضافة حلقة', en: 'Add episode' },
  youtubeId: { ar: 'معرّف فيديو يوتيوب', en: 'YouTube video id' },
  episodeTitle: { ar: 'عنوان الحلقة', en: 'Episode title' },
  episodeNumber: { ar: 'رقم الحلقة', en: 'Episode number' },
  duration: { ar: 'المدة (ثانية، اختياري)', en: 'Duration (seconds, optional)' },
  add: { ar: 'إضافة', en: 'Add' },
  uploadVideo: { ar: 'رفع وسائط (فيديو/صوت)', en: 'Upload media (video/audio)' },
  uploading: { ar: 'جارٍ الرفع…', en: 'Uploading…' },
  abort: { ar: 'إلغاء الرفع', en: 'Abort upload' },
  incomplete: { ar: 'لم يكتمل الرفع', en: 'Upload incomplete' },
  ready: { ar: 'جاهز', en: 'Ready' },
  close: { ar: 'إغلاق', en: 'Close' },
  selectFile: { ar: 'اختر ملف الفيديو أو الصوت', en: 'Choose a video or audio file' },
  deleteEpisode: { ar: 'حذف الحلقة', en: 'Delete episode' },

  // ===== Course status badge (the local statusLabel helper) =====
  courseStatus: {
    published: { ar: 'منشور', en: 'Published' },
    archived: { ar: 'مؤرشف', en: 'Archived' },
    draft: { ar: 'مسودة', en: 'Draft' },
  },

  // ===== Confirm dialogs, row actions, hard delete =====
  confirm: {
    publishTitle: { ar: 'نشر الكورس', en: 'Publish course' },
    archiveTitle: { ar: 'أرشفة الكورس', en: 'Archive course' },
    unpublishTitle: { ar: 'إلغاء نشر الكورس', en: 'Unpublish course' },
    duplicateTitle: { ar: 'نسخ الكورس', en: 'Duplicate course' },
    restoreTitle: { ar: 'استعادة الكورس', en: 'Restore course' },
    publishDescription: { ar: 'سيصبح الكورس "{{title}}" مع جميع حلقاته مرئيًا لجميع الطلاب.', en: '"{{title}}" and all its episodes will become visible to all students.' },
    archiveDescription: { ar: 'سيُخفى الكورس "{{title}}" من اكتشاف الطلاب. يمكن استعادته بالنشر لاحقًا.', en: '"{{title}}" will be hidden from student discovery. It can be re-published later.' },
    unpublishDescription: { ar: 'سيُعاد الكورس "{{title}}" إلى مسودة ويُخفى من الطلاب. الحلقات ومشاهداتها ومفضلات الطلاب تبقى دون تغيير، وإعادة النشر خطوة منفصلة.', en: '"{{title}}" reverts to draft and disappears from students. Episodes, views and student favorites stay untouched; republishing is a separate step.' },
    duplicateDescription: { ar: 'ستُنشأ مسودة جديدة تحمل بيانات الكورس "{{title}}" فقط — بدون الحلقات (كل حلقة تملك ملفها المخزن ولا يجوز أن تتشاركه نسختان).', en: 'A new draft is created with the metadata of "{{title}}" only — no episodes (each episode owns its stored file; two copies must never share it).' },
    restoreDescription: { ar: 'سيُعاد الكورس المؤرشف "{{title}}" إلى مسودة. إعادة النشر خطوة منفصلة تعيد التحقق من اكتمال الحلقات.', en: 'The archived course "{{title}}" returns to draft. Republish is a separate step that re-validates episode completeness.' },
    deleteTitle: { ar: 'حذف الكورس نهائيًا', en: 'Permanently delete course' },
    deleteDescription: { ar: 'سيُحذف الكورس "{{title}}" نهائيًا مع جميع حلقاته وملفات الفيديو المخزنة. لا يمكن التراجع عن هذا الإجراء.', en: '"{{title}}" will be permanently deleted together with all its episodes and stored videos. This cannot be undone.' },
    deleteAcknowledge: { ar: 'أفهم أن الحذف نهائي ولا يمكن التراجع عنه', en: 'I understand this deletion is permanent and cannot be undone' },
    hardDeleteAction: { ar: 'حذف نهائي (تجاوز الأرشفة)', en: 'Hard delete (bypass archive)' },
    hardDeleteConsequence: { ar: 'سيُحذف الكورس نهائيًا مع جميع حلقاته (تجاوز الأرشفة).', en: 'The course is physically deleted with all its episodes (bypassing archive).' },
    rowActionsLabel: { ar: 'إجراءات {{title}}', en: 'Actions for {{title}}' },
    rowDuplicate: { ar: 'نسخ كمسودة', en: 'Duplicate as draft' },
    rowUnpublish: { ar: 'إلغاء النشر (إعادة إلى مسودة)', en: 'Unpublish (revert to draft)' },
    rowRestore: { ar: 'استعادة من الأرشفة', en: 'Restore from archive' },
    episodeDeleteDescription: { ar: 'سيُحذف الحلقة "{{title}}"{{storedVideo}} نهائيًا. لا يمكن التراجع عن هذا الإجراء.', en: '"{{title}}"{{storedVideo}} will be permanently deleted. This cannot be undone.' },
    episodeDeleteStoredVideo: { ar: ' مع ملف الفيديو المخزن', en: ' and its stored video' },
  },

  // ===== PR-5 — usage/dependency warnings (real numbers from the usage endpoint) =====
  usage: {
    loading: { ar: 'جارٍ تحميل بيانات الاستخدام…', en: 'Loading usage data…' },
    episodes: { ar: 'عدد الحلقات: {{count}}', en: 'Episodes: {{count}}' },
    views: { ar: 'إجمالي المشاهدات: {{count}}', en: 'Total views: {{count}}' },
    favorites: { ar: 'مفضلات الطلاب لهذه الحلقات: {{count}}', en: 'Student favorites on these episodes: {{count}}' },
    inFlight: { ar: 'يوجد رفع غير مكتمل — سيُلغى تلقائيًا مع الحذف.', en: 'An incomplete upload exists — it is aborted automatically with the delete.' },
    warning: { ar: 'مؤشرات الاعتماد الحقيقية قبل الأرشفة أو الحذف — مراجعة الطلاب لهذا المحتوى ستتوقف.', en: 'Real dependency indicators before archive/delete — student access to this content stops.' },
  },

  // ===== Toasts & catch fallbacks =====
  feedback: {
    loadFailed: { ar: 'تعذر تحميل الكورسات.', en: 'Failed to load courses.' },
    createValidation: { ar: 'اختر مادة وأدخل عنوان الكورس.', en: 'Select a subject and enter a course title.' },
    created: { ar: 'تم إنشاء الكورس "{{title}}".', en: 'Course "{{title}}" created.' },
    createFailed: { ar: 'فشل إنشاء الكورس.', en: 'Failed to create course.' },
    updated: { ar: 'تم حفظ تعديلات الكورس.', en: 'Course updated.' },
    updateFailed: { ar: 'فشل حفظ التعديلات.', en: 'Failed to update.' },
    publishToast: { ar: 'تم نشر الكورس "{{title}}".', en: 'Course "{{title}}" published.' },
    archiveToast: { ar: 'تمت أرشفة الكورس "{{title}}".', en: 'Course "{{title}}" archived.' },
    unpublishToast: { ar: 'أُعيد الكورس "{{title}}" إلى مسودة.', en: 'Course "{{title}}" reverted to draft.' },
    duplicateToast: { ar: 'أُنشئت نسخة مسودة من الكورس "{{title}}" — أضف حلقاتها من محرر الحلقات.', en: 'Draft copy of "{{title}}" created — add its episodes from the episode manager.' },
    restoreToast: { ar: 'أُعيد الكورس "{{title}}" من الأرشيف إلى مسودة.', en: 'Course "{{title}}" restored from archive to draft.' },
    usageLoadFailed: { ar: 'تعذر تحميل بيانات الاستخدام.', en: 'Could not load usage data.' },
    deleteToast: { ar: 'تم حذف الكورس "{{title}}".', en: 'Course "{{title}}" deleted.' },
    deleteFailed: { ar: 'فشل حذف الكورس.', en: 'Failed to delete course.' },
    actionFailed: { ar: 'فشل الإجراء.', en: 'Action failed.' },
    youtubeValidation: { ar: 'أكمل عنوان الحلقة ورقمها ومعرّف اليوتيوب.', en: 'Fill episode title, number and YouTube id.' },
    youtubeAdded: { ar: 'تمت إضافة حلقة اليوتيوب.', en: 'YouTube episode added.' },
    episodeDeleted: { ar: 'تم حذف الحلقة.', en: 'Episode deleted.' },
    uploadValidation: { ar: 'اختر ملف الفيديو وأدخل عنوان الحلقة ورقمها.', en: 'Choose a video file, episode title and number.' },
    unrecognizedMediaType: { ar: 'لا يمكن التعرّف على نوع الملف «{{fileName}}» — الصيغ المدعومة: MP4, WebM, MOV, MP3, M4A, WAV.', en: 'Unrecognized media type "{{fileName}}" — supported formats: MP4, WebM, MOV, MP3, M4A, WAV.' },
    uploadAborted: { ar: 'تم إلغاء الرفع وحذف الحلقة غير المكتملة.', en: 'Upload aborted; the incomplete episode was removed.' },
    processingTimeout: { ar: 'استغرق الترميز وقتاً طويلاً جداً. يرجى المحاولة مرة أخرى أو التواصل مع الدعم.', en: 'Transcoding is taking too long. Please try again or contact support.' },
    processingFailed: { ar: 'فشلت معالجة الفيديو على الخادم.', en: 'Server-side video processing failed.' },
    processingFailedHuman: { ar: 'تعذّر تجهيز نسخ المشاهدة لهذه الحلقة على الخادم.', en: 'The server could not prepare watchable copies for this episode.' },
    processingCancelled: { ar: 'تم إلغاء معالجة هذا الفيديو بناءً على طلبك. لإعادة المحاولة، عدّل الحلقة أو ارفع ملفاً جديداً.', en: 'Processing was cancelled at your request. To retry, edit the episode or upload a new file.' },
    processingCancelledToast: { ar: 'تم إلغاء المعالجة — الحلقة الآن بحالة «فشلت المعالجة».', en: 'Processing aborted — the episode is now marked Failed.' },
    // Previously an Arabic-only inline literal (describeUploadError) — both locales now.
    uploadTransientError: { ar: 'حدث خطأ مؤقت في الخادم أثناء الرفع — أعد المحاولة، وإن استمر الخطأ فتحقّق من الاتصال ثم أعد المحاولة لاحقاً.', en: 'A transient server error occurred during the upload — retry, and if it persists check the connection and try again later.' },
  },

  // ===== EpisodesManager (buildCopy keys that differ from the shared vocabulary) =====
  manager: {
    episodes: { ar: 'الحلقات', en: 'Episodes' },
    retry: { ar: 'إعادة المحاولة', en: 'Retry' },
    retrying: { ar: 'إعادة المحاولة…', en: 'Retrying…' },
    editEpisode: { ar: 'تعديل بيانات الحلقة', en: 'Edit episode' },
    processingChip: { ar: 'المعالجة', en: 'Processing' },
  },

  // ===== SinglePutUploadPanel (copy2 + the human state machine) =====
  upload: {
    start: { ar: 'بدء الرفع', en: 'Start upload' },
    another: { ar: 'رفع وسائط أخرى', en: 'Upload another media file' },
    details: { ar: 'عرض التفاصيل التقنية', en: 'View technical details' },
    initiating: { ar: 'جارٍ تهيئة رابط الرفع…', en: 'Requesting the upload URL…' },
    completing: { ar: 'جارٍ التحقق من الملف المرفوع…', en: 'Verifying the uploaded file…' },
    readyTitle: { ar: 'الفيديو جاهز للمشاهدة ✅', en: 'The video is ready to watch ✅' },
    readyBody: { ar: 'اكتملت المعالجة — يمكنك رفع وسائط أخرى أو إغلاق اللوحة.', en: 'Processing finished — you can upload another media file or close the panel.' },
    failedTitle: { ar: 'تعذّر إتمام الرفع', en: 'Upload failed' },
    cancelledTitle: { ar: 'تم إلغاء المعالجة', en: 'Processing cancelled' },
    cancelledStatusHint: { ar: 'الحالة على الخادم: «فشلت المعالجة» — إعادة المحاولة تكون برفع جديد أو بعد تعديل الحلقة.', en: 'Server status: Processing failed — retry with a new upload or after editing the episode.' },
    retryHint: { ar: 'اضغط «إعادة المحاولة» لإعادة إرسال الملف كاملاً — لا توجد أجزاء محفوظة في الرفع الأحادي. إن استمر خطأ 403 فانتهت صلاحية الرابط: ألغِ الرفع وابدأ من جديد.', en: 'Press Retry to re-send the entire file — a single PUT keeps no partial parts. A persistent 403 means the URL expired: cancel and start a fresh upload.' },
    restartHint: { ar: 'اضغط «بدء الرفع» لإعادة المحاولة.', en: 'Press Start upload to try again.' },
    cancelProcessing: { ar: 'إلغاء المعالجة', en: 'Cancel processing' },
  },

  // ===== EpisodeEditModal =====
  episodeEdit: {
    number: { ar: 'رقم الحلقة', en: 'Episode number' },
    duration: { ar: 'المدة (ثانية، اختياري)', en: 'Duration (seconds, optional)' },
    save: { ar: 'حفظ التعديلات', en: 'Save changes' },
    cancel: { ar: 'إلغاء', en: 'Cancel' },
    heading: { ar: 'تعديل بيانات الحلقة', en: 'Edit episode' },
    sub: { ar: 'العنوان والوصف ومستوى الصعوبة يظهرون للطالب في صفحة المشغّل', en: 'Title, description and difficulty are shown to the student on the player page' },
    saved: { ar: 'تم حفظ بيانات الحلقة.', en: 'Episode updated.' },
    updateFailed: { ar: 'فشل حفظ التعديلات.', en: 'Failed to update episode.' },
  },

  // ===== EpisodeMetadataFields =====
  metadataFields: {
    titleLabel: { ar: 'عنوان الحلقة', en: 'Episode title' },
    // The legacy copy carried an explicit English label for the Arabic
    // placeholder branch — preserved byte-identically (same text both locales).
    titleLabelEn: { ar: 'Episode title', en: 'Episode title' },
    descriptionLabel: { ar: 'الوصف (اختياري)', en: 'Description (optional)' },
    difficultyLabel: { ar: 'مستوى الصعوبة', en: 'Difficulty' },
    qualityLabel: { ar: 'جودة المعالجة', en: 'Processing quality' },
    titleRequired: { ar: 'العنوان مطلوب', en: 'Title is required' },
    descriptionPlaceholder: { ar: 'وصف مختصر لمحتوى الحلقة — يظهر للطالب أسفل المشغّل', en: 'A short description of the episode — shown to the student under the player' },
  },

  // ===== ContentCenter =====
  content: {
    title: { ar: 'صفحات المحتوى', en: 'Content Pages' },
    description: { ar: 'تحرير شروط الاستخدام وسياسة الخصوصية وصفحة التواصل — تظهر للطلاب مباشرة بعد الحفظ.', en: 'Edit Terms, Privacy and Contact — students see changes immediately after save.' },
    loadFailed: { ar: 'تعذّر تحميل صفحات المحتوى', en: 'Could not load content pages' },
    saved: { ar: 'تم حفظ الصفحة بنجاح', en: 'Page saved' },
    saveFailed: { ar: 'تعذّر حفظ الصفحة. حاول مجدداً.', en: 'Could not save the page. Try again.' },
    lastUpdated: { ar: 'آخر تحديث', en: 'Updated' },
    edit: { ar: 'تحرير', en: 'Edit' },
    empty: { ar: 'لا توجد صفحات محتوى بعد.', en: 'No content pages yet.' },
  },
} as const satisfies DictSection;
