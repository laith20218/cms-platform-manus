import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 18.3 — Touch, Keys & Focus regression suite.
 * D-14 (keyboard rows + load-more), D-16 (focusable checkbox), D-24 (Radix
 * dialogs, ESC), D-35 (search aria), D-39 (chip aria-pressed), D-42 (cancel
 * dialog, mobile visibility, timer role), D-45 (shared report dialog).
 */

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
  useAuth: () => ({ user: { fullName: 'طالب تجريبي' }, isAuthenticated: true, isLoading: false }),
}));

vi.mock('@/features/security/useContentProtection', () => ({
  useContentProtection: () => undefined,
  useAntiCopy: () => undefined,
  useDevToolsDetection: () => undefined,
  useWatermark: () => undefined,
  useScreenshotDetection: () => undefined,
}));

vi.mock('@/features/favorites/components/FavoriteListPicker', () => ({
  FavoriteListPicker: () => null,
}));

import NotificationsPage from '@/features/notifications/pages/NotificationsPage';
import ExamPage from '@/features/exams/pages/ExamPage';
import QuestionPage from '@/features/questions/QuestionPage';
import RegisterPage from '@/features/auth/pages/RegisterPage';
import SearchPage from '@/features/search/SearchPage';

const PAGE_SIZE = 20;

function notif(id: string, isRead = false) {
  return {
    id, type: 'announcement', title: `إشعار ${id}`, body: 'نص الإشعار التجريبي',
    isRead, actionUrl: null, actionLabel: null, createdAt: '2026-01-01T00:00:00Z',
  };
}

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
  // ExamPage persists its session pointer in sessionStorage — a stale pointer
  // from a previous test would make the next one resume a broken session.
  sessionStorage.clear();
  getMock.mockImplementation(async () => ({ data: {} }));
  postMock.mockImplementation(async () => ({ data: {} }));
  putMock.mockImplementation(async () => ({ data: {} }));
  deleteMock.mockResolvedValue({ status: 204 });
});

// =====================================================================
// D-14 + D-39 — Notifications rows + chips
// =====================================================================
describe('Wave 18.3 — Notifications rows & chips (D-14/D-39)', () => {
  it('rows are real buttons (keyboard operable), and the filter chips carry aria-pressed', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/notifications/unread-count')) return { data: 0 };
      if (url.includes('/notifications')) return { data: { items: [notif('n1'), notif('n2')] } };
      return { data: {} };
    });
    renderWithProviders(<NotificationsPage />);

    const row = await screen.findByTestId('notification-row-n1');
    expect(row.tagName).toBe('BUTTON');
    expect(row).toHaveAttribute('type', 'button');
    // Keyboard operability: the row receives focus.
    row.focus();
    expect(document.activeElement).toBe(row);

    // D-39: the filter chips are pressed-state toggles.
    expect(screen.getByRole('button', { name: 'الكل' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /غير مقروء/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('a full first page shows load-more, which fetches the next page (the API paginates)', async () => {
    getMock.mockImplementation(async (url: string, config?: { params?: { page?: number } }) => {
      if (url.includes('/notifications/unread-count')) return { data: 0 };
      if (url.includes('/notifications')) {
        // axios merges `params` into the URL at request time — the raw mock
        // sees them in the config argument.
        const page = config?.params?.page ?? 1;
        // Page 1 full (PAGE_SIZE items), page 2 returns 1 item (last page).
        const items = page === 1
          ? Array.from({ length: PAGE_SIZE }, (_, i) => notif(`p1-${i}`))
          : [notif('p2-0')];
        return { data: { items } };
      }
      return { data: {} };
    });
    renderWithProviders(<NotificationsPage />);

    const loadMore = await screen.findByTestId('notifications-load-more', {}, { timeout: 5000 });
    expect((await screen.findByTestId('notification-row-p1-0'))).toBeInTheDocument();
    fireEvent.click(loadMore);
    await waitFor(() => {
      expect(screen.getByTestId('notification-row-p2-0')).toBeInTheDocument();
    });
    // Page 2 was actually requested.
    const secondCall = getMock.mock.calls.find(
      (call) => String(call[0]).includes('/notifications') && (call[1] as { params?: { page?: number } })?.params?.page === 2,
    );
    expect(secondCall).toBeTruthy();
  });

  it('a short first page renders NO load-more (no fake next page)', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/notifications/unread-count')) return { data: 0 };
      if (url.includes('/notifications')) return { data: { items: [notif('only-1')] } };
      return { data: {} };
    });
    renderWithProviders(<NotificationsPage />);
    await screen.findByTestId('notification-row-only-1');
    expect(screen.queryByTestId('notifications-load-more')).not.toBeInTheDocument();
  });
});

