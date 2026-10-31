import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  caseFoldItem, clearSearchCache, findMatches, getCachedPageSearchViewport, getPageSearchItems,
  textBoxToNormalizedViewportBox, type SearchTextItem,
} from '../pdf-search';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Wave 11.11 — search-engine falsification: Arabic presentation-form
 *  normalization on BOTH sides of the match (the whole point of reusing
 *  pdf-text.ts), per-item granularity, and the fingerprint-keyed cache. */

/** محاضرة spelled in Arabic Presentation Forms (U+FEE3 meem-initial,
 *  U+FEA4 hah-medial, U+FE8E alef-final, U+FEC0 dad-medial, U+FEAE reh-final,
 *  U+FE94 teh-marbuta-final) — what broken ToUnicode maps emit. NFKC must
 *  fold this to the base-letter spelling. */
const ARABIC_FORMS = '\uFEE3\uFEA4\uFE8E\uFEC0\uFEAE\uFE94';
const ARABIC_BASE = 'محاضرة';

const items: SearchTextItem[] = [
  { str: 'Differential Diagnosis — Page One', transform: [1, 0, 0, 1, 50, 72], width: 200, height: 14 },
  // findMatches receives PRE-NORMALIZED haystacks (getPageSearchItems folds
  // presentation forms at extraction — falsified in the describe below).
  { str: ARABIC_BASE, transform: [1, 0, 0, 1, 50, 100], width: 160, height: 16 },
];

/** The per-glyph item reality: Chromium/Word pipelines split words across
 *  items — matching must bridge item boundaries. */
const glyphItems: SearchTextItem[] = [
  { str: 'Diff', transform: [1, 0, 0, 1, 10, 20], width: 22, height: 12 },
  { str: 'erential', transform: [1, 0, 0, 1, 32, 20], width: 44, height: 12 },
  { str: ' Diagnosis', transform: [1, 0, 0, 1, 76, 20], width: 70, height: 12 },
];

describe('findMatches', () => {
  it('matches Latin case-insensitively', () => {
    const matches = findMatches(items, 'differential', 1);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ page: 1, str: items[0].str });
    expect(matches[0].boxes).toHaveLength(1);
    expect(matches[0].boxes[0].transform[4]).toBe(50);
  });

  it('BRIDGES per-glyph items: a word split across items still matches', () => {
    const matches = findMatches(glyphItems, 'differential', 1);
    expect(matches).toHaveLength(1);
    // The match covers BOTH fragments → two boxes, first item's str.
    expect(matches[0].boxes).toHaveLength(2);
    expect(matches[0].str).toBe('Diff');
    expect(matches[0].boxes[0].transform[4]).toBe(10);
    expect(matches[0].boxes[1].transform[4]).toBe(32);
  });

  it('bridges three items and stops at the match end', () => {
    const matches = findMatches(glyphItems, 'differential diagnosis', 1);
    expect(matches).toHaveLength(1);
    expect(matches[0].boxes).toHaveLength(3);
  });

  it('finds multiple occurrences, non-overlapping, in order', () => {
    const repeated: SearchTextItem[] = [
      { str: 'abab', transform: [1, 0, 0, 1, 0, 0], width: 10, height: 5 },
    ];
    const matches = findMatches(repeated, 'ab', 1);
    expect(matches).toHaveLength(2);
  });

  it('matches base-letter Arabic (pre-normalized haystack contract)', () => {
    const matches = findMatches(items, ARABIC_BASE, 2);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ page: 2, str: ARABIC_BASE });
  });

  it('normalizes a query that itself carries presentation forms', () => {
    expect(findMatches(items, ARABIC_FORMS, 1)).toHaveLength(1);
  });

  it('VISUAL ORDER: finds a base-letter query in a reversed (visual) stream', () => {
    // Chromium/Word Arabic PDFs often store glyphs in visual order — both
    // characters and words reversed. 'القلبية' then appears as 'ةيبلقلا'.
    const visualHaystack: SearchTextItem[] = [
      { str: [...ARABIC_BASE].reverse().join(''), transform: [1, 0, 0, 1, 30, 100], width: 80, height: 16 },
      { str: 'ignored', transform: [1, 0, 0, 1, 120, 100], width: 40, height: 12 },
    ];
    const matches = findMatches(visualHaystack, ARABIC_BASE, 2);
    expect(matches).toHaveLength(1);
    expect(matches[0].boxes).toHaveLength(1);
    expect(matches[0].boxes[0].transform[4]).toBe(30);
  });

  it('END-TO-END: forms haystack via extraction matches a base-letter query', async () => {
    const { doc } = stubDoc('fp-e2e', [ARABIC_FORMS]);
    const extracted = await getPageSearchItems(doc, 1);
    expect(findMatches(extracted, ARABIC_BASE, 7)).toHaveLength(1);
    expect(findMatches(extracted, ARABIC_FORMS, 7)).toHaveLength(1);
  });

  it('returns nothing for an empty query', () => {
    expect(findMatches(items, '', 1)).toEqual([]);
  });

  it('returns nothing when no item contains the query', () => {
    expect(findMatches(items, 'قسطرة', 1)).toEqual([]);
  });

  it('finds every occurrence, in order', () => {
    const both = findMatches([...items, { ...items[0] }], 'diagnosis', 3);
    expect(both.map((m) => m.page)).toEqual([3, 3]);
    expect(both).toHaveLength(2);
  });
});

