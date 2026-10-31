import { rectsFromRange } from './pdf-geometry';
import type { NormalizedRect } from './pdf-types';
import type { SearchMatch } from './pdf-search';

/**
 * Wave 12.1 — char-level search hit boxes through the pdf.js TextLayer DOM.
 *
 * The R30.1 box math (pdf-search.ts textBoxToNormalizedViewportBox) is
 * item-precise; this module is the RENDERED-PAGE authority that goes the last
 * mile to the character: it walks the text-layer spans pdf.js materialized
 * (PdfPlayer.tsx render effect), pins each search item to its span, and turns
 * every match's ORIGINAL-string slices into one DOM Range whose
 * getClientRects() are normalized against the canvas box with the SAME
 * production pipeline the text highlighter uses (rectsFromRange,
 * pdf-geometry.ts:103-128 — reuse, not a reimplementation).
 *
 * Why the DOM is the authority: Range.getClientRects() returns VISUAL line
 * boxes, so bidi/RTL and contextual Arabic shaping are handled by the layout
 * engine itself — the exact property that makes the highlighter RTL-safe in
 * production (R15.2/R16.2). CanvasRenderingContext2D.measureText is NOT a
 * viable authority on this platform: R19/R22 made disableFontFace universal,
 * so canvas glyph mapping of subset embedded fonts is the known-broken
 * pipeline (PdfPlayer.tsx R22 comment).
 *
 * pdf.js 6.4.299 span contract (node_modules/pdfjs-dist/legacy/build/pdf.mjs,
 * class TextLayer):
 *  - ONE span per str-bearing text item, appended in item order
 *    (#processItems :21480-21505, #appendText :21507);
 *  - span.textContent === item.str VERBATIM (:21543) — here the normalized
 *    string the player feeds the TextLayer (PdfPlayer.tsx:956-958), which is
 *    byte-identical to the search cache's items (same normalizeArabicPresentationForms);
 *  - items with str === "" produce NO span (:21512 hasText, :21568 append
 *    gate) — the walker skips them on the raw axis;
 *  - whitespace-only items (" ") DO produce spans — they are part of the raw
 *    axis but not the search (filtered) axis;
 *  - marked-content items wrap spans in span.markedContent containers
 *    (:21487-21500) — leaf detection ignores wrappers;
 *  - hasEOL appends a <br> sibling (:21571-21575) — no text, ignored.
 */

/** Everything the span walker needs to align the two item domains. */
export interface SearchResolveContext {
  /** ALL str-bearing RAW textContent items in order ('' included — pdf.js
   *  skips their spans; whitespace items get spans). */
  rawItemStrings: readonly string[];
  /** Filtered item k → raw str-bearing item index (search cache sourceIndexes). */
  rawIndexOfItem: readonly number[];
}

export interface SearchSpanMap {
  /** Filtered item k → its leaf span, or null when unverifiable. */
  spanForItem: Array<HTMLElement | null>;
  /** Spans verified byte-equal against the raw item strings. */
  verifiedSpans: number;
  /** Spans whose text diverged (matches touching them fall back). */
  mismatchedSpans: number;
}

/**
 * Walks the text layer's leaf spans ONCE per layer build and pins every
 * filtered search item to its span via strict text verification. Order-based
 * (pdf.js guarantees span order === raw item order), with a per-span
 * equality check so any divergence degrades honestly to the fallback instead
 * of mis-painting.
 */
