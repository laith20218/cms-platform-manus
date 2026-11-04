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

import PracticePage from '@/features/practice/pages/PracticePage';

// ---- fixtures ----
const QUESTIONS = [
  {
    id: 'q1', number: 1, text: 'ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟', textHtml: null,
    type: 'Mcq', difficulty: 'Medium', paragraphTag: 'الفصل الأول', lectureTitle: 'محاضرة القلب',
    options: [
      { id: 'o1', letter: 'A', text: 'ألم صدري ضاغط', imageUrl: null },
      { id: 'o2', letter: 'B', text: 'طنين في الأذن', imageUrl: null },
    ],
    images: [],
  },
  {
    id: 'q2', number: 2, text: 'أي هرمون ينقص سكر الدم؟', textHtml: null,
    type: 'Mcq', difficulty: 'Easy', paragraphTag: null, lectureTitle: 'محاضرة القلب',
    options: [
      { id: 'o3', letter: 'A', text: 'الإنسولين', imageUrl: null },
      { id: 'o4', letter: 'B', text: 'الأدرينالين', imageUrl: null },
    ],
    images: [],
  },
];

const START_CATEGORIZED = {
  sessionId: 'ps1', anchorExamModelId: 'ex1', created: true, status: 'InProgress',
  startedAt: '2026-01-01T00:00:00Z', lastAccessedAt: '2026-01-01T00:00:00Z', score: null,
  totalQuestions: 2, questions: QUESTIONS, answers: [],
};

const ANSWER_CORRECT = {
  sessionId: 'ps1', questionId: 'q1', isCorrect: true, answeredCount: 1, totalQuestions: 2,
  score: null, status: 'InProgress', correctOptionIds: ['o1'], correctAnswerText: null,
  explanation: 'الألم الضاغط عرض كلاسيكي.', explanationHtml: null, reference: 'ديفيدسون',
};

const PROGRESS = {
  sessionId: 'ps1', examModelId: 'ex1', status: 'InProgress', totalQuestions: 2,
  answeredCount: 1, correctCount: 1, wrongCount: 0, ungradedCount: 0,
  completionPercent: 50, score: null, startedAt: '2026-01-01T00:00:00Z', lastAccessedAt: '2026-01-01T00:00:00Z',
};

function stubApi(overrides?: { startCategorized?: unknown; answers?: unknown[] }) {
  const start = { ...START_CATEGORIZED, ...(overrides?.startCategorized as object ?? {}), answers: overrides?.answers ?? [] };
  postMock.mockImplementation(async (url: string) => {
    if (url.includes('/practice/categorized/s1/start')) return { data: start };
    if (url.includes('/practice/ps1/reset-question/')) return { status: 204 };
    if (url.includes('/practice/ps1/reset')) return { status: 204 };
    if (url.includes('/practice/ex9/start')) {
      return { data: { sessionId: 'ps9', examModelId: 'ex9', created: true, status: 'InProgress', startedAt: '2026-01-01T00:00:00Z', lastAccessedAt: '2026-01-01T00:00:00Z', score: null, totalQuestions: 2, questions: QUESTIONS, answers: [] } };
    }
    return { data: {} };
  });
  putMock.mockImplementation(async (url: string) => {
    if (url.includes('/practice/ps1/answer') || url.includes('/practice/ps9/answer')) return { data: ANSWER_CORRECT };
    return { data: {} };
  });
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: [{ id: 's1', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['QuestionsExams'] }] };
    if (url.includes('/exams/ex9')) return { data: { id: 'ex9', titleAr: 'نموذج تجريبي', totalQuestions: 2 } };
    if (url.includes('/practice/ps1/progress') || url.includes('/practice/ps9/progress')) return { data: PROGRESS };
    return { data: {} };
  });
}

function renderPractice(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/practice/exam/:examModelId" element={<PracticePage />} />
          <Route path="/practice/categorized/:subjectId" element={<PracticePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stubApi();
});

