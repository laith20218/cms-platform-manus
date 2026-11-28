/**
 * Shared admin e2e mock world — extracted from pr10-admin-smoke.e2e.mjs so
 * sibling evidence scripts (cc-final-surfaces.e2e.mjs) can reuse the exact
 * fixture set WITHOUT executing the whole smoke matrix on import.
 *
 * Same contract as before: context.route interception with a seeded
 * super_admin session; every unmocked /api/v1/** route aborts (fail-visible)
 * and is recorded into the caller-provided sink. Zero real network calls.
 */

export const E2E_ADMIN_USER = {
  id: 'e2e-admin-001',
  phone: '+962790000001',
  fullName: 'مدير الاختبار',
  role: 'super_admin',
  avatarUrl: null,
  university: { id: 'u1', nameAr: 'جامعة الاختبار' },
  college: { id: 'c1', nameAr: 'كلية الطب' },
};

// --- Academic cascade (D4 hydration source; shapes per AcademicCenter types) ---
const UNIVERSITIES_PAGE = {
  items: [{ id: 'u1', nameAr: 'جامعة الاختبار', nameEn: null, slug: 'test', collegesCount: 1, isArchived: false }],
  total: 1, page: 1, pageSize: 100, totalPages: 1,
};
const COLLEGES = [{ id: 'c1', universityId: 'u1', nameAr: 'كلية الطب', nameEn: null, slug: 'med', yearsCount: 1, isArchived: false }];
const YEARS = [{ id: 'y1', collegeId: 'c1', nameAr: 'السنة الأولى', nameEn: null, slug: 'y1', yearNumber: 1, semestersCount: 1, isArchived: false }];
const SEMESTERS = [{ id: 's1', academicYearId: 'y1', nameAr: 'الفصل الأول', nameEn: null, slug: 's1', semesterNumber: 1, subjectsCount: 1, isArchived: false }];
const SUBJECTS = [{ id: 'su1', semesterId: 's1', nameAr: 'علم وظائف الأعضاء', nameEn: 'Physiology', slug: 'physio', code: null, totalLectures: 1, isArchived: false }];
const LECTURES = [{ id: 'l1', subjectId: 'su1', titleAr: 'محاضرة القلب الأولى', titleEn: null, slug: 'l1', lectureNumber: 1, durationMinutes: 50, description: null, instructorName: null, sourceReference: null, status: 'Published', isArchived: false }];

// --- Admins / roles (App-level management data, fetched on every view) ---
const ADMINS_PAGE = {
  items: [
    { id: 'a-1', fullName: 'مدير الاختبار', email: 'e2e-admin@test.example', phone: '+962790000001', roleId: 'role-super', roleName: 'super_admin', roleNameAr: 'المدير العام', scopeUniversityId: null, scopeCollegeId: null, scopeYearId: null, scopeSubjectId: null, status: 'Active', lastLogin: '2025-11-25T08:00:00Z', createdAt: '2025-01-05T00:00:00Z' },
  ],
  total: 1, page: 1, pageSize: 50, totalPages: 1,
};
const ROLES = [
  { id: 'role-super', name: 'super_admin', nameAr: 'المدير العام', description: 'كل الصلاحيات عبر سياسات الخادم', isSystem: true, isActive: true, adminCount: 1, permissionCount: 0, createdAt: '2025-01-01T00:00:00Z' },
  { id: 'role-content', name: 'content_admin', nameAr: 'مدير المحتوى', description: 'إدارة المحتوى الأكاديمي', isSystem: false, isActive: true, adminCount: 1, permissionCount: 12, createdAt: '2025-02-01T00:00:00Z' },
];

// --- Overview dashboard (App Overview) + feeds (DashboardFeeds) ---
const DASHBOARD = {
  totalStudents: 1250, activeStudentsToday: 310, totalQuestions: 4800,
  totalActiveCodes: 96, totalActiveSubscriptions: 640, totalLibraryFiles: 220,
  totalExams: 48, pendingReports: 3, monthlyRevenue: 4200, revenueChangePercent: 4.2,
};
const RECENT_ACTIVITY = [
  { id: 'act-1', type: 'registration', description: 'تسجيل طالب جديد في كلية الطب', actorName: 'النظام', createdAt: '2025-11-25T09:00:00Z' },
  { id: 'act-2', type: 'report', description: 'بلاغ جديد على سؤال في علم وظائف الأعضاء', actorName: null, createdAt: '2025-11-25T08:30:00Z' },
];
const TOP_SUBJECTS = [
  { subjectId: 'su1', subjectName: 'علم وظائف الأعضاء', questionsAnswered: 5200, averageAccuracy: 74.5, activeStudents: 310 },
];
const DASHBOARD_REPORTS_SUMMARY = { totalReports: 3, pendingReports: 2, resolvedReports: 1, rejectedReports: 0 };

