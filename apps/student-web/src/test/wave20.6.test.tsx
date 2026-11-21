import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 20.6 (owner decision 3) — the Matching (وصل) UI across every student surface.
 *
 * Locks:
 *  1. QuestionPage: the board renders from the hydrated payload; «تصحيح» stays
 *     disabled until EVERY prompt is paired; the answer rides selectedOptionId
 *     as the W20.5 wire JSON; the reveal paints per-pair green/red + the correct
 *     target on wrong pairs; the explanation auto-opens (20.2 pattern).
 *  2. PracticePage: same board through the shared QuestionRow; the submit gate
 *     + wire JSON + per-pair reveal + auto explanation.
 *  3. ExamPage: the timed run autosaves the wire JSON on every pairing change
 *     and shows NO correctness during the run.
 *  4. ExamReviewPage: the recorded pairing renders read-only; the correct map
 *     paints only behind showCorrectAnswers.
 *  5. The click-click path (button + Enter/Space semantics — the keyboard
 *     equivalent of drag-and-drop) drives every pairing above.
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
import ExamPage from '@/features/exams/pages/ExamPage';
import ExamReviewPage from '@/features/exams/pages/ExamReviewPage';

// ---- the shared وصل payload ----
const PROMPTS = [
  { id: 'p1', text: 'العضلة الدائرية للعين', sortOrder: 0 },
  { id: 'p2', text: 'العضلة الهرمية', sortOrder: 1 },
];
const TARGETS = [
  { id: 't1', text: 'عصب الوجه', sortOrder: 0 },
  { id: 't2', text: 'عصب مثلث التوائم', sortOrder: 1 },
];

/** Click-click pairing: arm the target, then drop it on the prompt's pairzone
 *  button (the keyboard-operable path — buttons + Enter/Space). */
function pair(targetId: string, promptId: string) {
  fireEvent.click(screen.getByTestId(`question-matching-target-${targetId}`));
  fireEvent.click(screen.getByTestId(`question-matching-pairzone-${promptId}`));
}

