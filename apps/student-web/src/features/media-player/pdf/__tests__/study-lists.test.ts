import { beforeEach, describe, expect, it } from 'vitest';
import { collectHighlights, collectNotes, type HighlightEntry } from '../study-lists';
import { addBookmark, clearAllBookmarks, isBookmarked, loadBookmarks, removeBookmark } from '../pdf-bookmarks';
import type { PdfAnnotation } from '../pdf-types';

/** Wave 12.3.C — the Study Tools list helpers + the v1 bookmark store.
 *  Notes/highlights: TYPE filter + stable display ordering (page → created /
 *  visual position). Bookmarks: page-level, localStorage-persisted per file
 *  (Wave 12.4 moves them to the backend — the store API is the port surface). */

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

describe('pdf-bookmarks (12.3.C v1 — localStorage persistence)', () => {
  const FILE = 'file-abc';

  beforeEach(() => {
    clearAllBookmarks();
  });

  it('adds, lists and dedupes bookmarks per file', () => {
    expect(loadBookmarks(FILE)).toEqual([]);
    addBookmark(FILE, 2, 'Cardiology unit — page');
    addBookmark(FILE, 1);
    addBookmark(FILE, 2, 'refreshed snippet'); // same page → refresh, never duplicate
    const list = loadBookmarks(FILE);
    expect(list.map((b) => b.page)).toEqual([1, 2]);
    expect(list[1].snippet).toBe('refreshed snippet');
    expect(list[1].addedAt).toBeTruthy();
  });

  it('isBookmarked reflects the current page state', () => {
    expect(isBookmarked(FILE, 3)).toBe(false);
    addBookmark(FILE, 3);
    expect(isBookmarked(FILE, 3)).toBe(true);
    removeBookmark(FILE, 3);
    expect(isBookmarked(FILE, 3)).toBe(false);
  });

  it('removeBookmark is a no-op for absent pages and keeps the rest', () => {
    addBookmark(FILE, 1);
    addBookmark(FILE, 5);
    removeBookmark(FILE, 3);
    expect(loadBookmarks(FILE).map((b) => b.page)).toEqual([1, 5]);
  });

  it('persists across a "reload" (fresh reads hit localStorage) and scopes by file', () => {
    addBookmark(FILE, 4, 'Differential Diagnosis —');
    addBookmark('other-file', 9);
    // A remount reads the SAME storage — the persistence contract.
    expect(loadBookmarks(FILE).map((b) => b.page)).toEqual([4]);
    expect(loadBookmarks('other-file').map((b) => b.page)).toEqual([9]);
  });

  it('survives a corrupt storage entry (defensive empty list)', () => {
    window.localStorage.setItem(`cms:pdf:bookmarks:${FILE}`, '{not json');
    expect(loadBookmarks(FILE)).toEqual([]);
    // And a nonsense shape is sanitized instead of trusted.
    window.localStorage.setItem(`cms:pdf:bookmarks:${FILE}`, JSON.stringify([{ page: 'x' }, { page: 7 }, 3, null]));
    expect(loadBookmarks(FILE).map((b) => b.page)).toEqual([7]);
  });
});
