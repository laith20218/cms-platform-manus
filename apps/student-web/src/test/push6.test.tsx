import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) ----
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

import MyStudiesPage from '@/features/my-studies/pages/MyStudiesPage';
import SubjectsPage from '@/features/subjects/SubjectsPage';

// ---- fixtures ----
const ENTITLED_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
  { id: 's2', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['QuestionsExams'] },
];

const LECTURES_S1 = [
  { id: 'lec1', lectureNumber: 1, titleAr: 'محاضرة الالتهابات', questionsCount: 50, isCompleted: false, userProgress: 40 },
  { id: 'lec2', lectureNumber: 2, titleAr: 'محاضرة بدون أسئلة', questionsCount: 0, isCompleted: false },
];
const LECTURES_S2 = [
  { id: 'lec3', lectureNumber: 1, titleAr: 'محاضرة القلب', questionsCount: 12, isCompleted: true },
];

const COURSES_S1 = [
  { id: 'c1', subjectId: 's1', subjectNameAr: 'تشريح مرضي', title: 'كورس التشريح', description: null, coverImageUrl: null, episodesCount: 3, totalDurationSeconds: 600, totalViewsCount: 9 },
];
const COURSES_S2 = [
  { id: 'c2', subjectId: 's2', subjectNameAr: 'الباطنة', title: 'كورس الباطنة', description: null, coverImageUrl: null, episodesCount: 1, totalDurationSeconds: 120, totalViewsCount: 2 },
];