function renderAt(entry: string, path: string, element: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// =====================================================================
// 1. QuestionPage — the question player
// =====================================================================
const MATCHING_LIST = {
  items: [
    {
      id: 'qm1', text: 'صل كل عضلة بعصبها', type: 'Matching',
      difficulty: 'Medium', tags: ['تشريح'], lectureTitle: 'محاضرة الأعصاب', isFavorite: false,
    },
  ],
};

const MATCHING_FULL = {
  ...MATCHING_LIST.items[0],
  options: [],
  matchingItems: { prompts: PROMPTS, targets: TARGETS },
};

const MATCHING_ANSWER = {
  isCorrect: false,
  correctOptionId: '',
  correctOptionLetter: '',
  correctAnswerText: null,
  explanation: 'كل عضلة تُعصَّب من العصب المقابل لها في قائمة اليمين.',
  reference: null,
  isFirstAttempt: true,
  matchingResult: {
    isCorrect: false,
    pairs: [
      { promptId: 'p1', submittedTargetId: 't1', correctTargetId: 't1', isCorrect: true },
      { promptId: 'p2', submittedTargetId: 't1', correctTargetId: 't2', isCorrect: false },
    ],
    correctPairs: [
      { promptId: 'p1', targetId: 't1' },
      { promptId: 'p2', targetId: 't2' },
    ],
  },
};

function stubQuestionPlayer() {
  getMock.mockImplementation(async (url: string) => {
    if (url === '/questions') return { data: MATCHING_LIST };
    if (url === '/questions/qm1') return { data: MATCHING_FULL };
    return { data: {} };
  });
  postMock.mockImplementation(async (url: string) => {
    if (url === '/questions/qm1/answer') return { data: MATCHING_ANSWER };
    return { data: {} };
  });
}

describe('W20.6 — QuestionPage: matching board, submit gate, per-pair reveal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('renders both card groups from the hydrated payload', async () => {
    stubQuestionPlayer();
    renderAt('/subjects/ba/lectures/l1/questions', '/subjects/:subjectSlug/lectures/:lectureId/questions', <QuestionPage />);

    expect(await screen.findByTestId('question-matching-qm1')).toBeInTheDocument();
    expect(screen.getByTestId('question-matching-prompt-p1').textContent).toContain('العضلة الدائرية للعين');
    expect(screen.getByTestId('question-matching-prompt-p2').textContent).toContain('العضلة الهرمية');
    expect(screen.getByTestId('question-matching-target-t1').textContent).toContain('عصب الوجه');
    expect(screen.getByTestId('question-matching-target-t2').textContent).toContain('عصب مثلث التوائم');
  });

  it('«تصحيح الإجابة» stays disabled until EVERY prompt is paired, then sends the wire JSON', async () => {
    stubQuestionPlayer();
    renderAt('/subjects/ba/lectures/l1/questions', '/subjects/:subjectSlug/lectures/:lectureId/questions', <QuestionPage />);

    await screen.findByTestId('question-matching-qm1');
    const confirm = screen.getByRole('button', { name: 'تصحيح الإجابة' });
    expect(confirm).toBeDisabled();

    pair('t1', 'p1');
    expect(confirm).toBeDisabled(); // one prompt still unpaired

    pair('t2', 'p2');
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        '/questions/qm1/answer',
        expect.objectContaining({
          selectedOptionId: JSON.stringify([
            { promptId: 'p1', targetId: 't1' },
            { promptId: 'p2', targetId: 't2' },
          ]),
        }),
        expect.anything(),
      );
    });
  });

  it('submit paints per-pair green/red, shows the correct target on the wrong pair, and auto-opens the explanation', async () => {
    stubQuestionPlayer();
    renderAt('/subjects/ba/lectures/l1/questions', '/subjects/:subjectSlug/lectures/:lectureId/questions', <QuestionPage />);

    await screen.findByTestId('question-matching-qm1');
    pair('t1', 'p1');
    pair('t1', 'p2'); // p2 gets the SAME target — graded wrong, correct was t2
    fireEvent.click(screen.getByRole('button', { name: 'تصحيح الإجابة' }));

    // Per-pair verdicts on the prompt cards.
    await waitFor(() => {
      expect(screen.getByTestId('question-matching-prompt-p1').className).toContain('cms-success');
      expect(screen.getByTestId('question-matching-prompt-p2').className).toContain('cms-danger');
    });
    // The wrong pair ALSO shows the correct target (the reveal).
    expect(screen.getByTestId('question-matching-submitted-p2').textContent).toContain('عصب الوجه');
    expect(screen.getByTestId('question-matching-prompt-p2').textContent).toContain('الصحيح: عصب مثلث التوائم');
    // 20.2 pattern: the explanation auto-opens with the reveal.
    expect(screen.getByTestId('question-explanation').textContent).toContain('كل عضلة تُعصَّب من العصب المقابل لها');
  });

  it('HTML5 drop on a prompt card pairs the dragged target (mouse path)', async () => {
    stubQuestionPlayer();
    renderAt('/subjects/ba/lectures/l1/questions', '/subjects/:subjectSlug/lectures/:lectureId/questions', <QuestionPage />);

    await screen.findByTestId('question-matching-qm1');
    fireEvent.drop(screen.getByTestId('question-matching-prompt-p1'), {
      dataTransfer: { getData: () => 't2' },
    });
    const confirm = screen.getByRole('button', { name: 'تصحيح الإجابة' });
    expect(confirm).toBeDisabled(); // p2 still unpaired → gate holds
    expect(screen.getByTestId('question-matching-submitted-p1').textContent).toContain('عصب مثلث التوائم');
  });
});

// =====================================================================
// 2. PracticePage — bank practice through the shared QuestionRow
// =====================================================================
const PRACTICE_START = {
  sessionId: 'ps1', anchorExamModelId: 'ex1', created: true, status: 'InProgress',
  startedAt: '2026-01-01T00:00:00Z', lastAccessedAt: '2026-01-01T00:00:00Z', score: null,
  totalQuestions: 1,
  questions: [
    {
      id: 'qm1', number: 1, text: 'صل كل عضلة بعصبها', textHtml: null, type: 'Matching',
      difficulty: 'Medium', paragraphTag: null, lectureTitle: null,
      options: [], images: [], matching: { prompts: PROMPTS, targets: TARGETS },
    },
  ],
  answers: [],
};

