/**
 * PR-3 — reports dictionary section (filled by the center migration).
 * Strings are moved BYTE-IDENTICAL from the component ternaries/copy
 * objects into this section; the component then reads them through
 * `t(locale, 'reports.key')`.
 *
 * Sections:
 *   • header    — ReportsTabs shell (title, description, date-range furniture);
 *   • tabs      — the 8 analytics tab labels (TABS key map);
 *   • presets   — the date-range preset labels (DATE_PRESETS label keys);
 *   • stats     — stat-card labels shared across the analytics tabs;
 *   • charts    — chart/section titles + exam metric rows;
 *   • moderation— ReportsModeration (filters, table, transitions, assign,
 *                 pagination, toasts and error fallbacks).
 */
import type { DictSection } from './types';

export const reportsDict = {
  // ===== ReportsTabs — shell furniture =====
  header: {
    title: { ar: 'مركز التحليلات', en: 'Analytics Center' },
    desc: { ar: '8 تبويبات تحليلية شاملة', en: '8 comprehensive analytics tabs' },
    dateRange: { ar: 'الفترة', en: 'Date range' },
    lastUpdate: { ar: 'آخر تحديث', en: 'Last updated' },
    refresh: { ar: 'تحديث', en: 'Refresh' },
    tabDenied: { ar: 'لا تملك مفتاح هذا التبويب.', en: 'You do not have the key for this tab.' },
  },

  // ===== ReportsTabs — the 8 tab labels (keyed by TABS.key) =====
  tabs: {
    overview: { ar: 'نظرة عامة', en: 'Overview' },
    students: { ar: 'الطلاب', en: 'Students' },
    academic: { ar: 'الأداء الأكاديمي', en: 'Academic' },
    exams: { ar: 'الاختبارات', en: 'Exams' },
    questions: { ar: 'بنك الأسئلة', en: 'Questions' },
    content: { ar: 'المحتوى', en: 'Content' },
    codes: { ar: 'الأكواد', en: 'Codes' },
    operations: { ar: 'التشغيل', en: 'Operations' },
  },

  // ===== ReportsTabs — date-range preset labels (DATE_PRESETS.labelKey) =====
  presets: {
    last7: { ar: '7 أيام', en: '7 days' },
    last30: { ar: '30 يوم', en: '30 days' },
    last90: { ar: '90 يوم', en: '90 days' },
    last6m: { ar: '6 أشهر', en: '6 months' },
    last12m: { ar: 'سنة', en: '12 months' },
  },

  // ===== Stat-card labels (shared across the analytics tabs) =====
  stats: {
    totalStudents: { ar: 'إجمالي الطلاب', en: 'Total Students' },
    totalQuestions: { ar: 'إجمالي الأسئلة', en: 'Total Questions' },
    totalAnswers: { ar: 'إجمالي الإجابات', en: 'Total Answers' },
    platformAccuracy: { ar: 'دقة المنصة', en: 'Platform Accuracy' },
    examSessions: { ar: 'جلسات الاختبار', en: 'Exam Sessions' },
    libraryViews: { ar: 'مشاهدات المكتبة', en: 'Library Views' },
    newRegistrations: { ar: 'تسجيلات جديدة', en: 'New Registrations' },
    activeStudents: { ar: 'طلاب نشطون', en: 'Active Students' },
    inactiveStudents: { ar: 'طلاب غير نشطين', en: 'Inactive Students' },
    published: { ar: 'منشورة', en: 'Published' },
    drafts: { ar: 'مسودات', en: 'Drafts' },
    archived: { ar: 'مؤرشفة', en: 'Archived' },
    completionRate: { ar: 'معدل الإكمال', en: 'Completion Rate' },
    passRate: { ar: 'معدل النجاح', en: 'Pass Rate' },
    publishedFiles: { ar: 'ملفات منشورة', en: 'Published Files' },
    storageMb: { ar: 'المساحة (MB)', en: 'Storage (MB)' },
    totalViews: { ar: 'إجمالي المشاهدات', en: 'Total Views' },
    pendingScans: { ar: 'فحوص معلقة', en: 'Pending Scans' },
    totalIssued: { ar: 'أكواد صادرة', en: 'Total Issued' },
    activated: { ar: 'مفعّلة', en: 'Activated' },
    activationRate: { ar: 'نسبة التفعيل', en: 'Activation Rate' },
    estimatedValue: { ar: 'قيمة تقديرية', en: 'Estimated Value' },
    securityEvents: { ar: 'أحداث أمنية', en: 'Security Events' },
    successfulLogins: { ar: 'دخول ناجح', en: 'Successful Logins' },
    failedLogins: { ar: 'دخول فاشل', en: 'Failed Logins' },
    loginSuccessRate: { ar: 'معدل النجاح', en: 'Login Success Rate' },
  },

  // ===== Chart / section titles + exam metric rows =====
  charts: {
    studentGrowth: { ar: 'نمو الطلاب', en: 'Student Growth' },
    dailyRegistrations: { ar: 'التسجيلات اليومية', en: 'Daily Registrations' },
    passRatesBySubject: { ar: 'نسب النجاح حسب المادة', en: 'Pass Rates by Subject' },
    hardestQuestions: { ar: 'أصعب 10 أسئلة', en: 'Top 10 Hardest Questions' },
    scoreDistribution: { ar: 'توزيع الدرجات', en: 'Score Distribution' },
    metrics: { ar: 'معدلات', en: 'Metrics' },
    totalSessions: { ar: 'إجمالي الجلسات', en: 'Total Sessions' },
    completedSessions: { ar: 'جلسات مكتملة', en: 'Completed' },
    avgDuration: { ar: 'متوسط المدة (دقيقة)', en: 'Avg Duration (min)' },
    mostReported: { ar: 'أكثر الأسئلة إبلاغاً', en: 'Most Reported Questions' },
    topAttempted: { ar: 'الأكثر محاولة', en: 'Top Attempted' },
    viewsByType: { ar: 'المشاهدات حسب النوع', en: 'Views by Type' },
    dailyActivations: { ar: 'التفعيل اليومي', en: 'Daily Activations' },
    eventsByType: { ar: 'الأحداث حسب النوع', en: 'Events by Type' },
  },

  // ===== ReportsModeration =====
  moderation: {
    title: { ar: 'إدارة البلاغات', en: 'Reports Moderation' },
    desc: { ar: 'مراجعة البلاغات + انتقال الحالة + تعيين المسؤول', en: 'Review reports + transition status + assign' },
    search: { ar: 'بحث في الوصف...', en: 'Search description...' },
    status: { ar: 'الحالة', en: 'Status' },
    clear: { ar: 'إزالة الفلاتر', en: 'Clear filters' },
    question: { ar: 'السؤال', en: 'Question' },
    student: { ar: 'الطالب', en: 'Student' },
    reason: { ar: 'السبب', en: 'Reason' },
    assigned: { ar: 'المسؤول', en: 'Assigned' },
    created: { ar: 'الإنشاء', en: 'Created' },
    updated: { ar: 'آخر تحديث', en: 'Updated' },
    actions: { ar: 'إجراءات', en: 'Actions' },
    transition: { ar: 'تغيير الحالة', en: 'Transition status' },
    notes: { ar: 'ملاحظات الحل (مطلوبة للرفض)', en: 'Resolution notes (required for rejection)' },
    save: { ar: 'حفظ', en: 'Save' },
    saving: { ar: 'جارٍ الحفظ…', en: 'Saving…' },
    cancel: { ar: 'إلغاء', en: 'Cancel' },
    noTransitions: { ar: 'لا توجد انتقالات متاحة', en: 'No transitions available' },
    noNotes: { ar: 'لا توجد ملاحظات', en: 'No notes' },
    prev: { ar: 'السابق', en: 'Previous' },
    next: { ar: 'التالي', en: 'Next' },
    page: { ar: 'صفحة', en: 'Page' },
    of: { ar: 'من', en: 'of' },
    showing: { ar: 'عرض', en: 'Showing' },
    results: { ar: 'نتائج', en: 'results' },
    noData: { ar: 'لا توجد بلاغات', en: 'No reports found' },
    loading: { ar: 'جارٍ التحميل...', en: 'Loading...' },
    resolvedBy: { ar: 'حلّه', en: 'Resolved by' },
    reviewedBy: { ar: 'راجعه', en: 'Reviewed by' },
    assign: { ar: 'تعيين', en: 'Assign' },
    assignTitle: { ar: 'تعيين البلاغ لمدير', en: 'Assign report to an administrator' },
    assignBody: { ar: 'اختر المدير المسؤول عن مراجعة هذا البلاغ. سيظهر اسمه في عمود «المسؤول».', en: 'Choose the administrator responsible for reviewing this report. Their name shows in the Assigned column.' },
    selectAdmin: { ar: 'اختر المدير', en: 'Select administrator' },
    assignOk: { ar: 'تم تعيين المسؤول للبلاغ', en: 'Report assigned' },
    assignFail: { ar: 'فشل التعيين', en: 'Assign failed' },
    currentStatus: { ar: 'الحالة الحالية', en: 'Current status' },
    loadError: { ar: 'تعذّر تحميل البلاغات', en: 'Could not load reports' },
    statusUpdatedToast: { ar: 'تم تحديث حالة البلاغ', en: 'Report status updated' },
    updateFailed: { ar: 'فشل التحديث', en: 'Update failed' },
    adminsLoadError: { ar: 'تعذّر تحميل قائمة المدراء', en: 'Could not load administrators' },
    // STATUS_OPTIONS labels (filter select, keyed by labelKey).
    statusAll: { ar: 'كل الحالات', en: 'All statuses' },
    statusPending: { ar: 'معلّق', en: 'Pending' },
    statusReviewing: { ar: 'قيد المراجعة', en: 'Reviewing' },
    statusResolved: { ar: 'محلول', en: 'Resolved' },
    statusRejected: { ar: 'مرفوض', en: 'Rejected' },
    statusClosed: { ar: 'مغلق', en: 'Closed' },
  },
} as const satisfies DictSection;
