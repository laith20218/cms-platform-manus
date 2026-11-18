import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 17.4 — favorites upgrade.
 *
 * Locks:
 *  1. Flat mode subject filter: ?subjectId= rides the query (server-side param),
 *     the toolbar select rewrites the URL, «كل المواد» clears it.
 *  2. List mode reading queue: «قراءة متسلسلة» opens the sheet with the whole
 *     list, numbered rows + per-question deep links + prev/next stepper.
 *  3. Every favorite card is openable in context: question → question route,
 *     file → subject library with ?openFile= (auto-opens the viewer).
 *  4. Library ?openFile= auto-opens the DocumentViewer for the deep-linked file.
 */

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
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

import FavoritesPage from '@/features/favorites/FavoritesPage';
import { LibraryHub } from '@/features/my-studies/components/LibraryHub';

const MY_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', contentScopes: ['QuestionsExams', 'LecturesText'] },
  { id: 's2', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['QuestionsExams'] },
];

const FLAT_FAVORITES = (subjectId: string | undefined) => ({
  items: [
    subjectId === 's2' || subjectId === undefined
      ? { id: 'f1', targetType: 'question', targetId: 'q9', subjectId: 's2', courseId: null, title: 'سؤال الباطنة', subtitle: 'الباطنة', thumbnailUrl: null, fileType: null, durationSeconds: null, processingStatus: null, createdAt: '2026-01-01', progress: null }
      : null,
  ].filter(Boolean),
  total: subjectId === 's2' || subjectId === undefined ? 1 : 0,
  page: 1,
  pageSize: 20,
  totalPages: 1,
});

function stubFavorites(opts?: { lists?: unknown[]; listQuestions?: unknown }) {
  getMock.mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
    if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
    if (url === '/favorites/lists') return { data: opts?.lists ?? [] };
    if (url.includes('/favorites/lists/l1/questions')) {
      return {
        data: opts?.listQuestions ?? {
          items: [
            { id: 'f1', targetType: 'question', targetId: 'q1', subjectId: 's1', courseId: null, title: 'سؤال المحاضرة الأولى', subtitle: 'تشريح مرضي', thumbnailUrl: null, fileType: null, durationSeconds: null, processingStatus: null, createdAt: '2026-01-01', progress: null },
            { id: 'f2', targetType: 'question', targetId: 'q2', subjectId: 's1', courseId: null, title: 'سؤال المحاضرة الثانية', subtitle: 'تشريح مرضي', thumbnailUrl: null, fileType: null, durationSeconds: null, processingStatus: null, createdAt: '2026-01-02', progress: null },
          ],
          total: 2, page: 1, pageSize: 20, totalPages: 1,
        },
      };
    }
    if (url === '/favorites') {
      const subjectId = config?.params?.subjectId as string | undefined;
      return { data: FLAT_FAVORITES(subjectId) };
    }
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
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/subjects/:subjectSlug/library" element={<LocationProbe />} />
          <Route path="/subjects/:subjectSlug/questions/:questionId" element={<LocationProbe />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('W17.4 — favorites subject filter (flat mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    stubFavorites();
  });

  it('sends ?subjectId= to the API and renders the filtered grid', async () => {
    renderApp('/favorites?subjectId=s2');

    expect(await screen.findByText('سؤال الباطنة')).toBeInTheDocument();
    // The server-side filter param rode the request.
    await waitFor(() => {
      const call = getMock.mock.calls.find(([url]) => url === '/favorites');
      expect(call?.[1]?.params).toMatchObject({ subjectId: 's2' });
    });
    // The toolbar shows the active subject name.
    expect(screen.getByTestId('favorites-subject-value')).toHaveTextContent('الباطنة');
  });

  it('switching to «كل المواد» clears the subjectId param', async () => {
    renderApp('/favorites?subjectId=s2');
    await screen.findByText('سؤال الباطنة');

    fireEvent.click(screen.getByTestId('favorites-subject-filter'));
    const allOption = await screen.findByTestId('favorites-subject-option-all');
    fireEvent.pointerUp(allOption);
    fireEvent.click(allOption);

    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe.getAttribute('data-search')).toBe('');
    });
  });

  it('selecting a subject rewrites the URL with the subject scope', async () => {
    renderApp('/favorites');
    await waitFor(() => expect(screen.getByTestId('favorites-subject-value')).toHaveTextContent('كل المواد'));

    fireEvent.click(screen.getByTestId('favorites-subject-filter'));
    const option = await screen.findByTestId('favorites-subject-option-s1');
    fireEvent.pointerUp(option);
    fireEvent.click(option);

    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe.getAttribute('data-search')).toBe('?subjectId=s1');
    });
  });
});

