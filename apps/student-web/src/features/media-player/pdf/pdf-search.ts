import { Util, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { normalizeArabicPresentationForms } from './pdf-text';
import { clamp01 } from './pdf-geometry';

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
 * Granularity (Wave 12.1): matching still runs over the concatenated item
 * haystack, but every match now carries the exact ORIGINAL-string slice it
 * covers per item (itemIndex + sliceStart/sliceEnd) — the DOM resolver
 * (pdf-search-dom.ts) turns those slices into char-precise boxes through the
 * text-layer spans, and the data-only fallback advances the run
 * proportionally. The whole-item boxes this module produced before R12.1
 * were the production "highlight covers the whole line" offset.
 */

/** One searchable text item (viewport-space at scale 1). */
export interface SearchTextItem {
  str: string;
  /** pdf.js text matrix [a, b, c, d, e, f] — e/f are the baseline origin. */
  transform: number[];
  width: number;
  height: number;
}

/** One positioned box entry of a match: the slice of ONE pdf.js text item
 *  covered by the match (Wave 12.1 — char-level). sliceStart/sliceEnd are
 *  UTF-16 indices into the item's ORIGINAL (non-lowered) string — the exact
 *  domain the text-layer spans carry, so the DOM resolver can build a Range
 *  directly, while the data-only fallback advances the run proportionally
 *  (BoxSliceFractions). */
export interface SearchMatchBox {
  itemIndex: number;
  sliceStart: number;
  sliceEnd: number;
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
  boxes: SearchMatchBox[];
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

/** Wave 12.1 — proportional run advance for the data-only fallback box:
 *  fractions of item.width along the run direction (0 = item origin,
 *  1 = item run end). Only used for pages whose text layer is not built. */
export interface BoxSliceFractions {
  startFraction: number;
  endFraction: number;
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
  /** Wave 12.1 — kept-item k → RAW str-bearing textContent item index (the
   *  pdf.js TextLayer span domain). Whitespace-only raw items are skipped
   *  from the search domain here, but they DO materialize spans, so the DOM
   *  resolver needs the raw mapping to stay aligned (pdf.mjs:21512/21568 —
   *  empty-str items get no span, whitespace items do). */
  sourceIndexes: number[];
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
  slice?: BoxSliceFractions,
): NormalizedBox | null {
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return null;
  const t = item.transform;
  if (!Array.isArray(t) || t.length < 6) return null;
  const vt = viewportTransform as number[];
  // Viewport-space baseline origin + device glyph height (TextLayer math).
  const tx = Util.transform(vt, [t[0], t[1], t[2], t[3], t[4], t[5]]);
  const fontHeight = Math.hypot(tx[2], tx[3]);
  if (!(fontHeight > 0)) return null;
  // Run boundaries = origin advanced by the run fraction × item.width along
  // the run direction in USER space (item.width is user-space advance), then
  // mapped through the viewport. min/max over the glyph-body corners makes
  // left/width correct for +x runs, mirrored runs, and rotated viewports
  // alike. Wave 12.1: without a slice the fractions are 0→1 — bit-identical
  // to R30.1, because Util.applyTransform(origin, vt) computes the same
  // expressions as Util.transform(vt, t)[4..5].
  const runLength = Math.hypot(t[0], t[1]) || 1;
  const startFraction = slice ? clamp01(slice.startFraction) : 0;
  const endFraction = slice ? Math.max(startFraction, clamp01(slice.endFraction)) : 1;
  const runStart = [
    t[4] + (item.width * startFraction * t[0]) / runLength,
    t[5] + (item.width * startFraction * t[1]) / runLength,
  ];
  const runEnd = [
    t[4] + (item.width * endFraction * t[0]) / runLength,
    t[5] + (item.width * endFraction * t[1]) / runLength,
  ];
  Util.applyTransform(runStart, vt);
  Util.applyTransform(runEnd, vt);
  // Glyph-body lift: the transformed (0, fontSize) vector (tx[2], tx[3]) IS
  // the text-space up direction with magnitude fontHeight — exact for
  // mirrored/rotated runs, where angle-based sin/cos would lift the wrong
  // way (x-mirrored text: atan2(tx1, tx0) = π flips the perpendicular).
  const liftX = tx[2];
  const liftY = tx[3];
  const corners = [
    runStart[0], runStart[1],
    runEnd[0], runEnd[1],
    runStart[0] + liftX, runStart[1] + liftY,
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

/** Wave 12.1 — the search cache's doc key, exported for the per-page
 *  resolved-rect state keys (`fingerprint:pageNumber`) in PdfPlayer. */
export function documentSearchCacheKey(doc: PDFDocumentProxy): string {
  return docCacheKey(doc);
}

/** Wave 12.1 — synchronous read of an already-extracted page's search items
 *  (null when the page was never swept). Feeds the DOM resolver's item
 *  domain and the proportional fallback's slice lengths. */
export function getCachedPageSearchItems(doc: PDFDocumentProxy, pageNumber: number): SearchTextItem[] | null {
  return PAGE_TEXT_CACHE.get(`${docCacheKey(doc)}:${pageNumber}`)?.items ?? null;
}

/** Wave 12.1 — kept-item → raw str-bearing item index (span domain). */
export function getCachedPageSearchSourceIndexes(doc: PDFDocumentProxy, pageNumber: number): number[] | null {
  return PAGE_TEXT_CACHE.get(`${docCacheKey(doc)}:${pageNumber}`)?.sourceIndexes ?? null;
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
  const sourceIndexes: number[] = [];
  content.items.forEach((item, rawIndex) => {
    if (!('str' in item)) return;
    if (!item.str || item.str.trim().length === 0) return;
    sourceIndexes.push(rawIndex);
    items.push({
      str: normalizeArabicPresentationForms(item.str),
      transform: item.transform,
      width: item.width,
      height: item.height,
    });
  });

  // FIFO eviction keeps the ceiling honest without an LRU bookkeeping pass.
  if (PAGE_TEXT_CACHE.size >= PAGE_TEXT_CACHE_MAX_ENTRIES) {
    const oldest = PAGE_TEXT_CACHE.keys().next();
    if (!oldest.done) PAGE_TEXT_CACHE.delete(oldest.value);
  }
  PAGE_TEXT_CACHE.set(key, {
    items,
    sourceIndexes,
    viewport: viewport.width > 0 && viewport.height > 0
      ? { transform: Array.from(viewport.transform), width: viewport.width, height: viewport.height }
      : null,
  });
  return items;
}

/* ===== Wave 12.1 — case-fold index map =====
 * findMatches matches in the LOWERED domain (indexOf over the concatenated
 * haystack) but must report slices in the ORIGINAL string domain — the
 * domain the text-layer spans carry. Same-length lowerings align
 * positionally 1:1 (every code point keeps its UTF-16 unit count;
 * context-sensitive Σ→ς included). Expansion lowerings (İ U+0130 → "i" +
 * U+0307) break that alignment and need an explicit per-lowered-unit →
 * original-unit map. Arabic has no case mappings — always identity. */

export interface CaseFoldedItem {
  lowered: string;
  /** lowered UTF-16 index → ORIGINAL UTF-16 index; null = positional identity. */
  fold: readonly number[] | null;
}

export function caseFoldItem(str: string): CaseFoldedItem {
  const lowered = str.toLowerCase();
  if (lowered.length === str.length) return { lowered, fold: null };
  // Expansion lowerings: walk CODE POINTS (per-unit iteration would corrupt
  // astral case pairs like Deseret 𐐀→𐐨) and record, for every lowered unit,
  // the original unit index of its source character.
  const fold: number[] = [];
  let originalIndex = 0;
  let rebuilt = '';
  for (const ch of str) {
    const low = ch.toLowerCase();
    for (let j = 0; j < low.length; j += 1) fold.push(originalIndex);
    rebuilt += low;
    originalIndex += ch.length;
  }
  // Expansions are context-free, so the rebuilt lowering must reproduce the
  // engine's whole-string lowering exactly. The defensive identity fallback
  // keeps indices bounded (mapFoldedIndex clamps) even if an engine ever
  // disagreed.
  return rebuilt === lowered && fold.length === lowered.length
    ? { lowered, fold }
    : { lowered, fold: null };
}

/** Maps a lowered-domain index of one item back to its ORIGINAL index. */
function mapFoldedIndex(fold: readonly number[] | null, loweredIndex: number, itemLength: number): number {
  if (loweredIndex <= 0) return 0;
  if (fold === null) return Math.min(loweredIndex, itemLength);
  if (loweredIndex >= fold.length) return itemLength;
  return Math.min(fold[loweredIndex], itemLength);
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
  const folds: Array<readonly number[] | null> = [];
  const offsetsLowered: number[] = [];
  let joined = '';
  for (const item of items) {
    const folded = caseFoldItem(item.str);
    offsetsLowered.push(joined.length);
    lowered.push(folded.lowered);
    folds.push(folded.fold);
    joined += folded.lowered;
  }
  // Slice boundaries found here are LOWERED-domain; findMatches maps each
  // per-item boundary back to the ORIGINAL string domain through the
  // case-fold map (identity for same-length lowerings) before emitting a box.

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
        const start = offsetsLowered[k];
        if (start >= end) break;
        const stop = start + lowered[k].length;
        if (stop <= at || lowered[k].length === 0) continue;
        // Wave 12.1 — per-item slice in the ORIGINAL string domain (what the
        // text-layer spans carry). Boundaries found in the lowered domain map
        // back through the case-fold index map (identity for same-length
        // lowerings — the Arabic case; the İ-class needs the fold map).
        const endLocal = Math.min(lowered[k].length, end - start);
        const itemLength = items[k].str.length;
        const sliceStart = mapFoldedIndex(folds[k], Math.max(0, at - start), itemLength);
        const sliceEnd = endLocal >= lowered[k].length
          ? itemLength
          : mapFoldedIndex(folds[k], endLocal, itemLength);
        // A boundary landing inside one expansion (e.g. the "i" half of a
        // lowered İ) covers zero original characters — no box for it.
        if (sliceEnd <= sliceStart) continue;
        if (firstCovered === -1) firstCovered = k;
        boxes.push({
          itemIndex: k,
          sliceStart,
          sliceEnd,
          transform: items[k].transform,
          width: items[k].width,
          height: items[k].height,
        });
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