function stubPractice() {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: [{ id: 's1', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['QuestionsExams'] }] };
    if (url.includes('/practice/ps1/progress')) {
      return {
        data: {
          sessionId: 'ps1', examModelId: 'ex1', status: 'InProgress', totalQuestions: 1,
          answeredCount: 1, correctCount: 0, wrongCount: 1, ungradedCount: 0,
          completionPercent: 100, score: null,
          startedAt: '2026-01-01T00:00:00Z', lastAccessedAt: '2026-01-01T00:00:00Z',
        },
      };
    }
    return { data: {} };
  });
  postMock.mockImplementation(async (url: string) => {
    if (url.includes('/practice/categorized/s1/start')) return { data: PRACTICE_START };
    return { data: {} };
  });
  putMock.mockImplementation(async (url: string) => {
    if (url.includes('/practice/ps1/answer')) return { data: MATCHING_ANSWER };
    return { data: {} };
  });
}

describe('W20.6 — PracticePage: matching through the shared row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('gates the confirm on complete pairing, sends the wire JSON, and reveals per-pair + explanation', async () => {
    stubPractice();
    renderAt('/practice/categorized/s1', '/practice/categorized/:subjectId', <PracticePage />);

    await screen.findByTestId('practice-matching-qm1');
    const confirm = screen.getByTestId('practice-confirm-qm1');
    expect(confirm).toBeDisabled();

    // The row board uses the practice prefix.
    fireEvent.click(screen.getByTestId('practice-matching-target-t1'));
    fireEvent.click(screen.getByTestId('practice-matching-pairzone-p1'));
    fireEvent.click(screen.getByTestId('practice-matching-target-t2'));
    fireEvent.click(screen.getByTestId('practice-matching-pairzone-p2'));
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    await waitFor(() => {
      expect(putMock).toHaveBeenCalledWith(
        expect.stringContaining('/practice/ps1/answer'),
        expect.objectContaining({
          selectedAnswer: JSON.stringify([
            { promptId: 'p1', targetId: 't1' },
            { promptId: 'p2', targetId: 't2' },
          ]),
        }),
        expect.anything(),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('practice-matching-prompt-p1').className).toContain('cms-success');
      expect(screen.getByTestId('practice-matching-prompt-p2').className).toContain('cms-danger');
    });
    expect(screen.getByTestId('practice-explanation-qm1').textContent)
      .toContain('كل عضلة تُعصَّب من العصب المقابل لها');
  });
});

// =====================================================================
// 3. ExamPage — the timed run: autosave, no correctness during the run
// =====================================================================
const EXAM_SESSION = {
  sessionId: 'es1', examId: 'e1', examTitle: 'اختبار الأعصاب', status: 'InProgress',
  totalQuestions: 1, durationMinutes: 30,
  startedAt: new Date(Date.now() - 60_000).toISOString(),
  expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
  currentQuestionOrder: 1,
  questions: [
    {
      id: 'sq1', sourceQuestionId: 'qm1', number: 1, type: 'Matching',
      text: 'صل كل عضلة بعصبها', textHtml: null,
      options: [], images: [], savedAnswer: null,
      matching: { prompts: PROMPTS, targets: TARGETS },
    },
  ],
};

function stubExam() {
  postMock.mockImplementation(async (url: string) => {
    if (url.includes('/exams/e1/start')) return { data: EXAM_SESSION };
    return { data: {} };
  });
  putMock.mockImplementation(async (url: string) => {
    if (url.includes('/exams/sessions/es1/questions/sq1/answer')) {
      return {
        data: {
          sessionId: 'es1', questionId: 'sq1', savedAnswer: '[]', answeredQuestions: 1,
          currentQuestionOrder: 1, expiresAt: EXAM_SESSION.expiresAt, status: 'InProgress',
        },
      };
    }
    return { data: {} };
  });
  getMock.mockImplementation(async () => ({ data: {} }));
}

