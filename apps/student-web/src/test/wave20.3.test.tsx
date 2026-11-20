import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 20.3 (owner decision 1) — six-digit public codes on library files and
 * courses: always shown next to the name on the cards, and searchable by
 * name OR code (digit-only terms match the zero-padded form: "1234" → "001234").
 *
 *  1. LibraryHub cards render the code chip; the debounced search rides the
 *     SERVER `?search=` param on GET /library/subject/{id} (whole-catalog
 *     coverage, not just the loaded pages).
 *  2. CoursesCatalog cards render the code chip; the client-side search
 *     filters the complete (unpaginated) catalog by title/description/code.
 */

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/features/entitlements/services/entitlement-api', async () => {
  const actual = await vi.importActual<typeof import('@/features/entitlements/services/entitlement-api')>(
    '@/features/entitlements/services/entitlement-api'
  );
  return { ...actual, entitlementRequestConfig: async () => ({}) };
});

vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({ user: { fullName: 'طالب تجريبي' } }),
}));

import { LibraryHub } from '@/features/my-studies/components/LibraryHub';
import { CoursesCatalog } from '@/features/my-studies/components/CoursesCatalog';

// ---- Library fixtures ----
const MY_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', contentScopes: ['LecturesText'] },
];

const LIBRARY_FILES = [
  {
    id: 'file-1', type: 'Pdf', title: 'ملف القلب', description: null, fileSize: 2048,
    viewsCount: 3, isFavorite: false, category: 'Lecture', createdAt: '2026-01-02',
    publicCode: '001234',
  },
  {
    id: 'file-2', type: 'Summary', title: 'ملف الرئة', description: null, fileSize: 4096,
    viewsCount: 5, isFavorite: false, category: 'Summary', createdAt: '2026-01-01',
    publicCode: '998877',
  },
];

function stubLibrary() {
  getMock.mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
    if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
    if (url.includes('/library/subject/s1')) {
      const search = (config?.params?.search as string | undefined) ?? '';
      const items = search
        ? LIBRARY_FILES.filter((file) =>
            search === '1234' || search === '001234'
              ? file.publicCode === '001234'
              : file.title.includes(search))
        : LIBRARY_FILES;
      return { data: { items, total: items.length, page: 1, pageSize: 100, totalPages: 1 } };
    }
    return { data: [] };
  });
}

function renderHub() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/study?tab=library']}>
        <LibraryHub />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ---- Course fixtures ----
const COURSE_SUBJECT = { id: 's1', slug: 'مادة-فيديو', nameAr: 'مادة فيديو', contentScopes: ['VideoAudio'] };

const COURSES = [
  {
    id: 'c1', subjectId: 's1', subjectNameAr: 'مادة فيديو', title: 'دورة القلب',
    description: 'وصف تجريبي', coverImageUrl: null, episodesCount: 2,
    totalDurationSeconds: 3600, totalViewsCount: 12, publicCode: '004321',
  },
  {
    id: 'c2', subjectId: 's1', subjectNameAr: 'مادة فيديو', title: 'دورة الرئة',
    description: 'وصف آخر', coverImageUrl: null, episodesCount: 1,
    totalDurationSeconds: 1800, totalViewsCount: 4, publicCode: '112233',
  },
];

function stubCourses() {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: [COURSE_SUBJECT] };
    if (url.includes('/courses/subject/s1')) return { data: COURSES };
    return { data: [] };
  });
}

function renderCatalog() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CoursesCatalog />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  vi.clearAllMocks();
});

// ============ Library: code chip + server-side search ============

describe('W20.3 — LibraryHub public codes', () => {
  it('always shows the six-digit code next to the title on every card', async () => {
    stubLibrary();
    renderHub();

    await waitFor(() => expect(screen.getAllByTestId('library-card').length).toBe(2), { timeout: 4000 });
    const codes = screen.getAllByTestId('library-card-code').map((chip) => chip.textContent);
    expect(codes).toContain('001234');
    expect(codes).toContain('998877');
  });

  it('searching by code (short or full form) rides the server ?search= param and shows the match', async () => {
    stubLibrary();
    renderHub();

    await waitFor(() => expect(screen.getAllByTestId('library-card').length).toBe(2), { timeout: 4000 });

    // Type the SHORT digit form — the server zero-pads ("1234" finds "001234").
    fireEvent.change(screen.getByTestId('library-search-input'), { target: { value: '1234' } });
    await sleep(450); // past the 350ms debounce (real timers — waitFor needs them)

    await waitFor(() => {
      expect(getMock.mock.calls.some(([url, config]) =>
        String(url).includes('/library/subject/s1')
        && (config as { params?: { search?: string } })?.params?.search === '1234')).toBe(true);
    }, { timeout: 4000 });
    await waitFor(() => expect(screen.getAllByTestId('library-card').length).toBe(1), { timeout: 4000 });
    expect(screen.getByTestId('library-card-code').textContent).toBe('001234');
  });

  it('a search with no matches renders the honest empty state with a clear action', async () => {
    stubLibrary();
    renderHub();

    await waitFor(() => expect(screen.getAllByTestId('library-card').length).toBe(2), { timeout: 4000 });

    fireEvent.change(screen.getByTestId('library-search-input'), { target: { value: 'لا يوجد' } });
    await sleep(450);

    await waitFor(() => expect(screen.getByTestId('library-empty')).toBeInTheDocument(), { timeout: 4000 });
    expect(screen.getByTestId('library-empty').textContent).toContain('لا توجد ملفات تطابق البحث');
  });
});

// ============ Courses: code chip + client-side search ============

describe('W20.3 — CoursesCatalog public codes', () => {
  it('always shows the code next to the course title', async () => {
    stubCourses();
    renderCatalog();

    await waitFor(() => expect(screen.getAllByTestId('course-card').length).toBe(2), { timeout: 4000 });
    const codes = screen.getAllByTestId('course-card-code').map((chip) => chip.textContent);
    expect(codes).toContain('004321');
    expect(codes).toContain('112233');
  });

  it('searching by the short digit form filters to the matching course (client-side)', async () => {
    stubCourses();
    renderCatalog();

    await waitFor(() => expect(screen.getAllByTestId('course-card').length).toBe(2), { timeout: 4000 });

    fireEvent.change(screen.getByTestId('courses-search-input'), { target: { value: '4321' } });
    await waitFor(() => expect(screen.getAllByTestId('course-card').length).toBe(1));
    expect(screen.getByTestId('course-card-code').textContent).toBe('004321');

    // Clearing restores the full catalog.
    fireEvent.click(screen.getByTestId('courses-search-clear'));
    await waitFor(() => expect(screen.getAllByTestId('course-card').length).toBe(2));
  });

  it('a name search still works alongside the code search', async () => {
    stubCourses();
    renderCatalog();

    await waitFor(() => expect(screen.getAllByTestId('course-card').length).toBe(2), { timeout: 4000 });

    fireEvent.change(screen.getByTestId('courses-search-input'), { target: { value: 'الرئة' } });
    await waitFor(() => expect(screen.getAllByTestId('course-card').length).toBe(1));
    expect(screen.getByText('دورة الرئة')).toBeInTheDocument();
  });
});