// =====================================================================
// D-42 + D-24 — ExamPage cancel/submit dialogs + timer
// =====================================================================
describe('Wave 18.3 — ExamPage dialogs & timer (D-42/D-24)', () => {
  const EXAM_SESSION = {
    sessionId: 'es1', examId: 'ex1', examTitle: 'اختبار القلب', status: 'InProgress',
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    totalQuestions: 2,
    questions: [
      {
        id: 'q1', number: 1, text: 'سؤال تجريبي؟', textHtml: null, type: 'Mcq', difficulty: 'Easy',
        paragraphTag: null, lectureTitle: 'محاضرة', images: [],
        options: [
          { id: 'o1', letter: 'A', text: 'خيار 1', imageUrl: null },
          { id: 'o2', letter: 'B', text: 'خيار 2', imageUrl: null },
        ],
      },
    ],
    savedAnswers: [],
  };

  function stubExam() {
    postMock.mockImplementation(async (url: string) => {
      if (url.includes('/start')) return { data: EXAM_SESSION };
      if (url.includes('/cancel')) return { status: 204 };
      if (url.includes('/submit')) return { data: { isResultVisible: false, score: null, passed: null } };
      return { data: {} };
    });
    getMock.mockImplementation(async (url: string) => {
      // Resume path (a stored session pointer) stays healthy too.
      if (url.includes('/exams/sessions/es1')) return { data: EXAM_SESSION };
      return { data: {} };
    });
  }

  it('the cancel button is present WITHOUT the mobile-hidden class and opens the Radix confirm (no window.confirm)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    stubExam();
    renderRoute('/exams/ex1', '/exams/:examId', <ExamPage />);

    const cancel = await screen.findByTestId('exam-cancel-attempt', {}, { timeout: 5000 });
    // D-42: visible on mobile — the old `hidden sm:inline` is gone.
    expect(cancel.className).not.toContain('hidden');
    fireEvent.click(cancel);
    const dialog = await screen.findByTestId('exam-cancel-confirm');
    expect(dialog).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('exam-cancel-final')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('confirming cancel calls the API (no window.confirm anywhere in the flow)', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    stubExam();
    renderRoute('/exams/ex1', '/exams/:examId', <ExamPage />);

    fireEvent.click(await screen.findByTestId('exam-cancel-attempt', {}, { timeout: 5000 }));
    fireEvent.click(await screen.findByTestId('exam-cancel-final'));
    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        '/exams/sessions/es1/cancel',
        expect.anything(),
        expect.anything(),
      );
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('the timer has role=timer with a minute-level live region (seconds stay silent)', async () => {
    stubExam();
    renderRoute('/exams/ex1', '/exams/:examId', <ExamPage />);
    const timer = await screen.findByRole('timer', {}, { timeout: 5000 });
    expect(timer).toHaveAttribute('aria-label', 'الوقت المتبقي');
    // The ticking digits are aria-hidden; the announcement is the sr-only span.
    expect(timer.querySelector('span[lang="en"]')).toHaveAttribute('aria-hidden', 'true');
    expect(timer.textContent).toContain('دقيقة');
  });

  it('the submit confirm is a Radix dialog (role=dialog) and ESC closes it (D-24)', async () => {
    stubExam();
    renderRoute('/exams/ex1', '/exams/:examId', <ExamPage />);
    fireEvent.click(await screen.findByRole('button', { name: /تسليم الاختبار/ }, { timeout: 5000 }));
    const dialog = await screen.findByTestId('exam-submit-confirm', {}, { timeout: 5000 });
    expect(dialog).toHaveAttribute('role', 'dialog');
    fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('exam-submit-confirm')).not.toBeInTheDocument();
    });
  });
});

// =====================================================================
// D-45 — QuestionPage shared report dialog
// =====================================================================
describe('Wave 18.3 — QuestionPage shared report dialog (D-45)', () => {
  it('the report button opens the SHARED Radix dialog (role=dialog, one implementation)', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url === '/questions') {
        return {
          data: {
            items: [{
              id: 'q1', text: 'سؤال تجريبي', type: 'Mcq', difficulty: 'Easy', tags: [], isFavorite: false,
              options: [
                { id: 'o1', letter: 'A', text: 'خيار', imageUrl: null },
                { id: 'o2', letter: 'B', text: 'خيار', imageUrl: null },
              ],
            }],
          },
        };
      }
      return { data: {} };
    });
    renderRoute('/subjects/ba/lectures/l1/questions', '/subjects/:subjectSlug/lectures/:lectureId/questions', <QuestionPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'إبلاغ' }, { timeout: 5000 }));
    const dialog = await screen.findByTestId('report-question-dialog', {}, { timeout: 5000 });
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(screen.getByTestId('report-reasons')).toBeInTheDocument();
    expect(screen.getByTestId('report-submit')).toBeInTheDocument();
  });
});

// =====================================================================
// D-35 — Search input aria
// =====================================================================
describe('Wave 18.3 — Search input aria (D-35)', () => {
  it('the search input is labelled and the form is a landmark', () => {
    renderWithProviders(<SearchPage />);
    expect(screen.getByRole('search')).toBeInTheDocument();
    expect(screen.getByLabelText('ابحث في محتواك الأكاديمي')).toBeInTheDocument();
  });
});

// =====================================================================
// D-16 — Register terms checkbox focusable
// =====================================================================
describe('Wave 18.3 — Register checkbox focusable (D-16)', () => {
  it('the terms checkbox is sr-only (focusable), never display:hidden', async () => {
    renderRoute('/register', '/register', <RegisterPage />);
    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(checkbox.className).toContain('sr-only');
    expect(checkbox.className).not.toMatch(/\bhidden\b/);
    // Focusable (a hidden input cannot take focus).
    checkbox.focus();
    expect(document.activeElement).toBe(checkbox);
  });
});
