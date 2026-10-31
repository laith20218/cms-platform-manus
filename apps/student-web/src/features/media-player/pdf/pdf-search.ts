import { Util, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
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

/** A positioned rectangle in normalized [0, 1] viewport space (R30.1) —
 *  multiply by the canvas CSS size to land on exact page pixels. */
export interface NormalizedBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** One cached page: searchable items + the scale-1 viewport that maps their
 *  transforms to page space (R30.1 — the mapping authority is captured ONCE
 *  at extraction so highlight math and the render pipeline share one source). */
interface PageSearchCacheEntry {
  items: SearchTextItem[];
  viewport: { transform: number[]; width: number; height: number } | null;
}

const PAGE_TEXT_CACHE = new Map<string, PageSearchCacheEntry>();
/** generous ceiling: extraction is the cost, entries are tiny */
const PAGE_TEXT_CACHE_MAX_ENTRIES = 600;

/**
 * R30.1 — converts one pdf.js text item into a normalized [0, 1] rectangle
 * relative to the page canvas, through the SAME pipeline the pdf.js TextLayer
 * itself uses: `Util.transform(viewport.transform, item.transform)`.
 *
 * The old math (`left = transform[4]`, `top = transform[5] - height`) ignored
 * the viewport entirely — user space is y-UP (origin bottom-left) while the
 * canvas is y-DOWN, so every box landed near the page bottom (fixture item:
 * oldTop=736px vs true top=64.5px on an 843px page — the reported
 * "shifted right and down").
 *
 * RTL CONTRACT (fixture-proven, pdfjs-dist 6.4.299 text_layer.mjs): pdf.js
 * sets the span's `dir` ATTRIBUTE but never flips POSITIONING for it — and
 * for the visual-order Arabic streams this platform serves (Chromium/Word
 * print pipelines), `dir === 'rtl'` items still advance in +x with the
 * transform origin at the visual LEFT edge (glyph "ﻲ" e=57.75 → "ﻘ" e=79 …
 * across one word). A dir-based right-edge flip would therefore MISALIGN
 * exactly the documents in production. The transform matrix itself encodes
 * the true geometry: mirrored runs (t[0] < 0) put the origin at the visual
 * RIGHT edge — the min/max corner normalization below folds that out with
 * no dir special-case.
 *
 * Height spans one FULL font height above the baseline (pdf.js positions
 * spans at `tx[5] - fontAscent`; we use the metric-free `fontHeight` so the
 * wash covers ascenders/tashkeel without probing fontFamily metrics).
 */
export function textBoxToNormalizedViewportBox(
  item: { transform: number[]; width: number; height: number },
  viewportTransform: readonly number[],
  viewportWidth: number,
  viewportHeight: number,
): NormalizedBox | null {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return null;
  const t = item.transform;
  if (!Array.isArray(t) || t.length < 6) return null;
  const vt = viewportTransform as number[];
  // Viewport-space baseline origin + device glyph height (TextLayer math).
  const tx = Util.transform(vt, [t[0], t[1], t[2], t[3], t[4], t[5]]);
  const fontHeight = Math.hypot(tx[2], tx[3]);
  if (!(fontHeight > 0)) return null;
  // Run end = origin advanced by item.width along the run direction in USER
  // space (item.width is user-space advance), then mapped through the
  // viewport. min/max over the glyph-body corners makes left/width correct
  // for +x runs, mirrored runs, and rotated viewports alike.
  const runLength = Math.hypot(t[0], t[1]) || 1;
  const runEnd = [t[4] + (item.width * t[0]) / runLength, t[5] + (item.width * t[1]) / runLength];
  Util.applyTransform(runEnd, vt);
  // Glyph-body lift: the transformed (0, fontSize) vector (tx[2], tx[3]) IS
  // the text-space up direction with magnitude fontHeight — exact for
  // mirrored/rotated runs, where angle-based sin/cos would lift the wrong
  // way (x-mirrored text: atan2(tx1, tx0) = π flips the perpendicular).
  const liftX = tx[2];
  const liftY = tx[3];
  const corners = [
    tx[4], tx[5],
    runEnd[0], runEnd[1],
    tx[4] + liftX, tx[5] + liftY,
    runEnd[0] + liftX, runEnd[1] + liftY,
  ];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < corners.length; i += 2) {
    minX = Math.min(minX, corners[i]);
    maxX = Math.max(maxX, corners[i]);
    minY = Math.min(minY, corners[i + 1]);
    maxY = Math.max(maxY, corners[i + 1]);
  }
  return {
    left: minX / viewportWidth,
    top: minY / viewportHeight,
    width: (maxX - minX) / viewportWidth,
    height: (maxY - minY) / viewportHeight,
  };
}

/** The cached scale-1 viewport of a page that has already been swept —
 *  null when the page was never extracted (or the viewport is degenerate). */
export function getCachedPageSearchViewport(
  doc: PDFDocumentProxy,
  pageNumber: number,
): { transform: number[]; width: number; height: number } | null {
  return PAGE_TEXT_CACHE.get(`${docCacheKey(doc)}:${pageNumber}`)?.viewport ?? null;
}

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
  if (cached) return cached.items;

  const page = await doc.getPage(pageNumber);
  // R30.1 — capture the scale-1 viewport alongside the items: it is the
  // single authority that maps item transforms onto the canvas.
  const viewport = page.getViewport({ scale: 1 });
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
  PAGE_TEXT_CACHE.set(key, {
    items,
    viewport: viewport.width > 0 && viewport.height > 0
      ? { transform: Array.from(viewport.transform), width: viewport.width, height: viewport.height }
      : null,
  });
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
