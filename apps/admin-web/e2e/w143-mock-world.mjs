/**
 * Wave 14.3 — shared mock API world for the admin e2e evidence scripts.
 * Same contract as admin-upload.e2e.mjs: context.route interception with a
 * seeded super_admin session; every unmocked /api/v1/** route aborts (fail-visible).
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

export const EXAM_COURSE_LIST = [
  { id: 'ec-1', subjectId: 'su1', nameAr: 'دورة امتحانات نصف السنة الأولى', nameEn: 'First midterm bundle', coverUrl: null, year: 2025, semester: 1, courseType: 'First', freeOrPaid: false, status: 'Published', examsCount: 2, sortOrder: 0 },
  { id: 'ec-2', subjectId: 'su1', nameAr: 'دورة النماذج الامتحانية', nameEn: null, coverUrl: null, year: 2025, semester: 2, courseType: 'Model', freeOrPaid: true, status: 'Draft', examsCount: 3, sortOrder: 1 },
  { id: 'ec-3', subjectId: 'su1', nameAr: 'دورة تدريبية تجريبية', nameEn: null, coverUrl: null, year: 2024, semester: 3, courseType: 'Practice', freeOrPaid: true, status: 'Archived', examsCount: 1, sortOrder: 2 },
];

export const EXAM_COURSE_DETAIL = (id) => ({
  id, subjectId: 'su1', subjectName: 'علم وظائف الأعضاء', nameAr: 'دورة امتحانات نصف السنة الأولى',
  nameEn: 'First midterm bundle', description: 'باقة اختبارات شاملة لنصف السنة — ثلاثة نماذج.',
  coverUrl: null, year: 2025, semester: 1, courseType: 'First', freeOrPaid: false,
  sortOrder: 0, status: 'Published', createdAt: '2025-11-01T09:00:00Z', updatedAt: '2025-11-20T09:00:00Z',
  items: [
    { itemId: 'eci-1', examId: 'ex-1', examTitleAr: 'اختبار الدورة الدموية النهائي', modelLetter: 'A', examTotalQuestions: 50, examDurationMinutes: 60, examStatus: 'Published', sortOrder: 0 },
    { itemId: 'eci-2', examId: 'ex-2', examTitleAr: 'اختبار الجهاز التنفسي', modelLetter: null, examTotalQuestions: 30, examDurationMinutes: 45, examStatus: 'Published', sortOrder: 1 },
  ],
});

export const EXAM_PAGE = {
  items: [
    { id: 'ex-1', subjectId: 'su1', lectureId: null, titleAr: 'اختبار الدورة الدموية النهائي', slug: 'circulation-final', examType: 'Final', year: 2025, totalQuestions: 50, durationMinutes: 60, availableFrom: null, availableUntil: null, maxAttempts: 2, status: 'Published', attemptsCount: 48, completedCount: 40, averageScore: 78.4 },
    { id: 'ex-2', subjectId: 'su1', lectureId: null, titleAr: 'اختبار الجهاز التنفسي', slug: 'respiratory-mid', examType: 'Midterm', year: 2025, totalQuestions: 30, durationMinutes: 45, availableFrom: null, availableUntil: null, maxAttempts: null, status: 'Published', attemptsCount: 0, completedCount: 0, averageScore: null },
    { id: 'ex-3', subjectId: 'su1', lectureId: null, titleAr: 'اختبار قصير — الأعصاب', slug: 'nerves-quiz', examType: 'Quiz', year: 2025, totalQuestions: 15, durationMinutes: 20, availableFrom: null, availableUntil: null, maxAttempts: null, status: 'Draft', attemptsCount: 0, completedCount: 0, averageScore: null },
  ],
  page: 1, pageSize: 100, totalCount: 3,
};

export const EXAM_STATS = {
  examId: 'ex-1', started: 42, attempts: 48, completed: 40, timeouts: 3,
  inProgress: 2, cancelled: 3, pass: 30, fail: 10,
  meanScore: 78.4, medianScore: 82, avgDurationSeconds: 1620,
  distribution: [
    { label: '0-9', count: 0 }, { label: '10-19', count: 0 }, { label: '20-29', count: 1 },
    { label: '30-39', count: 0 }, { label: '40-49', count: 1 }, { label: '50-59', count: 3 },
    { label: '60-69', count: 6 }, { label: '70-79', count: 9 }, { label: '80-89', count: 14 }, { label: '90-100', count: 6 },
  ],
};

export const QUESTION_STATS = [
  { questionId: 'q-1', text: 'أي غرفة القلب تستقبل الدم المؤكسج القادم من الرئتين عبر الوريد الرئوي؟', sortOrder: 1, attempts: 48, correctPercent: 92.7, mostCommonWrongChoice: null, avgDurationSeconds: 21.4, problematic: false },
  { questionId: 'q-2', text: 'ما ضغط الدم الانقباضي الطبيعي عند البالغين في وضعية الجلوس؟', sortOrder: 2, attempts: 48, correctPercent: 33.3, mostCommonWrongChoice: '120/60 مم زئبق', avgDurationSeconds: 48.9, problematic: true },
  { questionId: 'q-3', text: 'أي شريان يغذّي الجدار الخلفي للبطين الأيسر في أغلب الناس؟', sortOrder: 3, attempts: 46, correctPercent: 67.4, mostCommonWrongChoice: 'الشريان التاجي الأيسر', avgDurationSeconds: 35.2, problematic: false },
  { questionId: 'q-4', text: 'كم عدد صمامات القلب عند الإنسان الطبيعي؟', sortOrder: 4, attempts: 45, correctPercent: 84.4, mostCommonWrongChoice: null, avgDurationSeconds: 12.8, problematic: false },
  { questionId: 'q-5', text: 'سؤال محجوز للمحاكاة — لم تُسجل عليه أي محاولات بعد.', sortOrder: 5, attempts: 0, correctPercent: 0, mostCommonWrongChoice: null, avgDurationSeconds: null, problematic: false },
];

export const REPORTS_PAGE = {
  items: [
    { id: 'r-1', questionId: 'q-2', questionText: 'ما ضغط الدم الانقباضي الطبيعي عند البالغين في وضعية الجلوس؟', studentId: 'st-1', reasonType: 'Other', reportType: 'WrongAnswer', description: 'الإجابة النموذجية خاطئة — المرجع يقول 120/80 وليس 130/85.', screenshotUrl: 'https://example.org/shot-r1.png', status: 'Pending', createdAt: '2025-11-24T10:12:00Z', resolvedAt: null, resolutionNotes: null },
    { id: 'r-2', questionId: 'q-6', questionText: 'أي من التالي ليس من وظائف الكبد؟', studentId: 'st-2', reasonType: 'Other', reportType: 'Typo', description: null, screenshotUrl: null, status: 'Reviewing', createdAt: '2025-11-23T14:30:00Z', resolvedAt: null, resolutionNotes: null },
    { id: 'r-3', questionId: 'q-7', questionText: 'ما هرمون الغدة الدرقية الرئيسي؟', studentId: 'st-3', reasonType: 'Other', reportType: 'Typo', description: 'خطأ إملائي في كلمة «الدرقية».', screenshotUrl: null, status: 'Resolved', createdAt: '2025-11-20T09:00:00Z', resolvedAt: '2025-11-21T11:00:00Z', resolutionNotes: 'تم تصحيح الصياغة في المراجعة الأسبوعية.' },
  ],
  total: 3, page: 1, pageSize: 50, totalPages: 1,
};

export async function mockWorld(context) {
  await context.addInitScript((user) => {
    sessionStorage.setItem('cms-admin-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-admin-refresh', 'e2e-dummy-refresh');
    sessionStorage.setItem('cms-admin-user', JSON.stringify(user));
  }, E2E_ADMIN_USER);

  await context.route('**/api/v1/**', (route) => { if (process.env.E2E_DEBUG) console.log('ABORT:', route.request().url()); route.abort(); });
  await context.route('**/health', (route) => route.fulfill({ json: { status: 'Healthy' } }));
  await context.route('**/api/v1/auth/refresh', (route) => route.fulfill({ json: { accessToken: 'e2e-access-2' } }));
  await context.route('**/api/v1/auth/admin/me/ui-permissions', (route) =>
    route.fulfill({ json: { mode: 'super_admin', isSuperAdmin: true, registryVersion: 'v2', allKeys: [], allowedKeys: [] } }));
  await context.route('**/api/v1/notifications/unread-count', (route) => route.fulfill({ json: { count: 0 } }));
  await context.route('**/api/v1/admin/dashboard', (route) =>
    route.fulfill({
      json: {
        totalStudents: 1250, activeStudentsToday: 310, totalQuestions: 4800,
        totalActiveCodes: 96, totalActiveSubscriptions: 640, totalLibraryFiles: 220,
        totalExams: 48, pendingReports: 3, monthlyRevenue: 4200, revenueChangePercent: 4.2,
      },
    }));
  await context.route('**/api/v1/admin/roles', (route) => route.fulfill({ json: [] }));
  await context.route('**/api/v1/admin/admins?*', (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 } }));

  // Academic cascade (D4 hydration source).
  await context.route('**/api/v1/universities?*', (route) =>
    route.fulfill({ json: { items: [{ id: 'u1', nameAr: 'جامعة الاختبار', nameEn: null, slug: 'test', collegesCount: 1, isArchived: false }], total: 1, page: 1, pageSize: 100, totalPages: 1 } }));
  await context.route('**/api/v1/universities/u1/colleges', (route) =>
    route.fulfill({ json: [{ id: 'c1', nameAr: 'كلية الطب', nameEn: null, slug: 'med', yearsCount: 1, isArchived: false }] }));
  await context.route('**/api/v1/colleges/c1/years', (route) =>
    route.fulfill({ json: [{ id: 'y1', nameAr: 'السنة الأولى', nameEn: null, slug: 'y1', yearNumber: 1, semestersCount: 1, isArchived: false }] }));
  await context.route('**/api/v1/years/y1/semesters', (route) =>
    route.fulfill({ json: [{ id: 's1', nameAr: 'الفصل الأول', nameEn: null, slug: 's1', semesterNumber: 1, isArchived: false }] }));
  await context.route('**/api/v1/semesters/s1/subjects', (route) =>
    route.fulfill({ json: [{ id: 'su1', semesterId: 's1', nameAr: 'علم وظائف الأعضاء', nameEn: 'Physiology', slug: 'physio', code: null, totalLectures: 3, isArchived: false }] }));
  await context.route('**/api/v1/admin/content/academic/subjects/*/lectures', (route) => route.fulfill({ json: [] }));

  // W14.3 R78 list endpoint + detail routes.
  await context.route('**/api/v1/admin/exam-courses?*', (route) => route.fulfill({ json: EXAM_COURSE_LIST }));
  await context.route(/\/api\/v1\/admin\/exam-courses\/[0-9a-f-]+$|\/api\/v1\/admin\/exam-courses\/ec-\d+$/, (route) =>
    route.fulfill({ json: EXAM_COURSE_DETAIL(route.request().url().split('/').pop()) }));
  await context.route('**/api/v1/admin/exams?*', (route) => route.fulfill({ json: EXAM_PAGE }));
  await context.route('**/api/v1/admin/exams/ex-1/stats', (route) => route.fulfill({ json: EXAM_STATS }));
  await context.route('**/api/v1/admin/exams/ex-1/question-stats', (route) => route.fulfill({ json: QUESTION_STATS }));
  await context.route('**/api/v1/admin/questions/reports?*', (route) => route.fulfill({ json: REPORTS_PAGE }));
  await context.route(/\/api\/v1\/admin\/questions\/reports\/r-\d+\/(resolve|reject)$/, (route) => route.fulfill({ status: 204 }));
}
