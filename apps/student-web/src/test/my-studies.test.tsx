import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) ----
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

// Redirect suite: neutralize the auth guard + shell so AppRoutes renders the hub.
vi.mock('@/components/common/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/layouts/AppShell', () => ({
  AppShell: () => <Outlet />,
}));

import MyStudiesPage from '@/features/my-studies/pages/MyStudiesPage';
import CoursePlayerPage from '@/features/my-studies/pages/CoursePlayerPage';
import { AppRoutes } from '@/app/router';
import type { CourseDetail } from '@/features/my-studies/services/courses-api';

// ---- jsdom HTMLMediaElement shims ----
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
const SUBJECTS = [{ id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي' }];

const COURSE_LIST = [{
  id: 'c1', subjectId: 's1', subjectNameAr: 'تشريح مرضي', title: 'كورس التشريح',
  description: 'وصف تجريبي', coverImageUrl: null, episodesCount: 2,
  totalDurationSeconds: 3600, totalViewsCount: 12,
}];

function courseDetail(): CourseDetail {
  return {
    id: 'c1', subjectId: 's1', title: 'كورس التشريح', description: null,
    coverImageUrl: null, status: 'Published', episodesCount: 2,
    createdAt: '2026-10-24T12:00:00Z',
    episodes: [
      { id: 'ep1', courseId: 'c1', title: 'الحلقة الأولى', episodeNumber: 1, durationSeconds: 1800, sourceType: 'Upload', fileSize: 104857600, contentType: 'video/mp4', youtubeVideoId: null, uploadCompleted: true, viewsCount: 5 },
      { id: 'ep2', courseId: 'c1', title: 'الحلقة الصوتية', episodeNumber: 2, durationSeconds: 900, sourceType: 'Upload', fileSize: 52428800, contentType: 'audio/mpeg', youtubeVideoId: null, uploadCompleted: true, viewsCount: 2 },
    ],
  };
}

function youtubeCourse(): CourseDetail {
  return {
    ...courseDetail(),
    episodes: [{
      id: 'epy', courseId: 'c1', title: 'حلقة يوتيوب', episodeNumber: 1,
      durationSeconds: null, sourceType: 'YouTube', fileSize: null,
      contentType: null, youtubeVideoId: 'abc123', uploadCompleted: true, viewsCount: 9,
    }],
  };
}

const access = (url: string) => ({
  accessUrl: url,
  expiresAt: '2026-10-24T13:00:00Z',
  watermark: { studentName: 'طالب تجريبي', studentPhone: '0999000111', timestamp: '2026-10-24', siteName: 'CMS' },
});

/** GET router: my-subjects / per-subject courses / course detail. */
function stubGet(detail: CourseDetail = courseDetail()) {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: SUBJECTS };
    if (url.includes('/courses/subject/')) return { data: COURSE_LIST };
    if (url.includes('/courses/')) return { data: detail };
    return { data: [] };
  });
}

function renderWithProviders(initialEntries: string[], element: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{element}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mediaTime = 0;
  mediaPaused = true;
  stubGet();
  postMock.mockReset();
});

// ================= MyStudiesPage: tabs =================

describe('MyStudiesPage — tabs', () => {
  it('renders the three study tabs (courses / exams / library)', () => {
    renderWithProviders(['/my-studies'], <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>);
    expect(screen.getByRole('tab', { name: /الكورسات/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /الاختبارات/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /المكتبة/ })).toBeInTheDocument();
  });

  it('defaults to the courses tab', () => {
    renderWithProviders(['/my-studies'], <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>);
    expect(screen.getByTestId('tab-courses').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('panel-courses')).toBeInTheDocument();
  });

  it('switches to the exams tab on click', () => {
    renderWithProviders(['/my-studies'], <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>);
    fireEvent.click(screen.getByTestId('tab-exams'));
    expect(screen.getByTestId('panel-exams')).toBeInTheDocument();
    expect(screen.getByTestId('tab-exams').getAttribute('aria-selected')).toBe('true');
  });

  it('switches to the library tab on click', () => {
    renderWithProviders(['/my-studies'], <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>);
    fireEvent.click(screen.getByTestId('tab-library'));
    expect(screen.getByTestId('panel-library')).toBeInTheDocument();
  });

  it('honours ?tab=library on direct entry', () => {
    renderWithProviders(['/my-studies?tab=library'], <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>);
    expect(screen.getByTestId('panel-library')).toBeInTheDocument();
  });
});

