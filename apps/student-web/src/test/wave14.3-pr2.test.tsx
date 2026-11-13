import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) — same harness pattern as push6.test.tsx ----
const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

// DashboardPage reads the greeting from useAuth; the push6-style harness mounts
// no AuthProvider, so the hook is mocked to a signed-in student.
vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({ user: { fullName: 'طالب تجريبي' } }),
}));

import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { SubjectModalProvider } from '@/features/subjects/SubjectModalContext';
import { SubjectModal } from '@/features/subjects/SubjectModal';

// ---- fixtures ----
// s1: every scope → sheet shows all 4 actions. s2: QuestionsExams only → content + exams.
const MY_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', color: '#0ea5e9', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
  { id: 's2', slug: 'باطنة', nameAr: 'الباطنة', color: null, contentScopes: ['QuestionsExams'] },
];

// Stats row s9 (الجراحة) has attempts but NO entitlement → in 15.2 (D1) it is
// not rendered at all: the «غير مفعّلة» badge left with the deleted progress grid.
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
    { subjectId: 's9', subjectName: 'الجراحة', questionsAnswered: 40, accuracy: 70, completedPercentage: 30 },
  ],
  byDifficulty: {
    easy: { answered: 40, accuracy: 80 },
    medium: { answered: 50, accuracy: 70 },
    hard: { answered: 30, accuracy: 60 },
  },
};

function stubGet() {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
    if (url.includes('/stats/me')) return { data: STATS_ME };
    return { data: [] };
  });
}

/** Renders /dashboard the way App.tsx composes it: page + global subject sheet,
 *  both inside SubjectModalProvider (Wave 14.3 PR #1 mounting contract).
 *  15.2: the page itself mounts ContinueCard + QuickAccessSection — both ride
 *  the same mocked ['my-subjects-entitled'] cache this harness already serves. */
function renderDashboard() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <SubjectModalProvider>
          <Routes>
            <Route path="/dashboard" element={<><DashboardPage /><SubjectModal /></>} />
            <Route path="*" element={<div data-testid="unmatched-route" />} />
          </Routes>
        </SubjectModalProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  postMock.mockReset();
  stubGet();
});

// ============ Wave 14.3 PR #2 → 15.2: موادي section ============

describe('Dashboard — موادي (entitled subjects)', () => {
  it('renders the heading and one progress card per entitled subject', async () => {
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'موادي' })).toBeInTheDocument();
    expect(await screen.findByTestId('my-subject-card-s1')).toBeInTheDocument();
    expect(screen.getByTestId('my-subject-card-s2')).toBeInTheDocument();
    expect(screen.getByTestId('my-subject-card-s2')).toHaveTextContent('الباطنة');
    // s2 has no stats row → its progress falls back to 0%.
    expect(screen.getByTestId('my-subject-card-s2')).toHaveTextContent('0%');
    // Both queries served from the mocked client.
    expect(getMock.mock.calls.some(([url]) => String(url).includes('/subjects/my-subjects'))).toBe(true);
    expect(getMock.mock.calls.some(([url]) => String(url).includes('/stats/me'))).toBe(true);
    // s1 has attempts (bySubject row) → the 15.2 ContinueCard picks it up.
    expect(await screen.findByTestId('dashboard-continue-card')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-continue-card')).toHaveTextContent('تشريح مرضي');
  });

  it('opens the scope-gated sheet from a progress card (QuestionsExams-only → content + exams)', async () => {
    renderDashboard();

    fireEvent.click(await screen.findByTestId('my-subject-card-s2'));

    const sheet = await screen.findByTestId('subject-actions-sheet');
    expect(sheet).toBeInTheDocument();
    expect(sheet).toHaveTextContent('الباطنة');
    expect(screen.getByTestId('subject-action-content')).toBeInTheDocument();
    expect(screen.getByTestId('subject-action-exams')).toBeInTheDocument();
    expect(screen.queryByTestId('subject-action-library')).not.toBeInTheDocument();
    expect(screen.queryByTestId('subject-action-courses')).not.toBeInTheDocument();
    // The continue card is a separate element — never inside the sheet.
    expect(sheet.contains(screen.getByTestId('dashboard-continue-cta'))).toBe(false);
  });

  it('drops non-entitled stats rows entirely (no card, no «غير مفعّلة» badge)', async () => {
    renderDashboard();

    // Entitled cards render once my-subjects settles; s9 (bySubject-only) never does.
    expect(await screen.findByTestId('my-subject-card-s1')).toBeInTheDocument();
    expect(screen.queryByTestId('my-subject-card-s9')).not.toBeInTheDocument();
    expect(screen.queryByText('غير مفعّلة')).not.toBeInTheDocument();
  });
});

