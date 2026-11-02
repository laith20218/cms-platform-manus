import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { collectHighlights, collectNotes, type HighlightEntry } from '../study-lists';
import { isBookmarked, orderBookmarks, readLegacyBookmarks, type PageBookmark } from '../pdf-bookmarks';
import { usePdfBookmarks } from '../hooks/usePdfBookmarks';
import type { PdfAnnotation } from '../pdf-types';

/** Wave 12.3.C — the Study Tools list helpers; Wave 12.5.B — bookmarks moved to
 *  the SERVER: this suite covers the pure ordering helper AND the optimistic
 *  mutation/rollback contract of usePdfBookmarks (queryClient harness, mirrors
 *  favorites/tests/hooks.test.tsx), plus the one-time legacy localStorage import. */

// ---- shared mocks (hoisted) ----
const { getBookmarksMock, addBookmarkMock, deleteBookmarkMock } = vi.hoisted(() => ({
  getBookmarksMock: vi.fn(),
  addBookmarkMock: vi.fn(),
  deleteBookmarkMock: vi.fn(),
}));

vi.mock('@/features/library/services/library-api', () => ({
  libraryApi: {
    getBookmarks: (...args: unknown[]) => getBookmarksMock(...args),
    addBookmark: (...args: unknown[]) => addBookmarkMock(...args),
    deleteBookmark: (...args: unknown[]) => deleteBookmarkMock(...args),
  },
}));

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args), info: vi.fn(), success: vi.fn() },
}));

const serverRow = (id: string, page: number, snippet?: string | null) => ({
  id, pageNumber: page, snippet: snippet ?? null, createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z',
});

function createWrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

const note = (id: string, page: number, text: string, createdAt?: string): PdfAnnotation => ({
  id, pageNumber: page, annotationType: 'Note',
  payload: { x: 0.5, y: 0.5, text, color: '#fde047' },
  ...(createdAt ? { createdAt } : {}),
});

const highlight = (id: string, page: number, y: number, x = 0.1): PdfAnnotation => ({
  id, pageNumber: page, annotationType: 'Highlight',
  payload: { rects: [{ x, y, w: 0.3, h: 0.02 }], color: '#fde047', textSnippet: `snippet-${id}` },
});

describe('collectNotes (12.3.C)', () => {
  it('filters ONLY Note annotations from the (document-scoped) map', () => {
    const entries: PdfAnnotation[] = [
      highlight('h1', 1, 0.2),
      note('n1', 2, 'ملاحظة قلبية'),
      { id: 'i1', pageNumber: 3, annotationType: 'Ink', payload: { points: [{ x: 0, y: 0 }], color: '#000', width: 0.01 } },
      note('n2', 1, 'ملاحظة أخرى'),
    ];
    const notes = collectNotes(entries);
    expect(notes.map((n) => n.id)).toEqual(['n2', 'n1']);
    expect(notes.every((n) => n.annotationType === 'Note')).toBe(true);
  });

  it('orders by page ascending, then createdAt ascending', () => {
    const entries: PdfAnnotation[] = [
      note('late', 1, 'b', '2026-01-02T00:00:00Z'),
      note('page2', 2, 'z', '2026-01-01T00:00:00Z'),
      note('early', 1, 'a', '2026-01-01T00:00:00Z'),
    ];
    expect(collectNotes(entries).map((n) => n.id)).toEqual(['early', 'late', 'page2']);
  });

  it('returns an empty list for an empty document (the empty state source)', () => {
    expect(collectNotes([])).toEqual([]);
  });
});