function stubGet(opts?: { mySubjects?: unknown[] }) {
  const mySubjects = opts?.mySubjects ?? ENTITLED_SUBJECTS;
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: mySubjects };
    if (url.includes('/subjects/s2/lectures')) return { data: LECTURES_S2 };
    if (url.includes('/subjects/')) return { data: LECTURES_S1 }; // /subjects/{id}/lectures
    if (url.includes('/courses/subject/s2')) return { data: COURSES_S2 };
    if (url.includes('/courses/subject/')) return { data: COURSES_S1 };
    if (url === '/universities' || url.startsWith('/universities?')) {
      return { data: { items: [{ id: 'u1', nameAr: 'جامعة حمص', collegesCount: 1 }] } };
    }
    if (url.endsWith('/colleges')) return { data: [{ id: 'c1', nameAr: 'كلية الطب البشري', yearsCount: 1 }] };
    if (url.endsWith('/years')) return { data: [{ id: 'y1', nameAr: 'السنة الخامسة', semestersCount: 1 }] };
    if (url.endsWith('/semesters')) return { data: [{ id: 'sem1', nameAr: 'الفصل الأول', subjectsCount: 1 }] };
    if (url.endsWith('/subjects')) {
      return { data: [
        { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', totalQuestions: 62, totalLectures: 2, totalFiles: 4, contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
        { id: 's9', slug: 'جراحة', nameAr: 'الجراحة', totalQuestions: 5, totalLectures: 1, totalFiles: 0, contentScopes: null },
      ] };
    }
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

/** Renders /my-studies and /subjects plus a probe that exposes the current location. */
function renderApp(initialEntry: string) {
  const LocationProbe = () => {
    const location = useLocation();
    return <div data-testid="location-probe" data-path={location.pathname} data-search={location.search} />;
  };
  return renderWithProviders(
    [initialEntry],
    <Routes>
      <Route path="/my-studies" element={<><MyStudiesPage /><LocationProbe /></>} />
      <Route path="/subjects" element={<><SubjectsPage /><LocationProbe /></>} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>
  );
}

async function walkCascade() {
  fireEvent.click(await screen.findByText('جامعة حمص'));
  fireEvent.click(await screen.findByText('كلية الطب البشري'));
  fireEvent.click(await screen.findByTestId('year-tab'));
  fireEvent.click(await screen.findByTestId('semester-chip'));
}

beforeEach(() => {
  vi.clearAllMocks();
  postMock.mockReset();
  stubGet();
});

// ================= Push 6 Task 2: the الدورات (practice) tab =================

describe('My Studies — الدورات practice tab', () => {
  it('renders the fourth tab الدورات alongside the other three', () => {
    renderWithProviders(['/my-studies'], <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>);
    expect(screen.getByTestId('tab-practice')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /الدورات/ })).toBeInTheDocument();
    expect(screen.getByTestId('tab-exams')).toBeInTheDocument();
    expect(screen.getByTestId('tab-library')).toBeInTheDocument();
    expect(screen.getByTestId('tab-courses')).toBeInTheDocument();
  });

  it('lists only lectures that carry questions, with counts and practice links', async () => {
    renderApp('/my-studies?tab=practice');

    const grid = await screen.findByTestId('practice-grid');
    // lec2 (0 questions) is filtered out; lec1 + lec3 remain.
    expect(screen.getByText('محاضرة الالتهابات')).toBeInTheDocument();
    expect(screen.getByText('محاضرة القلب')).toBeInTheDocument();
    expect(screen.queryByText('محاضرة بدون أسئلة')).not.toBeInTheDocument();
    expect(grid.textContent).toContain('50 سؤال');
    expect(screen.getByText('62 سؤال').textContent || '62 سؤال').toBeTruthy(); // summary chip
    const card = screen.getByText('محاضرة الالتهابات').closest('a');
    expect(card?.getAttribute('href')).toBe('/subjects/تشريح-مرضي/lectures/lec1/questions');
  });

  it('shows the locked state on the practice tab when the student has no active subjects', async () => {
    stubGet({ mySubjects: [] });
    renderApp('/my-studies?tab=practice');
    expect(await screen.findByTestId('locked-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('activate-code-cta')).toBeInTheDocument();
  });

  it('shows the scope-specific lock when no grant covers questions', async () => {
    stubGet({ mySubjects: [{ id: 's2', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['VideoAudio'] }] });
    renderApp('/my-studies?tab=practice');
    expect(await screen.findByText('الدورات غير مشمولة باشتراكك')).toBeInTheDocument();
  });
});

// ================= Push 6 Task 3b: subjectId filtering in My Studies =================

describe('My Studies — subjectId query-param filtering', () => {
  it('shows the subject filter chip and narrows the courses tab to that subject', async () => {
    renderApp('/my-studies?subjectId=s1&tab=courses');

    // The chip resolves the subject's name once my-subjects loads.
    await waitFor(() => {
      expect(screen.getByTestId('subject-filter-name').textContent).toBe('تشريح مرضي');
    });
    const chip = screen.getByTestId('subject-filter-chip');
    expect(chip.textContent).toContain('تشريح مرضي');
    // Only s1's course is listed.
    expect(await screen.findByText('كورس التشريح')).toBeInTheDocument();
    expect(screen.queryByText('كورس الباطنة')).not.toBeInTheDocument();
    expect(getMock.mock.calls.some(([url]) => String(url).includes('/courses/subject/s2'))).toBe(false);
  });

  it('clearing the filter drops the subjectId param', async () => {
    renderApp('/my-studies?subjectId=s1&tab=courses');

    await screen.findByText('كورس التشريح');
    fireEvent.click(screen.getByTestId('subject-filter-clear'));

    await waitFor(() => {
      expect(screen.queryByTestId('subject-filter-chip')).not.toBeInTheDocument();
    });
    const probe = screen.getByTestId('location-probe');
    expect(probe.getAttribute('data-search')).toBe('?tab=courses');
    // Both subjects' courses return after clearing.
    expect(await screen.findByText('كورس الباطنة')).toBeInTheDocument();
  });

  it('switching tabs preserves the subject filter', async () => {
    renderApp('/my-studies?subjectId=s1&tab=courses');

    await screen.findByText('كورس التشريح');
    fireEvent.click(screen.getByTestId('tab-practice'));

    expect(await screen.findByTestId('practice-grid')).toBeInTheDocument();
    expect(screen.getByTestId('location-probe').getAttribute('data-search')).toBe('?tab=practice&subjectId=s1');
    // Practice is narrowed to s1 only (محاضرة القلب belongs to s2).
    expect(screen.getByText('محاضرة الالتهابات')).toBeInTheDocument();
    expect(screen.queryByText('محاضرة القلب')).not.toBeInTheDocument();
  });

  it('a stale subjectId deep link shows an access state instead of the global lock', async () => {
    renderApp('/my-studies?subjectId=unknown&tab=courses');
    expect(await screen.findByTestId('courses-subject-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('locked-empty-state')).not.toBeInTheDocument();
  });
});

// ================= Push 6 Task 3a: subject card click flow =================

describe('SubjectsPage — card click flow (modal vs redirect)', () => {
  it('routes an entitled subject card into the filtered My Studies hub', async () => {
    renderApp('/subjects');
    await walkCascade();

    // s1 is entitled (QuestionsExams) → tab=exams deep link.
    fireEvent.click((await screen.findAllByTestId('subject-card-open'))[0]);

    await waitFor(() => {
      expect(screen.getByTestId('location-probe').getAttribute('data-path')).toBe('/my-studies');
    });
    expect(screen.getByTestId('location-probe').getAttribute('data-search')).toBe('?subjectId=s1&tab=exams');
    expect(await screen.findByTestId('panel-exams')).toBeInTheDocument();
  });

  it('opens the activation modal over the page for an unentitled subject (no navigation)', async () => {
    renderApp('/subjects');
    await walkCascade();

    // Second card (s9 الجراحة) is not entitled.
    const cards = await screen.findAllByTestId('subject-card-open');
    fireEvent.click(cards[1]);

    const modal = await screen.findByTestId('activation-modal');
    expect(modal).toBeInTheDocument();
    expect(modal.textContent).toContain('الجراحة');
    expect(screen.getByTestId('subject-card-locked-badge')).toBeInTheDocument();
    // Still on the subjects page.
    expect(screen.getByTestId('location-probe').getAttribute('data-path')).toBe('/subjects');
  });

  it('redeems a code from the modal and routes into My Studies', async () => {
    postMock.mockResolvedValue({ data: { ok: true } });
    renderApp('/subjects');
    await walkCascade();

    const cards = await screen.findAllByTestId('subject-card-open');
    fireEvent.click(cards[1]);

    const input = await screen.findByTestId('activation-code-input');
    fireEvent.change(input, { target: { value: 'ABCD1234EFGH5678' } });
    expect((input as HTMLInputElement).value).toBe('ABCD-1234-EFGH-5678');

    fireEvent.click(screen.getByTestId('activation-modal-submit'));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/subscriptions/redeem', { code: 'ABCD-1234-EFGH-5678' });
    });
    expect(await screen.findByText(/تم التفعيل/)).toBeInTheDocument();
  });

  it('shows a redeem failure inline inside the modal', async () => {
    postMock.mockRejectedValue({
      response: { status: 400, data: { detail: 'الكود مستخدم مسبقاً' } },
      isAxiosError: true,
    });
    renderApp('/subjects');
    await walkCascade();

    const cards = await screen.findAllByTestId('subject-card-open');
    fireEvent.click(cards[1]);

    const input = await screen.findByTestId('activation-code-input');
    fireEvent.change(input, { target: { value: 'ABCD1234EFGH5678' } });
    fireEvent.click(screen.getByTestId('activation-modal-submit'));

    expect(await screen.findByTestId('activation-modal-error')).toBeInTheDocument();
    expect(screen.getByText('الكود مستخدم مسبقاً')).toBeInTheDocument();
  });

  it('quick actions deep-link into the filtered hub', async () => {
    renderApp('/subjects');
    await walkCascade();

    const examsLink = await screen.findByTestId('quick-action-exams');
    expect(examsLink.getAttribute('href')).toBe('/my-studies?subjectId=s1&tab=exams');
    const libraryLink = screen.getByTestId('quick-action-library');
    expect(libraryLink.getAttribute('href')).toBe('/my-studies?subjectId=s1&tab=library');
  });
});