/* ===== Wave 12.1 — char-level slices (R12.1.a) =====
 * Matches now carry the ORIGINAL-string slice per covered item — the exact
 * domain the text-layer spans carry. The whole-item boxes pre-12.1 emitted
 * were the production "highlight covers the whole line" offset. */
describe('findMatches slices (Wave 12.1)', () => {
  it('reports the FULL original slice for a single-item match', () => {
    const matches = findMatches(items, 'differential', 1);
    expect(matches[0].boxes[0]).toMatchObject({ itemIndex: 0, sliceStart: 0, sliceEnd: 12 });
  });

  it('reports the PARTIAL original slice inside one item (the whole-line offset fix)', () => {
    // 'Differential Diagnosis — Page One' — 'diagnosis' starts at char 13, 9 chars.
    const matches = findMatches(items, 'diagnosis', 1);
    expect(matches).toHaveLength(1);
    expect(matches[0].boxes[0]).toMatchObject({ itemIndex: 0, sliceStart: 13, sliceEnd: 22 });
  });

  it('slices multi-item matches per covered item (partial first, full middle, full last)', () => {
    const matches = findMatches(glyphItems, 'differential diagnosis', 1);
    expect(matches[0].boxes).toHaveLength(3);
    expect(matches[0].boxes[0]).toMatchObject({ itemIndex: 0, sliceStart: 0, sliceEnd: 4 });
    expect(matches[0].boxes[1]).toMatchObject({ itemIndex: 1, sliceStart: 0, sliceEnd: 8 });
    expect(matches[0].boxes[2]).toMatchObject({ itemIndex: 2, sliceStart: 0, sliceEnd: 10 });
  });

  it('case-fold round-trip: İ (U+0130) expands to two lowered units — slices map back 1:1', () => {
    const istanbul: SearchTextItem[] = [
      { str: 'İstanbul', transform: [1, 0, 0, 1, 10, 20], width: 40, height: 12 },
    ];
    // 'İSTANBUL'.toLowerCase() === 'i̇stanbul' (9 lowered units vs 8 original).
    const full = findMatches(istanbul, 'İSTANBUL', 1);
    expect(full).toHaveLength(1);
    expect(full[0].boxes[0]).toMatchObject({ itemIndex: 0, sliceStart: 0, sliceEnd: 8 });
    // Partial match ending mid-haystack: 'i̇st' (4 lowered units) → the
    // original slice [0, 3) = 'İst' (the fold map walks back the expansion).
    const partial = findMatches(istanbul, '\u0069\u0307st', 1);
    expect(partial).toHaveLength(1);
    expect(partial[0].boxes[0]).toMatchObject({ itemIndex: 0, sliceStart: 0, sliceEnd: 3 });
  });

  it('caseFoldItem: identity map for Arabic (no case), explicit map for İ', () => {
    expect(caseFoldItem(ARABIC_BASE).fold).toBeNull();
    const folded = caseFoldItem('İa');
    expect(folded.lowered).toBe('\u0069\u0307a');
    expect(folded.fold).toEqual([0, 0, 1]);
  });

  it('Arabic lowercasing is identity — slices stay positional', () => {
    const matches = findMatches(items, ARABIC_BASE.slice(0, 3), 2);
    expect(matches).toHaveLength(1);
    expect(matches[0].boxes[0]).toMatchObject({ itemIndex: 1, sliceStart: 0, sliceEnd: 3 });
  });

  it('a boundary inside one expansion covers zero original chars — no phantom box', () => {
    // Query 'i' matches only the first half of the lowered İ; the original
    // slice would be empty, so the match is dropped entirely.
    const single: SearchTextItem[] = [
      { str: 'İ', transform: [1, 0, 0, 1, 10, 20], width: 8, height: 12 },
    ];
    expect(findMatches(single, 'i', 1)).toEqual([]);
  });
});

