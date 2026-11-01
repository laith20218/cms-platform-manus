/**
 * Wave 12.3.C — page-level bookmarks, CLIENT-SIDE ONLY (supervisor locked:
 * "bookmarks in localStorage ONLY (no backend)"). PERSISTENCE CONTRACT: keyed
 * per file id; Wave 12.4 will move them to the backend annotations store —
 * the API surface below (load/toggle/list) is deliberately the shape that
 * ports 1:1 to server persistence, so the migration touches this module and
 * nothing else.
 *
 * Storage shape: `cms:pdf:bookmarks:<fileId>` → JSON array of
 * { page, addedAt, snippet? } sorted page-ascending, deduped by page. Every
 * read is defensive (corrupt/missing → empty list) — a broken localStorage
 * entry must never crash the player.
 */

export interface PageBookmark {
  page: number;
  addedAt: string;
  /** First 30 chars of the page text captured at add time, when available. */
  snippet?: string;
}

const STORAGE_PREFIX = 'cms:pdf:bookmarks:';

function storageKey(fileId: string): string {
  return `${STORAGE_PREFIX}${fileId}`;
}

function sanitize(raw: unknown): PageBookmark[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: PageBookmark[] = [];
  for (const entry of raw) {
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
}

/** Reads the bookmark list of one document (defensive; never throws). */
export function loadBookmarks(fileId: string): PageBookmark[] {
  try {
    const raw = window.localStorage.getItem(storageKey(fileId));
    if (!raw) return [];
    return sanitize(JSON.parse(raw));
  } catch {
    return [];
  }
}

function persist(fileId: string, bookmarks: PageBookmark[]): PageBookmark[] {
  const ordered = sanitize(bookmarks);
  try {
    window.localStorage.setItem(storageKey(fileId), JSON.stringify(ordered));
  } catch {
    // Quota/disabled localStorage: the in-memory list still reflects intent;
    // persistence resumes on the next successful write. Never throws.
  }
  return ordered;
}

/** Adds (or refreshes) the bookmark for one page. Idempotent per page. */
export function addBookmark(fileId: string, page: number, snippet?: string): PageBookmark[] {
  const next = loadBookmarks(fileId).filter((b) => b.page !== page);
  next.push({ page, addedAt: new Date().toISOString(), ...(snippet ? { snippet } : {}) });
  return persist(fileId, next);
}

/** Removes the bookmark of one page (no-op when absent). */
export function removeBookmark(fileId: string, page: number): PageBookmark[] {
  return persist(fileId, loadBookmarks(fileId).filter((b) => b.page !== page));
}

/** Whether one page is bookmarked. */
export function isBookmarked(fileId: string, page: number): boolean {
  return loadBookmarks(fileId).some((b) => b.page === page);
}

/** Test hook — wipes every document's bookmarks (vitest isolation). */
export function clearAllBookmarks(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    /* defensive — storage unavailable */
  }
}
