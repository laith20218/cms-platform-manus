import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 20.1 — Study hub: subject-context strips BELOW the tab row (owner
 * decision 6) + the shared calmer LectureCard for both lecture-list surfaces.
 *
 * Locks:
 *  1. DOM order on every tab: the tab row FIRST, then the subject-context
 *     strip (scope bar / bank chip / progress hint), then the active panel.
 *  2. Progress keeps its honesty hint and bank keeps its chip (no scope bar
 *     on either) — both now rendered under the tabs, not above.
 *  3. The ONE shared LectureCard navigates from BOTH surfaces (/study
 *     «المحتوى» and /subjects/:slug) and keeps counts/progress/completed
 *     information (no information loss from the polish).
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
import SubjectDetailPage from '@/features/subjects/SubjectDetailPage';

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
    // SubjectDetailPage resolves the slug via the same /subjects/{slug} path.
    if (url === '/subjects/تشريح-مرضي') return { data: SUBJECT_S1 };
    return { data: [] };
  });
}

function renderApp(initialEntry: string, withSubjectRoute = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/study" element={<StudyPage />} />
          {withSubjectRoute && <Route path="/subjects/:subjectSlug" element={<SubjectDetailPage />} />}
          <Route path="*" element={<span data-testid="not-found-probe" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** `a` renders BEFORE `b` in the DOM. */
function expectBefore(a: Element, b: Element) {
  expect(
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
    'expected node to render after the tab row',
  ).toBeTruthy();
}

describe('W20.1 — subject-context strips render BELOW the tab row', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    stubGet();
  });

  it('content tab: tab row → scope bar → panel (owner decision 6)', async () => {
    renderApp('/study?tab=content');

    const bar = await screen.findByTestId('study-scope-bar');
    const tabRow = screen.getByRole('tablist', { name: 'أقسام دراستي' });
    const panel = await screen.findByTestId('study-panel-content');

    expectBefore(tabRow, bar);
    expectBefore(bar, panel);
  });

  it('library tab: scope bar under the tab row', async () => {
    renderApp('/study?tab=library');

    const bar = await screen.findByTestId('study-scope-bar');
    const tabRow = screen.getByRole('tablist', { name: 'أقسام دراستي' });
    const panel = await screen.findByTestId('study-panel-library');

    expectBefore(tabRow, bar);
    expectBefore(bar, panel);
  });

  it('bank tab: the hub chip sits under the tab row (cascade unchanged, no scope bar)', async () => {
    renderApp('/study?tab=bank&subjectId=s1');

    const chip = await screen.findByTestId('study-subject-filter-chip');
    const tabRow = screen.getByRole('tablist', { name: 'أقسام دراستي' });
    const panel = await screen.findByTestId('study-panel-bank');

    expectBefore(tabRow, chip);
    expectBefore(chip, panel);
    expect(screen.queryByTestId('study-scope-bar')).toBeNull();
    expect(screen.getByTestId('study-subject-filter-name').textContent).toContain('تشريح مرضي');
  });

  it('progress tab: the honesty hint sits under the tab row (no false subject chrome)', async () => {
    renderApp('/study?tab=progress&subjectId=s1');

    const hint = await screen.findByTestId('study-progress-scope-hint');
    const tabRow = screen.getByRole('tablist', { name: 'أقسام دراستي' });

    expectBefore(tabRow, hint);
    expect(screen.queryByTestId('study-scope-bar')).toBeNull();
  });
});

describe('W20.1 — the shared LectureCard (calm polish, no information loss)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    stubGet();
  });

  it('study content tab: card navigates and keeps counts, progress and completed', async () => {
    renderApp('/study?tab=content&subjectId=s1');

    const card1 = await screen.findByTestId('content-lecture-card-lec1');
    expect(card1.getAttribute('href')).toBe('/subjects/تشريح-مرضي/lectures/lec1');
    expect(card1.textContent).toContain('محاضرة القلب');
    expect(card1.textContent).toContain('سؤال');
    expect(card1.textContent).toContain('40');
    expect(card1.textContent).toContain('60%');

    const card2 = screen.getByTestId('content-lecture-card-lec2');
    expect(card2.getAttribute('href')).toBe('/subjects/تشريح-مرضي/lectures/lec2');
    expect(card2.textContent).toContain('مكتملة');
  });

  it('subject detail page: the SAME shared card navigates (one anatomy, both surfaces)', async () => {
    renderApp('/subjects/تشريح-مرضي', true);

    const card1 = await screen.findByTestId('subject-lecture-card-lec1');
    expect(card1.getAttribute('href')).toBe('/subjects/تشريح-مرضي/lectures/lec1');
    expect(card1.textContent).toContain('محاضرة القلب');
    expect(card1.textContent).toContain('60%');
    expect(screen.getByTestId('subject-lecture-card-lec2').textContent).toContain('مكتملة');
  });
});