/** Minimal PDFDocumentProxy stub for the extraction cache. The page stub
 *  carries the R30.1 scale-1 viewport (the box-mapping authority). */
function stubDoc(fingerprint: string, payload: SearchTextItem['str'][]) {
  const getTextContent = vi.fn(async () => ({
    styles: {},
    items: payload.map((str) => ({ str, dir: 'ltr', width: 100, height: 10, transform: [1, 0, 0, 1, 10, 20], fontName: 'g_d0', hasEOL: false })),
  }));
  const getViewport = vi.fn(() => ({
    width: 595.92,
    height: 842.88,
    transform: [1, 0, 0, -1, 0, 842.88],
  }));
  const doc = {
    fingerprints: [fingerprint, null],
    numPages: payload.length,
    getPage: vi.fn(async () => ({ getTextContent, getViewport })),
  } as unknown as PDFDocumentProxy;
  return { doc, getTextContent, getViewport, getPage: (doc as unknown as { getPage: ReturnType<typeof vi.fn> }).getPage };
}

describe('getPageSearchItems', () => {
  beforeEach(() => {
    clearSearchCache();
  });

  it('extracts, filters whitespace-only items, and normalizes Arabic', async () => {
    const { doc } = stubDoc('fp-a', ['Differential', ARABIC_FORMS, '   ']);
    const extracted = await getPageSearchItems(doc, 1);
    expect(extracted).toHaveLength(2);
    expect(extracted[0].str).toBe('Differential');
    expect(extracted[1].str).toBe(ARABIC_BASE); // forms fold to base letters
  });

  it('caches per fingerprint+page (one extraction, then warm)', async () => {
    const { doc, getTextContent, getPage } = stubDoc('fp-a', ['Differential']);
    await getPageSearchItems(doc, 1);
    await getPageSearchItems(doc, 1);
    await getPageSearchItems(doc, 1);
    expect(getTextContent).toHaveBeenCalledTimes(1);
    expect(getPage).toHaveBeenCalledTimes(1);
  });

  it('does not share cache entries across different documents', async () => {
    const a = stubDoc('fp-a', ['Differential']);
    const b = stubDoc('fp-b', ['Cardiology']);
    await getPageSearchItems(a.doc, 1);
    await getPageSearchItems(b.doc, 1);
    expect(a.getTextContent).toHaveBeenCalledTimes(1);
    expect(b.getTextContent).toHaveBeenCalledTimes(1);
    // Re-extracting doc A's page 1 does NOT return doc B's items.
    expect((await getPageSearchItems(a.doc, 1))[0].str).toBe('Differential');
  });

  it('caches per page number', async () => {
    const { doc, getPage } = stubDoc('fp-a', ['one', 'two', 'three']);
    await getPageSearchItems(doc, 1);
    await getPageSearchItems(doc, 2);
    expect(getPage).toHaveBeenCalledTimes(2);
  });
});

/* ===== R30.1 — viewport-authoritative box mapping (textBoxToNormalizedViewportBox) =====
 * Values below are REAL items dumped from the e2e fixture
 * (public/e2e-test-doc.pdf, Chromium print, page 1: 595.92 × 842.88,
 * viewport.transform = [1, 0, 0, -1, 0, 842.88]) — the exact document class
 * behind the production "highlights shifted right and down" report. */
