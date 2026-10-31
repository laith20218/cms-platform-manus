import { describe, expect, it, vi, beforeEach } from 'vitest';
import { clearSearchCache, findMatches, getPageSearchItems, type SearchTextItem } from '../pdf-search';
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

/** Minimal PDFDocumentProxy stub for the extraction cache. */
function stubDoc(fingerprint: string, payload: SearchTextItem['str'][]) {
  const getTextContent = vi.fn(async () => ({
    styles: {},
    items: payload.map((str) => ({ str, dir: 'ltr', width: 100, height: 10, transform: [1, 0, 0, 1, 10, 20], fontName: 'g_d0', hasEOL: false })),
  }));
  const doc = {
    fingerprints: [fingerprint, null],
    numPages: payload.length,
    getPage: vi.fn(async () => ({ getTextContent })),
  } as unknown as PDFDocumentProxy;
  return { doc, getTextContent, getPage: (doc as unknown as { getPage: ReturnType<typeof vi.fn> }).getPage };
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
