/**
 * PR-3 — audit dictionary section (filled by the center migration).
 * Strings are moved BYTE-IDENTICAL from the component ternaries/copy
 * objects into this section; the component then reads them through
 * `t(locale, 'audit.key')`.
 *
 * Sections:
 *   • severity   — severity value labels + the shared «الخطورة» heading;
 *   • eventTypes — security event-type labels (AuditCenter filter +
 *                  AuditLogViewer filter/row labels share the vocabulary);
 *   • actor      — actor chip labels ({{name}} interpolation);
 *   • headings   — shared table column headings;
 *   • center     — AuditCenter (header, filters, empty states, errors);
 *   • viewer     — AuditLogViewer (full log viewer furniture);
 *   • activity   — ActivityMonitor (sessions + activity logs tabs);
 *   • feeds      — DashboardFeeds (super-admin overview feed cards).
 *
 * Data maps kept as component data (per the migration decision rule):
 *   • AuditCenter `eventTypeLabel` arMap (English side is derived by
 *     camelCase spacing, not stored copy);
 *   • DashboardFeeds `ACTIVITY_TYPE_LABEL` (ar/en + color chip data).
 */
import type { DictSection } from './types';

export const auditDict = {
  // ===== Shared severity vocabulary =====
  severity: {
    critical: { ar: 'حرج', en: 'Critical' },
    warning: { ar: 'تحذير', en: 'Warning' },
    info: { ar: 'معلومات', en: 'Info' },
    heading: { ar: 'الخطورة', en: 'Severity' },
  },

  // ===== Security event-type labels (AuditCenter + AuditLogViewer) =====
  eventTypes: {
    loginSuccess: { ar: 'نجاح الدخول', en: 'Login Success' },
    loginFailed: { ar: 'فشل الدخول', en: 'Login Failed' },
    logout: { ar: 'تسجيل الخروج', en: 'Logout' },
    sessionCreated: { ar: 'إنشاء جلسة', en: 'Session Created' },
    sessionRevoked: { ar: 'إنهاء جلسة', en: 'Session Revoked' },
    deviceRegistered: { ar: 'تسجيل جهاز', en: 'Device Registered' },
    deviceChange: { ar: 'تغيير جهاز', en: 'Device Change' },
    banIssued: { ar: 'تطبيق حظر', en: 'Ban Issued' },
    banLifted: { ar: 'رفع حظر', en: 'Ban Lifted' },
    mfaEnabled: { ar: 'تفعيل التحقق الثنائي', en: 'MFA Enabled' },
    mfaDisabled: { ar: 'تعطيل التحقق الثنائي', en: 'MFA Disabled' },
    permissionChange: { ar: 'تغيير صلاحية', en: 'Permission Change' },
    roleChange: { ar: 'تغيير دور', en: 'Role Change' },
    subscriptionActivated: { ar: 'تفعيل اشتراك', en: 'Subscription Activated' },
    subscriptionRevoked: { ar: 'إلغاء اشتراك', en: 'Subscription Revoked' },
    fileAccess: { ar: 'وصول لملف', en: 'File Access' },
    fileAccessDenied: { ar: 'رفض وصول لملف', en: 'File Access Denied' },
    fileScanRejected: { ar: 'رفض فحص ملف', en: 'File Scan Rejected' },
    securityAlert: { ar: 'تنبيه أمني', en: 'Security Alert' },
    suspiciousActivity: { ar: 'نشاط مشبوه', en: 'Suspicious Activity' },
  },

  // ===== Actor chips ({{name}} interpolation) =====
  actor: {
    admin: { ar: 'مدير · {{name}}', en: 'Admin · {{name}}' },
    student: { ar: 'طالب · {{name}}', en: 'Student · {{name}}' },
    system: { ar: 'النظام', en: 'System' },
  },

  // ===== Shared table column headings =====
  headings: {
    time: { ar: 'الوقت', en: 'Time' },
    type: { ar: 'النوع', en: 'Type' },
    description: { ar: 'الوصف', en: 'Description' },
    actor: { ar: 'الفاعل', en: 'Actor' },
  },

  // ===== AuditCenter =====
  center: {
    eyebrow: { ar: 'التحقق المؤسسي', en: 'Institutional assurance' },
    title: { ar: 'السجل الأمني', en: 'Security Audit' },
    subtitle: { ar: 'سجل زمني للأحداث الحساسة عبر المنصة: الدخول، الأجهزة، التحقق الثنائي، والمحاولات المشبوهة.', en: 'Chronological log of sensitive platform events: sign-ins, devices, multi-factor, and suspicious attempts.' },
    searchPlaceholder: { ar: 'ابحث في الأحداث', en: 'Search events' },
    severityAll: { ar: 'الخطورة: الكل', en: 'Severity: All' },
    eventTypeAll: { ar: 'النوع: الكل', en: 'Event type: All' },
    // PR-10 a11y — accessible names for the two native filter selects.
    severityFilter: { ar: 'تصفية الخطورة', en: 'Severity filter' },
    eventTypeFilter: { ar: 'تصفية نوع الحدث', en: 'Event type filter' },
    dateFrom: { ar: 'من تاريخ', en: 'From date' },
    dateTo: { ar: 'إلى تاريخ', en: 'To date' },
    clearFilters: { ar: 'إزالة التصفية', en: 'Clear filters' },
    emptyTitle: { ar: 'لا توجد أحداث أمنية', en: 'No security events' },
    emptyNoEvents: { ar: 'لم تُسجَّل أحداث ضمن الصلاحيات الحالية.', en: 'No events are visible within your current permissions.' },
    emptyFiltered: { ar: 'عدّل عوامل التصفية لرؤية المزيد.', en: 'Adjust the filters to see more.' },
    errorForbidden: { ar: 'لا تملك صلاحية عرض السجل الأمني. هذه الميزة مخصصة للمدير العام.', en: 'You do not have permission to view the security audit. This feature is reserved for super-administrators.' },
    errorLoad: { ar: 'تعذر تحميل السجل الأمني.', en: 'Unable to load the security audit.' },
  },

  // ===== AuditLogViewer =====
  viewer: {
    title: { ar: 'سجل التدقيق الكامل', en: 'Full Audit Log' },
    desc: { ar: 'كل الأحداث الأمنية مع فلاتر وترقيم صفحات', en: 'All security events with filters + pagination' },
    search: { ar: 'بحث في الوصف...', en: 'Search description...' },
    severity: { ar: 'الخطورة', en: 'Severity' },
    eventType: { ar: 'النوع', en: 'Event type' },
    dateFrom: { ar: 'من تاريخ', en: 'From date' },
    dateTo: { ar: 'إلى تاريخ', en: 'To date' },
    clear: { ar: 'إزالة الفلاتر', en: 'Clear filters' },
    // Legacy Arabic header carried a typo («الوصصف») — preserved byte-identical.
    descriptionHeader: { ar: 'الوصصف', en: 'Description' },
    ip: { ar: 'IP', en: 'IP' },
    correlation: { ar: 'معرف الارتباط', en: 'Correlation ID' },
    severityAll: { ar: 'كل الخطورة', en: 'All severities' },
    eventTypeAll: { ar: 'كل الأنواع', en: 'All types' },
    exportCsv: { ar: 'تصدير CSV', en: 'Export CSV' },
    noData: { ar: 'لا توجد سجلات', en: 'No audit log entries' },
    loading: { ar: 'جارٍ التحميل...', en: 'Loading...' },
    prev: { ar: 'السابق', en: 'Previous' },
    next: { ar: 'التالي', en: 'Next' },
    page: { ar: 'صفحة', en: 'Page' },
    of: { ar: 'من', en: 'of' },
    showing: { ar: 'عرض', en: 'Showing' },
    results: { ar: 'النتائج', en: 'Results' },
    loadError: { ar: 'تعذّر تحميل السجل', en: 'Could not load audit logs' },
  },

  // ===== ActivityMonitor =====
  activity: {
    title: { ar: 'مراقبة نشاط المدراء', en: 'Admin activity monitor' },
    desc: { ar: 'جلسات المدراء والأجهزة والأعمال المنجزة (أسئلة، ملفات، أكواد).', en: 'Admin sessions, devices, and completed work (questions, files, codes).' },
    adminFilterPlaceholder: { ar: 'فلترة بمعرّف المدير (UUID)', en: 'Filter by admin id (UUID)' },
    apply: { ar: 'تطبيق', en: 'Apply' },
    sectionsAria: { ar: 'أقسام المراقبة', en: 'Monitor sections' },
    tabSessions: { ar: 'الجلسات', en: 'Sessions' },
    tabLogs: { ar: 'سجل النشاط', en: 'Activity logs' },
    loading: { ar: 'جارٍ التحميل…', en: 'Loading…' },
    sessionsEmpty: { ar: 'لا توجد جلسات إدارية بعد.', en: 'No admin sessions yet.' },
    logsEmpty: { ar: 'لا توجد أحداث نشاط بعد.', en: 'No activity events yet.' },
    noIp: { ar: 'IP غير متوفر', en: 'no IP' },
    sessionActive: { ar: 'نشطة', en: 'Active' },
    sessionClosed: { ar: 'مغلقة', en: 'Closed' },
    duration: { ar: 'المدة', en: 'Duration' },
    questions: { ar: 'الأسئلة', en: 'Questions' },
    files: { ar: 'الملفات', en: 'Files' },
    codes: { ar: 'الأكواد', en: 'Codes' },
    started: { ar: 'بدأت', en: 'Started' },
    lastActivity: { ar: 'آخر نشاط', en: 'Last activity' },
    closed: { ar: 'أُغلقت', en: 'Closed' },
    admin: { ar: 'المدير', en: 'Admin' },
    action: { ar: 'الإجراء', en: 'Action' },
    details: { ar: 'التفاصيل', en: 'Details' },
    actionCreateQuestion: { ar: 'إنشاء سؤال', en: 'Question created' },
    actionUploadFile: { ar: 'رفع ملف', en: 'File uploaded' },
    actionGenerateCode: { ar: 'توليد أكواد', en: 'Codes generated' },
    chipSize: { ar: 'الحجم', en: 'size' },
    chipQty: { ar: 'الكمية', en: 'qty' },
    pagerPage: { ar: 'صفحة {{page}} من {{totalPages}}', en: 'Page {{page}} of {{totalPages}}' },
    pagerPrev: { ar: 'السابق', en: 'Prev' },
    pagerNext: { ar: 'التالي', en: 'Next' },
    loadSessionsError: { ar: 'تعذر تحميل الجلسات.', en: 'Could not load sessions.' },
    loadLogsError: { ar: 'تعذر تحميل سجل النشاط.', en: 'Could not load activity logs.' },
  },

  // ===== DashboardFeeds =====
  feeds: {
    recentTitle: { ar: 'النشاط الأخير', en: 'Recent activity' },
    topSubjects: { ar: 'المواد الأكثر نشاطًا', en: 'Most active subjects' },
    reportsTitle: { ar: 'ملخص البلاغات', en: 'Reports summary' },
    loading: { ar: 'جارٍ التحميل…', en: 'Loading…' },
    failed: { ar: 'تعذر تحميل هذا البطاقة', en: 'Could not load this card' },
    noActivity: { ar: 'لا يوجد نشاط حديث', en: 'No recent activity' },
    noSubjects: { ar: 'لا توجد بيانات نشاط للمواد', en: 'No subject activity data' },
    answered: { ar: 'إجابة', en: 'answered' },
    accuracy: { ar: 'الدقة', en: 'accuracy' },
    activeStudents: { ar: 'طلاب نشطون', en: 'active students' },
    pending: { ar: 'قيد المراجعة', en: 'Pending' },
    resolved: { ar: 'محلولة', en: 'Resolved' },
    rejected: { ar: 'مرفوضة', en: 'Rejected' },
    total: { ar: 'الإجمالي', en: 'Total' },
    viewReports: { ar: 'افتح إدارة البلاغات', en: 'Open reports moderation' },
  },
} as const satisfies DictSection;
