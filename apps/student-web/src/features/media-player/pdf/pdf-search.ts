import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { normalizeArabicPresentationForms } from './pdf-text';

/**
 * Wave 11.11 / F2 Phase 3 — client-side text search for the PDF player.
 *
 * Entirely client-side (supervisor-locked): pdf.js is already in the player,
 * so search extracts per-page text with getTextContent() — no endpoint, no
 * backend. Pages are extracted lazily (current page first, then the rest in
 * ascending order) and cached in a MODULE-level Map keyed by the document's
 * pdf.js fingerprint + page number, so two different files never share
 * entries and a re-open of the same file reuses warm extractions.
 *
 * Arabic contract: haystacks AND queries go through the same presentation-form
 * normalization the text layer uses (pdf-text.ts) — Arabic PDFs whose
 * ToUnicode maps emit U+FB50–U+FEFF codepoints must match base-letter queries.
 *
 * Granularity (v1, locked): matches are PER TEXT ITEM — a query spanning two
 * items matches the item containing its core, and highlight boxes are
 * per-item. Cross-item merging is a future wave.
 */

/** One searchable text item (viewport-space at scale 1). */
export interface SearchTextItem {
  str: string;
  /** pdf.js text matrix [a, b, c, d, e, f] — e/f are the baseline origin. */
  transform: number[];
  width: number;
  height: number;
}

/** One match (an occurrence of the query). A match may SPAN several pdf.js
 *  text items (many producers emit per-glyph/per-cluster items), so it
 *  carries one positioned box per covered item — the highlight layer draws
 *  one box per box entry, all sharing the match's active state. */
export interface SearchMatch {
  page: number;
  boxes: Array<{ transform: number[]; width: number; height: number }>;
  str: string;
}

/** A positioned highlight box in PAGE PIXEL space (render scale applied). */
export interface SearchHitBox {
  left: number;
  top: number;
  width: number;
  height: number;
  active: boolean;
}

const PAGE_TEXT_CACHE = new Map<string, SearchTextItem[]>();
/** generous ceiling: extraction is the cost, entries are tiny */
const PAGE_TEXT_CACHE_MAX_ENTRIES = 600;

/** pdf.js documents carry a content fingerprint — the cache key's doc part. */
function docCacheKey(doc: PDFDocumentProxy): string {
  const fingerprints = (doc as unknown as { fingerprints?: readonly unknown[] }).fingerprints;
  const first = Array.isArray(fingerprints) ? fingerprints[0] : undefined;
  return typeof first === 'string' && first.length > 0 ? first : 'doc';
}

/**
 * Extracts (and caches) the searchable text items of one page. Whitespace-only
 * items are dropped up front — they are not matchable and their absence makes
 * "page has a text layer" a simple non-emptiness check.
 */
export async function getPageSearchItems(doc: PDFDocumentProxy, pageNumber: number): Promise<SearchTextItem[]> {
  const key = `${docCacheKey(doc)}:${pageNumber}`;
  const cached = PAGE_TEXT_CACHE.get(key);
  if (cached) return cached;

  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const items: SearchTextItem[] = [];
  for (const item of content.items) {
    if (!('str' in item)) continue;
    if (!item.str || item.str.trim().length === 0) continue;
    items.push({
      str: normalizeArabicPresentationForms(item.str),
      transform: item.transform,
      width: item.width,
      height: item.height,
    });
  }

  // FIFO eviction keeps the ceiling honest without an LRU bookkeeping pass.
  if (PAGE_TEXT_CACHE.size >= PAGE_TEXT_CACHE_MAX_ENTRIES) {
    const oldest = PAGE_TEXT_CACHE.keys().next();
    if (!oldest.done) PAGE_TEXT_CACHE.delete(oldest.value);
  }
  PAGE_TEXT_CACHE.set(key, items);
  return items;
}

/**
 * Finds every occurrence of the query in the page text.
 *
 * Matching runs over the LOWERED, concatenated item strings with per-item
 * offsets (the pdf.js find-controller approach): producers emit
 * per-glyph/per-cluster items, so restricting a match to one item would make
 * multi-character queries unfindable.
 *
 * ORIENTATION: many Arabic PDFs (Chromium-print fixtures included) encode
 * text in VISUAL order — characters AND words reversed, exactly as they were
 * drawn left-to-right. A logical query can therefore never match those
 * streams directly. Each page is searched FORWARD first; only when that
 * yields nothing is the page re-searched with the fully reversed string
 * (visual-order fallback). Per-page fallback (not both-at-once) keeps the
 * match list duplicate-free for short/symmetric queries; the item boxes are
 * position-anchored, so the highlight is correct in either orientation.
 *
 * The haystack must be PRE-NORMALIZED (getPageSearchItems folds Arabic
 * presentation forms at extraction); the query is normalized here, so typed
 * base letters match forms-carrying text and vice versa.
 */
export function findMatches(items: readonly SearchTextItem[], rawQuery: string, page: number): SearchMatch[] {
  const query = normalizeArabicPresentationForms(rawQuery).toLowerCase();
  if (!query) return [];

  const lowered: string[] = [];
  const offsets: number[] = [];
  let joined = '';
  for (const item of items) {
    const low = item.str.toLowerCase();
    offsets.push(joined.length);
    lowered.push(low);
    joined += low;
  }

  // Deduped orientations: a palindrome or 1-char query collapses to one pass.
  const seen = new Set<string>();
  const orientations = [query, [...query].reverse().join('')].filter((candidate) => {
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    return true;
  });

  const collect = (candidate: string) => {
    const found: Array<{ at: number; boxes: SearchMatch['boxes']; str: string }> = [];
    let from = 0;
    for (;;) {
      const at = joined.indexOf(candidate, from);
      if (at === -1) break;
      from = at + Math.max(1, candidate.length);
      const end = at + candidate.length;
      const boxes: SearchMatch['boxes'] = [];
      let firstCovered = -1;
      for (let k = 0; k < items.length; k += 1) {
        const start = offsets[k];
        if (start >= end) break;
        const stop = start + lowered[k].length;
        if (stop <= at || lowered[k].length === 0) continue;
        if (firstCovered === -1) firstCovered = k;
        boxes.push({ transform: items[k].transform, width: items[k].width, height: items[k].height });
      }
      if (boxes.length > 0) {
        found.push({ at, boxes, str: items[firstCovered].str });
      }
    }
    return found;
  };

  // Forward first; the reversed (visual-order) pass is a FALLBACK per page,
  // so short/symmetric queries can never double-count on one stream.
  let found = collect(orientations[0]);
  if (found.length === 0 && orientations.length > 1) {
    found = collect(orientations[1]);
  }

  found.sort((a, b) => a.at - b.at);
  return found.map((hit) => ({ page, boxes: hit.boxes, str: hit.str }));
}

/** Test hook — wipes the module cache between documents/scenarios. */
export function clearSearchCache(): void {
  PAGE_TEXT_CACHE.clear();
}