describe('textBoxToNormalizedViewportBox (R30.1)', () => {
  const VT = [1, 0, 0, -1, 0, 842.88];
  const VW = 595.92;
  const VH = 842.88;

  it('maps a REAL fixture item to the true normalized glyph box (y-flip + baseline lift)', () => {
    // Arabic glyph "ﻲ" — pdf.js reports the USER-space baseline origin
    // (57.75, 757.38) y-UP; the canvas is y-DOWN.
    const box = textBoxToNormalizedViewportBox(
      { transform: [21, 0, 0, 21, 57.75, 757.38], width: 21.25, height: 21 },
      VT, VW, VH,
    );
    expect(box).not.toBeNull();
    expect(box!.left).toBeCloseTo(57.75 / 595.92, 5);
    // 85.5 (viewport-space baseline) − 21 (fontHeight) = 64.5 — NOT the old
    // math's (757.38 − 21) = 736.38, which painted near the page bottom.
    expect(box!.top).toBeCloseTo(64.5 / 842.88, 5);
    expect(box!.width).toBeCloseTo(21.25 / 595.92, 5);
    expect(box!.height).toBeCloseTo(21 / 842.88, 5);
    // Explicit regression guard: the pre-R30.1 formula.
    expect(box!.top).not.toBeCloseTo((757.38 - 21) / 842.88, 3);
  });

  it('RTL visual-order run: dir === "rtl" items keep their LEFT-edge origins (no flip)', () => {
    // Fixture rows 1–2 of the word "التفريقي": dir:"rtl" glyphs still advance
    // in +x from the visual LEFT edge (e: 57.75 → 79). A dir-based right-edge
    // flip would misalign exactly these production documents.
    const first = textBoxToNormalizedViewportBox(
      { transform: [21, 0, 0, 21, 57.75, 757.38], width: 21.25, height: 21 }, VT, VW, VH,
    )!;
    const second = textBoxToNormalizedViewportBox(
      { transform: [21, 0, 0, 21, 79, 757.38], width: 15.11, height: 21 }, VT, VW, VH,
    )!;
    expect(second.left).toBeGreaterThan(first.left);
    expect(second.top).toBeCloseTo(first.top, 6);
  });

  it('mirrored run (transform[0] < 0): origin at the visual RIGHT edge folds out via min/max', () => {
    // t[0] = −12: the run extends LEFT from the origin. width stays 60.
    const box = textBoxToNormalizedViewportBox(
      { transform: [-12, 0, 0, 12, 400, 700], width: 60, height: 12 },
      VT, VW, VH,
    )!;
    expect(box.left).toBeCloseTo(340 / 595.92, 5);
    expect(box.width).toBeCloseTo(60 / 595.92, 5);
    expect(box.top).toBeCloseTo((842.88 - 700 - 12) / 842.88, 5);
    expect(box.height).toBeCloseTo(12 / 842.88, 5);
  });

  it('rotation 90 viewport: run + glyph body land through Util.transform', () => {
    // pdf.js-style 90° rotation matrix: user (x, y) → viewport (y, x).
    const box = textBoxToNormalizedViewportBox(
      { transform: [12, 0, 0, 12, 100, 200], width: 36, height: 12 },
      [0, 1, 1, 0, 0, 0], 595.92, 842.88,
    )!;
    // Baseline origin → (200, 100); run end (136, 200) → (200, 136);
    // fontHeight 12 lifts +x (sin 90° = 1). Bounding box: x 200..212, y 100..136.
    expect(box.left).toBeCloseTo(200 / 595.92, 5);
    expect(box.top).toBeCloseTo(100 / 842.88, 5);
    expect(box.width).toBeCloseTo(12 / 595.92, 5);
    expect(box.height).toBeCloseTo(36 / 842.88, 5);
  });

  it('returns null for degenerate inputs (zero viewport, short matrix, zero glyph height)', () => {
    const item = { transform: [21, 0, 0, 21, 10, 10], width: 20, height: 21 };
    expect(textBoxToNormalizedViewportBox(item, VT, 0, VH)).toBeNull();
    expect(textBoxToNormalizedViewportBox(item, VT, VW, 0)).toBeNull();
    expect(textBoxToNormalizedViewportBox({ ...item, transform: [21, 0, 0, 21] }, VT, VW, VH)).toBeNull();
    expect(textBoxToNormalizedViewportBox({ ...item, transform: [0, 0, 0, 0, 10, 10] }, VT, VW, VH)).toBeNull();
  });

  it('keeps every mapped box inside [0, 1] for a full fixture page', () => {
    const pageItems = [
      { transform: [21, 0, 0, 21, 57.75, 757.38], width: 21.25, height: 21 },
      { transform: [14, 0, 0, 14, 50, 500], width: 200, height: 14 },
      { transform: [14, 0, 0, 14, 460.92, 60], width: 90, height: 14 },
    ];
    for (const item of pageItems) {
      const box = textBoxToNormalizedViewportBox(item, VT, VW, VH)!;
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.left + box.width).toBeLessThanOrEqual(1);
      expect(box.top + box.height).toBeLessThanOrEqual(1);
    }
  });
});

