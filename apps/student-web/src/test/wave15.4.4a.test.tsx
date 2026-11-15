import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) — mirrors my-studies.test.tsx / wave15.4.2.test.tsx ----
const { getMock, postMock, playMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  playMock: vi.fn(),
}));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

vi.mock('@/features/entitlements/services/entitlement-api', () => ({
  entitlementRequestConfig: async () => ({}),
}));

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

vi.mock('@/features/security/useContentProtection', () => ({
  useContentProtection: () => { /* jsdom: protection listeners disabled in tests */ },
}));

// Redirect suite: neutralize the auth guard + shell so AppRoutes renders the pages.
vi.mock('@/components/common/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/layouts/AppShell', () => ({
  AppShell: () => <Outlet />,
}));

import { AppRoutes } from '@/app/router';
import type { CourseDetail } from '@/features/my-studies/services/courses-api';

// ---- jsdom HTMLMediaElement shims (course player video) ----
let mediaTime = 0;
let mediaPaused = true;
beforeAll(() => {
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    configurable: true, value: playMock.mockResolvedValue(undefined),
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
    configurable: true, value: vi.fn(),
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, 'currentTime', {
    configurable: true, get: () => mediaTime, set: (v: number) => { mediaTime = v; },
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, 'paused', {
    configurable: true, get: () => mediaPaused, set: (v: boolean) => { mediaPaused = v; },
  });
});

// ---- fixtures ----
const SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
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
  bySubject: [],
  byDifficulty: {
    easy: { answered: 40, accuracy: 85 },
    medium: { answered: 50, accuracy: 72 },
    hard: { answered: 30, accuracy: 60 },
  },
};

const COURSE_DETAIL: CourseDetail = {
  id: 'c1', subjectId: 's1', title: 'كورس التشريح', description: null,
  coverImageUrl: null, status: 'Published', episodesCount: 1,
  createdAt: '2026-11-15T00:00:00Z',
  episodes: [
    { id: 'ep1', courseId: 'c1', title: 'الحلقة الأولى', episodeNumber: 1, durationSeconds: 1800, sourceType: 'Upload', fileSize: 104857600, contentType: 'video/mp4', youtubeVideoId: null, uploadCompleted: true, viewsCount: 5 },
  ],
};

function stubGet() {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: SUBJECTS };
    if (url.includes('/courses/c1')) return { data: COURSE_DETAIL };
    if (url.includes('/stats/me')) return { data: STATS };
    if (url.includes('/stats/leaderboard')) return { data: { topStudents: [], yourRank: null } };
    if (url.includes('/library/subject/')) return { data: { items: [] } };
    if (url.includes('/exams/by-subject/')) return { data: [] };
    return { data: [] };
  });
}

function stubPost() {
  postMock.mockImplementation(async (url: string) => {
    if (typeof url === 'string' && url.includes('/playback-url')) {
      return {
        data: {
          url: 'https://r2.example.com/video?sig=1',
          ttlSeconds: 540,
          expiresAt: '2026-11-15T01:00:00Z',
          contentType: 'video/mp4',
          supportsRange: true,
        },
      };
    }
    return {
      data: {
        accessUrl: 'https://r2.example.com/audio?sig=1',
        expiresAt: '2026-11-15T01:00:00Z',
        watermark: { studentName: 'طالب تجريبي', studentPhone: '0999000111', timestamp: '2026-11-15', siteName: 'CMS' },
      },
    };
  });
}

/** Renders the REAL AppRoutes at the given URL plus a location probe. */
function renderApp(initialEntry: string) {
  const LocationProbe = () => {
    const location = useLocation();
    return <div data-testid="location-probe" data-path={location.pathname} data-search={location.search} />;
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mediaTime = 0;
  mediaPaused = true;
  stubGet();
  stubPost();
});

// ================= W15.4.4a: /my-studies cutover to /study =================

describe('W15.4.4a — /my-studies cutover redirects', () => {
  it('redirects bare /my-studies to /study (overview)', async () => {
    renderApp('/my-studies');

    expect(await screen.findByTestId('study-page')).toBeInTheDocument();
    const probe = screen.getByTestId('location-probe');
    expect(probe.getAttribute('data-path')).toBe('/study');
    expect(probe.getAttribute('data-search')).toBe('');
  });

  it('redirects /my-studies?tab=library to /study?tab=library', async () => {
    renderApp('/my-studies?tab=library');

    expect(await screen.findByTestId('study-panel-library')).toBeInTheDocument();
    const probe = screen.getByTestId('location-probe');
    expect(probe.getAttribute('data-path')).toBe('/study');
    expect(probe.getAttribute('data-search')).toBe('?tab=library');
  });

  it('redirects /my-studies?tab=practice to /study?tab=exams&subtab=practice', async () => {
    renderApp('/my-studies?tab=practice');

    // The exams tab (15.4.1) hosts the practice sub-tab (15.4.3).
    expect(await screen.findByTestId('study-exams-panel-practice')).toBeInTheDocument();
    const probe = screen.getByTestId('location-probe');
    expect(probe.getAttribute('data-path')).toBe('/study');
    expect(probe.getAttribute('data-search')).toBe('?tab=exams&subtab=practice');
  });

  it('redirects /my-studies?tab=exam-courses to /exam-courses', async () => {
    renderApp('/my-studies?tab=exam-courses');

    // The storefront standalone page (15.4.2) takes over the old hub tab.
    expect(await screen.findByTestId('exam-courses-page')).toBeInTheDocument();
    const probe = screen.getByTestId('location-probe');
    expect(probe.getAttribute('data-path')).toBe('/exam-courses');
  });

  it('redirects bare /practice to /study?tab=exams&subtab=practice (15.4.4a route)', async () => {
    renderApp('/practice');

    expect(await screen.findByTestId('study-exams-panel-practice')).toBeInTheDocument();
    const probe = screen.getByTestId('location-probe');
    expect(probe.getAttribute('data-path')).toBe('/study');
    expect(probe.getAttribute('data-search')).toBe('?tab=exams&subtab=practice');
  });
});

// ================= W15.4.4a: the player route is untouched =================

describe('W15.4.4a — /my-studies/courses/:courseId keeps rendering CoursePlayerPage', () => {
  it('still renders the course player at the legacy deep link', async () => {
    renderApp('/my-studies/courses/c1');

    expect(await screen.findByTestId('course-episode-player')).toBeInTheDocument();
    const video = await screen.findByTestId('video-element') as HTMLVideoElement;
    await waitFor(() => expect(video.getAttribute('src')).toBe('https://r2.example.com/video?sig=1'));
  });
});
