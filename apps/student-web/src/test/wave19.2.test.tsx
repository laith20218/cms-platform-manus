import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 19.2 — favorites residual polish (D-31 / D-32).
 *
 * Locks:
 *  1. (D-31) A «تعذّر المعالجة» episode card is not a permanent dead end:
 *     it owns an «إعادة التحقق» affordance that refetches favorites state —
 *     a recovered pipeline clears the badge and unblocks «فتح الحلقة».
 *     Pending/transcoding stays badge-only (open disabled, no recheck).
 *  2. (D-32) The reading sheet accumulates pages: sequential numbering holds
 *     past the 100-row boundary, ONE position counter exists, a single
 *     «التالي» tap at the boundary advances AND fetches (no double-tap), and
 *     the remaining-count math is correct. Error ≠ empty on queue failure.
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

import FavoritesPage from '@/features/favorites/FavoritesPage';

const MY_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
];

function episodeFavorite(processingStatus: string | null) {
  return {
    items: [
      { id: 'f1', targetType: 'episode', targetId: 'ep1', subjectId: 's1', courseId: 'c1', title: 'محاضرة الفيديو', subtitle: 'تشريح مرضي', thumbnailUrl: null, fileType: 'video', durationSeconds: 600, processingStatus, createdAt: '2026-01-01', progress: null },
    ],
    total: 1, page: 1, pageSize: 20, totalPages: 1,
  };
}

function renderFavorites(initialEntry: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="*" element={<div data-testid="unmatched-route" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

// ============ D-31 — failed episode card is not a dead end ============

describe('W19.2 (D-31) — «تعذّر المعالجة» card affordances', () => {
  it('shows «إعادة التحقق» on a failed episode; a recovered status clears the badge and unblocks open', async () => {
    let favoritesCalls = 0;
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
      if (url === '/favorites') {
        favoritesCalls += 1;
        return { data: episodeFavorite(favoritesCalls === 1 ? 'failed' : 'ready') };
      }
      if (url === '/favorites/lists') return { data: [] };
      return { data: [] };
    });
    renderFavorites('/favorites');

    // Failed state: badge + recheck present, open blocked.
    expect(await screen.findByTestId('favorite-card-episode')).toHaveTextContent('تعذّر المعالجة');
    const recheck = screen.getByTestId('favorite-recheck');
    expect(recheck).toHaveTextContent('إعادة التحقق');
    expect(screen.getByTestId('favorite-open')).toBeDisabled();

    // Recheck refetches favorites state; the recovered status unblocks the card.
    fireEvent.click(recheck);
    await waitFor(() => expect(favoritesCalls).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.queryByTestId('favorite-recheck')).toBeNull());
    await waitFor(() => expect(screen.getByTestId('favorite-open')).toBeEnabled());
    expect(screen.getByTestId('favorite-card-episode')).not.toHaveTextContent('تعذّر المعالجة');
  });

  it('keeps pending/transcoding badge-only (no recheck, open disabled)', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
      if (url === '/favorites') return { data: episodeFavorite('transcoding_360p') };
      if (url === '/favorites/lists') return { data: [] };
      return { data: [] };
    });
    renderFavorites('/favorites');

    expect(await screen.findByTestId('favorite-card-episode')).toHaveTextContent('قيد المعالجة');
    expect(screen.queryByTestId('favorite-recheck')).toBeNull();
    expect(screen.getByTestId('favorite-open')).toBeDisabled();
  });
});

// ============ D-32 — reading sheet: accumulate, single counter, one-tap advance ============

