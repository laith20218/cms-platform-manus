import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';

// ---- shared mocks (hoisted) ----
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

const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

import { useCreateEpisodeFavorite, useDeleteFavorite, useFavoritesList } from '../hooks';
import FavoritesPage from '../FavoritesPage';
import type { FavoriteItem, PagedFavorites } from '../types';

// ---- fixtures ----

function makeItem(overrides: Partial<FavoriteItem>): FavoriteItem {
  return {
    id: 'fav-1',
    targetType: 'episode',
    targetId: 'ep-1',
    subjectId: 's1',
    courseId: 'c1',
    title: 'حلقة تجريبية',
    subtitle: 'كورس القلب',
    thumbnailUrl: null,
    fileType: 'video',
    durationSeconds: 2400,
    processingStatus: 'Ready',
    createdAt: '2026-10-20T10:00:00Z',
    progress: { lastPositionSeconds: 300, durationSeconds: 2400, completionPercent: 12 },
    ...overrides,
  } as FavoriteItem;
}

const EPISODE_ITEM = makeItem({});
const FILE_ITEM = makeItem({ id: 'fav-2', targetType: 'file', targetId: 'f-1', courseId: null, fileType: 'pdf', durationSeconds: null, progress: null });

function page(items: FavoriteItem[], total = items.length, page = 1, pageSize = 20): PagedFavorites {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

const LIST_PARAMS = { type: 'episode' as const, sort: 'recent' as const, page: 1, pageSize: 20 };

function httpError(status: number) {
  const error = new AxiosError('Request failed', String(status));
  error.response = { status, data: {}, statusText: '', headers: {}, config: {} as never };
  return error;
}

function createTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function HookWrapper({ children }: { children: React.ReactNode }) {
  const client = createTestClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===== useFavoritesList =====

describe('useFavoritesList', () => {
  it('fetches with the parameterized key and returns the paged envelope', async () => {
    getMock.mockResolvedValue({ data: page([EPISODE_ITEM]) });

    const { result } = renderHook(() => useFavoritesList(LIST_PARAMS), { wrapper: HookWrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith('/favorites', expect.objectContaining({
      params: { type: 'episode', sort: 'recent', page: 1, pageSize: 20 },
    }));
    expect(result.current.data?.items).toHaveLength(1);
    expect(result.current.data?.total).toBe(1);
  });

  it('omits the type param when undefined (all-types listing)', async () => {
    getMock.mockResolvedValue({ data: page([EPISODE_ITEM, FILE_ITEM], 2) });

    const { result } = renderHook(() => useFavoritesList({ sort: 'alpha', page: 2, pageSize: 10 }), { wrapper: HookWrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith('/favorites', expect.objectContaining({
      params: { type: undefined, sort: 'alpha', page: 2, pageSize: 10 },
    }));
  });
});

// ===== useDeleteFavorite (optimistic + rollback) =====

describe('useDeleteFavorite', () => {
  it('removes the item from every cached favorites list OPTIMISTICALLY (before the API resolves)', async () => {
    const queryClient = createTestClient();
    queryClient.setQueryData(['favorites', 'list', LIST_PARAMS], page([EPISODE_ITEM, FILE_ITEM], 2));
    let release: (() => void) | undefined;
    deleteMock.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDeleteFavorite(), { wrapper });

    act(() => { result.current.mutate({ targetType: 'episode', targetId: 'ep-1' }); });

    // Optimistic state (the DELETE promise is STILL PENDING — release has not run):
    // file remains, episode gone, total dropped.
    await waitFor(() => {
      const optimistic = queryClient.getQueryData<PagedFavorites>(['favorites', 'list', LIST_PARAMS]);
      expect(optimistic?.items.map((item) => item.targetId)).toEqual(['f-1']);
      expect(optimistic?.total).toBe(1);
    });

    await act(async () => { release?.(); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteMock).toHaveBeenCalledWith('/favorites/episode/ep-1', expect.anything());
  });

  it('rolls the cache back and toasts when the DELETE fails', async () => {
    const queryClient = createTestClient();
    queryClient.setQueryData(['favorites', 'list', LIST_PARAMS], page([EPISODE_ITEM, FILE_ITEM], 2));
    deleteMock.mockRejectedValue(httpError(403));

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDeleteFavorite(), { wrapper });

    result.current.mutate({ targetType: 'file', targetId: 'f-1' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const restored = queryClient.getQueryData<PagedFavorites>(['favorites', 'list', LIST_PARAMS]);
    expect(restored?.items.map((item) => item.targetId).sort()).toEqual(['ep-1', 'f-1']);
    expect(restored?.total).toBe(2);
    expect(toastErrorMock).toHaveBeenCalled();
  });
});

// ===== useCreateEpisodeFavorite =====

describe('useCreateEpisodeFavorite', () => {
  it('posts to the episode endpoint and invalidates the favorites cache on success', async () => {
    postMock.mockResolvedValue({ data: { favoriteId: 'fav-9', targetId: 'ep-1', targetType: 'episode' } });
    const queryClient = createTestClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateEpisodeFavorite('ep-1'), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(postMock).toHaveBeenCalledWith('/favorites/episodes/ep-1', undefined, expect.anything());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['favorites'] });
  });

  it('toasts on failure without touching the cache', async () => {
    postMock.mockRejectedValue(httpError(409));
    const queryClient = createTestClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateEpisodeFavorite('ep-1'), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastErrorMock).toHaveBeenCalledWith('تعذّر تحديث المفضلة، حاول مجددًا');
    expect(queryClient.getQueryData(['favorites'])).toBeUndefined();
  });
});

// ===== FavoritesPage URL-param normalization + rendering =====

describe('FavoritesPage', () => {
  function renderPage(initialUrl: string) {
    const client = createTestClient();
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialUrl]}>
          <FavoritesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('normalizes out-of-domain URL params to canonical defaults', async () => {
    getMock.mockResolvedValue({ data: page([]) });
    renderPage('/favorites?type=podcast&sort=random&page=-3');

    await waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(getMock).toHaveBeenCalledWith('/favorites', expect.objectContaining({
      params: { type: undefined, sort: 'recent', page: 1, pageSize: 20 },
    }));
  });

  it('renders the per-tab empty state copy for episodes', async () => {
    getMock.mockResolvedValue({ data: page([]) });
    renderPage('/favorites?type=episode');

    expect(await screen.findByTestId('favorites-empty')).toBeInTheDocument();
    expect(screen.getByText('لا توجد حلقات محفوظة')).toBeInTheDocument();
  });

  it('renders enriched cards and hides متابعة on non-episode types', async () => {
    getMock.mockResolvedValue({ data: page([EPISODE_ITEM, FILE_ITEM], 2) });
    renderPage('/favorites');

    expect(await screen.findByTestId('favorite-card-episode')).toBeInTheDocument();
    expect(screen.getByTestId('favorite-card-file')).toBeInTheDocument();
    // Episode WITH progress → متابعة; file → never.
    expect(screen.getByTestId('favorite-continue')).toBeInTheDocument();
    expect(screen.queryAllByTestId('favorite-continue')).toHaveLength(1);
    // Duration badge rendered from the enriched payload.
    expect(screen.getByText('40:00')).toBeInTheDocument();
  });
});
