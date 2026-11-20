import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 19.1 — dashboard resilience (D-27 / D-28).
 *
 * Locks:
 *  1. (D-27) A /stats/me failure must NOT block the dashboard: MySubjects and
 *     QuickAccess ride their own ['my-subjects-entitled'] query and stay
 *     usable; the stats slot degrades to its own inline error + retry.
 *  2. (D-28) A my-subjects failure must not silently null ContinueCard /
 *     QuickAccessSection — each owns an inline error + retry. (An empty
 *     entitled list after a SUCCESSFUL load remains the W17.3 policy hide.)
 */

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

// Same harness contract as wave14.3-pr2.test.tsx: no AuthProvider mounted.
vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({ user: { fullName: 'طالب تجريبي' } }),
}));

import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { SubjectModalProvider } from '@/features/subjects/SubjectModalProvider';

const MY_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', color: '#0ea5e9', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
];

const STATS_ME = {
  totalQuestions: 120,
  correctAnswers: 90,
  accuracy: 75,
  currentStreak: 3,
  longestStreak: 5,
  studyTimeMinutes: 300,
  examsCompleted: 2,
  favoriteCount: 4,
  completedLectures: 10,
  readFiles: 6,
  bySubject: [
    { subjectId: 's1', subjectName: 'تشريح مرضي', questionsAnswered: 80, accuracy: 78, completedPercentage: 60 },
  ],
  byDifficulty: {
    easy: { answered: 40, accuracy: 80 },
    medium: { answered: 50, accuracy: 70 },
    hard: { answered: 30, accuracy: 60 },
  },
};

function renderDashboard() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <SubjectModalProvider>
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="*" element={<div data-testid="unmatched-route" />} />
          </Routes>
        </SubjectModalProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const statsCalls = () => getMock.mock.calls.filter(([u]) => String(u).includes('/stats/me')).length;
const subjectCalls = () => getMock.mock.calls.filter(([u]) => String(u).includes('/subjects/my-subjects')).length;

beforeEach(() => vi.clearAllMocks());

describe('W19.1 (D-27) — stats failure does not block the dashboard', () => {
  it('keeps MySubjects + QuickAccess usable and degrades the stats slot to inline error + retry', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/stats/me')) throw new Error('stats down');
      if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
      return { data: [] };
    });
    renderDashboard();

    // Stats slot: its own inline error, not a whole-page replacement.
    expect(await screen.findByTestId('dashboard-stats-error')).toHaveTextContent('تعذّر تحميل الإحصاءات');

    // The greeting hero still renders (auth-driven, not stats-driven).
    expect(screen.getByTestId('dashboard-hero')).toBeInTheDocument();

    // MySubjects stays usable with its own query's data.
    expect(await screen.findByTestId('my-subject-card-s1')).toBeInTheDocument();

    // QuickAccess stays usable (tiles + chips).
    expect(await screen.findByTestId('quick-access-section')).toBeInTheDocument();
    expect(screen.getByTestId('quick-access-tile-library')).toBeInTheDocument();

    // Retry re-requests /stats/me.
    const before = statsCalls();
    fireEvent.click(within(screen.getByTestId('dashboard-stats-error')).getByRole('button', { name: 'إعادة المحاولة' }));
    await waitFor(() => expect(statsCalls()).toBeGreaterThan(before));
  });
});

describe('W19.1 (D-28) — my-subjects failure is never a silent null', () => {
  it('ContinueCard and QuickAccessSection each show an inline error + retry', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/stats/me')) return { data: STATS_ME };
      if (url.includes('/subjects/my-subjects')) throw new Error('subjects down');
      return { data: [] };
    });
    renderDashboard();

    // ContinueCard: inline error + retry instead of the silent null.
    expect(await screen.findByTestId('dashboard-continue-error')).toHaveTextContent('تعذّر تحميل موادك');

    // QuickAccess: inline error + retry instead of the silent null.
    expect(await screen.findByTestId('quick-access-error')).toHaveTextContent('تعذّر تحميل موادك');

    // Retry re-requests the shared ['my-subjects-entitled'] query.
    const before = subjectCalls();
    fireEvent.click(within(screen.getByTestId('quick-access-error')).getByRole('button', { name: 'إعادة المحاولة' }));
    await waitFor(() => expect(subjectCalls()).toBeGreaterThan(before));
  });

  it('keeps the policy hide: a successfully-loaded empty entitled list still hides QuickAccess', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/stats/me')) return { data: STATS_ME };
      if (url.includes('/subjects/my-subjects')) return { data: [] };
      return { data: [] };
    });
    renderDashboard();

    // Error UI must NOT appear for the empty (policy) case…
    await waitFor(() => expect(screen.queryByTestId('quick-access-error')).toBeNull());
    // …and the section stays hidden exactly as before W19.1.
    await waitFor(() => expect(screen.queryByTestId('quick-access-section')).toBeNull());
  });
});