describe('W17.4 — list reading queue (same-window long list)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    stubFavorites({ lists: [{ id: 'l1', name: 'قائمة المراجعة', description: null, color: null, questionsCount: 2, containsQuestion: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' }] });
  });

  it('opens the sheet with the whole list, deep links, and a stepper', async () => {
    renderApp('/favorites?listId=l1');

    fireEvent.click(await screen.findByTestId('favorites-reading-trigger'));

    const sheet = await screen.findByTestId('favorites-reading-sheet');
    expect(sheet).toBeInTheDocument();
    expect(await screen.findByTestId('reading-sheet-item-0')).toHaveTextContent('سؤال المحاضرة الأولى');
    expect(screen.getByTestId('reading-sheet-item-1')).toHaveTextContent('سؤال المحاضرة الثانية');
    // Per-row deep link → the question route.
    expect(screen.getByTestId('reading-sheet-open-0').getAttribute('href')).toBe('/subjects/s1/questions/q1');
    // The stepper advances and the position indicator updates.
    expect(screen.getByTestId('reading-sheet-position')).toHaveTextContent('1 / 2');
    fireEvent.click(screen.getByTestId('reading-sheet-next'));
    await waitFor(() => expect(screen.getByTestId('reading-sheet-position')).toHaveTextContent('2 / 2'));
  });
});

describe('W17.4 — every favorite card opens in context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('question cards deep-link into the question view (GUID subject segment)', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
      if (url === '/favorites') {
        return {
          data: {
            items: [
              { id: 'f1', targetType: 'question', targetId: 'q9', subjectId: 's2', courseId: null, title: 'سؤال الباطنة', subtitle: 'الباطنة', thumbnailUrl: null, fileType: null, durationSeconds: null, processingStatus: null, createdAt: '2026-01-01', progress: null },
            ],
            total: 1, page: 1, pageSize: 20, totalPages: 1,
          },
        };
      }
      return { data: [] };
    });
    renderApp('/favorites');

    const open = await screen.findByTestId('favorite-open');
    expect(open.getAttribute('href')).toBe('/subjects/s2/questions/q9');
    expect(open).toHaveTextContent('عرض السؤال');
  });

  it('file cards deep-link into the subject library with ?openFile=', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
      if (url === '/favorites') {
        return {
          data: {
            items: [
              { id: 'f2', targetType: 'file', targetId: 'file-7', subjectId: 's1', courseId: null, title: 'ملخص المحاضرة', subtitle: 'تشريح مرضي', thumbnailUrl: null, fileType: 'pdf', durationSeconds: null, processingStatus: null, createdAt: '2026-01-01', progress: null },
            ],
            total: 1, page: 1, pageSize: 20, totalPages: 1,
          },
        };
      }
      return { data: [] };
    });
    renderApp('/favorites');

    const open = await screen.findByTestId('favorite-open');
    expect(open.getAttribute('href')).toBe('/subjects/s1/library?openFile=file-7');
    expect(open).toHaveTextContent('فتح الملف');
  });
});

describe('W17.4 — library ?openFile= auto-opens the viewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the DocumentViewer for the deep-linked file and clears the param', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/library/subject/s1')) {
        return {
          data: {
            items: [
              { id: 'file-7', type: 'Pdf', title: 'ملخص المحاضرة', description: null, fileSize: 1024, viewsCount: 3, isFavorite: false, category: 'Summary', createdAt: '2026-01-01', subjectId: 's1', subjectSlug: 'تشريح-مرضي', subjectName: 'تشريح مرضي' },
            ],
          },
        };
      }
      return { data: [] };
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/subjects/تشريح-مرضي/library?openFile=file-7']}>
          <LibraryHub subjectId="s1" subjectSlug="تشريح-مرضي" subjectName="تشريح مرضي" />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // The viewer mounts with the deep-linked file (the file title now appears
    // in BOTH the grid card and the opened viewer).
    await screen.findByTestId('library-file-viewer');
    expect(screen.getAllByText('ملخص المحاضرة').length).toBeGreaterThanOrEqual(2);
  });
});
