import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 18.1 — Truthful States regression suite (D-01/02/10/11/12/13).
 *
 * The contract: a network/5xx/timeout failure or a 403/404 must NEVER render the
 * false-empty / policy-forbids copy below. Each case forces the error path and
 * asserts both the truthful state AND the absence of the banned string.
 */

// ---- shared mocks (hoisted) ----
const { getMock, postMock, putMock, deleteMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn(), putMock: vi.fn(), deleteMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    put: (...args: unknown[]) => putMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
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

// The picker's internals are out of scope here — QuestionPage owns the banned copy.
vi.mock('@/features/favorites/components/FavoriteListPicker', () => ({
  FavoriteListPicker: () => null,
}));

import QuestionPage from '@/features/questions/QuestionPage';
import ExamReviewPage from '@/features/exams/pages/ExamReviewPage';
import { TrainingBuilderModal } from '@/features/my-studies/components/TrainingBuilderModal';
import LecturePage from '@/features/subjects/LecturePage';
import PracticePage from '@/features/practice/pages/PracticePage';

// ---- banned strings (the recon contract) ----
const BANNED_OPTIONS_NOT_PUBLISHED = 'خيارات هذا السؤال غير منشورة'; // D-02
const BANNED_POLICY_FORBIDS_REVIEW = 'لا تسمح سياسة هذا الاختبار'; // D-10
const BANNED_NO_CATEGORIZED_LECTURES = 'لا توجد محاضرات مصنّفة'; // D-11
const BANNED_NO_PUBLISHED_FILES = 'لا توجد ملفات نصية منشورة'; // D-12

// ---- axios-shaped error factories ----
const networkError = () =>
  Object.assign(new Error('Network Error'), { isAxiosError: true, response: undefined });
const httpError = (status: number, data?: unknown) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: data ?? {} },
  });

// ---- fixtures ----
const LECTURE_QUESTIONS = {
  items: [
    {
      id: 'q1', text: 'ما هو العرض الكلاسيكي لاحتشاء العضلة القلبية؟', type: 'Mcq',
      difficulty: 'Easy', tags: ['قلب'], lectureTitle: 'محاضرة القلب', isFavorite: false,
      // NOTE: no `options` — the light list DTO; the full-payload hydration is required.
    },
  ],
};

const LECTURE = {
  id: 'l1', lectureNumber: 3, titleAr: 'محاضرة القلب الثالثة', description: null,
  durationMinutes: 45, instructorName: 'د. أحمد', sourceReference: null,
  isCompleted: false, questionsCount: 4,
};

function renderWithProviders(ui: ReactElement, initialEntry = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderRoute(initialEntry: string, path: string, element: ReactElement) {
  return renderWithProviders(
    <Routes>
      <Route path={path} element={element} />
    </Routes>,
    initialEntry
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteMock.mockResolvedValue({ status: 204 });
  // Safe default: unrelated queries resolve instead of rejecting.
  getMock.mockImplementation(async () => ({ data: {} }));
  postMock.mockImplementation(async () => ({ data: {} }));
  putMock.mockImplementation(async () => ({ data: {} }));
});

// =====================================================================
// D-01 + D-02 — QuestionPage
// =====================================================================
describe('Wave 18.1 — QuestionPage truthful states', () => {
  it('D-01: a 403 on the question list renders the activation/locked pattern, not a generic error', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/questions')) throw httpError(403, { detail: 'الاشتراك لا يغطي محتوى هذه المادة' });
      return { data: {} };
    });

    renderRoute('/subjects/ba/lectures/l1/questions', '/subjects/:subjectSlug/lectures/:lectureId/questions', <QuestionPage />);

    const locked = await screen.findByTestId('questions-locked');
    expect(locked).toBeInTheDocument();
    // The activation CTA from the shared locked pattern.
    expect(screen.getByTestId('activate-code-cta')).toBeInTheDocument();
    // NOT the generic connection-error card.
    expect(screen.queryByTestId('questions-error')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain(BANNED_OPTIONS_NOT_PUBLISHED);
  });

  it('D-02: a failed options hydration renders a retry error, never the "غير منشورة" empty copy', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url === '/questions') return { data: LECTURE_QUESTIONS };
      if (url === '/questions/q1') throw networkError();
      return { data: {} };
    });

    renderRoute('/subjects/ba/lectures/l1/questions', '/subjects/:subjectSlug/lectures/:lectureId/questions', <QuestionPage />);

    const optionsError = await screen.findByTestId('question-options-error', {}, { timeout: 5000 });
    expect(optionsError).toBeInTheDocument();
    expect(optionsError).toHaveTextContent('تعذّر تحميل خيارات هذا السؤال');
    expect(document.body.textContent).not.toContain(BANNED_OPTIONS_NOT_PUBLISHED);
  });

  it('D-02 (403 hydration): the activation hint with a code link, still never the empty copy', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url === '/questions') return { data: LECTURE_QUESTIONS };
      if (url === '/questions/q1') throw httpError(403, { detail: 'Subject is outside the entitlement scope.' });
      return { data: {} };
    });

    renderRoute('/subjects/ba/lectures/l1/questions', '/subjects/:subjectSlug/lectures/:lectureId/questions', <QuestionPage />);

    const optionsError = await screen.findByTestId('question-options-error', {}, { timeout: 5000 });
    expect(optionsError).toHaveTextContent('نطاق اشتراك غير مفعّل');
    expect(document.body.textContent).not.toContain(BANNED_OPTIONS_NOT_PUBLISHED);
  });
});

