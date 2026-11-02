/**
 * Wave 12.5.B — page bookmarks moved to the SERVER (supervisor unlocked the
 * old "localStorage ONLY" lock): the player now talks to
 * `/library/{fileId}/bookmarks` (GET list / POST add / DELETE by row id —
 * see library-api.ts + usePdfBookmarks.ts). This module keeps ONLY:
 *   1. the `PageBookmark` shape the StudyListsPanel renders (unchanged contract),
 *   2. the pure ordering/normalization helper (page-ascending, deduped by page),
 *   3. the LEGACY localStorage reader/cleaner that backs the ONE-TIME import
 *      of pre-12.5 bookmarks (`cms:pdf:bookmarks:<fileId>` → POST each →
 *      remove the key). The import itself runs inside usePdfBookmarks' queryFn.
 *
 * Legacy storage shape (read-only now): `cms:pdf:bookmarks:<fileId>` → JSON
 * array of { page, addedAt, snippet? } sorted page-ascending, deduped by page.
 * Every legacy read is defensive (corrupt/missing → empty list).
 */

export interface PageBookmark {
  /** Server row id (present after any server round-trip; absent in optimistic rows). */
  id?: string;
  page: number;
  addedAt: string;
  /** First 30 chars of the page text captured at add time, when available. */
  snippet?: string;
}

const STORAGE_PREFIX = 'cms:pdf:bookmarks:';
/** One-time marker set after the first successful legacy import on this device. */
export const BOOKMARKS_MIGRATED_FLAG = 'cms:pdf:bookmarks:migrated:v1';

function storageKey(fileId: string): string {
  return `${STORAGE_PREFIX}${fileId}`;
}

/** Page-ascending, deduped by page — the canonical list order everywhere. */
export function orderBookmarks(bookmarks: PageBookmark[]): PageBookmark[] {
  const seen = new Set<number>();
  const out: PageBookmark[] = [];
  for (const entry of bookmarks) {
    if (!entry || typeof entry.page !== 'number' || !Number.isFinite(entry.page) || entry.page < 1) continue;
    if (seen.has(entry.page)) continue;
    seen.add(entry.page);
    out.push({
      ...(entry.id ? { id: entry.id } : {}),
      page: entry.page,
      addedAt: typeof entry.addedAt === 'string' ? entry.addedAt : '',
      ...(typeof entry.snippet === 'string' && entry.snippet ? { snippet: entry.snippet } : {}),
    });
  }
  return out.sort((a, b) => a.page - b.page);
}

/**
 * Reads the LEGACY localStorage bookmark list of one document (defensive; never
 * throws). Used exclusively by the one-time import — the app never writes here
 * anymore.
 */
export function readLegacyBookmarks(fileId: string): PageBookmark[] {
  try {
    const raw = window.localStorage.getItem(storageKey(fileId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<number>();
    const out: PageBookmark[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const page = (entry as { page?: unknown }).page;
      if (typeof page !== 'number' || !Number.isFinite(page) || page < 1) continue;
      if (seen.has(page)) continue;
      seen.add(page);
      out.push({
        page,
        addedAt: typeof (entry as { addedAt?: unknown }).addedAt === 'string'
          ? (entry as { addedAt: string }).addedAt
          : '',
        ...(typeof (entry as { snippet?: unknown }).snippet === 'string' && (entry as { snippet: string }).snippet
          ? { snippet: (entry as { snippet: string }).snippet }
          : {}),
      });
    }
    return out.sort((a, b) => a.page - b.page);
  } catch {
    return [];
  }
}

/** Removes the LEGACY localStorage key of one document (after a successful import). */
export function removeLegacyBookmarks(fileId: string): void {
  try {
    window.localStorage.removeItem(storageKey(fileId));
  } catch {
    /* defensive — storage unavailable; the key (if any) stays and the next
       import attempt retries. Never throws. */
  }
}

/** Whether one page is bookmarked within an ordered list. */
export function isBookmarked(bookmarks: PageBookmark[], page: number): boolean {
  return bookmarks.some((b) => b.page === page);
}
