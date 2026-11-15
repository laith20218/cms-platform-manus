import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) — mirrors push5.test.tsx ----
const { getMock, postMock, deleteMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

vi.mock('@/features/entitlements/services/entitlement-api', () => ({
  entitlementRequestConfig: async () => ({}),
}));

vi.mock('@/features/security/useContentProtection', () => ({
  useContentProtection: () => { /* jsdom: protection listeners disabled in tests */ },
}));

import { StudyPage } from '@/features/study/pages/StudyPage';
import LibraryPage from '@/features/library/LibraryPage';

// ---- fixtures (Wave 15.5.1a) ----
const MY_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
];

const SUBJECT = {
  id: 's1',
  slug: 'تشريح-مرضي',
  nameAr: 'تشريح مرضي',
  totalQuestions: 10,
  totalLectures: 5,
  totalFiles: 4,
  description: null,
  totalExams: 2,
};

const LIBRARY_FILES = {
  items: [
    { id: 'f1', type: 'Pdf', title: 'منهاج التشريح الرسمي', fileSize: 1048576, viewsCount: 4, isFavorite: false, category: 'Curriculum', createdAt: '2026-10-20T10:00:00Z' },
    { id: 'f2', type: 'Html', title: 'خطة المنهاج التفاعلية', fileSize: 20480, viewsCount: 6, isFavorite: true, category: 'Curriculum', createdAt: '2026-10-21T10:00:00Z' },
    { id: 'f3', type: 'Pdf', title: 'محاضرة مقدمة في التشريح', fileSize: 524288, viewsCount: 2, isFavorite: false, category: 'Lecture', createdAt: '2026-10-22T10:00:00Z' },
    { id: 'f4', type: 'Pdf', title: 'ملخص المحاضرة الثالثة', fileSize: 40960, viewsCount: 9, isFavorite: false, category: 'Summary', createdAt: '2026-10-23T10:00:00Z' },
  ],
};

function stubGet() {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
    if (url.includes('/library/subject/')) return { data: LIBRARY_FILES };
    if (url.includes('/subjects/')) return { data: SUBJECT };
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

function renderStudyLibrary() {
  return renderWithProviders(['/study?tab=library'], (
    <Routes>
      <Route path="/study" element={<StudyPage />} />
      <Route path="*" element={<div data-testid="route-fallback" />} />
    </Routes>
  ));
}

function renderSubjectLibrary() {
  return renderWithProviders(['/subjects/تشريح-مرضي/library'], (
    <Routes>
      <Route path="/subjects/:subjectSlug/library" element={<LibraryPage />} />
      <Route path="*" element={<div data-testid="route-fallback" />} />
    </Routes>
  ));
}

beforeEach(() => {
  vi.clearAllMocks();
  postMock.mockReset();
  deleteMock.mockReset();
  stubGet();
});

// ================= Wave 15.5.1a: the unified library =================

describe('Wave 15.5.1a — unified library', () => {
  it('renders two filter rows in /study?tab=library', async () => {
    renderStudyLibrary();

    expect(await screen.findByTestId('study-library-tab')).toBeInTheDocument();
    expect(await screen.findByTestId('library-tab-all')).toBeInTheDocument();
    expect(await screen.findByTestId('library-format-all')).toBeInTheDocument();
  });

  it('category Summary label reads ملخصات المحاضرات', async () => {
    renderStudyLibrary();

    const tab = await screen.findByTestId('library-tab-Summary');
    expect(tab.textContent).toContain('ملخصات المحاضرات');
    expect(tab.textContent).not.toMatch(/الملخصات/);
  });

  it('AND logic: Curriculum + Pdf shows only Curriculum PDFs', async () => {
    renderStudyLibrary();

    await screen.findAllByTestId('library-card');
    fireEvent.click(screen.getByTestId('library-tab-Curriculum'));
    fireEvent.click(screen.getByTestId('library-format-Pdf'));
    await waitFor(() => expect(screen.getAllByTestId('library-card').length).toBe(1));
    expect(screen.getByText('منهاج التشريح الرسمي')).toBeInTheDocument();
  });

  it('faceted counters update when format filter applied', async () => {
    renderStudyLibrary();

    await screen.findAllByTestId('library-card');
    expect(screen.getByTestId('library-tab-Curriculum').textContent).toContain('2');
    fireEvent.click(screen.getByTestId('library-format-Pdf'));
    expect(screen.getByTestId('library-tab-Curriculum').textContent).toContain('1');
    expect(screen.getByTestId('library-tab-Lecture').textContent).toContain('1');
  });

  it('renders breadcrumb دراستي › المكتبة with no h1', async () => {
    renderStudyLibrary();

    const breadcrumb = await screen.findByTestId('library-breadcrumb');
    expect(within(breadcrumb).getByRole('link', { name: 'دراستي' })).toHaveAttribute('href', '/study');
    expect(within(breadcrumb).queryByText('المكتبة')).toBeInTheDocument();
    expect(within(breadcrumb).getByText('المكتبة').tagName).toBe('SPAN');
    expect(screen.queryByRole('heading', { level: 1, name: 'المكتبة الرقمية' })).toBeNull();
  });

  it('renders breadcrumb الرئيسية › المادة › المكتبة and h1', async () => {
    renderSubjectLibrary();

    const breadcrumb = await screen.findByTestId('library-breadcrumb');
    expect(within(breadcrumb).getByRole('link', { name: 'الرئيسية' })).toHaveAttribute('href', '/dashboard');
    expect(within(breadcrumb).getByRole('link', { name: 'المادة' })).toHaveAttribute('href', '/subjects/تشريح-مرضي');
    expect(within(breadcrumb).queryByText('المكتبة')).toBeInTheDocument();
    expect(within(breadcrumb).getByText('المكتبة').tagName).toBe('SPAN');
    expect(screen.getByRole('heading', { level: 1, name: 'المكتبة الرقمية' })).toBeInTheDocument();
    expect(screen.getByTestId('library-tab-all')).toBeInTheDocument();
    expect(screen.getByTestId('library-format-all')).toBeInTheDocument();
  });

  it('favorites toggle triggers mutation', async () => {
    renderStudyLibrary();

    await screen.findAllByTestId('library-card');
    // f1 is NOT a favorite → toggling issues POST /favorites { libraryFileId: 'f1' }.
    fireEvent.click(screen.getByTestId('library-card-favorite-f1'));
    await waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    expect(postMock).toHaveBeenCalledWith('/favorites', { libraryFileId: 'f1' }, {});
  });
});