// =====================================================================
// D-10 — ExamReviewPage
// =====================================================================
describe('Wave 18.1 — ExamReviewPage truthful states', () => {
  it('a network failure renders connection + retry copy, never the policy-forbids claim', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/review')) throw networkError();
      return { data: {} };
    });

    renderRoute('/exams/s9/review', '/exams/:sessionId/review', <ExamReviewPage />);

    const errorCard = await screen.findByTestId('review-error-network', {}, { timeout: 5000 });
    expect(errorCard).toHaveTextContent('تعذّر تحميل المراجعة');
    expect(errorCard).toHaveTextContent('حدث خطأ في الاتصال');
    expect(document.body.textContent).not.toContain(BANNED_POLICY_FORBIDS_REVIEW);
  });

  it('a 403 without a server detail renders the access-denied fallback, never the policy claim', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/review')) throw httpError(403);
      return { data: {} };
    });

    renderRoute('/exams/s9/review', '/exams/:sessionId/review', <ExamReviewPage />);

    const card = await screen.findByTestId('review-unavailable', {}, { timeout: 5000 });
    expect(card).toHaveTextContent('لا يمكنك الوصول إلى مراجعة هذا الاختبار');
    expect(document.body.textContent).not.toContain(BANNED_POLICY_FORBIDS_REVIEW);
  });

  it('a 403 WITH a server detail shows that detail verbatim (the truthful policy case)', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/review')) {
        throw httpError(403, { detail: 'المحاولة مفتوحة حالياً — المراجعة متاحة بعد تسليمها.' });
      }
      return { data: {} };
    });

    renderRoute('/exams/s9/review', '/exams/:sessionId/review', <ExamReviewPage />);

    const card = await screen.findByTestId('review-unavailable', {}, { timeout: 5000 });
    expect(card).toHaveTextContent('المحاولة مفتوحة حالياً');
    expect(document.body.textContent).not.toContain(BANNED_POLICY_FORBIDS_REVIEW);
  });

  it('a missing session id renders the honest not-found copy', async () => {
    // No :sessionId in the route at all — the query stays disabled and the page
    // must not claim the exam's policy forbids review.
    renderRoute('/', '/', <ExamReviewPage />);

    const card = await screen.findByTestId('review-unavailable', {}, { timeout: 5000 });
    expect(card).toHaveTextContent('سجل هذا الاختبار غير موجود أو تم حذفه');
    expect(document.body.textContent).not.toContain(BANNED_POLICY_FORBIDS_REVIEW);
  });
});

// =====================================================================
// D-11 — TrainingBuilderModal
// =====================================================================
describe('Wave 18.1 — TrainingBuilderModal truthful states', () => {
  it('a failed tree fetch renders a retry error, never the empty-lectures copy', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/practice/categorized/')) throw networkError();
      return { data: {} };
    });

    renderWithProviders(
      <TrainingBuilderModal open subjectId="s1" subjectName="الباطنة" onOpenChange={() => undefined} />
    );

    const errorBox = await screen.findByTestId('training-lectures-error', {}, { timeout: 5000 });
    expect(errorBox).toHaveTextContent('تعذّر تحميل محاضرات المادة');
    expect(errorBox).toHaveTextContent('إعادة المحاولة');
    expect(document.body.textContent).not.toContain(BANNED_NO_CATEGORIZED_LECTURES);
  });

  it('a 403 tree fetch renders the activation copy + code CTA, never the empty-lectures copy', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/practice/categorized/')) {
        throw httpError(403, { detail: 'No active grants for this student.' });
      }
      return { data: {} };
    });

    renderWithProviders(
      <TrainingBuilderModal open subjectId="s1" subjectName="الباطنة" onOpenChange={() => undefined} />
    );

    const errorBox = await screen.findByTestId('training-lectures-error', {}, { timeout: 5000 });
    expect(errorBox).toHaveTextContent('اشتراكك لا يغطي بنك أسئلة هذه المادة');
    expect(document.body.textContent).not.toContain(BANNED_NO_CATEGORIZED_LECTURES);
  });
});

