import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) — mirrors wave15.4.1.test.tsx, plus `put`
//      for PUT /profile/leaderboard-sharing ----
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
  useAuth: () => ({
    user: { fullName: 'طالب تجريبي', phone: '0999000111' },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
  }),
}));

import LeaderboardPage from '@/features/stats/pages/LeaderboardPage';
import SettingsPage from '@/features/settings/SettingsPage';
import { ThemeProvider } from '@/app/providers/ThemeProvider';

// jsdom lacks matchMedia — ThemeProvider (the SettingsPage D-08 harness) probes the color scheme.
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

// ---- fixtures ----
const MY_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
  { id: 's2', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['QuestionsExams', 'VideoAudio'] },
];

const LEADERBOARD = {
  topStudents: [
    { rank: 1, studentName: 'الطالب الأول', avatarUrl: null, questionsAnswered: 10, accuracy: 90, isYou: false },
    { rank: 2, studentName: 'الطالب الثاني', avatarUrl: null, questionsAnswered: 9, accuracy: 85, isYou: false },
    { rank: 3, studentName: 'الطالب الثالث', avatarUrl: null, questionsAnswered: 8, accuracy: 80, isYou: false },
    { rank: 4, studentName: 'أحمد', avatarUrl: null, questionsAnswered: 5, accuracy: 80, isYou: false },
  ],
  yourRank: null,
};

// ---- per-test mock state ----
const mockConfig = {
  /** What GET /profile/leaderboard-sharing currently reports. */
  sharing: false,
  /** What the server reports once a PUT has been accepted. */
  sharingAfterPut: true,
};

function stubGet() {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/profile/leaderboard-sharing')) return { data: { sharesLeaderboard: mockConfig.sharing } };
    if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
    if (url.includes('/stats/leaderboard')) return { data: LEADERBOARD };
    if (url.includes('/library/subject/')) return { data: { items: [] } };
    if (url.includes('/exams/by-subject/')) return { data: [] };
    return { data: [] };
  });
}

function stubPut() {
  putMock.mockImplementation(async (url: string, body: unknown) => {
    if (url.includes('/profile/leaderboard-sharing')) {
      mockConfig.sharing = mockConfig.sharingAfterPut;
      return { data: body };
    }
    return { data: {} };
  });
}

/** Mirrors the URL inside MemoryRouter so tests can assert on search params. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.search}</div>;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          {/* W16.1a — the leaderboard is the standalone /leaderboard page
              (was: the /study?tab=leaderboard hub tab until the redirect). */}
          <Route path="/leaderboard" element={<><LeaderboardPage /><LocationProbe /></>} />
          <Route path="/settings" element={<ThemeProvider><SettingsPage /></ThemeProvider>} />
          <Route path="*" element={<div data-testid="route-fallback" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  postMock.mockReset();
  mockConfig.sharing = false;
  mockConfig.sharingAfterPut = true;
  stubGet();
  stubPut();
});

// ================= W15.4.4.0b: leaderboard opt-in + subject picker =================

describe('Leaderboard subject picker + mutual-sharing opt-in (15.4.4.0b)', () => {
  it('/leaderboard (no subjectId) renders Picker', async () => {
    mockConfig.sharing = false;
    renderAt('/leaderboard');

    expect(await screen.findByTestId('leaderboard-subject-picker')).toBeInTheDocument();
    expect(await screen.findByTestId('leaderboard-subject-s1')).toBeInTheDocument();
    expect(screen.getByTestId('leaderboard-subject-s2')).toBeInTheDocument();
  });

  it('Picker → click subject → URL updates + leaderboard renders', async () => {
    mockConfig.sharing = true;
    renderAt('/leaderboard');

    fireEvent.click(await screen.findByTestId('leaderboard-subject-s1'));

    // The pick is a deliberate navigation: ?subjectId=s1 lands in the URL.
    await waitFor(() => {
      expect(screen.getByTestId('location-probe').textContent).toContain('subjectId=s1');
    });
    // Consent already granted → the subject board renders its ranked list.
    expect(await screen.findByRole('heading', { name: 'لوحة المتصدرين' })).toBeInTheDocument();
    expect(await screen.findByText('أحمد')).toBeInTheDocument();
    // The DTO no longer carries studentId — nothing renders it.
    expect(document.body.textContent).not.toContain('studentId');
  });

  it('/leaderboard?subjectId=s1 (not sharing) → opt-in prompt', async () => {
    mockConfig.sharing = false;
    renderAt('/leaderboard?subjectId=s1');

    expect(await screen.findByTestId('leaderboard-optin-prompt')).toBeInTheDocument();
    expect(await screen.findByTestId('leaderboard-sharing-toggle')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'لوحة المتصدرين' })).not.toBeInTheDocument();
  });

  it('Opt-in prompt → toggle on → leaderboard renders', async () => {
    mockConfig.sharing = false;
    renderAt('/leaderboard?subjectId=s1');

    expect(await screen.findByTestId('leaderboard-optin-prompt')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch'));

    // PUT accepted → consent refetch flips true → the query's enabled
    // flag fires it → the board appears without further interaction.
    expect(await screen.findByRole('heading', { name: 'لوحة المتصدرين' })).toBeInTheDocument();
  });

  it('SettingsPage shows sharing toggle with current state', async () => {
    mockConfig.sharing = false;
    renderAt('/settings');

    expect(await screen.findByTestId('leaderboard-sharing-toggle')).toBeInTheDocument();
    // W18.2: the theme toggle is also a role=switch now — target the sharing
    // switch by its testid instead of the ambiguous role query.
    const switchBtn = await screen.findByRole('switch', { name: 'المشاركة في لوحة المتصدرين' });
    await waitFor(() => {
      expect(switchBtn.getAttribute('aria-checked')).toBe('false');
    });
  });

  it('SettingsPage → toggle on → PUT called with true', async () => {
    mockConfig.sharing = false;
    renderAt('/settings');

    // W18.2: the theme toggle is also a role=switch now — target by testid.
    const switchBtn = await screen.findByRole('switch', { name: 'المشاركة في لوحة المتصدرين' });
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(putMock).toHaveBeenCalledWith('/profile/leaderboard-sharing', { sharesLeaderboard: true });
    });
    // After the invalidation → refetch, the switch reflects the new state.
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'المشاركة في لوحة المتصدرين' }).getAttribute('aria-checked')).toBe('true');
    });
  });
});
