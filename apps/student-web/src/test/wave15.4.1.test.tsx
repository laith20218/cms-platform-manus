import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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

const LEADERBOARD = { topStudents: [], yourRank: null };

function stubGet() {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
    if (url.includes('/stats/me')) return { data: STATS };
    if (url.includes('/stats/leaderboard')) return { data: LEADERBOARD };
    if (url.includes('/library/subject/')) return { data: { items: [] } };
    if (url.includes('/exams/by-subject/')) return { data: [] };
    return { data: [] };
  });
}

/** Renders the /study route directly (W15.4.1: the hub is URL-only — tests
 *  navigate straight to it, no sidebar link exists yet). */
function renderStudyAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/study" element={<StudyPage />} />
          <Route path="*" element={<div data-testid="route-fallback" />} />
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

// ================= W15.4.1: the parallel /study hub =================

describe('StudyPage — 6-tab parallel hub (15.4.1)', () => {
  it('renders /study with the overview tab active by default', async () => {
    renderStudyAt('/study');

    expect(screen.getByTestId('study-page')).toBeInTheDocument();
    expect(screen.getByTestId('study-tab-overview').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('study-panel-overview')).toBeInTheDocument();
    // Greeting resolves once /stats/me loads.
    expect(await screen.findByText(/أهلاً، طالب/)).toBeInTheDocument();
    expect(screen.getByTestId('study-overview-tab')).toBeInTheDocument();
    expect(screen.getByTestId('study-stat-questions')).toBeInTheDocument();
  });

  it('renders all six tabs with the correct labels', () => {
    renderStudyAt('/study');

    const expected: ReadonlyArray<readonly [string, string]> = [
      ['overview', 'نظرة عامة'],
      ['progress', 'تقدمي'],
      ['library', 'المكتبة'],
      ['courses', 'الكورسات'],
      ['exams', 'الاختبارات'],
      ['leaderboard', 'الصدارة'],
    ];
    for (const [key, label] of expected) {
      const tab = screen.getByTestId(`study-tab-${key}`);
      expect(tab).toBeInTheDocument();
      expect(tab.textContent).toContain(label);
    }
    // No seventh tab leaks in from the legacy hub.
    expect(screen.queryByTestId('study-tab-practice')).not.toBeInTheDocument();
  });

  it('switching tabs updates the panel and the active state', () => {
    renderStudyAt('/study');

    fireEvent.click(screen.getByTestId('study-tab-library'));

    expect(screen.getByTestId('study-panel-library')).toBeInTheDocument();
    expect(screen.getByTestId('study-tab-library').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('study-tab-overview').getAttribute('aria-selected')).toBe('false');
  });

  it('renders the exams tab from a direct ?tab=exams URL', () => {
    renderStudyAt('/study?tab=exams');

    expect(screen.getByTestId('study-tab-exams').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('study-panel-exams')).toBeInTheDocument();
    expect(screen.getByTestId('study-exams-tab')).toBeInTheDocument();
  });

  it('shows the subject filter chip when ?subjectId= is present', async () => {
    renderStudyAt('/study?subjectId=s1&tab=library');

    const chip = await screen.findByTestId('study-subject-filter-chip');
    await waitFor(() => {
      expect(screen.getByTestId('study-subject-filter-name').textContent).toBe('تشريح مرضي');
    });
    expect(chip.textContent).toContain('تشريح مرضي');
    expect(screen.getByTestId('study-subject-filter-clear')).toBeInTheDocument();
  });

  it('renders the leaderboard tab with no breadcrumb links inside the panel', async () => {
    renderStudyAt('/study?tab=leaderboard');

    const panel = await screen.findByTestId('study-panel-leaderboard');
    expect(screen.getByTestId('study-leaderboard-tab')).toBeInTheDocument();
    // W15.4.4.0b: with no ?subjectId the tab shows the subject picker —
    // the board itself renders only after a subject is picked.
    expect(await screen.findByTestId('leaderboard-subject-picker')).toBeInTheDocument();
    expect(await screen.findByTestId('leaderboard-subject-s1')).toBeInTheDocument();
    expect(screen.getByTestId('leaderboard-subject-s2')).toBeInTheDocument();

    // hideBreadcrumb: the hub owns navigation — no breadcrumb links to
    // /dashboard or /stats anywhere inside the panel.
    expect(within(panel).queryByRole('link', { name: 'الرئيسية' })).not.toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: 'الإحصائيات' })).not.toBeInTheDocument();
    expect(within(panel).queryAllByRole('link')).toHaveLength(0);
  });
});
