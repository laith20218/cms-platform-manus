import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 19.4 — player breadcrumb hop (narrow C2) + small P2 batch.
 *
 * Locks:
 *  1. (D-22) CoursePlayerPage's two back/breadcrumb links point at the /study
 *     hub (?tab=courses) — the legacy /my-studies hrefs are gone. Locked as a
 *     SOURCE CONTRACT: the C2 exception allows exactly these two lines.
 *  2. (D-33) Register: academic-load errors are inline (own testid + retry),
 *     clear on the next successful load, and never leak into the form banner.
 *  3. (D-36) Leaderboard podium marks «(أنت)» when isYou; no physical mr-1.
 *  4. (D-40) MuwadiTab empty state carries a real link CTA to the structure
 *     tab (/subjects default view) — no text-only dead end.
 */

const here = dirname(fileURLToPath(import.meta.url));

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
const academicMocks = vi.hoisted(() => ({
  getUniversities: vi.fn(),
  getColleges: vi.fn(),
  getYears: vi.fn(),
}));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/features/subjects/services/academic-api', () => ({
  academicApi: {
    getUniversities: academicMocks.getUniversities,
    getColleges: academicMocks.getColleges,
    getYears: academicMocks.getYears,
  },
}));

vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({ user: { fullName: 'طالب تجريبي' } }),
}));

import RegisterPage from '@/features/auth/pages/RegisterPage';
import LeaderboardPage from '@/features/stats/pages/LeaderboardPage';
import { MuwadiTab } from '@/features/subjects/MuwadiTab';

vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
})));

function withProviders(ui: React.ReactNode, initialEntry = '/leaderboard') {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ============ D-22 — player back/breadcrumb hrefs (C2 exception contract) ============

describe('W19.4 (D-22) — CoursePlayerPage back links target /study', () => {
  it('holds exactly two to="/study?tab=courses" links and zero legacy /my-studies hrefs', () => {
    const source = readFileSync(resolve(here, '../features/my-studies/pages/CoursePlayerPage.tsx'), 'utf-8');
    const matches = source.match(/to="\/study\?tab=courses"/g) ?? [];
    expect(matches.length).toBe(2);
    expect(source).not.toContain('/my-studies?tab=courses');
    expect(source).not.toContain("to='/my-studies?tab=courses'");
  });
});

// ============ D-33 — Register academic-load errors ============

describe('W19.4 (D-33) — Register: academic errors clear on success + retry', () => {
  it('shows an inline error with retry when universities fail; retry recovers and clears it', async () => {
    let universitiesCalls = 0;
    academicMocks.getUniversities.mockImplementation(async () => {
      universitiesCalls += 1;
      if (universitiesCalls === 1) throw new Error('down');
      return { items: [{ id: 'u1', nameAr: 'جامعة دمشق' }] };
    });

    withProviders(<RegisterPage />);

    const err = await screen.findByTestId('register-academic-error');
    expect(err).toHaveTextContent('تعذّر تحميل البيانات الأكاديمية');
    expect(screen.getByTestId('register-academic-retry')).toHaveTextContent('إعادة المحاولة');

    fireEvent.click(screen.getByTestId('register-academic-retry'));

    await waitFor(() => expect(screen.queryByTestId('register-academic-error')).toBeNull());
    expect(await screen.findByRole('option', { name: 'جامعة دمشق' })).toBeInTheDocument();
  });

  it('clears the colleges error when a later university selection succeeds', async () => {
    academicMocks.getUniversities.mockResolvedValue({
      items: [
        { id: 'u1', nameAr: 'جامعة ١' },
        { id: 'u2', nameAr: 'جامعة ٢' },
      ],
    });
    academicMocks.getColleges.mockImplementation(async (id: string) => {
      if (id === 'u1') throw new Error('down');
      return [{ id: 'c1', nameAr: 'كلية الطب' }];
    });

    withProviders(<RegisterPage />);

    // First selection fails → inline error.
    fireEvent.change(await screen.findByLabelText('الجامعة'), { target: { value: 'u1' } });
    expect(await screen.findByTestId('register-academic-error')).toHaveTextContent('تعذّر تحميل الكليات');

    // Second selection succeeds → the stale error clears.
    fireEvent.change(screen.getByLabelText('الجامعة'), { target: { value: 'u2' } });
    await waitFor(() => expect(screen.queryByTestId('register-academic-error')).toBeNull());
    expect(await screen.findByRole('option', { name: 'كلية الطب' })).toBeInTheDocument();
  });
});

// ============ D-36 — leaderboard podium «(أنت)» + logical margin ============

describe('W19.4 (D-36) — Leaderboard podium self-marker', () => {
  it('marks «(أنت)» on the podium when you are ranked top-3', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/profile/leaderboard-sharing')) return { data: { sharesLeaderboard: true } };
      if (url.includes('/stats/leaderboard')) {
        return {
          data: {
            topStudents: [
              { rank: 1, studentName: 'الأول', avatarUrl: null, questionsAnswered: 500, accuracy: 90, isYou: false },
              { rank: 2, studentName: 'الطالب التجريبي', avatarUrl: null, questionsAnswered: 400, accuracy: 85, isYou: true },
              { rank: 3, studentName: 'الثالث', avatarUrl: null, questionsAnswered: 300, accuracy: 80, isYou: false },
              { rank: 4, studentName: 'الرابع', avatarUrl: null, questionsAnswered: 200, accuracy: 70, isYou: false },
            ],
            yourRank: null,
          },
        };
      }
      if (url.includes('/subjects/my-subjects')) return { data: [] };
      return { data: [] };
    });

    withProviders(<LeaderboardPage />, '/leaderboard?subjectId=s1');

    expect(await screen.findByTestId('podium-is-you')).toHaveTextContent('(أنت)');
  });

  it('keeps the leaderboard free of physical mr-1 margins (RTL logical-property ruling)', () => {
    const source = readFileSync(resolve(here, '../features/stats/pages/LeaderboardPage.tsx'), 'utf-8');
    expect(source).not.toMatch(/\bmr-1\b/);
  });
});

// ============ D-40 — MuwadiTab empty state link CTA ============

describe('W19.4 (D-40) — MuwadiTab empty state is a link, not a dead end', () => {
  it('offers a «تصفح الهيكل الأكاديمي» link to /subjects (the structure tab)', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: [] };
      return { data: [] };
    });

    withProviders(<MuwadiTab />);

    const empty = await screen.findByTestId('muwadi-empty');
    const cta = screen.getByTestId('muwadi-empty-cta');
    expect(cta).toHaveAttribute('href', '/subjects');
    expect(cta).toHaveTextContent('تصفح الهيكل الأكاديمي لتفعيل مادة');
    expect(empty).toBeInTheDocument();
  });
});