// --- Activity monitor (overview activity tab — mocked for completeness) ---
const ACTIVITY_SESSIONS = { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
const ACTIVITY_LOGS = { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };

// --- Questions (QuestionsCenter) ---
const QUESTIONS_PAGE = {
  items: [
    { id: 'q-1', subjectId: 'su1', lectureId: 'l1', text: 'أي غرفة القلب تستقبل الدم المؤكسج القادم من الرئتين عبر الوريد الرئوي؟', type: 'Mcq', difficulty: 'Easy', status: 'Published', tags: ['قلب'], lectureTitle: 'محاضرة القلب الأولى', optionsCount: 4, attemptsCount: 48, correctRate: 92.7, createdAt: '2025-10-01T00:00:00Z', updatedAt: '2025-11-01T00:00:00Z' },
    { id: 'q-2', subjectId: 'su1', lectureId: null, text: 'ما ضغط الدم الانقباضي الطبيعي عند البالغين في وضعية الجلوس؟', type: 'Mcq', difficulty: 'Medium', status: 'Draft', tags: [], lectureTitle: null, optionsCount: 4, attemptsCount: 12, correctRate: 33.3, createdAt: '2025-10-02T00:00:00Z', updatedAt: null },
  ],
  total: 2, page: 1, pageSize: 20, totalPages: 1,
};
const QUESTION_FACETS = { authors: [{ id: 'a-1', name: 'مدير الاختبار' }], tags: ['قلب'] };

// --- Exams + exam courses (w143 fixtures, unchanged shapes) ---
const EXAM_PAGE = {
  items: [
    { id: 'ex-1', subjectId: 'su1', lectureId: null, titleAr: 'اختبار الدورة الدموية النهائي', slug: 'circulation-final', examType: 'Final', year: 2025, totalQuestions: 50, durationMinutes: 60, availableFrom: null, availableUntil: null, maxAttempts: 2, status: 'Published', attemptsCount: 48, completedCount: 40, averageScore: 78.4 },
    { id: 'ex-2', subjectId: 'su1', lectureId: null, titleAr: 'اختبار الجهاز التنفسي', slug: 'respiratory-mid', examType: 'Midterm', year: 2025, totalQuestions: 30, durationMinutes: 45, availableFrom: null, availableUntil: null, maxAttempts: null, status: 'Published', attemptsCount: 0, completedCount: 0, averageScore: null },
    { id: 'ex-3', subjectId: 'su1', lectureId: null, titleAr: 'اختبار قصير — الأعصاب', slug: 'nerves-quiz', examType: 'Quiz', year: 2025, totalQuestions: 15, durationMinutes: 20, availableFrom: null, availableUntil: null, maxAttempts: null, status: 'Draft', attemptsCount: 0, completedCount: 0, averageScore: null },
  ],
  page: 1, pageSize: 100, totalCount: 3,
};
const EXAM_COURSE_LIST = [
  { id: 'ec-1', subjectId: 'su1', nameAr: 'دورة امتحانات نصف السنة الأولى', nameEn: 'First midterm bundle', coverUrl: null, year: 2025, semester: 1, courseType: 'First', freeOrPaid: false, status: 'Published', examsCount: 2, sortOrder: 0 },
  { id: 'ec-2', subjectId: 'su1', nameAr: 'دورة النماذج الامتحانية', nameEn: null, coverUrl: null, year: 2025, semester: 2, courseType: 'Model', freeOrPaid: true, status: 'Draft', examsCount: 3, sortOrder: 1 },
];

// --- Students (StudentsCenter list row) ---
const STUDENTS_PAGE = {
  items: [
    { id: 'st-1', fullName: 'طالب الاختبار', phone: '+962790000002', status: 'Active', lastLogin: '2025-11-24T10:00:00Z', questionsAnswered: 320, accuracy: 71.5, createdAt: '2025-09-01T00:00:00Z', universityName: 'جامعة الاختبار', collegeName: 'كلية الطب', avatarUrl: null, gender: 'Male', archived: false },
  ],
  total: 1, page: 1, pageSize: 20, totalPages: 1,
};

// --- Codes (CodesCenter ledger row) ---
const CODES_PAGE = {
  items: [
    { id: 'code-1', code: 'CMS-TEST-0001', scopeType: 'subject', contentScope: 'full_subject', isPublic: false, scopeName: 'علم وظائف الأعضاء', status: 'Active', usedAt: null, usedByName: null, createdAt: '2025-11-20T00:00:00Z', expiresAt: '2026-11-20T00:00:00Z', redemptionCount: 0 },
  ],
  total: 1, page: 1, pageSize: 100, totalPages: 1,
};

// --- Audit center (SecurityAlert rows + audit-logs severity counts) ---
const SECURITY_ALERTS = [
  { id: 'al-1', eventType: 'LoginFailed', severity: 'Warning', description: 'محاولة دخول فاشلة متكررة', studentId: 'st-1', studentName: 'طالب الاختبار', adminId: null, adminName: null, ipAddress: '10.0.0.9', createdAt: '2025-11-25T09:12:00Z' },
];
const SECURITY_EVENTS = [
  { id: 'ev-1', eventType: 'LoginSuccess', severity: 'Info', description: 'دخول ناجح إلى لوحة الإدارة', ipAddress: '10.0.0.9', deviceFingerprint: null, correlationId: null, createdAt: '2025-11-25T09:00:00Z', studentId: 'st-1', studentName: 'طالب الاختبار', adminId: null, adminName: null },
  { id: 'ev-2', eventType: 'LoginFailed', severity: 'Warning', description: 'محاولة دخول فاشلة متكررة', ipAddress: '10.0.0.9', deviceFingerprint: null, correlationId: null, createdAt: '2025-11-25T09:12:00Z', studentId: 'st-1', studentName: 'طالب الاختبار', adminId: null, adminName: null },
];
// audit-logs serves both the SecurityCenter paged table and the AuditCenter
// per-severity count probes — answer with the honestly filtered subset.
const auditEventsFor = (params) => {
  const severity = params.get('severity');
  const items = severity ? SECURITY_EVENTS.filter(e => e.severity === severity) : SECURITY_EVENTS;
  return { items, total: items.length, page: 1, pageSize: params.get('pageSize') ? Number(params.get('pageSize')) : 25, totalPages: 1 };
};

// --- Security center (contract F summary) ---
const SECURITY_SUMMARY = {
  generatedAt: '2025-11-25T09:30:00Z',
  failedLogins24h: 4, failedLogins7d: 9, activeLockouts: 1, refreshReuse7d: 0,
  mfaEnabled7d: 2, mfaDisabled7d: 0, mfaFailed7d: 1, criticalEvents7d: 0,
  suspiciousAlerts7d: 1, passwordResets7d: 1,
  topFailedLoginIps24h: [{ ipAddress: '10.0.0.9', count: 4 }],
};

// --- Servers dashboard (PR-9 wire contract: ProviderEnvelope<TData>) ---
const NOW = '2025-11-25T09:30:00Z';
const freshness = { cached: false, ageSeconds: 0 };
const SERVERS_SUMMARY = {
  // Backend contract (ServersOverallStatus): healthy | degraded | down | unavailable | unknown.
  // 'operational' is a PROVIDER status value — the summary head never emits it.
  overallStatus: 'healthy',
  checkedAt: NOW,
  providers: [
    { provider: 'render', status: 'operational', checkedAt: NOW, responseTimeMs: 680, unavailableReason: null, freshness, note: 'render api service' },
    { provider: 'vercel', status: 'operational', checkedAt: NOW, responseTimeMs: 340, unavailableReason: null, freshness, note: 'vercel deployments' },
    { provider: 'neon', status: 'operational', checkedAt: NOW, responseTimeMs: 190, unavailableReason: null, freshness, note: 'neon postgres' },
    { provider: 'github', status: 'operational', checkedAt: NOW, responseTimeMs: 410, unavailableReason: null, freshness, note: 'github repo + ci' },
  ],
};
const RENDER_ENVELOPE = {
  provider: 'render', status: 'operational', checkedAt: NOW, responseTimeMs: 680, unavailableReason: null, freshness,
  data: {
    service: { id: 'srv-1', name: 'cms-api', suspended: false, autoDeploy: true, plan: 'free', region: 'oregon' },
    lastDeploy: { id: 'dep-1', status: 'live', commitSha: 'abc123def4567890', commitMessage: 'e2e mock world', createdAt: '2025-11-25T08:00:00Z', finishedAt: '2025-11-25T08:05:00Z' },
    metricsAvailable: false,
    metricsUnavailableReason: 'Metrics are not available on the Render free plan.',
  },
};
const VERCEL_ENVELOPE = {
  provider: 'vercel', status: 'operational', checkedAt: NOW, responseTimeMs: 340, unavailableReason: null, freshness,
  data: {
    projects: [
      { id: 'prj-admin', name: 'cms-admin-web', url: 'admin.example.test', latestDeployment: { id: 'd1', state: 'READY', target: 'production', commitSha: 'abc123def4', commitRef: 'main', createdAt: '2025-11-25T07:00:00Z', readyAt: '2025-11-25T07:02:00Z' } },
      { id: 'prj-student', name: 'cms-student-web', url: 'student.example.test', latestDeployment: { id: 'd2', state: 'READY', target: 'production', commitSha: 'abc123def4', commitRef: 'main', createdAt: '2025-11-25T07:00:00Z', readyAt: '2025-11-25T07:02:00Z' } },
    ],
  },
};
const NEON_ENVELOPE = {
  provider: 'neon', status: 'operational', checkedAt: NOW, responseTimeMs: 190, unavailableReason: null, freshness,
  data: {
    project: { id: 'np-1', name: 'cms-db', regionId: 'aws-us-east-2' },
    branch: { id: 'br-1', name: 'main', isDefault: true, protected: false, state: 'ready' },
    usage: null,
    usageUnavailableReason: 'Neon usage summary is not exposed on this plan.',
  },
};
const GITHUB_ENVELOPE = {
  provider: 'github', status: 'operational', checkedAt: NOW, responseTimeMs: 410, unavailableReason: null, freshness,
  data: {
    repository: { name: 'cms-platform', fullName: 'e2e-mock/cms-platform', visibility: 'public', defaultBranch: 'main', pushedAt: '2025-11-25T08:00:00Z', openIssuesCount: 2 },
    recentWorkflows: [
      { id: 42, name: 'CI', headSha: 'abc123def4567890', status: 'completed', conclusion: 'success', createdAt: '2025-11-25T08:00:00Z', updatedAt: '2025-11-25T08:10:00Z' },
    ],
  },
};
const PROVIDER_HISTORY = (provider) => ({
  provider,
  capacity: 60,
  windowNote: 'سجل الطلبات في الذاكرة منذ آخر تشغيل للواجهة الخلفية (لأغراض المحاكاة).',
  items: [
    { checkedAt: NOW, status: 'operational', responseTimeMs: 320, reason: null },
    { checkedAt: '2025-11-25T09:20:00Z', status: 'operational', responseTimeMs: 290, reason: null },
  ],
});

// --- Reports center (ReportsTabs overview + ReportsModeration ledger) ---
const GLOBAL_STATS = { totalStudents: 1250, totalQuestions: 4800, totalAnswers: 512000, platformAccuracy: 74.2, totalExamSessions: 9800, totalLibraryViews: 42000 };
const REVENUE = [
  { period: '2025-06', revenue: 2600, codesSold: 62, newSubscriptions: 58 },
  { period: '2025-07', revenue: 2900, codesSold: 70, newSubscriptions: 64 },
  { period: '2025-08', revenue: 3100, codesSold: 76, newSubscriptions: 71 },
  { period: '2025-09', revenue: 3500, codesSold: 84, newSubscriptions: 78 },
  { period: '2025-10', revenue: 3900, codesSold: 91, newSubscriptions: 83 },
  { period: '2025-11', revenue: 4200, codesSold: 96, newSubscriptions: 90 },
];
const STUDENT_GROWTH = [
  { date: '2025-11-20', newRegistrations: 11, activeUsers: 280 },
  { date: '2025-11-21', newRegistrations: 9, activeUsers: 291 },
  { date: '2025-11-22', newRegistrations: 14, activeUsers: 302 },
  { date: '2025-11-23', newRegistrations: 8, activeUsers: 296 },
  { date: '2025-11-24', newRegistrations: 13, activeUsers: 308 },
  { date: '2025-11-25', newRegistrations: 10, activeUsers: 310 },
];
const MODERATION_REPORTS = {
  items: [
    { id: 'mr-1', questionId: 'q-1', questionText: 'أي غرفة القلب تستقبل الدم المؤكسج؟', studentId: 'st-1', studentName: 'طالب الاختبار', reasonType: 'WrongAnswer', description: 'الإجابة النموذجية غير دقيقة.', status: 'Pending', assignedTo: null, assignedToName: null, reviewedBy: null, reviewedAt: null, resolvedBy: null, resolvedByName: null, resolvedAt: null, resolutionNotes: null, createdAt: '2025-11-24T10:12:00Z', updatedAt: '2025-11-24T10:12:00Z' },
  ],
  total: 1, page: 1, pageSize: 15, totalPages: 1,
};
// Analytics tabs (only the overview tab loads by default; the rest are mocked
// for completeness — same honest-minimal shape discipline).
const ANALYTICS_STUDENTS = { totalStudents: 1250, newRegistrations: 65, activeStudents: 310, inactiveStudents: 42, inactiveThresholdDate: '2025-10-26T00:00:00Z', dailyBreakdown: [{ date: '2025-11-25', registrations: 10 }] };
const ANALYTICS_ACADEMIC = { subjectStats: [{ subjectId: 'su1', subjectName: 'علم وظائف الأعضاء', totalAttempts: 5200, passRate: 61.5, averageScore: 68.4 }], hardestQuestions: [{ questionId: 'q-2', questionText: 'ما ضغط الدم الانقباضي الطبيعي؟', totalAttempts: 48, correctRate: 33.3 }] };
const ANALYTICS_EXAMS = { publishedCount: 2, draftCount: 1, archivedCount: 0, totalSessions: 48, completedCount: 40, completionRate: 83.3, passRate: 75, avgDurationMinutes: 27, scoreDistribution: [{ range: '80-89', count: 14 }] };
const ANALYTICS_QUESTIONS = { publishedCount: 1, draftCount: 1, archivedCount: 0, mostReported: [{ questionId: 'q-2', questionText: 'ما ضغط الدم الانقباضي الطبيعي؟', reportsCount: 2, mostCommonReason: 'WrongAnswer' }], topAttempted: [{ questionId: 'q-1', questionText: 'أي غرفة القلب تستقبل الدم المؤكسج؟', attempts: 48, correctRate: 92.7 }] };
const ANALYTICS_CONTENT = { publishedFiles: 1, draftFiles: 0, archivedFiles: 0, totalStorageBytes: 1048576, totalStorageMB: 1, totalViews: 12, viewsByType: [{ type: 'Pdf', count: 1, totalSize: 1048576, views: 12 }], pendingScans: 0, failedScans: 0, infectedFiles: 0 };
const ANALYTICS_CODES = { totalIssued: 96, activated: 90, expired: 4, revoked: 2, activationRate: 93.8, activeSubscriptions: 640, estimatedValue: 4200, estimatedValueNote: 'قيمة تقديرية للأشهر الستة الأخيرة.', dailyActivation: [{ date: '2025-11-25', activated: 3 }] };
const ANALYTICS_OPERATIONS = { totalSecurityEvents: 120, successfulLogins: 900, failedLogins: 30, loginSuccessRate: 96.8, securityEventsByType: [{ eventType: 'LoginFailed', count: 30 }] };

// --- Settings + feature flags (PR-7 DTOs) ---
const SYSTEM_SETTINGS = [
  { id: 'set-1', key: 'Security.SessionLifetimeMinutes', value: '120', valueType: 'int', allowedValues: null, description: 'مدة جلسة المدير بالدقائق', category: 'Security', updatedBy: 'system', updatedAt: '2025-11-01T00:00:00Z', createdAt: '2025-01-01T00:00:00Z' },
  { id: 'set-2', key: 'Content.MaxUploadMb', value: '40', valueType: 'int', allowedValues: null, description: 'الحد الأقصى لحجم الملف المرفوع', category: 'Content', updatedBy: 'system', updatedAt: '2025-11-01T00:00:00Z', createdAt: '2025-01-01T00:00:00Z' },
  { id: 'set-3', key: 'Codes.MaxActivePerStudent', value: '5', valueType: 'int', allowedValues: null, description: 'أقصى عدد اشتراكات نشطة لكل طالب', category: 'Codes', updatedBy: null, updatedAt: '2025-06-01T00:00:00Z', createdAt: '2025-01-01T00:00:00Z' },
];
const FEATURE_FLAGS = [
  { key: 'Security.EnforceDeviceBinding', rawEnvName: 'SECURITY__ENFORCEDEVICEBINDING', value: 'true', valueType: 'bool', source: 'default', editable: false },
];
const SETTING_HISTORY = {
  items: [
    { id: 'h-1', key: 'Security.SessionLifetimeMinutes', oldValue: '90', newValue: '120', changedBy: 'a-1', changedByName: 'مدير الاختبار', changedAt: '2025-11-01T00:00:00Z', reason: 'update' },
  ],
  total: 1, page: 1, pageSize: 10, totalPages: 1,
};

// --- Content pages (W16.5 ContentCenter) ---
const CONTENT_PAGES = [
  { slug: 'terms', titleAr: 'شروط الاستخدام', bodyAr: 'نص شروط الاستخدام لغرض المحاكاة.', updatedAt: '2025-11-20T10:00:00Z' },
  { slug: 'privacy', titleAr: 'سياسة الخصوصية', bodyAr: 'نص سياسة الخصوصية لغرض المحاكاة.', updatedAt: '2025-11-20T10:00:00Z' },
  { slug: 'contact', titleAr: 'تواصل معنا', bodyAr: 'نص صفحة التواصل لغرض المحاكاة.', updatedAt: '2025-11-20T10:00:00Z' },
];

// --- Offline packages (Wave 4 OfflineCenter ledger) ---
const OFFLINE_PACKAGES = [
  { packageId: 'pkg-1', studentId: 'st-1', studentName: 'طالب الاختبار', installationId: 'e2e-install-1', contentVersion: 3, status: 'active', issuedAt: '2025-11-20T09:00:00Z', expiresAt: '2026-11-20T09:00:00Z', revokedAt: null, createdAt: '2025-11-20T09:00:00Z' },
];

// --- Library files (defensive — the default /library view has no active filter,
//     so no files fetch fires until a filter is set; shape matches the admin list DTO) ---
const LIBRARY_FILES_PAGE = {
  items: [
    { id: 'f-1', subjectId: 'su1', lectureId: 'l1', subjectNameAr: 'علم وظائف الأعضاء', title: 'ملف تجريبي — ملخص القلب', type: 'Pdf', category: 'Summary', fileSize: 1048576, durationSeconds: null, status: 'Published', virusScanStatus: 'Clean', createdAt: '2025-11-01T00:00:00Z', pdfProcessingStatus: 'Ready', processingError: null, fontPipelineFixed: false, diagnosticReport: null, healthStatus: 'Healthy', contentProcessingStatus: null, enableScripts: false, viewsCount: 12, favoritesCount: 1, retentionState: null, quarantinedAt: null, quarantinedBy: null, quarantineReason: null, tombstonedAt: null, tombstonedBy: null, retentionExpiresAt: null },
  ],
  total: 1, page: 1, pageSize: 25, totalPages: 1,
};

// ===== The mock world =====
// Registration order matters: the fail-visible catch-all goes FIRST, then every
// specific route — later registrations take precedence in Playwright.
/** PR-10 mock world — reusable (the smoke script and diagnostics import it). */
export async function mockWorld(context, sink = [], { seed = true } = {}) {
  if (seed) {
    await context.addInitScript((user) => {
      sessionStorage.setItem('cms-admin-token', 'e2e-dummy-access');
      sessionStorage.setItem('cms-admin-refresh', 'e2e-dummy-refresh');
      sessionStorage.setItem('cms-admin-user', JSON.stringify(user));
    }, E2E_ADMIN_USER);
  }

  // Fail-visible default: any unmocked /api/v1/** route aborts and is recorded.
  await context.route('**/api/v1/**', (route) => {
    const entry = `${route.request().method()} ${route.request().url()}`;
    sink.push(entry);
    if (process.env.E2E_DEBUG) console.log('ABORT:', entry);
    route.abort();
  });

  // Health probe + auth/session envelope.
  await context.route('**/health', (route) => route.fulfill({ json: { status: 'Healthy' } }));
  await context.route('**/api/v1/auth/refresh', (route) => route.fulfill({ json: { accessToken: 'e2e-access-2' } }));
  await context.route('**/api/v1/auth/admin/login', (route) =>
    route.fulfill({ json: { accessToken: 'e2e-dummy-access', refreshToken: 'e2e-dummy-refresh', tokenType: 'Bearer', expiresIn: 3600, user: E2E_ADMIN_USER } }));
  await context.route('**/api/v1/auth/admin/me', (route) => route.fulfill({ json: E2E_ADMIN_USER }));
  await context.route('**/api/v1/auth/admin/me/permissions', (route) => route.fulfill({ json: [] }));
  await context.route('**/api/v1/auth/admin/me/ui-permissions', (route) =>
    route.fulfill({ json: { mode: 'super_admin', isSuperAdmin: true, registryVersion: 'v2', allKeys: [], allowedKeys: [] } }));
  await context.route('**/api/v1/notifications/unread-count', (route) => route.fulfill({ json: { count: 0 } }));

  // App-level management data (fetched on every authenticated view).
  await context.route('**/api/v1/admin/admins?*', (route) => route.fulfill({ json: ADMINS_PAGE }));
  await context.route('**/api/v1/admin/roles', (route) => route.fulfill({ json: ROLES }));

  // Overview dashboard + feeds.
  await context.route('**/api/v1/admin/dashboard', (route) => route.fulfill({ json: DASHBOARD }));
  await context.route('**/api/v1/admin/dashboard/recent-activity?*', (route) => route.fulfill({ json: RECENT_ACTIVITY }));
  await context.route('**/api/v1/admin/dashboard/top-subjects?*', (route) => route.fulfill({ json: TOP_SUBJECTS }));
  await context.route('**/api/v1/admin/dashboard/reports/summary', (route) => route.fulfill({ json: DASHBOARD_REPORTS_SUMMARY }));

  // Activity monitor (overview activity tab).
  await context.route('**/api/v1/admin/activity/sessions?*', (route) => route.fulfill({ json: ACTIVITY_SESSIONS }));
  await context.route('**/api/v1/admin/activity/logs?*', (route) => route.fulfill({ json: ACTIVITY_LOGS }));

  // Academic cascade (D4). Query-tolerant: AcademicCenter appends
  // ?includeArchived=… while the other centers hydrate without a query.
  await context.route('**/api/v1/universities?*', (route) => route.fulfill({ json: UNIVERSITIES_PAGE }));
  await context.route('**/api/v1/universities/*/colleges*', (route) => route.fulfill({ json: COLLEGES }));
  await context.route('**/api/v1/colleges/*/years*', (route) => route.fulfill({ json: YEARS }));
  await context.route('**/api/v1/years/*/semesters*', (route) => route.fulfill({ json: SEMESTERS }));
  await context.route('**/api/v1/semesters/*/subjects*', (route) => route.fulfill({ json: SUBJECTS }));
  await context.route('**/api/v1/admin/content/academic/subjects/*/lectures*', (route) => route.fulfill({ json: LECTURES }));

  // Questions center.
  await context.route('**/api/v1/admin/questions?*', (route) => route.fulfill({ json: QUESTIONS_PAGE }));
  await context.route('**/api/v1/admin/questions/facets?*', (route) => route.fulfill({ json: QUESTION_FACETS }));

  // Exams + exam-course bundles.
  await context.route('**/api/v1/admin/exams?*', (route) => route.fulfill({ json: EXAM_PAGE }));
  await context.route('**/api/v1/admin/exam-courses?*', (route) => route.fulfill({ json: EXAM_COURSE_LIST }));

  // Students center (list only — the drawer is not part of this smoke).
  await context.route('**/api/v1/admin/students?*', (route) => route.fulfill({ json: STUDENTS_PAGE }));

  // Codes center.
  await context.route('**/api/v1/admin/codes?*', (route) => route.fulfill({ json: CODES_PAGE }));

  // Audit center + security center (contract G shares /security/audit-logs).
  await context.route('**/api/v1/security/alerts?*', (route) => route.fulfill({ json: SECURITY_ALERTS }));
  await context.route('**/api/v1/security/audit-logs?*', (route) => {
    const url = new URL(route.request().url());
    route.fulfill({ json: auditEventsFor(url.searchParams) });
  });
  await context.route('**/api/v1/security/summary', (route) => route.fulfill({ json: SECURITY_SUMMARY }));

  // Servers dashboard (PR-9): summary + per-provider envelopes + history.
  await context.route('**/api/v1/admin/servers/summary', (route) => route.fulfill({ json: SERVERS_SUMMARY }));
  await context.route('**/api/v1/admin/servers/render', (route) => route.fulfill({ json: RENDER_ENVELOPE }));
  await context.route('**/api/v1/admin/servers/vercel', (route) => route.fulfill({ json: VERCEL_ENVELOPE }));
  await context.route('**/api/v1/admin/servers/neon', (route) => route.fulfill({ json: NEON_ENVELOPE }));
  await context.route('**/api/v1/admin/servers/github', (route) => route.fulfill({ json: GITHUB_ENVELOPE }));
  await context.route('**/api/v1/admin/servers/*/history', (route) =>
    route.fulfill({ json: PROVIDER_HISTORY(new URL(route.request().url()).pathname.split('/').at(-2)) }));

  // Reports center: overview tab + moderation ledger.
  await context.route('**/api/v1/stats/global?*', (route) => route.fulfill({ json: GLOBAL_STATS }));
  await context.route('**/api/v1/admin/revenue?*', (route) => route.fulfill({ json: REVENUE }));
  await context.route('**/api/v1/admin/student-growth?*', (route) => route.fulfill({ json: STUDENT_GROWTH }));
  await context.route('**/api/v1/admin/reports?*', (route) => route.fulfill({ json: MODERATION_REPORTS }));
  await context.route('**/api/v1/admin/analytics/students?*', (route) => route.fulfill({ json: ANALYTICS_STUDENTS }));
  await context.route('**/api/v1/admin/analytics/academic?*', (route) => route.fulfill({ json: ANALYTICS_ACADEMIC }));
  await context.route('**/api/v1/admin/analytics/exams?*', (route) => route.fulfill({ json: ANALYTICS_EXAMS }));
  await context.route('**/api/v1/admin/analytics/questions?*', (route) => route.fulfill({ json: ANALYTICS_QUESTIONS }));
  await context.route('**/api/v1/admin/analytics/content?*', (route) => route.fulfill({ json: ANALYTICS_CONTENT }));
  await context.route('**/api/v1/admin/analytics/codes?*', (route) => route.fulfill({ json: ANALYTICS_CODES }));
  await context.route('**/api/v1/admin/analytics/operations?*', (route) => route.fulfill({ json: ANALYTICS_OPERATIONS }));

  // Settings center: registry list (bare + ?category=), history, feature flags.
  await context.route('**/api/v1/admin/settings/*', (route) => route.fulfill({ json: SETTING_HISTORY }));
  await context.route('**/api/v1/admin/settings*', (route) => route.fulfill({ json: SYSTEM_SETTINGS }));
  await context.route('**/api/v1/admin/settings/feature-flags', (route) => route.fulfill({ json: FEATURE_FLAGS }));
  await context.route('**/api/v1/admin/settings/*/history?*', (route) => route.fulfill({ json: SETTING_HISTORY }));

  // Content pages center (W16.5).
  await context.route('**/api/v1/admin/content', (route) => route.fulfill({ json: CONTENT_PAGES }));

  // Library files (defensive — only fetched with an active filter).
  await context.route('**/api/v1/admin/content/files?*', (route) => route.fulfill({ json: LIBRARY_FILES_PAGE }));

  // Offline packages ledger (Wave 4).
  await context.route('**/api/v1/admin/offline/packages?*', (route) => route.fulfill({ json: OFFLINE_PACKAGES }));
}
