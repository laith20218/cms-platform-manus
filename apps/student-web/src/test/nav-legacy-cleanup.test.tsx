import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave C — legacy nav cleanup + official Stats placement regression suite.
 *
 * Recon findings this wave fixes (docs/student-web-navigation-recon.md §4):
 *   1. Five deep pages used raw navigate(-1): on a DIRECT URL entry
 *      (bookmark / notification deep link) history is empty and the control
 *      could leave the app. Now useLogicalBack(fallback) mirrors the
 *      PathTrail parent policy.
 *   2. Legal «العودة للرئيسية» targeted `/` — a pointless redirect hop (and a
 *      second bounce to /login for guests). Now links /dashboard directly.
 *   3. RegisterPage terms/privacy were raw <a href> — full page reloads. Now
 *      SPA <Link>.
 *   4. /stats was an orphan (only entrance: the leaderboard breadcrumb). The
 *      Profile quick-links grid is now its OFFICIAL entry («إحصاءاتي»).
 *
 * NOTE on the history tests: the app mounts BrowserRouter (which syncs
 * window.history.state.idx), but MemoryRouter keeps its own stack. The tests
 * below set window.history.state.idx explicitly to model each scenario and
 * let MemoryRouter's internal stack serve as the in-app navigation history.
 */

// ---------------------------------------------------------------------------
// Mocks — the deep pages under test lean on these modules.
// ---------------------------------------------------------------------------

vi.mock('@/features/my-studies/hooks/useMySubjects', () => ({
  useMySubjects: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/features/my-studies/services/courses-api', async () => {
  const actual = await vi.importActual<typeof import('@/features/my-studies/services/courses-api')>(
    '@/features/my-studies/services/courses-api'
  );
  return {
    ...actual,
    isEntitlementDenied: () => false,
    useCourseEntitlement: () => ({}),
  };
});
vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', fullName: 'طالب تجريبي', role: 'student' },
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
  }),
}));

