/**
 * Wave 14.4 — shared mock API world for the student e2e evidence script.
 * Same contract as the W14.3 admin harness (context.route interception, seeded
 * session) but with STUDENT seeding: cms-access-token + /auth/me + a signed-shaped
 * entitlement token. Every unmocked /api/v1/** route aborts (fail-visible).
 */

export const E2E_STUDENT = {
  id: 'e2e-student-001',
  phone: '+963990000001',
  fullName: 'طالب الاختبار',
  role: 'student',
  avatarUrl: null,
  university: { id: 'u-1', nameAr: 'جامعة الاختبار' },
  college: { id: 'c-1', nameAr: 'كلية الطب' },
};

const ENTITLEMENT_TOKEN = [
  Buffer.from(JSON.stringify({ expiresAt: new Date(Date.now() + 3600_000).toISOString() })).toString('base64url'),
  'e2e', 'sig',
].join('.');

export const MY_SUBJECTS = [
  { id: 's-1', slug: 'physiology', nameAr: 'علم وظائف الأعضاء', color: null, contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
];

export const EXAM_COURSES = [
  { id: 'ec-1', nameAr: 'دورة 2025 الأولى', nameEn: null, description: 'باقة اختبارات نصف السنة.', coverUrl: null, year: 2025, semester: 1, courseType: 'First', freeOrPaid: false, examsCount: 2, sortOrder: 0 },
  { id: 'ec-2', nameAr: 'دورة 2026 الأولى', nameEn: null, description: null, coverUrl: null, year: 2026, semester: 1, courseType: 'First', freeOrPaid: true, examsCount: 3, sortOrder: 1 },
  { id: 'ec-3', nameAr: 'دورة 2026 الثانية', nameEn: null, description: null, coverUrl: null, year: 2026, semester: 2, courseType: 'Second', freeOrPaid: true, examsCount: 1, sortOrder: 2 },
];

export const EXAM_COURSE_DETAIL = {
  id: 'ec-2', nameAr: 'دورة 2026 الأولى', nameEn: null, description: 'باقة اختبارات شاملة.',
  coverUrl: null, year: 2026, semester: 1, courseType: 'First', freeOrPaid: true,
  exams: [
    { examId: 'ex-1', titleAr: 'اختبار الدورة الدموية النهائي', durationMinutes: 45, totalQuestions: 3, sortOrder: 0, inProgress: true, completed: false, attemptCount: 1, bestScore: null },
    { examId: 'ex-2', titleAr: 'اختبار الجهاز التنفسي', durationMinutes: 30, totalQuestions: 2, sortOrder: 1, inProgress: false, completed: true, attemptCount: 2, bestScore: 80 },
  ],
};

export const PRACTICE_TREE = {
  subjectId: 's-1', subjectName: 'علم وظائف الأعضاء', totalQuestions: 9, uncategorizedCount: 2, anchorExamModelId: 'ex-1',
  lectures: [
    { lectureId: 'lec-1', lectureTitle: 'محاضرة القلب والأوعية', lectureNumber: 1, questionsCount: 5, groups: [
      { paragraphTag: 'الفصل الأول', questionsCount: 3 },
      { paragraphTag: 'الفصل الثاني', questionsCount: 1 },
      { paragraphTag: null, questionsCount: 1 },
    ] },
    { lectureId: 'lec-2', lectureTitle: 'محاضرة التنفس', lectureNumber: 2, questionsCount: 2, groups: [
      { paragraphTag: 'الفصل الأول', questionsCount: 2 },
    ] },
    { lectureId: null, lectureTitle: 'غير مصنف', lectureNumber: null, questionsCount: 2, groups: [
      { paragraphTag: null, questionsCount: 2 },
    ] },
  ],
};

const PRACTICE_OPTIONS = (prefix) => [
  { id: `${prefix}-a`, letter: 'A', text: 'ألم صدري ضاغط يستمر أكثر من عشرين دقيقة', imageUrl: null },
  { id: `${prefix}-b`, letter: 'B', text: 'طنين في الأذن', imageUrl: null },
  { id: `${prefix}-c`, letter: 'C', text: 'احمرار العين', imageUrl: null },
];

export const PRACTICE_START = {
  sessionId: 'ps-1', anchorExamModelId: 'ex-1', created: true, status: 'InProgress',
  startedAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString(), score: null,
  totalQuestions: 2,
  questions: [
    { id: 'pq-1', number: 1, text: 'ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟', textHtml: null, type: 'Mcq', difficulty: 'Medium', paragraphTag: 'الفصل الأول', lectureTitle: 'محاضرة القلب والأوعية', options: PRACTICE_OPTIONS('pq1'), images: [] },
    { id: 'pq-2', number: 2, text: 'أي هرمون ينقص سكر الدم؟', textHtml: null, type: 'Mcq', difficulty: 'Easy', paragraphTag: 'الفصل الأول', lectureTitle: 'محاضرة القلب والأوعية', options: PRACTICE_OPTIONS('pq2'), images: [] },
  ],
  answers: [],
};

export const PRACTICE_ANSWER = (questionId) => ({
  sessionId: 'ps-1', questionId, isCorrect: true, answeredCount: 1, totalQuestions: 2,
  score: null, status: 'InProgress', correctOptionIds: [`${questionId === 'pq-1' ? 'pq1' : 'pq2'}-a`],
  correctAnswerText: null, explanation: 'الألم الصدري الضاغط المستعرض كلاسيكي لاحتشاء العضلة القلبية.', explanationHtml: null, reference: 'ديفيدسون ص. 245',
});

export const PRACTICE_PROGRESS = {
  sessionId: 'ps-1', examModelId: 'ex-1', status: 'InProgress', totalQuestions: 2,
  answeredCount: 1, correctCount: 1, wrongCount: 0, ungradedCount: 0, completionPercent: 50,
  score: null, startedAt: new Date().toISOString(), lastAccessedAt: new Date().toISOString(),
};

export const EXAM_DETAIL = {
  id: 'ex-1', subjectId: 's-1', lectureId: null, titleAr: 'اختبار الدورة الدموية النهائي', titleEn: null,
  slug: 'circulation-final', description: null, examType: 'Final', year: 2026, durationMinutes: 45,
  totalQuestions: 1, passingScore: 60, availableFrom: null, availableUntil: null, maxAttempts: 3,
  shuffleQuestions: false, shuffleOptions: false, showResultsImmediately: true, allowReview: true,
  showCorrectAnswers: true, showExplanations: true, status: 'Published', modelLetter: null,
};

export const EXAM_SESSION = {
  sessionId: 'es-1', examId: 'ex-1', examTitle: 'اختبار الدورة الدموية النهائي', status: 'InProgress',
  totalQuestions: 1, durationMinutes: 45, startedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 45 * 60_000).toISOString(), currentQuestionOrder: 0,
  questions: [
    { id: 'sq-1', sourceQuestionId: 'q-1', number: 1, type: 'Mcq', text: 'ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟', textHtml: null,
      options: [
        { id: 'sq-1-a', letter: 'A', text: 'ألم صدري ضاغط يستمر أكثر من عشرين دقيقة', textHtml: null, imageUrl: null },
        { id: 'sq-1-b', letter: 'B', text: 'طنين في الأذن', textHtml: null, imageUrl: null },
      ],
      images: [], savedAnswer: null },
  ],
};

