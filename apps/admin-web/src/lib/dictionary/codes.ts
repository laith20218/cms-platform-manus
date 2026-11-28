/**
 * PR-3 — codes dictionary section (filled by the center migration).
 * Strings are moved BYTE-IDENTICAL from the component ternaries/copy
 * objects into this section; the component then reads them through
 * `t(locale, 'codes.key')`.
 *
 * Covers:
 *   • CodesCenter (access-code ledger, generate/redemptions/activate/revoke
 *     modals, bulk revoke confirm, toasts);
 *   • OfflineCenter (offline question-package ledger) under `offline`.
 *
 * The known code/redemption statuses themselves live in the central status
 * registry (`statusLabel(locale, 'codeStatus' | 'redemptionStatus', …)`);
 * only the legacy «unknown» labels live here (see `statuses` below).
 */
import type { DictSection } from './types';

export const codesDict = {
  // ===== Cross-modal shared labels (Cancel/Close/Activate/Revoke + revoke-reason copy) =====
  cancel: { ar: 'إلغاء', en: 'Cancel' },
  loading: { ar: 'جارٍ تحميل التفاصيل…', en: 'Loading details…' },
  close: { ar: 'إغلاق', en: 'Close' },
  activate: { ar: 'تفعيل', en: 'Activate' },
  revoke: { ar: 'إبطال', en: 'Revoke' },
  confirmRevoke: { ar: 'تأكيد الإبطال', en: 'Confirm revoke' },
  revokeReason: { ar: 'سبب الإبطال', en: 'Revoke reason' },
  revokeReasonPlaceholder: { ar: 'سبب واضح وآمن للتدقيق.', en: 'A clear, audit-safe reason.' },
  redemptionDetail: { ar: 'تفاصيل التفعيلات', en: 'Redemption detail' },

  // ===== Header =====
  header: {
    eyebrow: { ar: 'سياسة الوصول', en: 'Access policy' },
    title: { ar: 'رموز الوصول', en: 'Access codes' },
    subtitle: { ar: 'سجل واحد خفيف: إنشاء من نافذة مركّزة، وتصفية حسب السنة والمادة، وتفصيل كل تفعيل.', en: 'One light ledger: focused create modal, year/subject filters, per-redemption detail.' },
    refresh: { ar: 'تحديث', en: 'Refresh' },
    generate: { ar: 'إنشاء رموز', en: 'Generate codes' },
  },

  // ===== Ledger panel + filters =====
  ledger: {
    eyebrow: { ar: 'سجل الرموز', en: 'Code ledger' },
    title: { ar: 'الأكواد والتفعيلات', en: 'Codes & redemptions' },
    exportCsv: { ar: 'تصدير CSV', en: 'Export CSV' },
    revokeSelected: { ar: 'إبطال المحدد', en: 'Revoke selected' },
    search: { ar: 'بحث', en: 'Search' },
    searchPlaceholder: { ar: 'بحث بالكود...', en: 'Search by code...' },
    allStatuses: { ar: 'كل الحالات', en: 'All status' },
    // Filter dropdown copy (byte-identical to the pre-PR-3 options — note the
    // legacy «ملغي» wording, distinct from the chip glossary «مُبطَل»).
    statusActive: { ar: 'نشط', en: 'Active' },
    statusUsed: { ar: 'مستخدم', en: 'Used' },
    statusRevoked: { ar: 'ملغي', en: 'Revoked' },
    statusExpired: { ar: 'منتهي', en: 'Expired' },
    allScopes: { ar: 'كل النطاقات', en: 'All scopes' },
    // PR-10 a11y — accessible names for the two native filter selects.
    statusFilter: { ar: 'تصفية الحالة', en: 'Status filter' },
    scopeFilter: { ar: 'تصفية النطاق', en: 'Scope filter' },
    scopeSubject: { ar: 'مادة', en: 'Subject' },
    scopeYear: { ar: 'سنة', en: 'Year' },
    scopeSemester: { ar: 'فصل', en: 'Semester' },
    scopeCollege: { ar: 'كلية', en: 'College' },
    scopeUniversity: { ar: 'جامعة', en: 'University' },
    academicFilter: { ar: 'تصفية أكاديمية:', en: 'Academic filter:' },
    university: { ar: 'الجامعة', en: 'University' },
    college: { ar: 'الكلية', en: 'College' },
    allYears: { ar: 'كل السنوات', en: 'All years' },
    allSemesters: { ar: 'كل الفصول', en: 'All semesters' },
    allSubjects: { ar: 'كل المواد', en: 'All subjects' },
    clearAcademic: { ar: 'مسح الأكاديمية', en: 'Clear academic' },
    empty: { ar: 'لا توجد رموز ضمن نطاقك.', en: 'No codes exist in your scope.' },
  },

  // ===== Ledger row =====
  row: {
    selectCode: { ar: 'تحديد {{code}}', en: 'Select {{code}}' },
    copy: { ar: 'نسخ', en: 'Copy' },
    publicCode: { ar: 'عام', en: 'Public' },
    privateCode: { ar: 'خاص', en: 'Private' },
    redemptionCount: { ar: '{{count}} تفعيل — اضغط العين للتفاصيل', en: '{{count}} redemption(s) — open the eye for detail' },
    viewDetails: { ar: 'عرض التفاصيل', en: 'View details' },
    rowActionsLabel: { ar: 'إجراءات الرمز {{code}}', en: 'Actions for code {{code}}' },
    noRedemptionsYet: { ar: 'لم يُفعَّل بعد', en: 'No redemptions yet' },
    activateForStudent: { ar: 'تفعيل يدوي لطالب', en: 'Activate for student' },
    revokeAll: { ar: 'إبطال شامل', en: 'Revoke all' },
  },

  // ===== Generate modal =====
  generateModal: {
    title: { ar: 'إنشاء رموز وصول', en: 'Generate access codes' },
    subtitle: { ar: 'نطاق مضبوط ونوع محتوى محدد لكل دفعة.', en: 'A controlled scope and content type per batch.' },
    contentScope: { ar: 'نوع المحتوى', en: 'Content scope' },
    publicFreeCode: { ar: 'رمز عام مجاني', en: 'Public free code' },
    publicFreeCodeNote: { ar: 'يمكن لكل طالب مسجّل استرداده مرة واحدة.', en: 'Each registered student may redeem it once.' },
    academicYear: { ar: 'السنة', en: 'Academic year' },
    chooseUniversity: { ar: 'اختر الجامعة', en: 'Choose university' },
    chooseCollege: { ar: 'اختر الكلية', en: 'Choose college' },
    chooseYear: { ar: 'اختر السنة', en: 'Choose year' },
    semester: { ar: 'الفصل', en: 'Semester' },
    chooseSemester: { ar: 'اختر الفصل', en: 'Choose semester' },
    subject: { ar: 'المادة', en: 'Subject' },
    chooseSubject: { ar: 'اختر المادة', en: 'Choose subject' },
    quantity: { ar: 'الكمية', en: 'Quantity' },
    durationDays: { ar: 'المدة بالأيام', en: 'Duration in days' },
    durationHint: { ar: '0 = وصول دائم', en: '0 = permanent access' },
    prefix: { ar: 'بادئة الرمز (اختياري)', en: 'Code prefix (optional)' },
    expiry: { ar: 'تاريخ انتهاء الرمز (اختياري)', en: 'Code expiry (optional)' },
    publicScopeNote: { ar: 'متاح لكل طالب مسجل مرة واحدة.', en: 'available once to every registered student.' },
    privateScopeNote: { ar: 'يملكه أول طالب مسجل يسترده — ولا يمكن ربطه بطالب ثانٍ.', en: 'owned by the first student to redeem it — never a second student.' },
    submit: { ar: 'إنشاء الرموز', en: 'Generate codes' },
    busySubmit: { ar: 'جارٍ إنشاء الرموز…', en: 'Generating codes…' },
  },

  // ===== Redemptions detail modal =====
  redemptionsModal: {
    subtitle: { ar: 'من فعّل هذا الرمز، وماذا يفتح، ومتى ينتهي.', en: 'Who activated this code, what it unlocks, and when it ends.' },
    empty: { ar: 'لم يُفعّل هذا الرمز بعد.', en: 'No redemptions yet.' },
    emptyHint: { ar: 'عندما يُفعّل طلاب هذا الرمز ستظهر تفاصيل التفعيلات هنا.', en: 'Redemption details appear here once students activate this code.' },
    from: { ar: 'من', en: 'from' },
    until: { ar: 'إلى', en: 'until' },
    permanent: { ar: 'دائم', en: 'permanent' },
  },

  // ===== Manual activation modal =====
  activateModal: {
    title: { ar: 'تفعيل يدوي للكود', en: 'Manual code activation' },
    subtitle: { ar: 'اختر طالبًا لتفعيل هذا الكود له مباشرة.', en: 'Select a student to activate this code for.' },
    searchLabel: { ar: 'بحث عن طالب', en: 'Search student' },
    searchPlaceholder: { ar: 'الاسم أو الهاتف...', en: 'Name or phone...' },
    busySubmit: { ar: 'جارٍ التفعيل…', en: 'Activating…' },
  },

  // ===== Revoke confirmation modal =====
  revokeModal: {
    title: { ar: 'إبطال الرمز', en: 'Revoke code' },
    subtitle: { ar: 'سيُسحب وصول جميع من استرد هذا الرمز. لا يمكن التراجع.', en: 'All students who redeemed this code will lose access. This cannot be undone.' },
    provideReason: { ar: 'أدخل سبب الإبطال.', en: 'Provide a revoke reason.' },
  },

  // ===== Bulk revoke confirm =====
  bulkRevoke: {
    title: { ar: 'إبطال الرموز المحددة', en: 'Revoke selected codes' },
    description: { ar: 'سيُبطَل {{count}} رمز، وسيفقد جميع الطلاب الذين استردوها وصولهم للمحتوى المرتبط بها. لا يمكن التراجع، وسيُسجَّل السبب في سجل التدقيق.', en: '{{count}} code(s) will be revoked — every student who redeemed them loses access to the linked content. This cannot be undone; the reason is recorded in the audit log.' },
    success: { ar: 'تم إبطال {{count}} كود.', en: '{{count}} code(s) revoked.' },
    partialFailure: { ar: 'أُبطل {{success}} كود، وفشل {{failed}}: {{list}}', en: '{{success}} code(s) revoked; {{failed}} failed: {{list}}' },
    listSeparator: { ar: '، ', en: ', ' },
  },

  // ===== Toasts (success notices) =====
  toasts: {
    generated: { ar: 'تم إنشاء {{count}} رمز وصول.', en: '{{count}} access code(s) created.' },
    revoked: { ar: 'أُلغي الرمز وسُحب وصول {{count}} اشتراكًا.', en: 'Code revoked; {{count}} subscription(s) withdrawn.' },
    copied: { ar: 'تم نسخ الكود.', en: 'Code copied.' },
    activated: { ar: 'تم تفعيل الكود للطالب.', en: 'Code activated for student.' },
  },

  // ===== Inline operator-facing errors =====
  errors: {
    chooseScopeFirst: { ar: 'اختر نطاق الرمز الأكاديمي أولًا.', en: 'Choose the academic code scope first.' },
    copyFailed: { ar: 'تعذّر النسخ.', en: 'Copy failed.' },
    noCodesToExport: { ar: 'لا توجد أكواد للتصدير.', en: 'No codes to export.' },
    selectStudentFirst: { ar: 'اختر طالبًا أولاً.', en: 'Select a student first.' },
  },

  // ===== Legacy «unknown» status labels =====
  // CodesCenter legacy behavior: an unrecognized wire status rendered Arabic
  // «غير معروف»/«غير معروفة» but passed the raw value through in English, so
  // the `en` sides below are placeholders that never render (English keeps the
  // raw pass-through in the thin component wrappers).
  statuses: {
    unknownCode: { ar: 'غير معروف', en: 'Unknown' },
    unknownRedemption: { ar: 'غير معروفة', en: 'Unknown' },
  },

  // ===== OfflineCenter — offline question-package ledger =====
  offline: {
    title: { ar: 'الحزم دون اتصال (حزم الأسئلة المشفّرة)', en: 'Offline packages' },
    subtitle: { ar: 'رؤية وإبطال فقط — الإصدار يتم من تطبيق الطالب عبر القناة المشفّرة المرتبطة بالجهاز.', en: 'Visibility + revocation only — issuance happens from the student app.' },
    refreshLabel: { ar: 'تحديث قائمة الحزم', en: 'Refresh packages' },
    refresh: { ar: 'تحديث', en: 'Refresh' },
    studentUuid: { ar: 'معرّف الطالب (UUID، اختياري)', en: 'Student UUID (optional)' },
    filter: { ar: 'تصفية', en: 'Filter' },
    // Legacy Arabic-only `.catch` fallbacks — both locales provided (PR-3).
    loadFailed: { ar: 'تعذر تحميل الحزم دون اتصال.', en: 'Failed to load offline packages.' },
    revokeFailed: { ar: 'تعذر إلغاء الحزمة.', en: 'Failed to revoke the package.' },
    listFailed: { ar: 'تعذر تحميل القائمة — حاول التحديث.', en: 'Failed to load — try refreshing.' },
    empty: { ar: 'لا توجد حزم مسجّلة بعد.', en: 'No packages recorded yet.' },
    columns: {
      student: { ar: 'الطالب', en: 'Student' },
      installation: { ar: 'التثبيت', en: 'Installation' },
      status: { ar: 'الحالة', en: 'Status' },
      issued: { ar: 'الإصدار', en: 'Issued' },
      expires: { ar: 'انتهاء الصلاحية', en: 'Expires' },
      action: { ar: 'إجراء', en: 'Action' },
    },
    revokePackageLabel: { ar: 'إلغاء الحزمة {{id}}', en: 'Revoke package' },
    revoke: { ar: 'إلغاء', en: 'Revoke' },
    confirmTitle: { ar: 'تأكيد إلغاء الحزمة', en: 'Confirm revocation' },
    confirmText: { ar: 'ستتوقف الحزمة {{packageId}} للطالب {{studentName}} عند أول اتصال تالٍ — ولا يمكن فتحها أو تسديد إجابات منها بعد ذلك.', en: "Package {{packageId}} stops at the device's next online contact." },
    cancel: { ar: 'تراجع', en: 'Cancel' },
    revokePackage: { ar: 'إلغاء الحزمة', en: 'Revoke' },
  },
} as const satisfies DictSection;
