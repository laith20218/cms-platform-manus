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

// Stats row s9 (الجراحة) has attempts but NO entitlement → inert card + «غير مفعّلة».
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
 *  both inside SubjectModalProvider (Wave 14.3 PR #1 mounting contract). */
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

/** The progress-grid <h3> for a subject (its name also appears in the موادي chip). */
function progressHeading(name: string) {
  return screen.getAllByText(name).find((el) => el.tagName === 'H3');
}

beforeEach(() => {
  vi.clearAllMocks();
  postMock.mockReset();
  stubGet();
});

// ================= Wave 14.3 PR #2: موادي section =================

describe('Dashboard — موادي (entitled subjects)', () => {
  it('renders the heading and one chip per entitled subject', async () => {
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'موادي' })).toBeInTheDocument();
    expect(await screen.findByTestId('my-subject-chip-s1')).toBeInTheDocument();
    expect(screen.getByTestId('my-subject-chip-s2')).toBeInTheDocument();
    expect(screen.getByTestId('my-subject-chip-s2')).toHaveTextContent('الباطنة');
    // Both queries served from the mocked client.
    expect(getMock.mock.calls.some(([url]) => String(url).includes('/subjects/my-subjects'))).toBe(true);
    expect(getMock.mock.calls.some(([url]) => String(url).includes('/stats/me'))).toBe(true);
  });

  it('opens the scope-gated sheet from a chip (QuestionsExams-only → content + exams)', async () => {
    renderDashboard();

    fireEvent.click(await screen.findByTestId('my-subject-chip-s2'));

    const sheet = await screen.findByTestId('subject-actions-sheet');
    expect(sheet).toBeInTheDocument();
    expect(sheet).toHaveTextContent('الباطنة');
    expect(screen.getByTestId('subject-action-content')).toBeInTheDocument();
    expect(screen.getByTestId('subject-action-exams')).toBeInTheDocument();
    expect(screen.queryByTestId('subject-action-library')).not.toBeInTheDocument();
    expect(screen.queryByTestId('subject-action-courses')).not.toBeInTheDocument();
  });

  it('makes entitled progress cards clickable (all scopes → 4 actions) and marks expired ones «غير مفعّلة»', async () => {
    renderDashboard();

    // Both progress rows render (s1 + s9) — «سؤال مميز» appears once per card.
    expect((await screen.findAllByText('سؤال مميز')).length).toBe(2);

    // Entitled stats row (s1) → wrapped in a button that opens the full sheet.
    const entitledHeading = progressHeading('تشريح مرضي');
    expect(entitledHeading).toBeDefined();
    const entitledButton = entitledHeading!.closest('button');
    expect(entitledButton).not.toBeNull();
    fireEvent.click(entitledButton!);

    const sheet = await screen.findByTestId('subject-actions-sheet');
    expect(sheet).toBeInTheDocument();
    expect(screen.getByTestId('subject-action-content')).toBeInTheDocument();
    expect(screen.getByTestId('subject-action-exams')).toBeInTheDocument();
    expect(screen.getByTestId('subject-action-library')).toBeInTheDocument();
    expect(screen.getByTestId('subject-action-courses')).toBeInTheDocument();

    // Stats row without entitlement (s9 الجراحة) → plain article, no button, badge shown.
    const expiredHeading = progressHeading('الجراحة');
    expect(expiredHeading).toBeDefined();
    expect(expiredHeading!.closest('button')).toBeNull();
    expect(screen.getByText('غير مفعّلة')).toBeInTheDocument();
  });
});