/* ===== Wave 12.1 — proportional slice fallback (R12.1.c) =====
 * For pages whose text layer is not built, the box advances the run
 * proportionally (item.width × slice fractions along the run direction)
 * before corner folding — supervisor-locked formula. */
describe('textBoxToNormalizedViewportBox slice fallback (Wave 12.1)', () => {
  const IDENTITY = [1, 0, 0, 1, 0, 0];
  const item = { transform: [2, 0, 0, 2, 100, 700], width: 100, height: 10 };

  it('advances the run proportionally along the run direction', () => {
    const box = textBoxToNormalizedViewportBox(item, IDENTITY, 1000, 1000, { startFraction: 0.25, endFraction: 0.75 })!;
    // fontHeight 2 (tx[2], tx[3] = 0, 2); run x 125 → 175; glyph body 700 → 702.
    expect(box.left).toBeCloseTo(0.125, 6);
    expect(box.width).toBeCloseTo(0.05, 6);
    expect(box.top).toBeCloseTo(0.7, 6);
    expect(box.height).toBeCloseTo(0.002, 6);
  });

  it('clamps inverted / out-of-range fractions (degenerate slice collapses safely)', () => {
    const box = textBoxToNormalizedViewportBox(item, IDENTITY, 1000, 1000, { startFraction: 0.9, endFraction: -2 })!;
    expect(box.left).toBeCloseTo(0.19, 6);
    expect(box.width).toBeCloseTo(0, 6);
    expect(box.top).toBeCloseTo(0.7, 6);
  });

  it('mirrored run: the slice advances in the RUN direction (visual right → left)', () => {
    // t[0] = −2: the run extends LEFT from the origin; slice 0→0.5 covers
    // the FIRST half of the string, i.e. the visual RIGHT half of the run.
    const mirrored = { transform: [-2, 0, 0, 2, 400, 700], width: 100, height: 10 };
    const box = textBoxToNormalizedViewportBox(mirrored, IDENTITY, 1000, 1000, { startFraction: 0, endFraction: 0.5 })!;
    expect(box.left).toBeCloseTo(0.35, 6); // x 350 → 400
    expect(box.width).toBeCloseTo(0.05, 6);
  });

  it('without a slice the box is the FULL item (R30.1 behavior unchanged)', () => {
    const box = textBoxToNormalizedViewportBox(item, IDENTITY, 1000, 1000)!;
    expect(box.left).toBeCloseTo(0.1, 6);
    expect(box.width).toBeCloseTo(0.1, 6);
    expect(box.top).toBeCloseTo(0.7, 6);
    expect(box.height).toBeCloseTo(0.002, 6);
  });
});

describe('getCachedPageSearchViewport (R30.1)', () => {
  beforeEach(() => {
    clearSearchCache();
  });

  it('exposes the scale-1 viewport of an already-extracted page', async () => {
    const { doc, getViewport } = stubDoc('fp-vp', ['Differential']);
    expect(getCachedPageSearchViewport(doc, 1)).toBeNull(); // not swept yet
    await getPageSearchItems(doc, 1);
    const viewport = getCachedPageSearchViewport(doc, 1);
    expect(viewport).not.toBeNull();
    expect(viewport!.width).toBe(595.92);
    expect(viewport!.height).toBe(842.88);
    expect(viewport!.transform).toEqual([1, 0, 0, -1, 0, 842.88]);
    expect(getViewport).toHaveBeenCalledTimes(1);
  });

  it('stays null for unknown pages/documents', async () => {
    const { doc } = stubDoc('fp-vp2', ['one']);
    await getPageSearchItems(doc, 1);
    expect(getCachedPageSearchViewport(doc, 2)).toBeNull();
    const other = stubDoc('fp-vp3', ['one']).doc;
    expect(getCachedPageSearchViewport(other, 1)).toBeNull();
  });
});