const { getMock, postMock, putMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
}));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    put: (...args: unknown[]) => putMock(...args),
  },
}));

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderWithProviders(ui: React.ReactNode, initialEntries: string[]) {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// 1) useLogicalBack — the policy hook
// ---------------------------------------------------------------------------

import { useLogicalBack } from '@/hooks/useLogicalBack';

function BackProbe({ fallback }: { fallback: string }) {
  const goBack = useLogicalBack(fallback);
  const location = useLocation();
  return (
    <>
      <button type="button" data-testid="back-probe" onClick={goBack}>back</button>
      <span data-testid="location-probe" data-path={location.pathname} data-search={location.search} />
    </>
  );
}

describe('useLogicalBack', () => {
  beforeEach(() => { window.history.replaceState({ idx: 0 }, '', '/'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('a DIRECT URL entry (history idx 0) navigates to the fallback parent', async () => {
    window.history.replaceState({ idx: 0 }, '', '/exams/e1');
    render(
      <MemoryRouter initialEntries={['/exams/e1']}>
        <Routes>
          <Route path="/exams/:examId" element={<BackProbe fallback="/exams" />} />
          <Route path="/exams" element={<span data-testid="exams-page">exams</span>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('location-probe').dataset.path).toBe('/exams/e1');
    fireEvent.click(screen.getByTestId('back-probe'));
    // The fallback page renders — the student stays INSIDE the app.
    await waitFor(() => expect(screen.getByTestId('exams-page')).toBeInTheDocument());
  });

  it('an in-app navigation (history idx > 0) goes back to where the student came from', async () => {
    window.history.replaceState({ idx: 2 }, '', '/exams/e1');
    render(
      <MemoryRouter initialEntries={['/from', '/exams/e1']}>
        <Routes>
          <Route path="/from" element={<span data-testid="from-page">from</span>} />
          <Route path="/exams/:examId" element={<BackProbe fallback="/exams" />} />
          <Route path="/exams" element={<span data-testid="exams-page">exams</span>} />
        </Routes>
      </MemoryRouter>
    );
    // MemoryRouter's stack holds /from beneath the current entry: clicking
    // back must return there — NOT the fallback /exams.
    fireEvent.click(screen.getByTestId('back-probe'));
    await waitFor(() => expect(screen.getByTestId('from-page')).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// 2) Deep pages — «عودة» lands on the logical parent on direct entry
// ---------------------------------------------------------------------------

describe('deep pages — logical back on direct URL entry', () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockImplementation(async () => ({ data: {} }));
    window.history.replaceState({ idx: 0 }, '', '/');
  });
  afterEach(() => vi.restoreAllMocks());

  it('ExamReviewPage «العودة للنتائج» falls back to /exams (not app exit)', async () => {
    getMock.mockImplementation(async () => {
      // Simulate a load failure so the error card with the back button renders.
      throw Object.assign(new Error('Network Error'), { isAxiosError: true, response: undefined });
    });
    const { default: ExamReviewPage } = await import('@/features/exams/pages/ExamReviewPage');
    renderWithProviders(
      <Routes>
        <Route path="/exams/:sessionId/review" element={<ExamReviewPage />} />
        <Route path="/exams" element={<span data-testid="exams-page">exams</span>} />
      </Routes>,
      ['/exams/s1/review']
    );
    const back = await screen.findByRole('button', { name: 'العودة للنتائج' });
    fireEvent.click(back);
    await waitFor(() => expect(screen.getByTestId('exams-page')).toBeInTheDocument());
  });

  it('LecturePage error card «عودة» falls back to the subject page', async () => {
    getMock.mockImplementation(async () => {
      throw Object.assign(new Error('Network Error'), { isAxiosError: true, response: undefined });
    });
    const { default: LecturePage } = await import('@/features/subjects/LecturePage');
    renderWithProviders(
      <Routes>
        <Route path="/subjects/:subjectSlug/lectures/:lectureId" element={<LecturePage />} />
        <Route path="/subjects/:subjectSlug" element={<span data-testid="subject-page">subject</span>} />
      </Routes>,
      ['/subjects/anatomy/lectures/l1']
    );
    const back = await screen.findByRole('button', { name: 'عودة' });
    fireEvent.click(back);
    await waitFor(() => expect(screen.getByTestId('subject-page')).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// 3) Legal pages — «العودة للرئيسية» targets /dashboard directly
// ---------------------------------------------------------------------------

describe('legal pages home target (Wave C)', () => {
  it('the back-home link points at /dashboard (no / redirect hop)', async () => {
    getMock.mockImplementation(async () => ({
      data: { slug: 'terms', titleAr: 'شروط الاستخدام', bodyAr: 'نص.', updatedAt: '2026-01-01T00:00:00Z' },
    }));
    const { TermsPage } = await import('@/features/legal/TermsPage');
    renderWithProviders(<TermsPage />, ['/terms']);
    await waitFor(() => expect(screen.getByTestId('legal-back-home')).toBeInTheDocument());
    expect(screen.getByTestId('legal-back-home')).toHaveAttribute('href', '/dashboard');
  });
});

// ---------------------------------------------------------------------------
// 4) Official Stats placement — the Profile quick-link
// ---------------------------------------------------------------------------

describe('official /stats placement (Wave C)', () => {
  beforeEach(() => {
    getMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes('/profile')) {
        return {
          data: {
            fullName: 'طالب تجريبي', phone: '0999999999', email: null,
            universityName: 'الجامعة', collegeName: 'الكلية', academicYearName: 'الأولى',
            subscriptions: [],
          },
        };
      }
      if (u.includes('/security/my-sessions')) {
        return { data: { sessions: [] } };
      }
      if (u.includes('/stats/me')) {
        return {
          data: {
            totalQuestions: 10, correctAnswers: 8, accuracy: 80, currentStreak: 2, longestStreak: 5,
            studyTimeMinutes: 120, examsCompleted: 3, completedLectures: 4,
            readFiles: 6, favoriteCount: 7,
            bySubject: [],
            byDifficulty: {
              easy: { answered: 4, accuracy: 90 },
              medium: { answered: 3, accuracy: 70 },
              hard: { answered: 3, accuracy: 60 },
            },
          },
        };
      }
      return { data: {} };
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('ProfilePage carries a stats quick-link card next to activate-code and settings', async () => {
    const { default: ProfilePage } = await import('@/features/profile/ProfilePage');
    renderWithProviders(<ProfilePage />, ['/profile']);
    const statsLink = await screen.findByTestId('profile-stats-link');
    expect(statsLink).toHaveAttribute('href', '/stats');
    expect(statsLink).toHaveTextContent('إحصاءاتي');
    // The pre-existing quick links stay in place.
    expect(screen.getByTestId('profile-activate-code-link')).toHaveAttribute('href', '/activate-code');
    expect(screen.getByTestId('profile-settings-link')).toHaveAttribute('href', '/settings');
  });

  it('StatsPage keeps its leaderboard banner (the stats ↔ leaderboard island pair)', async () => {
    const { default: StatsPage } = await import('@/features/stats/pages/StatsPage');
    renderWithProviders(<StatsPage />, ['/stats']);
    const banner = await screen.findByText('🏆 لوحة المتصدرين');
    expect(banner.closest('a')).toHaveAttribute('href', '/leaderboard');
  });
});

// ---------------------------------------------------------------------------
// 5) RegisterPage — SPA anchors for terms/privacy (no full reloads)
// ---------------------------------------------------------------------------

describe('RegisterPage legal anchors (Wave C)', () => {
  it('terms/privacy are SPA Links, not raw <a href> full reloads', async () => {
    getMock.mockImplementation(async () => ({ data: { universities: [], colleges: [], academicYears: [] } }));
    const { default: RegisterPage } = await import('@/features/auth/pages/RegisterPage');
    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/terms" element={<span data-testid="terms-route">terms</span>} />
        <Route path="/privacy" element={<span data-testid="privacy-route">privacy</span>} />
      </Routes>,
      ['/register']
    );
    const terms = await screen.findByRole('link', { name: 'الشروط' });
    const privacy = screen.getByRole('link', { name: 'سياسة الخصوصية' });
    expect(terms.getAttribute('href')).toBe('/terms');
    expect(privacy.getAttribute('href')).toBe('/privacy');
    // Router navigation lands on the real routes — the SPA behavior a raw
    // <a href> cannot provide (it would unmount the app for a full reload).
    fireEvent.click(terms);
    await waitFor(() => expect(screen.getByTestId('terms-route')).toBeInTheDocument());
  });
});