describe('W14.4 PracticePage (B.1, D13)', () => {
  it('starts a categorized session, answers with immediate feedback, and advances progress', async () => {
    renderPractice('/practice/categorized/s1?lectureId=lec1');

    // Session header + first question + zero progress.
    expect(await screen.findByTestId('practice-progress')).toBeTruthy();
    expect(screen.getByTestId('practice-progress').textContent).toContain('أجبت');
    expect(screen.getByTestId('practice-progress').textContent).toContain('0');
    expect(screen.getByText('ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟')).toBeTruthy();
    expect(screen.getByTestId('practice-confirm-q1')).toBeTruthy();

    // Answer: select the correct option and confirm.
    fireEvent.click(screen.getByTestId('practice-option-o1'));
    fireEvent.click(screen.getByTestId('practice-confirm-q1'));

    await waitFor(() => {
      expect(putMock).toHaveBeenCalledWith('/practice/ps1/answer', expect.objectContaining({ questionId: 'q1', lectureId: 'lec1' }), expect.anything());
    });
    expect(await screen.findByTestId('practice-feedback-q1')).toBeTruthy();
    expect(screen.getByText('إجابة صحيحة')).toBeTruthy();
    expect(screen.getByText('الألم الضاغط عرض كلاسيكي.')).toBeTruthy();
  });

  it('withdraws a single answer (إعادة ضبط السؤال)', async () => {
    renderPractice('/practice/categorized/s1?lectureId=lec1');

    fireEvent.click(await screen.findByTestId('practice-option-o1'));
    fireEvent.click(screen.getByTestId('practice-confirm-q1'));
    expect(await screen.findByTestId('practice-feedback-q1')).toBeTruthy();

    fireEvent.click(screen.getByTestId('practice-reset-question-q1'));
    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/practice/ps1/reset-question/q1', undefined, expect.anything());
    });
    await waitFor(() => {
      expect(screen.queryByTestId('practice-feedback-q1')).toBeNull();
    });
    expect(screen.getByTestId('practice-confirm-q1')).toBeTruthy(); // back to unanswered
  });

  it('wipes the whole session through the confirm dialog (إعادة ضبط الكل)', async () => {
    renderPractice('/practice/categorized/s1?paragraphTag=الفصل الأول');

    fireEvent.click(await screen.findByTestId('practice-option-o1'));
    fireEvent.click(screen.getByTestId('practice-confirm-q1'));
    expect(await screen.findByTestId('practice-feedback-q1')).toBeTruthy();

    fireEvent.click(screen.getByTestId('practice-reset-all'));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByTestId('practice-reset-all-confirm'));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/practice/ps1/reset', undefined, expect.anything());
    });
    await waitFor(() => {
      expect(screen.queryByTestId('practice-feedback-q1')).toBeNull();
    });
  });

  it('restores a resumed session from the shipped answer states', async () => {
    stubApi({ answers: [{ questionId: 'q1', sortOrder: 0, selectedAnswer: 'o1', isCorrect: true, answeredAt: '2026-01-01T00:00:00Z' }] });
    renderPractice('/practice/categorized/s1');

    expect(await screen.findByText('أجبت هذا السؤال سابقاً')).toBeTruthy();
    // Progress counts the restored answer server-side state.
    const progress = screen.getByTestId('practice-progress');
    expect(progress.textContent).toContain('1');
    expect(progress.textContent).toContain('2');
  });

  it('runs the exam-model mode with the exam title in the header', async () => {
    renderPractice('/practice/exam/ex9');

    expect(await screen.findByText('نموذج تجريبي')).toBeTruthy();
    expect(screen.getByText('ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟')).toBeTruthy();
    // No filter echo in exam-model mode.
    fireEvent.click(screen.getByTestId('practice-option-o1'));
    fireEvent.click(screen.getByTestId('practice-confirm-q1'));
    await waitFor(() => {
      expect(putMock).toHaveBeenCalledWith('/practice/ps9/answer', expect.objectContaining({ lectureId: null, untaggedLecture: false }), expect.anything());
    });
  });

  // W14.5 (Phase A): the API now resolves stored image references (object keys /
  // b2:// URIs) into freshly generated presigned B2 URLs. The <img> tags must render
  // the URL VERBATIM — no client-side rewriting, no stripping of the SigV4 query
  // parameters (X-Amz-*), which would invalidate the signature.
  it('renders question images from presigned B2 URLs verbatim (W14.5 Phase A)', async () => {
    const presignedUrl =
      'https://s3.eu-central-003.backblazeb2.com/CMSmedia/library/seeded/question-image.png' +
      '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
      '&X-Amz-Credential=005e2f8e1b234d000000000005%2F20261103%2Feu-central-003%2Fs3%2Faws4_request' +
      '&X-Amz-Date=20261103T183000Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host' +
      '&X-Amz-Signature=abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    stubApi({
      startCategorized: {
        ...START_CATEGORIZED,
        questions: [
          { ...QUESTIONS[0], images: [{ id: 'img1', imageUrl: presignedUrl, altText: 'مخطط القلب', caption: null }] },
          QUESTIONS[1],
        ],
      },
    });
    renderPractice('/practice/categorized/s1?lectureId=lec1');

    const img = await screen.findByAltText('مخطط القلب');
    expect(img.getAttribute('src')).toBe(presignedUrl);
  });

  // W15.0 (P4-C2): the inline list view — ALL questions render SIMULTANEOUSLY as
  // shared QuestionRows (the old single-card pager showed exactly one at a time).
  it('renders every question simultaneously as an inline list (W15.0 P4)', async () => {
    renderPractice('/practice/categorized/s1?lectureId=lec1');

    expect(await screen.findByTestId('practice-row-q1')).toBeTruthy();
    expect(screen.getByTestId('practice-row-q2')).toBeTruthy();
    expect(screen.getByText('ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟')).toBeTruthy();
    expect(screen.getByText('أي هرمون ينقص سكر الدم؟')).toBeTruthy();
    // One inline confirm PER question (the confirm moved inside each row).
    expect(screen.queryAllByTestId(/^practice-confirm-/)).toHaveLength(2);
    // Scroll-anchor navigator chips render for both questions.
    expect(screen.getByTestId('practice-chip-q1')).toBeTruthy();
    expect(screen.getByTestId('practice-chip-q2')).toBeTruthy();
  });
});
