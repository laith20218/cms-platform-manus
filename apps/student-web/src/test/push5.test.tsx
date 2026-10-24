import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';

// ---- shared mocks (hoisted) ----
const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(async () => ({ data: {} })),
  },
}));

vi.mock('@/features/entitlements/services/entitlement-api', () => ({
  entitlementRequestConfig: async () => ({}),
}));

vi.mock('@/features/security/useContentProtection', () => ({
  useContentProtection: () => { /* jsdom: protection listeners disabled in tests */ },
}));

import MyStudiesPage from '@/features/my-studies/pages/MyStudiesPage';
import SubjectDetailPage from '@/features/subjects/SubjectDetailPage';
import SubjectsPage from '@/features/subjects/SubjectsPage';

// ---- fixtures ----
const ENTITLED_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
];

const LIBRARY_FILES = {
  items: [
    { id: 'f1', type: 'Pdf', title: 'منهاج التشريح الرسمي', fileSize: 1048576, viewsCount: 4, isFavorite: false, category: 'Curriculum', createdAt: '2026-10-20T10:00:00Z' },
    { id: 'f2', type: 'Pdf', title: 'ملخص المحاضرة الثالثة', fileSize: 524288, viewsCount: 2, isFavorite: false, category: 'Summary', createdAt: '2026-10-21T10:00:00Z' },
    { id: 'f3', type: 'Html', title: 'أفكار ذهبية — الالتهابات', fileSize: 20480, viewsCount: 9, isFavorite: false, category: 'GoldenIdeas', createdAt: '2026-10-22T10:00:00Z' },
    { id: 'f4', type: 'Image', title: 'صورة غير مصنّفة', fileSize: 8192, viewsCount: 1, isFavorite: false, category: null, createdAt: '2026-10-23T10:00:00Z' },
  ],
};

function httpError(status: number) {
  const error = new AxiosError('Request failed', String(status));
  error.response = { status, data: {}, statusText: '', headers: {}, config: {} as never };
  return error;
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
});

// ================= Push 5 Task 5: locked states across My Studies =================

describe('My Studies — entitlement visual connection', () => {
  it('shows the locked state with activation CTA on the library tab when the student has no active subjects', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: [] };
      return { data: [] };
    });
    renderWithProviders(['/my-studies?tab=library'], <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>);

    const locked = await screen.findByTestId('locked-empty-state');
    expect(locked).toBeInTheDocument();
    expect(screen.getByTestId('activate-code-cta')).toBeInTheDocument();
    expect(screen.getByTestId('activate-code-cta').getAttribute('href')).toBe('/activate-code');
    // No library tabs are rendered while locked.
    expect(screen.queryByTestId('library-category-tabs')).not.toBeInTheDocument();
  });

  it('shows the locked state on the exams tab when the student has no active subjects', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: [] };
      return { data: [] };
    });
    renderWithProviders(['/my-studies?tab=exams'], <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>);

    expect(await screen.findByTestId('locked-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('activate-code-cta')).toBeInTheDocument();
  });

  it('shows the locked state on the courses tab when the student has no active subjects', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: [] };
      return { data: [] };
    });
    renderWithProviders(['/my-studies'], <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>);

    expect(await screen.findByTestId('locked-empty-state')).toBeInTheDocument();
  });

  it('shows the neutral empty state (not locked) when entitled but the library is empty', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: ENTITLED_SUBJECTS };
      if (url.includes('/library/subject/')) return { data: { items: [] } };
      return { data: [] };
    });
    renderWithProviders(['/my-studies?tab=library'], <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>);

    expect(await screen.findByTestId('library-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('locked-empty-state')).not.toBeInTheDocument();
  });
});

// ================= Push 5 Task 3: library category tabs =================

