import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) ----
const { getMock, postMock, putMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn(), putMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    put: (...args: unknown[]) => putMock(...args),
    delete: vi.fn(),
  },
}));

vi.mock('@/features/entitlements/services/entitlement-api', async () => {
  const actual = await vi.importActual<typeof import('@/features/entitlements/services/entitlement-api')>(
    '@/features/entitlements/services/entitlement-api'
  );
  return { ...actual, entitlementRequestConfig: async () => ({}) };
});

vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({ user: { fullName: 'طالب تجريبي', phone: '0999999999' } }),
}));

vi.mock('@/features/security/useContentProtection', () => ({
  useContentProtection: () => undefined,
  useAntiCopy: () => undefined,
  useDevToolsDetection: () => undefined,
  useWatermark: () => undefined,
  useScreenshotDetection: () => undefined,
}));

import ExamPage from '@/features/exams/pages/ExamPage';
import QuestionPage from '@/features/questions/QuestionPage';
import { SecurityWrapper } from '@/features/security/SecurityWrapper';

// ---- fixtures ----
const EXAM_SESSION = {
  sessionId: 'es1', examId: 'ex1', examTitle: 'اختبار الباطنة', status: 'InProgress',
  totalQuestions: 1, durationMinutes: 30,
  startedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  currentQuestionOrder: 0,
  questions: [
    {
      id: 'sq1', sourceQuestionId: 'q1', number: 1, type: 'Mcq',
      text: 'ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟', textHtml: null,
      options: [
        { id: 'so1', letter: 'A', text: 'ألم صدري ضاغط', textHtml: null, imageUrl: null },
        { id: 'so2', letter: 'B', text: 'طنين في الأذن', textHtml: null, imageUrl: null },
      ],
      images: [], savedAnswer: null,
    },
  ],
};

const RESULT_V2 = {
  sessionId: 'es1', status: 'Completed', isResultVisible: true, score: 66.67, passed: true,
  totalQuestions: 3, answeredQuestions: 3, correctAnswers: 2,
  wrongCount: 1, unansweredQuestions: 0, durationSeconds: 420, canReview: false,
  weakestTopics: [{ tag: 'pharma', accuracy: 40 }],
  strongTopics: [{ tag: 'cardiology', accuracy: 100 }],
  comparison: null, maxAttempts: 3, remainingAttempts: 2,
  attempts: [
    { sessionId: 'es0', status: 'Completed', startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:10:00Z', score: 33.33, passed: false, isCurrent: false },
    { sessionId: 'es1', status: 'Completed', startedAt: '2026-01-02T00:00:00Z', completedAt: '2026-01-02T00:07:00Z', score: 66.67, passed: true, isCurrent: true },
  ],
};

const FULL_QUESTION = {
  id: 'q1', text: 'سؤال تجريبي', type: 'Mcq', difficulty: 'Medium', tags: ['cardiology'],
  lectureTitle: 'محاضرة القلب', year: 2026, reference: null, paragraphTag: null,
  options: [
    { id: 'o1', letter: 'A', text: 'خيار 1', imageUrl: null },
    { id: 'o2', letter: 'B', text: 'خيار 2', imageUrl: null },
  ],
  images: [], userAnswer: null, isFavorite: false,
  stats: { attemptsCount: 10, correctRate: 60 },
};

function stubApi() {
  postMock.mockImplementation(async (url: string) => {
    if (url.includes('/exams/ex1/start')) return { data: EXAM_SESSION };
    if (url.includes('/sessions/es1/submit')) return { data: RESULT_V2 };
    if (url.includes('/questions/q1/answer')) {
      return { data: { isCorrect: true, correctOptionId: 'o1', correctOptionLetter: 'A', explanation: 'شرح', reference: null, isFirstAttempt: true, updatedStats: null, newAchievements: null, correctAnswerText: null } };
    }
    return { data: {} };
  });
  putMock.mockImplementation(async () => ({
    data: { sessionId: 'es1', questionId: 'sq1', savedAnswer: null, answeredQuestions: 1, currentQuestionOrder: 0, expiresAt: EXAM_SESSION.expiresAt, status: 'InProgress' },
  }));
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/questions/q1')) return { data: FULL_QUESTION };
    return { data: {} };
  });
}

function renderRoute(initialEntry: string, element: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/exams/:examId" element={element} />
          <Route path="/subjects/:subjectSlug/questions/:questionId" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stubApi();
  sessionStorage.clear();
});

describe('W14.4 Results v2 (D9)', () => {
  it('shows the SERVER wrong count, strong topics, attempt history and a retake button', async () => {
    renderRoute('/exams/ex1', <ExamPage />);

    // Exam renders; answer the single question and submit.
    const option = await screen.findByText('ألم صدري ضاغط');
    fireEvent.click(option);
    await waitFor(() => expect(putMock).toHaveBeenCalled());
    fireEvent.click(screen.getByText('تسليم الاختبار'));
    fireEvent.click(await screen.findByText('تسليم نهائي'));

    // Results v2.
    expect(await screen.findByTestId('result-wrong-count')).toBeTruthy();
    expect(screen.getByTestId('result-wrong-count').textContent).toContain('1'); // server value — never answered-correct
    expect(await screen.findByTestId('result-strong-topics')).toBeTruthy();
    expect(screen.getByText('#cardiology')).toBeTruthy();
    expect(await screen.findByTestId('result-attempts')).toBeTruthy();
    expect(screen.getByText('هذه المحاولة')).toBeTruthy();
    const retake = screen.getByTestId('result-retake');
    expect(retake.textContent).toContain('إعادة المحاولة');
  });

  it('retake clears the stored session and starts a FRESH attempt', async () => {
    renderRoute('/exams/ex1', <ExamPage />);

    const option = await screen.findByText('ألم صدري ضاغط');
    fireEvent.click(option);
    await waitFor(() => expect(putMock).toHaveBeenCalled());
    fireEvent.click(screen.getByText('تسليم الاختبار'));
    fireEvent.click(await screen.findByText('تسليم نهائي'));
    expect(await screen.findByTestId('result-retake')).toBeTruthy();

    const startsBefore = postMock.mock.calls.filter(([url]) => String(url).includes('/exams/ex1/start')).length;
    fireEvent.click(screen.getByTestId('result-retake'));

    await waitFor(() => {
      const startsAfter = postMock.mock.calls.filter(([url]) => String(url).includes('/exams/ex1/start')).length;
      expect(startsAfter).toBe(startsBefore + 1);
    });
  });
});

describe('W14.4 C.2 — Share removed from QuestionPage (and C.3 wrapper mounts)', () => {
  it('renders favorite + report but NO share action', async () => {
    renderRoute('/subjects/batin/questions/q1', <SecurityWrapper><QuestionPage /></SecurityWrapper>);

    expect(await screen.findByText('سؤال تجريبي')).toBeTruthy();
    expect(screen.getByTestId('question-favorite-button')).toBeTruthy();
    expect(screen.getByText('إبلاغ')).toBeTruthy();
    expect(screen.queryByText('مشاركة')).toBeNull();
  });
});
