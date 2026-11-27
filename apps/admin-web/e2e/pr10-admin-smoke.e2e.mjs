/**
 * PR-10 — admin-web Playwright visual smoke/regression matrix.
 *
 * Drives the REAL vite dev server (http://127.0.0.1:5174) with a FULLY MOCKED
 * API via context.route interception (the w143-mock-world.mjs contract: a
 * seeded super_admin session in sessionStorage + a fail-visible catch-all that
 * ABORTS every unmocked /api/v1/** route, so a missing fixture is loud, not
 * silently green). No real network API call is ever made.
 *
 * What it does per the PR-10 binding:
 *   • visits EVERY admin route from App.tsx VIEW_PATHS (all 17, including the
 *     PR-6 /security and PR-9 /servers surfaces) plus the PR-2 route-level 404
 *     (NotFoundView on an unknown path),
 *   • screenshots each view at 375 / 768 / 1440 (clean deterministic names:
 *     pr10-<view>-<width>.png) — plus the pre-login screen at 375/1440 with no
 *     session seeded,
 *   • per-view lightweight assertions: the URL pathname is the intended route,
 *     a stable per-view data-testid / heading / row text renders, and NO
 *     horizontal scroll (documentElement + body + ground-truth scrollable delta)
 *     at every width,
 *   • axe-core scan (wcag2a/aa + wcag21aa + wcag22aa) at 768px per view —
 *     gate: 0 critical / 0 serious violations,
 *   • a mock-world completeness gate: the fail-visible abort catch-all must
 *     never fire (zero unmocked /api/v1 requests per view).
 *
 * Console-error policy (mirrors w14.3-admin-ui.e2e.mjs):
 *   • pageerror events (uncaught exceptions) FAIL the view — they mean the
 *     view crashed, not merely logged.
 *   • console.error messages are tolerated and reported (non-gating): dev-mode
 *     React warnings and "Failed to load resource" noise from any aborted
 *     request are not render regressions. The mock-world abort gate above is
 *     the real "a fixture is missing" tripwire; the pageerror gate is the real
 *     "the view exploded" tripwire.
 *
 * RAM contract (hard rule, same as w14.3): ONE Chromium instance, every
 * scenario runs in its own browser.newContext(), browser closed at the end;
 * peak Chrome RSS sampled at 400ms (ceiling 1.6GB).
 *
 * Run (dev server on 127.0.0.1:5174 — note the sandbox vite default binds
 * [::1] only, so start it with an IPv4 host, e.g.
 * `cd apps/admin-web && node_modules/.bin/vite --host 127.0.0.1`):
 *   E2E_ADMIN_URL=http://127.0.0.1:5174 node e2e/pr10-admin-smoke.e2e.mjs
 * Env overrides (same knobs as w14.3):
 *   E2E_PLAYWRIGHT_MODULE — playwright module path
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE — Chromium binary path
 *   E2E_AXE_JS — axe-core axe.js path
 *   E2E_DEBUG — print every aborted (unmocked) route as it happens
 */
let chromium;
const PLAYWRIGHT_CANDIDATES = [
  process.env.E2E_PLAYWRIGHT_MODULE,
  'file:///home/z/cms-platform-manus/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs',
  'playwright',
].filter(Boolean);
for (const candidate of PLAYWRIGHT_CANDIDATES) {
  try { ({ chromium } = await import(candidate)); break; } catch { /* try next */ }
}
if (!chromium) {
  console.error('playwright module not found — set E2E_PLAYWRIGHT_MODULE');
  process.exit(1);
}
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:5174';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));
// PR-10: AXE_JS honors the E2E_AXE_JS override; the default is THIS workspace's
// pnpm-resolved axe-core (the cms-work path only exists on the old sandbox).
const AXE_JS = process.env.E2E_AXE_JS
  ?? '/home/z/cms-platform-manus/node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.js';
const WIDTHS = [375, 768, 1440];
const AXE_WIDTH = 768;
// W14.3 D4 shared academic URL context — the subject-scoped views hydrate from
// these query params (Questions / Exams / ExamCourses centers).
const SUBJECT_QUERY = 'univ=u1&college=c1&year=y1&semester=s1&subject=su1';

mkdirSync(SHOT_DIR, { recursive: true });