describe('LibraryHub — category filter tabs', () => {
  function stubLibrary() {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: ENTITLED_SUBJECTS };
      if (url.includes('/library/subject/')) return { data: LIBRARY_FILES };
      return { data: [] };
    });
  }

  it('renders all category tabs with counts and every file under الكل', async () => {
    stubLibrary();
    renderWithProviders(['/my-studies?tab=library'], <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>);

    await waitFor(() => expect(screen.getAllByTestId('library-card').length).toBe(4));
    const allTab = screen.getByTestId('library-tab-all');
    expect(allTab.getAttribute('aria-selected')).toBe('true');
    expect(allTab.textContent).toContain('4');
    expect(screen.getByTestId('library-tab-Curriculum')).toBeInTheDocument();
    expect(screen.getByTestId('library-tab-Summary')).toBeInTheDocument();
    expect(screen.getByTestId('library-tab-GoldenIdeas')).toBeInTheDocument();
    // Tabs whose categories are absent are not offered.
    expect(screen.queryByTestId('library-tab-Lecture')).not.toBeInTheDocument();
  });

  it('filters files when a category tab is selected', async () => {
    stubLibrary();
    renderWithProviders(['/my-studies?tab=library'], <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>);

    await waitFor(() => expect(screen.getAllByTestId('library-card').length).toBe(4));
    fireEvent.click(screen.getByTestId('library-tab-Summary'));
    expect(screen.getByTestId('library-tab-Summary').getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(screen.getAllByTestId('library-card').length).toBe(1));
    expect(screen.getByText('ملخص المحاضرة الثالثة')).toBeInTheDocument();
  });

  it('shows category badge, subject name and upload date on the cards', async () => {
    stubLibrary();
    renderWithProviders(['/my-studies?tab=library'], <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>);

    await waitFor(() => expect(screen.getAllByTestId('library-card').length).toBe(4));
    expect(screen.getAllByTestId('library-card-category').length).toBe(3); // f4 uncategorized → no badge
    expect(screen.getAllByText('تشريح مرضي').length).toBeGreaterThan(0);
    // Link targets carry the subject SLUG (not the GUID) — Push 5 routing fix.
    const firstCard = screen.getByText('منهاج التشريح الرسمي').closest('a');
    expect(firstCard?.getAttribute('href')).toBe('/subjects/تشريح-مرضي/library');
  });
});

// ================= Push 5 Task 2: subject detail status-aware states =================

describe('SubjectDetailPage — status-aware failure states', () => {
  it('shows the locked state + activation CTA when the API returns 403 (no active subscription)', async () => {
    getMock.mockImplementation(async () => { throw httpError(403); });
    renderWithProviders(['/subjects/تشريح-مرضي'], <Routes><Route path="/subjects/:subjectSlug" element={<SubjectDetailPage />} /></Routes>);

    expect(await screen.findByTestId('locked-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('activate-code-cta')).toBeInTheDocument();
    expect(screen.queryByText('المادة غير موجودة')).not.toBeInTheDocument();
  });

  it('shows the not-found state when the API returns 404', async () => {
    getMock.mockImplementation(async () => { throw httpError(404); });
    renderWithProviders(['/subjects/مادة-وهمية'], <Routes><Route path="/subjects/:subjectSlug" element={<SubjectDetailPage />} /></Routes>);

    expect(await screen.findByTestId('subject-not-found')).toBeInTheDocument();
    expect(screen.getByText('المادة غير موجودة')).toBeInTheDocument();
    expect(screen.queryByTestId('locked-empty-state')).not.toBeInTheDocument();
  });

  it('resolves GUID params via the by-ID endpoint (library deep links)', async () => {
    const GUID = '9d2bd5e6-45b5-4e97-9616-8f4d4072b408';
    getMock.mockImplementation(async (url: string) => {
      if (url.includes(`/subjects/${GUID}`)) {
        return { data: { id: GUID, slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', contentScopes: ['QuestionsExams'] } };
      }
      return { data: [] };
    });
    renderWithProviders([`/subjects/${GUID}`], <Routes><Route path="/subjects/:subjectSlug" element={<SubjectDetailPage />} /></Routes>);

    expect((await screen.findAllByText('تشريح مرضي')).length).toBeGreaterThan(0);
    expect(getMock.mock.calls[0][0]).toContain(`/subjects/${GUID}`);
  });

  it('shows the exams tab link (and hides library/courses) when only QuestionsExams is granted', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/تشريح-مرضي')) {
        return { data: { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', contentScopes: ['QuestionsExams'] } };
      }
      return { data: [] };
    });
    renderWithProviders(['/subjects/تشريح-مرضي'], <Routes><Route path="/subjects/:subjectSlug" element={<SubjectDetailPage />} /></Routes>);

    await screen.findAllByText('تشريح مرضي');
    expect(screen.getByText('الاختبارات')).toBeInTheDocument();
    expect(screen.queryByText('المكتبة')).not.toBeInTheDocument();
    expect(screen.queryByText('الكورسات')).not.toBeInTheDocument();
    // Lectures section shows its own locked state.
    expect(await screen.findByTestId('subject-lectures-locked')).toBeInTheDocument();
  });
});

// ================= Push 5 Task 4: subjects page quick actions =================

/** Shared cascade mock — matches the exact endpoint shapes the API client emits. */
function stubCascade(opts: { mySubjects: unknown[]; semesterSubjects: unknown[] }) {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: opts.mySubjects };
    if (url === '/universities' || url.startsWith('/universities?')) {
      return { data: { items: [{ id: 'u1', nameAr: 'جامعة حمص', collegesCount: 1 }] } };
    }
    if (url.endsWith('/colleges')) return { data: [{ id: 'c1', nameAr: 'كلية الطب البشري', yearsCount: 1 }] };
    if (url.endsWith('/years')) return { data: [{ id: 'y1', nameAr: 'السنة الخامسة', semestersCount: 1 }] };
    if (url.endsWith('/semesters')) return { data: [{ id: 'sem1', nameAr: 'الفصل الأول', subjectsCount: 1 }] };
    if (url.endsWith('/subjects')) return { data: opts.semesterSubjects };
    return { data: [] };
  });
}