const QUEUE_LIST = { id: 'l1', name: 'قائمة طويلة', description: null, color: null, questionsCount: 150, containsQuestion: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' };

function queueItem(n: number) {
  return {
    id: `f${n}`, targetType: 'question', targetId: `q${n}`, subjectId: 's1', courseId: null,
    title: `سؤال رقم ${n}`, subtitle: 'تشريح مرضي', thumbnailUrl: null, fileType: null,
    durationSeconds: null, processingStatus: null, createdAt: '2026-01-01', progress: null,
  };
}

function stubPagedQueue() {
  getMock.mockImplementation(async (url: string, config?: { params?: Record<string, unknown> }) => {
    if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
    if (url === '/favorites/lists') return { data: [QUEUE_LIST] };
    if (url.includes('/favorites/lists/l1/questions')) {
      const page = Number(config?.params?.page ?? 1);
      if (page === 1) return { data: { items: Array.from({ length: 100 }, (_, i) => queueItem(i + 1)), total: 150, page: 1, pageSize: 100, totalPages: 2 } };
      return { data: { items: Array.from({ length: 50 }, (_, i) => queueItem(101 + i)), total: 150, page: 2, pageSize: 100, totalPages: 2 } };
    }
    if (url === '/favorites') return { data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 } };
    return { data: [] };
  });
}

async function openSheet() {
  renderFavorites('/favorites?listId=l1');
  fireEvent.click(await screen.findByTestId('favorites-reading-trigger'));
  return screen.findByTestId('favorites-reading-sheet');
}

describe('W19.2 (D-32) — reading sheet queue past the 100-row boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    stubPagedQueue();
  });

  it('accumulates pages: honest remaining count, sequential numbering, one position counter', async () => {
    await openSheet();

    expect(await screen.findByTestId('reading-sheet-item-0')).toBeInTheDocument();
    // Correct remaining math with an accumulated queue (was 100-100=… broken before).
    expect(screen.getByTestId('reading-sheet-load-more')).toHaveTextContent('50 متبقية');
    // Single position counter INSIDE the sheet — the old duplicate «index / loaded» span is gone.
    expect(within(screen.getByTestId('favorites-reading-sheet')).getAllByText(/\d+ \/ \d+/).length).toBe(1);
    expect(screen.getByTestId('reading-sheet-position')).toHaveTextContent('1 / 150');
  });

  it('one «التالي» tap at the boundary advances AND fetches — no double-tap', async () => {
    await openSheet();
    await screen.findByTestId('reading-sheet-item-0');

    // Walk to the last loaded row (index 99).
    for (let i = 0; i < 99; i++) fireEvent.click(screen.getByTestId('reading-sheet-next'));
    await waitFor(() => expect(screen.getByTestId('reading-sheet-position')).toHaveTextContent('100 / 150'));

    // ONE more tap: the position advances immediately (optimistic) …
    fireEvent.click(screen.getByTestId('reading-sheet-next'));
    expect(screen.getByTestId('reading-sheet-position')).toHaveTextContent('101 / 150');

    // … and the row appears once the next page accumulates — numbered 101,
    // not restarted at 1 (the pre-W19.2 replacement bug).
    const row = await screen.findByTestId('reading-sheet-item-100', {}, { timeout: 4000 });
    expect(row).toHaveTextContent('101');
    expect(row).toHaveTextContent('سؤال رقم 101');

    // Full queue loaded → the load-more affordance disappears.
    await waitFor(() => expect(screen.queryByTestId('reading-sheet-load-more')).toBeNull());
  });

  it('error ≠ empty: a failed queue load shows inline error + retry, never the empty message', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
      if (url === '/favorites/lists') return { data: [QUEUE_LIST] };
      if (url.includes('/favorites/lists/l1/questions')) throw new Error('queue down');
      if (url === '/favorites') return { data: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 } };
      return { data: [] };
    });

    await openSheet();

    const err = await screen.findByTestId('reading-sheet-error');
    expect(err).toHaveTextContent('تعذّر تحميل أسئلة القائمة');
    expect(screen.queryByText('لا توجد أسئلة في هذه القائمة بعد.')).toBeNull();

    // Retry hits the queue endpoint again.
    const before = getMock.mock.calls.filter(([u]) => String(u).includes('/favorites/lists/l1/questions')).length;
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    await waitFor(() => {
      const after = getMock.mock.calls.filter(([u]) => String(u).includes('/favorites/lists/l1/questions')).length;
      expect(after).toBeGreaterThan(before);
    });
  });
});