export function createSearchSpanMap(layerEl: HTMLElement, ctx: SearchResolveContext): SearchSpanMap {
  const spanForRaw: Array<HTMLElement | null> = new Array(ctx.rawItemStrings.length).fill(null);
  let verifiedSpans = 0;
  let mismatchedSpans = 0;
  let rawPtr = 0;
  for (const span of collectLeafSpans(layerEl)) {
    // pdf.js appends spans for every str-bearing item EXCEPT str === ""
    // (pdf.mjs:21512/21568) — skip those raw items, they have no span.
    while (rawPtr < ctx.rawItemStrings.length && ctx.rawItemStrings[rawPtr] === '') rawPtr += 1;
    if (rawPtr >= ctx.rawItemStrings.length) break;
    if (span.textContent === ctx.rawItemStrings[rawPtr]) {
      spanForRaw[rawPtr] = span;
      verifiedSpans += 1;
    } else {
      // Text divergence (a skipped span upstream, a debug-hidden layer
      // mid-rebuild, an unexpected pdf.js transform). This item gets no span;
      // matches covering it fall back to the proportional slice box. The
      // pointer still advances so later spans can re-verify.
      mismatchedSpans += 1;
    }
    rawPtr += 1;
  }
  const spanForItem = ctx.rawIndexOfItem.map((rawIndex) =>
    rawIndex >= 0 && rawIndex < spanForRaw.length ? spanForRaw[rawIndex] : null);
  return { spanForItem, verifiedSpans, mismatchedSpans };
}

/**
 * Resolves ONE match into page-normalized rects through the text-layer DOM:
 * a single Range from the first covered item's sliceStart to the last
 * covered item's sliceEnd (intermediate items are covered by the range
 * automatically — the match is contiguous), normalized with rectsFromRange.
 * Returns null when the match cannot be pinned (missing/unverified spans,
 * degenerate range) — the caller then paints the proportional fallback.
 */
export function resolveSearchMatchRects(
  spanForItem: ReadonlyArray<HTMLElement | null>,
  match: SearchMatch,
  pageRect: DOMRect,
): NormalizedRect[] | null {
  const boxes = match.boxes;
  if (boxes.length === 0) return null;
  const firstBox = boxes[0];
  const lastBox = boxes[boxes.length - 1];
  const firstSpan = spanForItem[firstBox.itemIndex] ?? null;
  const lastSpan = spanForItem[lastBox.itemIndex] ?? null;
  if (!firstSpan || !lastSpan) return null;
  const startText = firstTextNode(firstSpan);
  const endText = firstTextNode(lastSpan);
  if (!startText || !endText) return null;
  // Offsets are UTF-16 indices into the item string; the span text was
  // verified byte-equal, so they are directly Range-valid. Clamp defensively
  // — a Range throw must degrade to the fallback, never crash the page.
  const startOffset = Math.min(firstBox.sliceStart, startText.length);
  const endOffset = Math.min(lastBox.sliceEnd, endText.length);
  if (startText === endText && startOffset >= endOffset) return null;
  try {
    const range = document.createRange();
    range.setStart(startText, startOffset);
    range.setEnd(endText, endOffset);
    const rects = rectsFromRange(range, pageRect);
    return rects.length > 0 ? rects : null;
  } catch {
    return null;
  }
}

/**
 * Leaf spans of the text layer, in document order: spans that contain no
 * nested span. markedContent containers (pdf.mjs:21489-21490) are skipped —
 * they only wrap; leaf spans carry exactly one text node with the item
 * string. getElementsByTagName walks in document order.
 */
function collectLeafSpans(layerEl: HTMLElement): HTMLElement[] {
  const leaves: HTMLElement[] = [];
  const spans = layerEl.getElementsByTagName('span');
  for (let i = 0; i < spans.length; i += 1) {
    const el = spans[i];
    if (!el.querySelector('span')) leaves.push(el);
  }
  return leaves;
}

/**
 * The span's single text node (textContent assignment — pdf.mjs:21543 —
 * replaces all children with exactly one). Range offsets count CHARACTERS
 * only on text nodes; on element nodes they count children, which would be
 * wrong by construction.
 */
function firstTextNode(span: HTMLElement): Text | null {
  for (let i = 0; i < span.childNodes.length; i += 1) {
    const node = span.childNodes[i];
    if (node.nodeType === Node.TEXT_NODE && (node.nodeValue?.length ?? 0) > 0) {
      return node as Text;
    }
  }
  return null;
}