// ================= Legacy redirects =================

describe('Legacy redirects into the My Studies hub', () => {
  it('redirects /exams to /my-studies?tab=exams', async () => {
    renderWithProviders(['/exams'], <AppRoutes />);
    expect(await screen.findByTestId('panel-exams')).toBeInTheDocument();
    expect(screen.getByTestId('tab-exams').getAttribute('aria-selected')).toBe('true');
  });

  it('redirects /library to /my-studies?tab=library', async () => {
    renderWithProviders(['/library'], <AppRoutes />);
    expect(await screen.findByTestId('panel-library')).toBeInTheDocument();
    expect(screen.getByTestId('tab-library').getAttribute('aria-selected')).toBe('true');
  });
});

// ================= Courses catalog =================

describe('CoursesCatalog', () => {
  it('shows the student\'s courses with a link to the player', async () => {
    renderWithProviders(['/my-studies'], <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>);
    const card = await screen.findByText('كورس التشريح');
    expect(card).toBeInTheDocument();
    const link = card.closest('a');
    expect(link?.getAttribute('href')).toBe('/my-studies/courses/c1');
    expect(screen.getByText('تشريح مرضي')).toBeInTheDocument();
    expect(screen.getByText(/2 حلقة/)).toBeInTheDocument();
  });

  it('shows the empty state when no courses are available', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: SUBJECTS };
      if (url.includes('/courses/subject/')) return { data: [] };
      return { data: [] };
    });
    renderWithProviders(['/my-studies'], <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>);
    expect(await screen.findByTestId('courses-empty')).toBeInTheDocument();
  });
});

// ================= Course player =================

function renderPlayer(entry: string) {
  return renderWithProviders(
    [entry],
    <Routes><Route path="/my-studies/courses/:courseId" element={<CoursePlayerPage />} /></Routes>
  );
}

/**
 * jsdom reports videoWidth === 0 for every <video> — which the Push 7 fallback
 * interprets as "no video track". Tests that exercise the VIDEO path (lease
 * refresh, aspect swap) stub a real track so the fallback stays out of the way.
 */
function stubVideoTrack(el: HTMLVideoElement, width = 1280, height = 720) {
  Object.defineProperty(el, 'videoWidth', { configurable: true, get: () => width });
  Object.defineProperty(el, 'videoHeight', { configurable: true, get: () => height });
}

describe('CoursePlayerPage — rendering', () => {
  it('renders the native video player with the signed URL + watermark + episode list', async () => {
    postMock.mockResolvedValue({ data: access('https://r2.example.com/video?sig=1') });
    renderPlayer('/my-studies/courses/c1');

    const video = await screen.findByTestId('course-video') as HTMLVideoElement;
    await waitFor(() => expect(video.getAttribute('src')).toBe('https://r2.example.com/video?sig=1'));
    expect(video.hasAttribute('controls')).toBe(true);

    const watermark = screen.getByTestId('course-watermark');
    expect(watermark.textContent).toContain('طالب تجريبي');
    expect(watermark.textContent).toContain('0999000111');

    expect(screen.getByTestId('episode-list')).toBeInTheDocument();
    expect(screen.getByText('الحلقة الأولى')).toBeInTheDocument();
    // Push 5: backend lease details are intentionally hidden from the student.
    expect(screen.queryByText(/رابط مؤقت حتى/)).not.toBeInTheDocument();
    expect(screen.queryByText(/التسجيل أو التصوير/)).not.toBeInTheDocument();
  });

  it('renders the elegant custom audio player for audio-only episodes', async () => {
    postMock.mockResolvedValue({ data: access('https://r2.example.com/audio?sig=1') });
    renderPlayer('/my-studies/courses/c1');

    await screen.findByTestId('course-video'); // ep1 is video
    fireEvent.click(screen.getByText('الحلقة الصوتية'));
    const audio = await screen.findByTestId('course-audio') as HTMLAudioElement;
    expect(audio.getAttribute('src')).toBe('https://r2.example.com/audio?sig=1');
    expect(screen.queryByTestId('course-video')).not.toBeInTheDocument();
    // Push 5: the designed stage + custom control bar replace the black box.
    expect(screen.getByTestId('audio-stage')).toBeInTheDocument();
    expect(screen.getByTestId('audio-disc')).toBeInTheDocument();
    expect(screen.getByTestId('audio-controls')).toBeInTheDocument();
    expect(screen.getByTestId('audio-play-button')).toBeInTheDocument();
    expect(screen.getByText('حلقة صوتية')).toBeInTheDocument();
  });

  it('renders the YouTube iframe for YouTube episodes (no refresh loop)', async () => {
    stubGet(youtubeCourse());
    postMock.mockResolvedValue({ data: access('https://www.youtube.com/embed/abc123') });
    renderPlayer('/my-studies/courses/c1?refreshMs=120');

    const iframe = await screen.findByTestId('youtube-player') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('https://www.youtube.com/embed/abc123');
    expect(screen.queryByTestId('course-video')).not.toBeInTheDocument();

    await act(async () => { await new Promise((r) => setTimeout(r, 320)); });
    expect(postMock.mock.calls.length).toBe(1); // no interval for YouTube
  });
});