// ===== §13 helpers =====
const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log(`${ok ? '  PASS' : '! FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

async function hScroll(page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    const start = doc.scrollLeft;
    doc.scrollLeft = 99999; // RTL clamps toward the inline-start extreme
    const a = doc.scrollLeft;
    doc.scrollLeft = -99999;
    const b = doc.scrollLeft;
    doc.scrollLeft = start;
    return {
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
      // Ground truth: can the user actually scroll horizontally? (RTL scroll
      // region quirk makes scrollWidth alone unreliable — W14.3 finding.)
      scrollableDelta: Math.abs(a - b),
    };
  });
}

async function axeScan(page, label) {
  await page.addScriptTag({ content: readFileSync(AXE_JS, 'utf-8') });
  const axeResult = await page.evaluate(async () => {
    const axe = window.axe;
    const r = await axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
    });
    return {
      total: r.violations.length,
      blocking: r.violations
        .filter(v => v.impact === 'critical' || v.impact === 'serious')
        .map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, first: v.nodes[0]?.target?.[0] ?? '' })),
    };
  });
  check(`AXE ${label}: 0 critical/serious`, axeResult.blocking.length === 0,
    `${axeResult.total} rule(s), blocking=${axeResult.blocking.length}${axeResult.blocking.length ? ' :: ' + JSON.stringify(axeResult.blocking) : ''}`);
  return axeResult;
}

// ===== RAM sampler (best-effort, same as w14.3) =====
let peakChromeRssKb = 0;
const sampler = setInterval(() => {
  try {
    const out = execSync("ps -C chrome --no-headers -o rss= 2>/dev/null | awk '{s+=$1} END {print s+0}'", { stdio: ['ignore', 'pipe', 'ignore'] });
    const kb = Number(out.toString().trim());
    if (kb > peakChromeRssKb) peakChromeRssKb = kb;
  } catch { /* sampler is best-effort */ }
}, 400);

const consoleErrors = [];

// ≤1024px the sidebar is off-canvas (globals.css @media max-width:1024) — open it first.
async function openNav(page, width) {
  await page.locator('.admin-shell').waitFor({ timeout: 15000 });
  if (width <= 1024) {
    await page.getByRole('button', { name: 'فتح القائمة' }).click();
    await page.waitForTimeout(250);
  }
}

// ======================================================================
// PR-10 mock world — every fixture below mirrors the DTO the component
// actually reads (lib/api.ts + per-center types). Lists are small but
// non-empty where a table row anchors the visual assertion; empty lists
// would be valid too, but a seeded row proves the wire shape end-to-end.
// ======================================================================

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
  overallStatus: 'operational',
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

// ======================================================================
// The view matrix — every VIEW_PATHS route (App.tsx) + the PR-2 404.
// ready: structural selector that proves the view mounted; content: a
// stable data-testid / row text that proves the fixture wired end-to-end.
// ======================================================================
const VIEWS = [
  {
    name: 'overview', path: '/',
    ready: '[data-testid="dashboard-feeds"]',
    content: (page) => page.locator('.stat-value', { hasText: '1250' }).first().waitFor({ timeout: 10000 }),
    contentDesc: 'dashboard stat 1250 renders',
  },
  {
    name: 'admins', path: '/admins',
    ready: '[data-testid="admins-page-header"]',
    content: (page) => page.locator('td', { hasText: 'e2e-admin@test.example' }).first().waitFor({ timeout: 10000 }),
    contentDesc: 'admin row renders',
  },
  {
    name: 'roles', path: '/roles',
    ready: 'h2:has-text("أدوار الوصول")',
    content: (page) => page.locator('.content').getByText('مدير المحتوى').first().waitFor({ timeout: 10000 }),
    contentDesc: 'role row renders',
  },
  {
    name: 'audit', path: '/audit',
    ready: 'h2:has-text("السجل الأمني")',
    content: (page) => page.locator('.content').getByText('محاولة دخول فاشلة متكررة').first().waitFor({ timeout: 10000 }),
    contentDesc: 'security alert row renders',
  },
  {
    name: 'academic', path: '/academic',
    ready: 'h2:has-text("من الجامعة إلى المحاضرة")',
    content: (page) => page.locator('.content').getByText('جامعة الاختبار').first().waitFor({ timeout: 10000 }),
    contentDesc: 'university directory row renders',
  },
  {
    name: 'codes', path: '/codes',
    ready: '[data-testid="open-generate-modal"]',
    content: (page) => page.locator('.content').getByText('CMS-TEST-0001').first().waitFor({ timeout: 10000 }),
    contentDesc: 'code ledger row renders',
  },
  {
    name: 'students', path: '/students',
    ready: 'h2:has-text("الطلاب")',
    content: (page) => page.locator('.content').getByText('طالب الاختبار').first().waitFor({ timeout: 10000 }),
    contentDesc: 'student row renders',
  },
  {
    name: 'questions', path: `/questions?${SUBJECT_QUERY}`,
    ready: '[data-testid="questions-toolbar"]',
    content: (page) => page.locator('.content').getByText('أي غرفة القلب تستقبل').first().waitFor({ timeout: 10000 }),
    contentDesc: 'question bank row renders',
  },
  {
    name: 'exams', path: `/exams?${SUBJECT_QUERY}`,
    ready: 'h2:has-text("الاختبارات")',
    content: (page) => page.locator('.content').getByText('اختبار الدورة الدموية النهائي').first().waitFor({ timeout: 10000 }),
    contentDesc: 'exam row renders',
  },
  {
    name: 'exam-courses', path: `/exam-courses?${SUBJECT_QUERY}`,
    ready: 'td:has-text("دورة امتحانات نصف السنة الأولى")',
    content: (page) => page.locator('td', { hasText: 'دورة امتحانات نصف السنة الأولى' }).first().waitFor({ timeout: 10000 }),
    contentDesc: 'bundle row renders',
  },
  {
    name: 'library', path: '/library',
    ready: '[data-testid="library-lifecycle-filter"]',
    content: (page) => page.locator('.content').getByText('مركز المكتبة والملفات').first().waitFor({ timeout: 10000 }),
    contentDesc: 'library header renders',
  },
  {
    name: 'reports', path: '/reports',
    ready: 'h2:has-text("مركز التحليلات")',
    content: (page) => page.locator('.content').getByText('1250').first().waitFor({ timeout: 10000 }),
    contentDesc: 'overview stat card renders',
  },
  {
    name: 'settings', path: '/settings',
    ready: '[data-testid="setting-type-Security.SessionLifetimeMinutes"]',
    content: (page) => page.locator('[data-testid="settings-feature-flags"]').first().waitFor({ timeout: 10000 }),
    contentDesc: 'feature-flags inventory renders',
  },
  {
    name: 'content', path: '/content',
    ready: 'h2:has-text("صفحات المحتوى")',
    content: (page) => page.locator('.content').getByText('شروط الاستخدام').first().waitFor({ timeout: 10000 }),
    contentDesc: 'content page row renders',
  },
  {
    name: 'offline', path: '/offline',
    ready: '[data-testid="offline-center-root"]',
    content: (page) => page.locator('[data-testid="offline-row-pkg-1"]').first().waitFor({ timeout: 10000 }),
    contentDesc: 'offline package row renders',
  },
  {
    name: 'security', path: '/security',
    ready: '[data-testid="security-center"]',
    content: (page) => page.locator('[data-testid="security-event-row-ev-1"]').first().waitFor({ timeout: 10000 }),
    contentDesc: 'security event row renders',
  },
  {
    name: 'servers', path: '/servers',
    ready: '[data-testid="servers-card-render"]',
    content: (page) => page.locator('[data-testid="servers-render-service"]').first().waitFor({ timeout: 10000 }),
    contentDesc: 'render provider service card renders',
  },
  {
    name: 'not-found', path: '/nonexistent',
    ready: '[data-testid="not-found"]',
    content: (page) => page.locator('[data-testid="not-found"]').getByText('الصفحة غير موجودة').first().waitFor({ timeout: 10000 }),
    contentDesc: '404 copy renders',
  },
];

const viewPathName = (view) => new URL(`http://x${view.path}`).pathname;

// ======================================================================
// Scenario runner
// ======================================================================
try {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  // ============ Login screen — no session (empty state) ============
  console.log('\n== A. Login screen (no session) — 375 / 1440 ==');
  for (const width of [375, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 740 : 900 } });
    const aborts = [];
    const pageErrors = [];
    await mockWorld(context, aborts, { seed: false });
    const page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`login/${width}: ${message.text()}`); });
    page.on('pageerror', (error) => pageErrors.push(`login/${width}: ${String(error).slice(0, 200)}`));
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    let ok = true;
    let extra = '';
    try {
      await page.locator('.login-shell').waitFor({ timeout: 15000 });
      await page.locator('.login-shell').getByText('دخول إلى لوحة الإدارة').first().waitFor({ timeout: 8000 });
    } catch (error) {
      ok = false;
      extra = `login shell/title missing (${String(error).split('\n')[0]})`;
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOT_DIR}pr10-login-${width}.png`, fullPage: true });
    const scroll = await hScroll(page);
    const scrollOk = scroll.doc <= 0 && scroll.body <= 0 && scroll.scrollableDelta <= 1;
    check(`pr10 login @${width}px: shell + title + no horizontal scroll`, ok && scrollOk,
      `${extra ? extra + ' ' : ''}docΔ=${scroll.doc} bodyΔ=${scroll.body} scrollΔ=${scroll.scrollableDelta}`);
    check(`pr10 login @${width}px: 0 unmocked /api/v1 routes`, aborts.length === 0,
      aborts.length ? `aborted: ${aborts.slice(0, 3).join(' ; ')}` : '');
    check(`pr10 login @${width}px: 0 page errors`, pageErrors.length === 0,
      pageErrors.length ? pageErrors[0] : '');
    await context.close();
  }

  // ============ The full view matrix (17 VIEW_PATHS routes + the 404) ============
  for (const view of VIEWS) {
    console.log(`\n== ${view.name} — ${WIDTHS.join('/')}px matrix + axe @${AXE_WIDTH}px ==`);
    const viewAborts = [];
    const viewPageErrors = [];
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: width < 500 ? 740 : 900 },
      });
      await mockWorld(context, viewAborts);
      const page = await context.newPage();
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`${view.name}/${width}: ${message.text()}`); });
      page.on('pageerror', (error) => viewPageErrors.push(`${view.name}/${width}: ${String(error).slice(0, 200)}`));

      await page.goto(`${BASE_URL}${view.path}`, { waitUntil: 'domcontentloaded' });
      let readyOk = true;
      let contentOk = true;
      let detail = '';
      try {
        await page.locator(view.ready).first().waitFor({ timeout: 15000 });
      } catch (error) {
        readyOk = false;
        detail = `ready selector missing: ${view.ready} (${String(error).split('\n')[0]})`;
      }
      if (readyOk) {
        try {
          await view.content(page);
        } catch (error) {
          contentOk = false;
          detail = `content assertion failed: ${view.contentDesc} (${String(error).split('\n')[0]})`;
        }
      }
      // ≤1024px the sidebar is off-canvas — open it so the screenshot shows the
      // nav (same convention as w14.3).
      if (readyOk) {
        try { await openNav(page, width); } catch { /* nav already open or shell absent */ }
      }
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SHOT_DIR}pr10-${view.name}-${width}.png`, fullPage: true });

      const urlOk = new URL(page.url()).pathname === viewPathName(view);
      const scroll = await hScroll(page);
      const scrollOk = scroll.doc <= 0 && scroll.body <= 0 && scroll.scrollableDelta <= 1;
      check(`pr10 ${view.name} @${width}px: url + content + no horizontal scroll`,
        urlOk && readyOk && contentOk && scrollOk,
        `url=${urlOk ? 'ok' : new URL(page.url()).pathname} ready=${readyOk ? 'ok' : 'FAIL'} content=${contentOk ? view.contentDesc : 'FAIL'} docΔ=${scroll.doc} bodyΔ=${scroll.body} scrollΔ=${scroll.scrollableDelta}${detail ? ` :: ${detail}` : ''}`);

      if (width === AXE_WIDTH) {
        if (readyOk) {
          await axeScan(page, `${view.name} @${width}px`);
        } else {
          check(`AXE ${view.name} @${width}px: skipped (view did not mount)`, false, 'view not rendered — cannot scan');
        }
      }
      await context.close();
    }
    check(`pr10 ${view.name}: 0 unmocked /api/v1 routes (fail-visible catch-all never hit)`,
      viewAborts.length === 0,
      viewAborts.length ? `aborted: ${viewAborts.slice(0, 3).join(' ; ')}` : '');
    check(`pr10 ${view.name}: 0 page errors (pageerror events)`,
      viewPageErrors.length === 0,
      viewPageErrors.length ? viewPageErrors[0] : '');
  }

  await browser.close();
} finally {
  clearInterval(sampler);
}

