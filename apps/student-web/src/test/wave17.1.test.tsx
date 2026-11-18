import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 17.1 — Study hub: the «المحتوى» content tab + the shared subject
 * scope control on the content / library / courses tabs.
 *
 * Locks:
 *  1. Content tab renders the entitled subject's lecture cards (same
 *     LectureSummary data as /subjects/:slug) with the rich counts strip.
 *  2. Content tab without a subject → a pick-subject prompt (points at the
 *     scope bar) — never a blank panel.
 *  3. An unentitled subjectId deep link → the bank's activation-gate pattern.
 *  4. The scope bar renders on content/library/courses and NOT on bank
 *     (bank owns its cascade + chip) or progress (subject-agnostic).
 */

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/features/entitlements/services/entitlement-api', async () => {
  const actual = await vi.importActual<typeof import('@/features/entitlements/services/entitlement-api')>(
    '@/features/entitlements/services/entitlement-api'
  );
  return { ...actual, entitlementRequestConfig: async () => ({}) };
});

import { StudyPage } from '@/features/study/pages/StudyPage';

const MY_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
  { id: 's2', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['VideoAudio'] },
];

const SUBJECT_S1 = {
  id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي',
  totalQuestions: 42, totalLectures: 2, totalFiles: 3, totalExams: 1,
  contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'],
};

const LECTURES_S1 = [
  { id: 'lec1', lectureNumber: 1, titleAr: 'محاضرة القلب', questionsCount: 5, durationMinutes: 40, userProgress: 60, isCompleted: false },
  { id: 'lec2', lectureNumber: 2, titleAr: 'محاضرة الالتهابات', questionsCount: 7, durationMinutes: 55, isCompleted: true },
];

function stubGet() {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
    if (url === '/subjects/s1') return { data: SUBJECT_S1 };
    if (url === '/subjects/s1/lectures') return { data: LECTURES_S1 };
    return { data: [] };
  });
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-probe" data-path={location.pathname} data-search={location.search} />;
}

function renderApp(initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/study" element={<StudyPage />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('W17.1 — study content tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    stubGet();
  });

  it('renders the entitled subject’s lecture cards with counts and links', async () => {
    renderApp('/study?tab=content&subjectId=s1');

    // The subject strip resolves the rich counts (42 سؤال / 2 محاضرة / 3 ملف).
    const strip = await screen.findByTestId('content-subject-strip');
    expect(strip.textContent).toContain('تشريح مرضي');
    await waitFor(() => expect(strip.textContent).toContain('42'));

    // Both lecture cards render and deep link into the lecture page.
    const card1 = await screen.findByTestId('content-lecture-card-lec1');
    expect(card1.getAttribute('href')).toBe('/subjects/تشريح-مرضي/lectures/lec1');
    expect(card1.textContent).toContain('محاضرة القلب');
    expect(screen.getByTestId('content-lecture-card-lec2').textContent).toContain('مكتملة');
  });

  it('prompts to pick a subject when none is selected (no dead panel)', async () => {
    renderApp('/study?tab=content');

    expect(await screen.findByTestId('content-pick-subject')).toBeInTheDocument();
    expect(screen.getByTestId('content-pick-subject').textContent).toContain('اختر مادتك');
    // The scope bar sits above the prompt and carries the choice.
    expect(screen.getByTestId('study-scope-bar')).toBeInTheDocument();
    // The content scope bar has NO «كل موادي» option (content is per-subject).
    fireEvent.click(screen.getByTestId('study-scope-select'));
    expect(await screen.findByTestId('study-scope-option-s1')).toBeInTheDocument();
    expect(screen.queryByTestId('study-scope-option-all')).toBeNull();
  });

  it('gates an unentitled subject with the activation card (bank pattern)', async () => {
    renderApp('/study?tab=content&subjectId=s9');

    expect(await screen.findByTestId('content-subject-locked')).toBeInTheDocument();
    expect(screen.getByText('هذه المادة غير مفعلة')).toBeInTheDocument();
    expect(screen.getByTestId('activate-code-cta').getAttribute('href')).toBe('/activate-code');
  });

  it('gates an entitled subject whose grant lacks LecturesText', async () => {
    renderApp('/study?tab=content&subjectId=s2');

    expect(await screen.findByTestId('content-scope-locked')).toBeInTheDocument();
    expect(screen.getByText('محتوى المحاضرات غير مشمول باشتراكك')).toBeInTheDocument();
  });
});

describe('W17.1 — subject scope bar placement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    stubGet();
  });

  it('renders on the library tab and switching scope rewrites ?subjectId=', async () => {
    renderApp('/study?tab=library');

    const bar = await screen.findByTestId('study-scope-bar');
    expect(bar).toBeInTheDocument();
    expect(screen.getByTestId('study-scope-value').textContent).toContain('كل موادي');

    // Pick الباطنة (s2) — the URL gains subjectId=s2, tab preserved.
    fireEvent.click(screen.getByTestId('study-scope-select'));
    const option = await screen.findByTestId('study-scope-option-s2');
    fireEvent.pointerUp(option);
    fireEvent.click(option);

    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe.getAttribute('data-search')).toBe('?tab=library&subjectId=s2');
    });
  });

  it('does not render on the bank or progress tabs (bank owns its cascade)', async () => {
    const { unmount } = renderApp('/study?tab=bank');
    await screen.findByTestId('study-panel-bank');
    expect(screen.queryByTestId('study-scope-bar')).toBeNull();
    unmount();

    renderApp('/study');
    await screen.findByTestId('study-panel-progress');
    expect(screen.queryByTestId('study-scope-bar')).toBeNull();
  });
});