// ============ Wave 15.2: ContinueCard ============

describe('Dashboard — ContinueCard (15.2)', () => {
  it('falls back to the first entitled subject ("start" state) when bySubject is empty', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
      if (url.includes('/stats/me')) return { data: { ...STATS_ME, bySubject: [] } };
      return { data: [] };
    });
    renderDashboard();

    const card = await screen.findByTestId('dashboard-continue-card');
    expect(card).toHaveTextContent('ابدأ الدراسة');
    expect(card).not.toHaveTextContent('تابع من حيث توقفت');
    const cta = screen.getByTestId('dashboard-continue-cta');
    expect(cta).toHaveTextContent('ابدأ الآن');

    // The CTA opens the sheet scoped to s1 (every scope → 4 actions).
    fireEvent.click(cta);
    const sheet = await screen.findByTestId('subject-actions-sheet');
    expect(sheet).toBeInTheDocument();
    expect(sheet).toHaveTextContent('تشريح مرضي');
    expect(screen.getByTestId('subject-action-content')).toBeInTheDocument();
    expect(screen.getByTestId('subject-action-exams')).toBeInTheDocument();
    expect(screen.getByTestId('subject-action-library')).toBeInTheDocument();
    expect(screen.getByTestId('subject-action-courses')).toBeInTheDocument();
  });

  it('hides ContinueCard and QuickAccess when the student has no entitled subjects', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: [] };
      if (url.includes('/stats/me')) return { data: STATS_ME };
      return { data: [] };
    });
    renderDashboard();

    // Settle both queries: the موادي empty state appears once my-subjects resolves [].
    expect(await screen.findByText('لم تفعّل أي مادة بعد')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-continue-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-access-section')).not.toBeInTheDocument();
  });
});

// ============ Wave 15.2: QuickAccess ============

describe('Dashboard — QuickAccess (15.2)', () => {
  it('filter chips scope the tiles to the selected subject', async () => {
    renderDashboard();

    expect(await screen.findByTestId('quick-access-chip-all')).toBeInTheDocument();
    expect(screen.getByTestId('quick-access-chip-s1')).toBeInTheDocument();
    expect(screen.getByTestId('quick-access-chip-s2')).toBeInTheDocument();

    // Default («الكل»): hub links carry no subjectId.
    expect(screen.getByTestId('quick-access-tile-library')).toHaveAttribute('href', '/my-studies?tab=library');

    // Selecting s1 scopes every tile via the hub's ?subjectId= param.
    fireEvent.click(screen.getByTestId('quick-access-chip-s1'));
    expect(screen.getByTestId('quick-access-tile-library')).toHaveAttribute('href', '/my-studies?subjectId=s1&tab=library');
    expect(screen.getByTestId('quick-access-tile-courses')).toHaveAttribute('href', '/my-studies?subjectId=s1&tab=courses');
    expect(screen.getByTestId('quick-access-tile-exams')).toHaveAttribute('href', '/my-studies?subjectId=s1&tab=exams');

    // «الكل» clears the filter again.
    fireEvent.click(screen.getByTestId('quick-access-chip-all'));
    expect(screen.getByTestId('quick-access-tile-library')).toHaveAttribute('href', '/my-studies?tab=library');
  });
});