describe('collectHighlights (12.3.C)', () => {
  it('orders by page, then first-rect y, then x (visual reading order)', () => {
    const entries: PdfAnnotation[] = [
      highlight('h-bottom', 1, 0.8),
      highlight('h-p2', 2, 0.1),
      highlight('h-right', 1, 0.3, 0.6),
      highlight('h-left', 1, 0.3, 0.1),
    ];
    expect(collectHighlights(entries).map((h: HighlightEntry) => h.id))
      .toEqual(['h-left', 'h-right', 'h-bottom', 'h-p2']);
  });

  it('skips degenerate payloads (no rects) and carries the snippet + color', () => {
    const entries: PdfAnnotation[] = [
      { id: 'bad', pageNumber: 1, annotationType: 'Highlight', payload: { rects: [], color: '#fff' } },
      highlight('good', 1, 0.5),
    ];
    const highlights = collectHighlights(entries);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].snippet).toBe('snippet-good');
    expect(highlights[0].color).toBe('#fde047');
    expect(highlights[0].firstRect.y).toBe(0.5);
  });
});

describe('orderBookmarks (12.5.B — the pure list contract)', () => {
  it('orders page-ascending and dedupes by page', () => {
    const list = orderBookmarks([
      { page: 5, addedAt: 'a' },
      { page: 1, addedAt: 'b' },
      { page: 5, addedAt: 'c' },
      { page: 3, addedAt: 'd', snippet: 'kept' },
    ]);
    expect(list.map((b) => b.page)).toEqual([1, 3, 5]);
    expect(list[1].snippet).toBe('kept');
  });

  it('sanitizes nonsense entries (bad pages, non-objects) instead of trusting them', () => {
    const list = orderBookmarks([
      { page: 'x' as unknown as number, addedAt: '' },
      { page: 7, addedAt: '' },
      null as unknown as PageBookmark,
      { page: 0, addedAt: '' },
    ]);
    expect(list.map((b) => b.page)).toEqual([7]);
  });

  it('isBookmarked checks the ordered list by page', () => {
    const list = orderBookmarks([{ page: 3, addedAt: '' }]);
    expect(isBookmarked(list, 3)).toBe(true);
    expect(isBookmarked(list, 4)).toBe(false);
  });

  it('readLegacyBookmarks is defensive (missing/corrupt keys → empty list)', () => {
    expect(readLegacyBookmarks('no-such-file')).toEqual([]);
    window.localStorage.setItem('cms:pdf:bookmarks:corrupt', '{not json');
    expect(readLegacyBookmarks('corrupt')).toEqual([]);
    window.localStorage.setItem('cms:pdf:bookmarks:nonsense', JSON.stringify([{ page: 'x' }, { page: 7 }, 3, null]));
    expect(readLegacyBookmarks('nonsense').map((b) => b.page)).toEqual([7]);
  });
});

