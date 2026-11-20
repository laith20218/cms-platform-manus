import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 20.2 — auto explanation after answer (owner decision 4).
 *
 * Locks:
 *  1. QuestionPage: answering auto-opens «الشرح» together with the
 *     correctness reveal — no second click anywhere.
 *  2. QuestionPage: an answer payload WITHOUT explanation text paints NO
 *     explanation box (never an empty «الشرح» panel).
 *  3. PracticePage (shared QuestionRow): the explanation auto-shows with the
 *     immediate feedback; null explanation → no box. (Exam review uses the
 *     same QuestionRow path with `feedback.explanation` server-gated by
 *     ShowExplanationsSnapshot — the reveal gate is respected.)
 */

const { getMock, postMock, putMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn(), putMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    put: (...args: unknown[]) => putMock(...args),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock('@/features/entitlements/services/entitlement-api', async () => {
  const actual = await vi.importActual<typeof import('@/features/entitlements/services/entitlement-api')>(
    '@/features/entitlements/services/entitlement-api'
  );
  return { ...actual, entitlementRequestConfig: async () => ({}) };
});

vi.mock('@/features/favorites/components/FavoriteListPicker', () => ({
  FavoriteListPicker: () => null,
}));

vi.mock('@/features/security/useContentProtection', () => ({
  useContentProtection: () => undefined,
  useAntiCopy: () => undefined,
  useDevToolsDetection: () => undefined,
  useWatermark: () => undefined,
  useScreenshotDetection: () => undefined,
}));

vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({ user: { fullName: 'طالب تجريبي', phone: '0999999999' } }),
}));

import QuestionPage from '@/features/questions/QuestionPage';
import PracticePage from '@/features/practice/pages/PracticePage';

// ---- QuestionPage fixtures ----
const LIST_PAYLOAD = {
  items: [
    {
      id: 'q1', text: 'ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟', type: 'Mcq',
      difficulty: 'Easy', tags: ['قلب'], lectureTitle: 'محاضرة القلب', isFavorite: false,
    },
  ],
};

const FULL_Q1 = {
  ...LIST_PAYLOAD.items[0],
  options: [
    { id: 'o1', letter: 'A', text: 'ألم صدري ضاغط', imageUrl: null },
    { id: 'o2', letter: 'B', text: 'طنين في الأذن', imageUrl: null },
  ],
};

const ANSWER_WITH_EXPLANATION = {
  isCorrect: true,
  correctOptionId: 'o1',
  correctOptionLetter: 'A',
  correctAnswerText: 'ألم صدري ضاغط',
  explanation: 'احتشاء العضلة القلبية يُظهر ألماً صدرياً ضاغقاً.',
  reference: 'ديفيدسون',
  isFirstAttempt: true,
};

const ANSWER_WITHOUT_EXPLANATION = {
  isCorrect: true,
  correctOptionId: 'o1',
  correctOptionLetter: 'A',
  correctAnswerText: 'ألم صدري ضاغط',
  explanation: '',
  reference: null,
  isFirstAttempt: true,
};

function stubQuestionPage(answerPayload: unknown) {
  getMock.mockImplementation(async (url: string) => {
    if (url === '/questions') return { data: LIST_PAYLOAD };
    if (url === '/questions/q1') return { data: FULL_Q1 };
    return { data: {} };
  });
  postMock.mockImplementation(async (url: string) => {
    if (url === '/questions/q1/answer') return { data: answerPayload };
    return { data: {} };
  });
  putMock.mockImplementation(async () => ({ data: {} }));
}

function renderQuestionPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/subjects/ba/lectures/l1/questions']}>
        <Routes>
          <Route path="/subjects/:subjectSlug/lectures/:lectureId/questions" element={<QuestionPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---- PracticePage fixtures ----
const PRACTICE_QUESTIONS = [
  {
    id: 'q1', number: 1, text: 'ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟', textHtml: null,
    type: 'Mcq', difficulty: 'Medium', paragraphTag: null, lectureTitle: 'محاضرة القلب',
    options: [
      { id: 'o1', letter: 'A', text: 'ألم صدري ضاغط', imageUrl: null },
      { id: 'o2', letter: 'B', text: 'طنين في الأذن', imageUrl: null },
    ],
    images: [],
  },
];

const PRACTICE_START = {
  sessionId: 'ps1', anchorExamModelId: 'ex1', created: true, status: 'InProgress',
  startedAt: '2026-01-01T00:00:00Z', lastAccessedAt: '2026-01-01T00:00:00Z', score: null,
  totalQuestions: 1, questions: PRACTICE_QUESTIONS, answers: [],
};

const PRACTICE_PROGRESS = {
  sessionId: 'ps1', examModelId: 'ex1', status: 'InProgress', totalQuestions: 1,
  answeredCount: 1, correctCount: 1, wrongCount: 0, ungradedCount: 0,
  completionPercent: 100, score: null, startedAt: '2026-01-01T00:00:00Z', lastAccessedAt: '2026-01-01T00:00:00Z',
};

function stubPractice(answerPayload: unknown) {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: [{ id: 's1', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['QuestionsExams'] }] };
    if (url.includes('/practice/ps1/progress')) return { data: PRACTICE_PROGRESS };
    return { data: {} };
  });
  postMock.mockImplementation(async (url: string) => {
    if (url.includes('/practice/categorized/s1/start')) return { data: PRACTICE_START };
    return { data: {} };
  });
  putMock.mockImplementation(async (url: string) => {
    if (url.includes('/practice/ps1/answer')) return { data: answerPayload };
    return { data: {} };
  });
}

function renderPractice() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/practice/categorized/s1']}>
        <Routes>
          <Route path="/practice/categorized/:subjectId" element={<PracticePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('W20.2 — QuestionPage: explanation auto-opens with the answer reveal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('answered with explanation → «الشرح» is visible immediately (no second click)', async () => {
    stubQuestionPage(ANSWER_WITH_EXPLANATION);
    renderQuestionPage();

    // Select + confirm — the only two clicks the student makes.
    fireEvent.click(await screen.findByRole('button', { name: /ألم صدري ضاغط/ }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الإجابة' }));

    const box = await screen.findByTestId('question-explanation');
    expect(box.textContent).toContain('الشرح');
    expect(box.textContent).toContain('احتشاء العضلة القلبية يُظهر ألماً صدرياً ضاغقاً.');
    expect(box.textContent).toContain('المرجع: ديفيدسون');
  });

  it('answered WITHOUT explanation → no empty «الشرح» box at all', async () => {
    stubQuestionPage(ANSWER_WITHOUT_EXPLANATION);
    renderQuestionPage();

    fireEvent.click(await screen.findByRole('button', { name: /ألم صدري ضاغط/ }));
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد الإجابة' }));

    // The correctness reveal still appears…
    await waitFor(() => {
      expect(screen.getByText('صحيح!')).toBeInTheDocument();
    });
    // …but no explanation box is painted for an empty explanation payload.
    expect(screen.queryByTestId('question-explanation')).toBeNull();
  });
});

describe('W20.2 — PracticePage (shared QuestionRow): explanation auto-shows, null → no box', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('confirm → feedback + explanation visible in one reveal', async () => {
    stubPractice({
      sessionId: 'ps1', questionId: 'q1', isCorrect: true, answeredCount: 1, totalQuestions: 1,
      score: null, status: 'InProgress', correctOptionIds: ['o1'], correctAnswerText: null,
      explanation: 'الألم الضاغط عرض كلاسيكي.', explanationHtml: null, reference: 'ديفيدسون',
    });
    renderPractice();

    fireEvent.click(await screen.findByTestId('practice-option-o1'));
    fireEvent.click(screen.getByTestId('practice-confirm-q1'));

    const box = await screen.findByTestId('practice-explanation-q1');
    expect(box.textContent).toContain('الألم الضاغط عرض كلاسيكي.');
  });

  it('confirm with NO explanation in the payload → no explanation box', async () => {
    stubPractice({
      sessionId: 'ps1', questionId: 'q1', isCorrect: true, answeredCount: 1, totalQuestions: 1,
      score: null, status: 'InProgress', correctOptionIds: ['o1'], correctAnswerText: null,
      explanation: null, explanationHtml: null, reference: null,
    });
    renderPractice();

    fireEvent.click(await screen.findByTestId('practice-option-o1'));
    fireEvent.click(screen.getByTestId('practice-confirm-q1'));

    await screen.findByTestId('practice-feedback-q1');
    expect(screen.queryByTestId('practice-explanation-q1')).toBeNull();
  });
});