describe('CoursePlayerPage — the lease trap (auto-refresh)', () => {
  it('refreshes the signed URL on schedule and preserves timestamp + play state', async () => {
    // First access returns URL1, every later refresh returns URL2.
    postMock.mockImplementation(async () => ({ data: access(postMock.mock.calls.length <= 1 ? 'https://r2.example.com/v1?sig=a' : 'https://r2.example.com/v2?sig=b') }));

    renderPlayer('/my-studies/courses/c1?refreshMs=200');
    const video = await screen.findByTestId('course-video') as HTMLVideoElement;
    await waitFor(() => expect(video.getAttribute('src')).toBe('https://r2.example.com/v1?sig=a'));
    expect(postMock.mock.calls.length).toBe(1);

    // Simulate mid-playback state at the moment the refresh fires.
    act(() => {
      video.currentTime = 42;
      mediaPaused = false; // playing
    });

    // The 8-minute mark (shortened to 200ms here) swaps the source.
    await waitFor(() => expect(postMock.mock.calls.length).toBeGreaterThanOrEqual(2), { timeout: 3000 });
    await waitFor(() => expect(video.getAttribute('src')).toBe('https://r2.example.com/v2?sig=b'));

    // Metadata of the new source loads → timestamp + playback resume seamlessly.
    stubVideoTrack(video); // jsdom's videoWidth===0 would otherwise trigger the Push 7 audio fallback
    playMock.mockClear();
    fireEvent(video, new Event('loadedmetadata'));
    expect(video.currentTime).toBe(42);
    expect(playMock).toHaveBeenCalled();
  });

  it('re-fetches access immediately when the media errors (expired lease)', async () => {
    postMock.mockResolvedValue({ data: access('https://r2.example.com/v1?sig=a') });
    renderPlayer('/my-studies/courses/c1');

    const video = await screen.findByTestId('course-video') as HTMLVideoElement;
    await waitFor(() => expect(postMock.mock.calls.length).toBe(1));

    fireEvent.error(video);
    await waitFor(() => expect(postMock.mock.calls.length).toBe(2));
  });
});

// ================= Push 7: video → audio graceful fallback =================
// An episode stored under video/* whose bytes are actually audio-only (the
// mislabeled-MP3 incident) must not dead-end the student: the player detects
// it and swaps to the custom audio stage — per episode, watermark preserved.