describe('usePdfBookmarks (12.5.B — server persistence, optimistic UI)', () => {
  const FILE = 'file-abc';

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  const renderBookmarks = () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return renderHook(() => usePdfBookmarks(FILE), { wrapper: createWrapper(client) });
  };

  it('maps server rows into the page-ascending list', async () => {
    getBookmarksMock.mockResolvedValue([serverRow('bm-9', 9), serverRow('bm-2', 2, 'early page')]);
    const { result } = renderBookmarks();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bookmarks.map((b) => b.page)).toEqual([2, 9]);
    expect(result.current.bookmarks[0].id).toBe('bm-2');
    expect(result.current.bookmarks[0].snippet).toBe('early page');
  });

  it('imports legacy localStorage bookmarks once: POST each → remove the key → set the flag', async () => {
    window.localStorage.setItem('cms:pdf:bookmarks:file-abc', JSON.stringify([
      { page: 4, addedAt: '2026-01-01T00:00:00Z', snippet: 'Differential Diagnosis —' },
      { page: 1, addedAt: '2026-01-02T00:00:00Z' },
    ]));
    getBookmarksMock.mockResolvedValue([]);
    addBookmarkMock.mockImplementation((_fileId: string, page: number) =>
      Promise.resolve(serverRow(`bm-${page}`, page)));

    const { result } = renderBookmarks();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(addBookmarkMock).toHaveBeenCalledTimes(2);
    expect(addBookmarkMock).toHaveBeenCalledWith(FILE, 4, 'Differential Diagnosis —');
    expect(window.localStorage.getItem('cms:pdf:bookmarks:file-abc')).toBeNull();
    expect(window.localStorage.getItem('cms:pdf:bookmarks:migrated:v1')).toBeTruthy();
    expect(result.current.bookmarks.map((b) => b.page)).toEqual([1, 4]);
  });

  it('keeps the legacy key when the import fails (retry on next mount, list still renders)', async () => {
    window.localStorage.setItem('cms:pdf:bookmarks:file-abc', JSON.stringify([{ page: 4, addedAt: '' }]));
    getBookmarksMock.mockResolvedValue([]);
    addBookmarkMock.mockRejectedValue(new Error('network'));

    const { result } = renderBookmarks();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(window.localStorage.getItem('cms:pdf:bookmarks:file-abc')).not.toBeNull();
    expect(result.current.bookmarks).toEqual([]);
    expect(toastErrorMock).not.toHaveBeenCalled(); // the import never blocks the player
  });

  it('toggle-add is OPTIMISTIC: cache updates before the POST resolves, then reconciles the server id', async () => {
    getBookmarksMock
      .mockResolvedValueOnce([])                                   // initial list
      .mockResolvedValueOnce([])                                   // toggle's server-truth GET
      .mockResolvedValue([serverRow('bm-5', 5)]);                  // onSettled refetch
    let release: (() => void) | undefined;
    addBookmarkMock.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve(serverRow('bm-5', 5)); }),
    );

    const { result } = renderBookmarks();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.toggle(5, 'page five'); });
    await waitFor(() => {
      const optimistic = result.current.bookmarks;
      expect(optimistic.map((b) => b.page)).toEqual([5]); // pending POST, no server id yet
      expect(optimistic[0].id).toBeUndefined();
    });

    await act(async () => { release?.(); });
    await waitFor(() => expect(result.current.bookmarks[0]?.id).toBe('bm-5'));
    expect(deleteBookmarkMock).not.toHaveBeenCalled();
  });

  it('toggle-add failure rolls the cache back and toasts', async () => {
    getBookmarksMock.mockResolvedValue([]);
    addBookmarkMock.mockRejectedValue(new Error('boom'));

    const { result } = renderBookmarks();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.toggle(5); });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('تعذر حفظ العلامة المرجعية. تحقق من اتصالك وحاول مجددًا.'));
    expect(result.current.bookmarks).toEqual([]);
  });

  it('toggle-remove resolves the row server-side and DELETEs by id (the pending-add race)', async () => {
    getBookmarksMock
      .mockResolvedValueOnce([])                                  // initial list
      .mockResolvedValueOnce([serverRow('bm-5', 5)])              // toggle's server-truth GET
      .mockResolvedValue([]);                                     // onSettled refetch
    deleteBookmarkMock.mockResolvedValue(undefined);

    const { result } = renderBookmarks();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.toggle(5); });
    await waitFor(() => expect(deleteBookmarkMock).toHaveBeenCalledWith('bm-5'));
    await waitFor(() => expect(result.current.bookmarks).toEqual([]));
  });

  it('panel remove is OPTIMISTIC and DELETEs by the server row id; failure rolls back + toasts', async () => {
    getBookmarksMock
      .mockResolvedValueOnce([serverRow('bm-7', 7)])               // initial list
      .mockResolvedValueOnce([serverRow('bm-7', 7)])               // remove's server-truth GET
      .mockResolvedValue([serverRow('bm-7', 7)]);                  // rollback refetch
    let fail: ((error: Error) => void) | undefined;
    deleteBookmarkMock.mockImplementation(
      () => new Promise((_resolve, reject) => { fail = () => reject(new Error('boom')); }),
    );

    const { result } = renderBookmarks();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.bookmarks.map((b) => b.page)).toEqual([7]);

    act(() => { result.current.remove(7); });
    // Optimistic removal while the DELETE is still PENDING (held open):
    await waitFor(() => expect(result.current.bookmarks).toEqual([]));
    // Failure → snapshot restored + toast:
    await act(async () => { fail?.(new Error('boom')); });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    await waitFor(() => expect(result.current.bookmarks.map((b) => b.page)).toEqual([7]));
  });
});