const failed = results.filter(r => !r.ok);
console.log(`\n==== pr10-admin-smoke E2E: ${results.length - failed.length}/${results.length} checks passed ====`);
console.log(`peak Chromium RSS: ${(peakChromeRssKb / 1024).toFixed(0)} MB (ceiling 1562 MB)`);
// Console-error policy: tolerated (non-gating) — dev-mode warnings + the
// "Failed to load resource" noise aborted requests emit. The gating tripwires
// are the pageerror check (crashes) and the unmocked-route check (fixture gaps).
const realErrors = consoleErrors.filter(text => !text.includes('ui-permissions') && !text.includes('Failed to load resource'));
console.log(`console errors (tolerated, excluding mocked-route noise): ${realErrors.length}`);
realErrors.slice(0, 8).forEach(text => console.log('  •', text.slice(0, 220)));
console.log(`screenshot matrix: ${VIEWS.length} views x ${WIDTHS.length} widths + login (2) -> ${VIEWS.length * WIDTHS.length + 2} shots in e2e/screenshots/`);
// Failure triage so a red run is immediately interpretable: axe gate failures
// (a11y regressions in src, out of e2e scope) vs horizontal-scroll failures
// (shell layout overflow) vs render/mount failures (fixture or view wiring).
const axeFails = failed.filter(r => r.name.startsWith('AXE'));
const hscrollFails = failed.filter(r => r.name.includes('no horizontal scroll'));
const renderFails = failed.filter(r => !axeFails.includes(r) && !hscrollFails.includes(r));
console.log(`failure breakdown: axe=${axeFails.length} h-scroll=${hscrollFails.length} render/mock=${renderFails.length}`);
if (renderFails.length) {
  console.log('render/mock failures (fixture or view wiring — fix these first):');
  renderFails.forEach(r => console.log('  !', r.name));
}
process.exitCode = failed.length === 0 ? 0 : 1;