describe('CoursePlayerPage — Push 7 video→audio fallback', () => {
  it('falls back to the custom audio stage when metadata has no video track (videoWidth 0)', async () => {
    postMock.mockResolvedValue({ data: access('https://r2.example.com/v1?sig=a') });
    renderPlayer('/my-studies/courses/c1');

    const video = await screen.findByTestId('course-video') as HTMLVideoElement;
    await waitFor(() => expect(video.getAttribute('src')).toBe('https://r2.example.com/v1?sig=a'));

    // Mid-playback when the metadata reveals there is nothing to show.
    act(() => {
      video.currentTime = 30;
      mediaPaused = false;
    });
    fireEvent(video, new Event('loadedmetadata')); // jsdom videoWidth === 0 here

    const audio = await screen.findByTestId('course-audio') as HTMLAudioElement;
    expect(screen.queryByTestId('course-video')).not.toBeInTheDocument();
    expect(audio.getAttribute('src')).toBe('https://r2.example.com/v1?sig=a');
    // The designed audio stage + the watermark survive the swap.
    expect(screen.getByTestId('audio-stage')).toBeInTheDocument();
    expect(screen.getByTestId('audio-play-button')).toBeInTheDocument();
    expect(screen.getByTestId('course-watermark')).toBeInTheDocument();

    // The audio element's metadata loads → timestamp + playback resume seamlessly.
    playMock.mockClear();
    fireEvent(audio, new Event('loadedmetadata'));
    expect(playMock).toHaveBeenCalled();
  });

  it('falls back when the video bytes cannot be decoded (error code 3)', async () => {
    postMock.mockResolvedValue({ data: access('https://r2.example.com/v1?sig=a') });
    renderPlayer('/my-studies/courses/c1');

    const video = await screen.findByTestId('course-video') as HTMLVideoElement;
    await waitFor(() => expect(postMock.mock.calls.length).toBe(1));

    Object.defineProperty(video, 'error', { configurable: true, value: { code: 3 } });
    fireEvent.error(video);

    await screen.findByTestId('audio-stage');
    expect(screen.queryByTestId('course-video')).not.toBeInTheDocument();
  });

  it('falls back when the source is not supported (error code 4)', async () => {
    postMock.mockResolvedValue({ data: access('https://r2.example.com/v1?sig=a') });
    renderPlayer('/my-studies/courses/c1');

    const video = await screen.findByTestId('course-video') as HTMLVideoElement;
    await waitFor(() => expect(postMock.mock.calls.length).toBe(1));

    Object.defineProperty(video, 'error', { configurable: true, value: { code: 4 } });
    fireEvent.error(video);

    await screen.findByTestId('audio-stage');
    expect(screen.queryByTestId('course-video')).not.toBeInTheDocument();
  });

  it('keeps the lease-refetch path for codes 1–2 — no stage swap', async () => {
    postMock.mockResolvedValue({ data: access('https://r2.example.com/v1?sig=a') });
    renderPlayer('/my-studies/courses/c1');

    const video = await screen.findByTestId('course-video') as HTMLVideoElement;
    await waitFor(() => expect(postMock.mock.calls.length).toBe(1));

    // MEDIA_ERR_ABORTED / MEDIA_ERR_NETWORK — likely an expired lease → refetch.
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 1 } });
    fireEvent.error(video);

    await waitFor(() => expect(postMock.mock.calls.length).toBe(2));
    expect(screen.getByTestId('course-video')).toBeInTheDocument();
    expect(screen.queryByTestId('audio-stage')).not.toBeInTheDocument();
  });

  it('resets the fallback per episode — switching back re-mounts the video stage', async () => {
    postMock.mockResolvedValue({ data: access('https://r2.example.com/v1?sig=a') });
    renderPlayer('/my-studies/courses/c1');

    // ep1 (mislabeled video) falls back to audio…
    const video = await screen.findByTestId('course-video') as HTMLVideoElement;
    fireEvent(video, new Event('loadedmetadata')); // videoWidth 0
    await screen.findByTestId('audio-stage');

    // …then ep2 (real audio) plays in the audio stage…
    fireEvent.click(screen.getByText('الحلقة الصوتية'));
    await screen.findByTestId('course-audio');

    // …and returning to ep1 starts fresh in the VIDEO stage (no leak across episodes).
    fireEvent.click(screen.getByText('الحلقة الأولى'));
    const videoAgain = await screen.findByTestId('course-video') as HTMLVideoElement;
    stubVideoTrack(videoAgain);
    fireEvent(videoAgain, new Event('loadedmetadata'));
    expect(screen.getByTestId('course-video')).toBeInTheDocument();
    expect(screen.queryByTestId('audio-stage')).not.toBeInTheDocument();
  });
});
