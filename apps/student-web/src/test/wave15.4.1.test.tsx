import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) — mirrors push6.test.tsx ----
const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

vi.mock('@/features/entitlements/services/entitlement-api', async () => {
  const actual = await vi.importActual<typeof import('@/features/entitlements/services/entitlement-api')>(
    '@/features/entitlements/services/entitlement-api'
  );
  return { ...actual, entitlementRequestConfig: async () => ({}) };
});

vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({
    user: { fullName: 'طالب تجريبي', phone: '0999000111' },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
  }),
}));

import { StudyPage } from '@/features/study/pages/StudyPage';

// ---- fixtures ----
const MY_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
  { id: 's2', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['QuestionsExams', 'VideoAudio'] },
];

const STATS = {
  totalQuestions: 120,
  correctAnswers: 90,
  accuracy: 75,
  currentStreak: 3,
  longestStreak: 7,
  studyTimeMinutes: 95,
  examsCompleted: 4,
  favoriteCount: 5,
  completedLectures: 6,
  readFiles: 8,
  bySubject: [
    { subjectId: 's1', subjectName: 'تشريح مرضي', questionsAnswered: 80, accuracy: 78, completedPercentage: 40 },
    { subjectId: 's2', subjectName: 'الباطنة', questionsAnswered: 40, accuracy: 70, completedPercentage: 20 },
  ],
  byDifficulty: {
    easy: { answered: 40, accuracy: 85 },
    medium: { answered: 50, accuracy: 72 },
    hard: { answered: 30, accuracy: 60 },
  },
};

function stubGet() {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
    if (url.includes('/stats/me')) return { data: STATS };
    if (url.includes('/library/subject/')) return { data: { items: [] } };
    if (url.includes('/exams/by-subject/')) return { data: [] };
    return { data: [] };
  });
}

/** Exposes the live location so redirect assertions can read the final URL. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe" data-path={location.pathname} data-search={location.search} />;
}

/** Renders the /study route directly (W15.4.1: the hub is URL-only — tests
 *  navigate straight to it). The catch-all probe renders whenever a retired
 *  tab redirects OUT of the hub (W16.1a: /exams, /leaderboard). */
function renderStudyAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/study" element={<><StudyPage /><LocationProbe /></>} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  postMock.mockReset();
  stubGet();
});

// ================= W16.1a: the 4-tab /study hub =================

describe('StudyPage — 4-tab hub (15.4.1 → 16.1a)', () => {
  it('renders /study with the progress tab active by default (overview retired)', async () => {
    renderStudyAt('/study');

    expect(screen.getByTestId('study-page')).toBeInTheDocument();
    expect(screen.getByTestId('study-tab-progress').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('study-panel-progress')).toBeInTheDocument();
    // ProgressTab settles once /stats/me loads — the bySubject grid renders.
    expect(await screen.findByText('الأداء حسب المادة')).toBeInTheDocument();
    expect(screen.getByTestId('study-progress-tab')).toBeInTheDocument();
    expect(screen.getByText('تشريح مرضي')).toBeInTheDocument();
  });

  it('renders all five tabs with the correct labels (W17.1: content added; overview/exams/leaderboard retired)', () => {
    renderStudyAt('/study');

    const expected: ReadonlyArray<readonly [string, string]> = [
      ['progress', 'تقدمي'],
      ['content', 'المحتوى'],
      ['library', 'المكتبة'],
      ['bank', 'بنك الأسئلة'],
      ['courses', 'الكورسات'],
    ];
    for (const [key, label] of expected) {
      const tab = screen.getByTestId(`study-tab-${key}`);
      expect(tab).toBeInTheDocument();
      expect(tab.textContent).toContain(label);
    }
    // Tab order: progress | content | library | bank | courses (W17.1) — each
    // tab button must follow the previous one in the DOM.
    for (let i = 1; i < expected.length; i += 1) {
      const prev = screen.getByTestId(`study-tab-${expected[i - 1][0]}`);
      const curr = screen.getByTestId(`study-tab-${expected[i][0]}`);
      expect(prev.compareDocumentPosition(curr) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
    // The retired hub tabs are gone; the practice sub-tab never leaked in.
    expect(screen.queryByTestId('study-tab-overview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('study-tab-exams')).not.toBeInTheDocument();
    expect(screen.queryByTestId('study-tab-leaderboard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('study-tab-practice')).not.toBeInTheDocument();
  });

  it('switching tabs updates the panel and the active state', () => {
    renderStudyAt('/study');

    fireEvent.click(screen.getByTestId('study-tab-library'));

    expect(screen.getByTestId('study-panel-library')).toBeInTheDocument();
    expect(screen.getByTestId('study-tab-library').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('study-tab-progress').getAttribute('aria-selected')).toBe('false');
  });

  it('renders the exam-courses storefront in the bank tab (16.1b — D2-a mount)', async () => {
    renderStudyAt('/study?tab=bank');

    expect(screen.getByTestId('study-tab-bank').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('study-panel-bank')).toBeInTheDocument();
    // The catalog mounts as the bank panel (hideHeader — the hub owns the h1);
    // the 16.1a placeholder is gone. No published courses → the catalog's empty state.
    expect(screen.queryByTestId('study-bank-placeholder')).not.toBeInTheDocument();
    expect(await screen.findByTestId('exam-courses-empty')).toBeInTheDocument();
    expect(screen.getByTestId('exam-courses-tab-years').getAttribute('aria-selected')).toBe('true');
  });

  it('shows the subject scope bar (not the retired chip) when ?subjectId= is present (W17.1)', async () => {
    renderStudyAt('/study?subjectId=s1&tab=library');

    const bar = await screen.findByTestId('study-scope-bar');
    await waitFor(() => {
      expect(screen.getByTestId('study-scope-value').textContent).toBe('تشريح مرضي');
    });
    expect(bar).toBeInTheDocument();
    // The old hub-wide chip is retired outside the bank tab.
    expect(screen.queryByTestId('study-subject-filter-chip')).not.toBeInTheDocument();
  });
});

// ================= W16.1a: retired hub tabs redirect out (O1/R1) =================

describe('StudyPage — retired hub tabs redirect out (16.1a)', () => {
  it('?tab=overview redirects to ?tab=progress (O1)', async () => {
    renderStudyAt('/study?tab=overview');

    expect(await screen.findByTestId('study-panel-progress')).toBeInTheDocument();
    const probe = screen.getByTestId('location-probe');
    expect(probe.getAttribute('data-path')).toBe('/study');
    expect(probe.getAttribute('data-search')).toBe('?tab=progress');
  });

  it('?tab=exams redirects to the standalone /exams page (R1)', () => {
    renderStudyAt('/study?tab=exams');

    const probe = screen.getByTestId('location-probe');
    expect(probe.getAttribute('data-path')).toBe('/exams');
    expect(probe.getAttribute('data-search')).toBe('');
  });

  it('?tab=exams forwards ?subjectId= to /exams', () => {
    renderStudyAt('/study?subjectId=s1&tab=exams');

    const probe = screen.getByTestId('location-probe');
    expect(probe.getAttribute('data-path')).toBe('/exams');
    expect(probe.getAttribute('data-search')).toBe('?subjectId=s1');
  });

  it('?tab=leaderboard redirects to the standalone /leaderboard page (R1)', () => {
    renderStudyAt('/study?tab=leaderboard');

    const probe = screen.getByTestId('location-probe');
    expect(probe.getAttribute('data-path')).toBe('/leaderboard');
    expect(probe.getAttribute('data-search')).toBe('');
  });
});