export const EXAM_SAVE_RESULT = {
  sessionId: 'es-1', questionId: 'sq-1', savedAnswer: '["sq-1-a"]', answeredQuestions: 1,
  currentQuestionOrder: 0, expiresAt: new Date(Date.now() + 45 * 60_000).toISOString(), status: 'InProgress',
};

export const EXAM_RESULT_V2 = {
  sessionId: 'es-1', status: 'Completed', isResultVisible: true, score: 100, passed: true,
  totalQuestions: 1, answeredQuestions: 1, correctAnswers: 1, wrongCount: 0, unansweredQuestions: 0,
  durationSeconds: 95, canReview: true,
  weakestTopics: [], strongTopics: [{ tag: 'cardiology', accuracy: 100 }],
  comparison: { yourScore: 100, averageScore: 72, topScore: 100 },
  maxAttempts: 3, remainingAttempts: 2,
  attempts: [
    { sessionId: 'es-0', status: 'Completed', startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:10:00Z', score: 40, passed: false, isCurrent: false },
    { sessionId: 'es-1', status: 'Completed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), score: 100, passed: true, isCurrent: true },
  ],
};

export const FULL_QUESTION = {
  id: 'q-1', text: 'ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟', textHtml: null, type: 'Mcq',
  difficulty: 'Medium', tags: ['cardiology'], lectureTitle: 'محاضرة القلب والأوعية', year: 2026,
  reference: 'ديفيدسون ص. 245', paragraphTag: 'الفصل الأول',
  options: PRACTICE_OPTIONS('fq'),
  images: [], userAnswer: null, isFavorite: false,
  stats: { attemptsCount: 120, correctRate: 74.2 },
};

export async function mockWorld(context) {
  await context.addInitScript(() => {
    sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
  });

  // Fail-visible: every unmocked API route aborts.
  await context.route('**/api/v1/**', (route) => { if (process.env.E2E_DEBUG) console.log('ABORT:', route.request().url()); route.abort(); });
  await context.route('**/health', (route) => route.fulfill({ json: { status: 'Healthy' } }));

  await context.route('**/api/v1/auth/refresh', (route) => route.fulfill({ json: { accessToken: 'e2e-access-2' } }));
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_STUDENT }));
  await context.route('**/api/v1/entitlements/issue', (route) => route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));
  await context.route('**/api/v1/security/events', (route) => route.fulfill({ status: 204 }));
  await context.route('**/api/v1/notifications*', (route) => route.fulfill({ json: { items: [], unreadCount: 0 } }));

  // Entitled subjects (A.1 visibility signal).
  await context.route('**/api/v1/subjects/my-subjects*', (route) => route.fulfill({ json: { items: MY_SUBJECTS } }));

  // Exam-course storefront (A.2/A.3).
  await context.route('**/api/v1/exam-courses/subject/s-1*', (route) => route.fulfill({ json: EXAM_COURSES }));
  await context.route('**/api/v1/exam-courses/ec-2', (route) => route.fulfill({ json: EXAM_COURSE_DETAIL }));

  // Categorized practice tree + session (A.4/B.1).
  await context.route('**/api/v1/practice/categorized/s-1', (route) => route.fulfill({ json: PRACTICE_TREE }));
  await context.route('**/api/v1/practice/categorized/s-1/start', (route) => route.fulfill({ json: PRACTICE_START }));
  await context.route('**/api/v1/practice/ps-1/answer', (route) => {
    const body = route.request().postDataJSON();
    route.fulfill({ json: PRACTICE_ANSWER(body?.questionId ?? 'pq-1') });
  });
  await context.route('**/api/v1/practice/ps-1/progress*', (route) => route.fulfill({ json: PRACTICE_PROGRESS }));
  await context.route(/\/api\/v1\/practice\/ps-1\/(reset|reset-question\/.*)$/, (route) => route.fulfill({ status: 204 }));

  // Exam session golden path (E).
  await context.route('**/api/v1/exams/ex-1', (route) => route.fulfill({ json: EXAM_DETAIL }));
  await context.route('**/api/v1/exams/ex-1/start', (route) => route.fulfill({ json: EXAM_SESSION }));
  await context.route('**/api/v1/exams/sessions/es-1/questions/sq-1/answer', (route) => route.fulfill({ json: EXAM_SAVE_RESULT }));
  await context.route('**/api/v1/exams/sessions/es-1/submit', (route) => route.fulfill({ json: EXAM_RESULT_V2 }));
  await context.route('**/api/v1/exams/sessions/es-1/results', (route) => route.fulfill({ json: EXAM_RESULT_V2 }));

  // Question page (F).
  await context.route('**/api/v1/questions/q-1', (route) => route.fulfill({ json: FULL_QUESTION }));
  await context.route('**/api/v1/questions/q-1/answer', (route) =>
    route.fulfill({ json: { isCorrect: true, correctOptionId: 'fq-a', correctOptionLetter: 'A', explanation: 'شرح تجريبي.', reference: null, isFirstAttempt: true, updatedStats: null, newAchievements: null, correctAnswerText: null } }));
}