// =====================================================================
// D-12 — LecturePage
// =====================================================================
describe('Wave 18.1 — LecturePage truthful states', () => {
  it('a failed files fetch renders a retry error, never the "no published files" copy', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/library/lectures/')) throw networkError();
      if (url.includes('/lectures/')) return { data: LECTURE };
      return { data: {} };
    });

    renderRoute('/subjects/ba/lectures/l1', '/subjects/:subjectSlug/lectures/:lectureId', <LecturePage />);

    const errorBox = await screen.findByTestId('lecture-files-error', {}, { timeout: 5000 });
    expect(errorBox).toHaveTextContent('تعذّر تحميل ملفات المحاضرة');
    expect(document.body.textContent).not.toContain(BANNED_NO_PUBLISHED_FILES);
  });

  it('a 403 on the lecture renders the activation/locked pattern', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/lectures/')) throw httpError(403, { detail: 'الاشتراك لا يغطي محتوى هذه المادة' });
      return { data: {} };
    });

    renderRoute('/subjects/ba/lectures/l1', '/subjects/:subjectSlug/lectures/:lectureId', <LecturePage />);

    const locked = await screen.findByTestId('lecture-locked', {}, { timeout: 5000 });
    expect(locked).toBeInTheDocument();
    expect(screen.getByTestId('activate-code-cta')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('تعذر العثور على المحاضرة أو لا تملك صلاحية');
  });

  it('a 404 on the lecture renders the not-found copy (separated from 403)', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/library/lectures/')) return { data: { items: [] } };
      if (url.includes('/lectures/')) throw httpError(404);
      return { data: {} };
    });

    renderRoute('/subjects/ba/lectures/l1', '/subjects/:subjectSlug/lectures/:lectureId', <LecturePage />);

    const notFound = await screen.findByTestId('lecture-not-found', {}, { timeout: 5000 });
    expect(notFound).toHaveTextContent('المحاضرة غير موجودة');
    expect(screen.queryByTestId('lecture-locked')).not.toBeInTheDocument();
  });

  it('a network failure on the lecture renders connection + retry (separated from 404)', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/lectures/')) throw networkError();
      return { data: {} };
    });

    renderRoute('/subjects/ba/lectures/l1', '/subjects/:subjectSlug/lectures/:lectureId', <LecturePage />);

    const errorCard = await screen.findByTestId('lecture-error', {}, { timeout: 5000 });
    expect(errorCard).toHaveTextContent('تعذّر تحميل المحاضرة');
    expect(errorCard).toHaveTextContent('حدث خطأ في الاتصال');
    expect(screen.queryByTestId('lecture-not-found')).not.toBeInTheDocument();
  });
});

// =====================================================================
// D-13 — PracticePage denial variant
// =====================================================================
describe('Wave 18.1 — PracticePage denial variant honesty', () => {
  it('a 403 with a device-mismatch reason renders the DEVICE card (login CTA), not a blanket no-grants claim', async () => {
    postMock.mockImplementation(async (url: string) => {
      if (url.includes('/practice/categorized/s1/start')) {
        throw httpError(403, { detail: 'Entitlement device mismatch.' });
      }
      return { data: {} };
    });

    renderRoute('/practice/categorized/s1', '/practice/categorized/:subjectId', <PracticePage />);

    const denied = await screen.findByTestId('practice-denied', {}, { timeout: 5000 });
    expect(denied).toHaveAttribute('data-variant', 'device');
    expect(screen.getByTestId('entitlement-login-link')).toBeInTheDocument();
    expect(screen.queryByTestId('entitlement-activate-link')).not.toBeInTheDocument();
  });

  it('a 403 with a no-grants reason renders the no-grants card (activation CTA)', async () => {
    postMock.mockImplementation(async (url: string) => {
      if (url.includes('/practice/categorized/s1/start')) {
        throw httpError(403, { detail: 'No active grants for this student.' });
      }
      return { data: {} };
    });

    renderRoute('/practice/categorized/s1', '/practice/categorized/:subjectId', <PracticePage />);

    const denied = await screen.findByTestId('practice-denied', {}, { timeout: 5000 });
    expect(denied).toHaveAttribute('data-variant', 'no-grants');
    expect(screen.getByTestId('entitlement-activate-link')).toBeInTheDocument();
  });
});