/** Walks the full cascade: university → college → year → semester. */
async function walkCascade() {
  fireEvent.click(await screen.findByText('جامعة حمص'));
  fireEvent.click(await screen.findByText('كلية الطب البشري'));
  fireEvent.click(await screen.findByTestId('year-tab'));
  fireEvent.click(await screen.findByTestId('semester-chip'));
}

describe('SubjectsPage — entitlement-aware quick actions', () => {
  it('renders the my-subjects strip and scope-gated action buttons on subject cards', async () => {
    stubCascade({
      mySubjects: ENTITLED_SUBJECTS,
      semesterSubjects: [{ id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', totalQuestions: 10, totalLectures: 4, totalFiles: 2, contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] }],
    });

    renderWithProviders(['/subjects'], <Routes><Route path="/subjects" element={<SubjectsPage />} /></Routes>);

    // My-subjects strip
    expect(await screen.findByTestId('my-subjects-strip')).toBeInTheDocument();
    expect(screen.getByText('موادي المفعّلة')).toBeInTheDocument();

    await walkCascade();

    const card = await screen.findByTestId('subject-card');
    expect(card).toBeInTheDocument();
    const actions = screen.getByTestId('subject-quick-actions');
    expect(actions.textContent).toContain('المحتوى');
    expect(actions.textContent).toContain('الاختبارات');
    expect(actions.textContent).toContain('المكتبة');
    expect(actions.textContent).toContain('الكورسات');
  });

  it('hides scope-missing quick actions (questions-only grant)', async () => {
    stubCascade({
      mySubjects: [],
      semesterSubjects: [{ id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', totalQuestions: 10, totalLectures: 4, totalFiles: 0, contentScopes: ['QuestionsExams'] }],
    });

    renderWithProviders(['/subjects'], <Routes><Route path="/subjects" element={<SubjectsPage />} /></Routes>);

    await walkCascade();

    const actions = await screen.findByTestId('subject-quick-actions');
    expect(actions.textContent).toContain('المحتوى');
    expect(actions.textContent).toContain('الاختبارات');
    expect(actions.textContent).not.toContain('المكتبة');
    expect(actions.textContent).not.toContain('الكورسات');
  });

  it('shows the activation CTA when the semester has no visible subjects and the student has none either', async () => {
    stubCascade({ mySubjects: [], semesterSubjects: [] });

    renderWithProviders(['/subjects'], <Routes><Route path="/subjects" element={<SubjectsPage />} /></Routes>);

    await walkCascade();

    expect(await screen.findByTestId('subjects-empty')).toBeInTheDocument();
    expect(screen.getByTestId('activate-code-cta')).toBeInTheDocument();
  });
});