describe('W20.6 — ExamPage: matching autosaves the wire JSON, no correctness mid-run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('pairing a single prompt autosaves immediately; nothing turns green/red during the run', async () => {
    stubExam();
    renderAt('/exams/e1', '/exams/:examId', <ExamPage />);

    await screen.findByTestId('exam-matching-sq1');
    fireEvent.click(screen.getByTestId('exam-matching-target-t1'));
    fireEvent.click(screen.getByTestId('exam-matching-pairzone-p1'));

    await waitFor(() => {
      expect(putMock).toHaveBeenCalledWith(
        expect.stringContaining('/exams/sessions/es1/questions/sq1/answer'),
        expect.objectContaining({
          answer: JSON.stringify([{ promptId: 'p1', targetId: 't1' }]),
        }),
        expect.anything(),
      );
    });

    // The run shows the pairing, NEVER a verdict (server-gated to the review).
    expect(screen.getByTestId('exam-matching-submitted-p1').textContent).toContain('عصب الوجه');
    expect(screen.getByTestId('exam-matching-prompt-p1').className).not.toContain('cms-success');
    expect(screen.getByTestId('exam-matching-prompt-p1').className).not.toContain('cms-danger');
  });
});

// =====================================================================
// 4. ExamReviewPage — read-only board + reveal-gated correct map
// =====================================================================
const REVIEW = {
  sessionId: 'sr1', showCorrectAnswers: true, showExplanations: true,
  questions: [
    {
      id: 'sq1', sourceQuestionId: 'qm1', number: 1, type: 'Matching',
      text: 'صل كل عضلة بعصبها', options: [],
      userAnswer: JSON.stringify([{ promptId: 'p1', targetId: 't2' }, { promptId: 'p2', targetId: 't2' }]),
      correctAnswer: 'العضلة الدائرية للعين ← عصب الوجه | العضلة الهرمية ← عصب مثلث التوائم',
      isCorrect: false,
      explanation: 'كل عضلة تُعصَّب من العصب المقابل لها.',
      matching: { prompts: PROMPTS, targets: TARGETS },
      correctPairs: [
        { promptId: 'p1', targetId: 't1' },
        { promptId: 'p2', targetId: 't2' },
      ],
    },
  ],
};

describe('W20.6 — ExamReviewPage: recorded pairs render read-only with the revealed map', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('renders the recorded pairing + per-pair verdict from the revealed correct map', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/exams/sessions/sr1/review')) return { data: REVIEW };
      return { data: {} };
    });
    renderAt('/exams/sr1/review', '/exams/:sessionId/review', <ExamReviewPage />);

    await screen.findByTestId('review-matching-sq1');
    // p1 submitted t2 (wrong — correct t1): red + the correct target shown.
    expect(screen.getByTestId('review-matching-prompt-p1').className).toContain('cms-danger');
    expect(screen.getByTestId('review-matching-submitted-p1').textContent).toContain('عصب مثلث التوائم');
    expect(screen.getByTestId('review-matching-prompt-p1').textContent).toContain('الصحيح: عصب الوجه');
    // p2 submitted t2 (correct): green.
    expect(screen.getByTestId('review-matching-prompt-p2').className).toContain('cms-success');
    // The explanation block auto-shows (review mode, showExplanations=true).
    expect(screen.getByTestId('review-explanation-sq1').textContent).toContain('كل عضلة تُعصَّب من العصب المقابل لها');
  });

  it('hides the correct pairs when showCorrectAnswers is false (recorded pairing stays, verdict stays neutral)', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/exams/sessions/sr1/review')) {
        return { data: { ...REVIEW, showCorrectAnswers: false, showExplanations: false } };
      }
      return { data: {} };
    });
    renderAt('/exams/sr1/review', '/exams/:sessionId/review', <ExamReviewPage />);

    await screen.findByTestId('review-matching-sq1');
    expect(screen.getByTestId('review-matching-submitted-p1').textContent).toContain('عصب مثلث التوائم');
    expect(screen.queryByText(/الصحيح:/)).toBeNull();
    expect(screen.getByTestId('review-matching-prompt-p1').className).not.toContain('cms-danger');
  });
});
