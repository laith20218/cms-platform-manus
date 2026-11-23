import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 19.3 — library volume + mobile search entry (D-23 / D-34 / D-35).
 *
 * Locks:
 *  1. (D-23) LibraryHub pages past the old 100-per-subject cap: «تحميل المزيد»
 *     appends the next page and shows an honest «تم تحميل X من Y ملفاً»
 *     against the summed backend totals; fully-loaded catalogs show no row.
 *  2. (D-34) The Navbar exposes a search entry below md (icon → /search).
 *  3. (D-35) The mobile search control is fully labeled (Arabic aria-label);
 *     the existing labeled icon controls stay labeled.
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

vi.mock('@/app/providers/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: () => {} }) }));
vi.mock('@/app/providers/useAuth', () => ({ useAuth: () => ({ user: { fullName: 'طالب تجريبي' } }) }));

import { LibraryHub } from '@/features/my-studies/components/LibraryHub';
import { Navbar } from '@/components/layouts/Navbar';

const MY_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', contentScopes: ['LecturesText'] },
];

function libraryFile(n: number) {
  return {
    id: `file-${n}`, type: 'Pdf', title: `ملف رقم ${n}`, description: null, fileSize: 2048,
    viewsCount: 3, isFavorite: false, category: 'Lecture', createdAt: '2026-01-01', pagesCount: 2,
  };
}

function stubLibraryPages(totalPages: number, total: number) {
  getMock.mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
    if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
    if (url.includes('/library/subject/s1')) {
      const page = Number(config?.params?.page ?? 1);
      const pageSize = Number(config?.params?.pageSize ?? 100);
      if (page > totalPages) return { data: { items: [], total, page, pageSize, totalPages } };
      const count = Math.min(pageSize, total - (page - 1) * pageSize);
      return { data: { items: Array.from({ length: count }, (_, i) => libraryFile((page - 1) * pageSize + i + 1)), total, page, pageSize, totalPages } };
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
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

// ============ D-23 — past-the-cap paging with honest totals ============

describe('W19.3 (D-23) — LibraryHub past the 100-file cap', () => {
  it('loads the first 100, shows «تم تحميل 100 من 150 ملفاً», and «تحميل المزيد» appends the tail', async () => {
    stubLibraryPages(2, 150);
    renderHub();

    // First page renders 100 cards; the honest counter appears with the row.
    await waitFor(() => expect(screen.getAllByTestId('library-card').length).toBe(100), { timeout: 4000 });
    const row = screen.getByTestId('library-load-more');
    expect(row).toHaveTextContent('تم تحميل');
    expect(row).toHaveTextContent('100');
    expect(row).toHaveTextContent('150');

    // The second page was requested with page=2 (not a silent cap at 100).
    fireEvent.click(screen.getByRole('button', { name: 'تحميل المزيد' }));
    await waitFor(() => expect(screen.getAllByTestId('library-card').length).toBe(150), { timeout: 4000 });
    expect(getMock.mock.calls.some(([u, c]) => String(u).includes('/library/subject/s1') && (c as { params?: { page?: number } })?.params?.page === 2)).toBe(true);

    // Fully loaded → the affordance disappears (nothing hidden, no honesty gap).
    await waitFor(() => expect(screen.queryByTestId('library-load-more')).toBeNull());
  });

  it('shows no load-more row when the whole catalog fits one page', async () => {
    stubLibraryPages(1, 3);
    renderHub();

    await waitFor(() => expect(screen.getAllByTestId('library-card').length).toBe(3), { timeout: 4000 });
    expect(screen.queryByTestId('library-load-more')).toBeNull();
  });
});

// ============ D-34 / D-35 — mobile search entry, labeled ============

describe('W19.3 (D-34/D-35) — Navbar mobile search entry', () => {
  it('renders an md:hidden search link to /search with a full Arabic aria-label', () => {
    // Night Task 4 — the Navbar reads the shared unread-count query now.
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <Navbar />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const mobile = screen.getByTestId('navbar-search-mobile');
    expect(mobile).toHaveAttribute('href', '/search');
    expect(mobile.getAttribute('aria-label')).toBe('البحث في المحتوى');
    // Visible below md only — mirrors the desktop input's hidden md:block.
    expect(mobile.className).toContain('md:hidden');

    // The desktop input stays the md+ surface (D-35: the 18.3 labeled control holds).
    expect(screen.getByTestId('navbar-search')).toBeInTheDocument();
    expect(screen.getByTestId('navbar-search-submit')).toHaveAttribute('aria-label', 'تنفيذ البحث');
    // Existing icon controls stay labeled.
    expect(screen.getByTestId('navbar-bell')).toHaveAttribute('aria-label', 'الإشعارات');
    expect(screen.getByTestId('navbar-theme-toggle')).toHaveAttribute('aria-label', 'تبديل الوضع الليلي');
  });
});
