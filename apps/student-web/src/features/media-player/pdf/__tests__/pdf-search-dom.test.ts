import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSearchSpanMap, resolveSearchMatchRects, type SearchResolveContext } from '../pdf-search-dom';
import type { SearchMatch, SearchMatchBox } from '../pdf-search';

/**
 * Wave 12.1 — DOM-resolver falsification WITHOUT a layout engine.
 *
 * jsdom implements Range boundary points (setStart/setEnd, startContainer,
 * startOffset) but has no layout, so getClientRects carries no geometry. The
 * suite stubs Range.prototype.getClientRects with a per-span geometry table
 * — interpolating the range's intra-span offsets linearly — and then lets
 * the REAL rectsFromRange (pdf-geometry.ts) run end-to-end, exactly the
 * production pipeline. Stubbing browser APIs in this suite is established
 * practice (IO stub precedent: pdf-font-face.test.tsx:63-73).
 */

interface FakeRect {
  left: number; top: number; right: number; bottom: number; width: number; height: number;
}

const spanGeometry = new Map<HTMLElement, { left: number; top: number; width: number; height: number }>();
const originalGetClientRects = Range.prototype.getClientRects;

beforeEach(() => {
  spanGeometry.clear();
  Range.prototype.getClientRects = function (this: Range): DOMRectList {
    const rects: FakeRect[] = [];
    const startSpan = (this.startContainer as Text).parentElement;
    const endSpan = (this.endContainer as Text).parentElement;
    const layer = startSpan?.closest('.pdf-text-layer');
    if (startSpan && endSpan && layer && layer.contains(endSpan)) {
      const ordered = leafSpans(layer as HTMLElement);
      const from = ordered.indexOf(startSpan);
      const to = ordered.indexOf(endSpan);
      if (from !== -1 && to !== -1) {
        for (let i = Math.min(from, to); i <= Math.max(from, to); i += 1) {
          const span = ordered[i];
          const geo = spanGeometry.get(span);
          const length = span.textContent?.length ?? 0;
          if (!geo || length === 0) continue;
          const a = span === startSpan ? this.startOffset : 0;
          const b = span === endSpan ? this.endOffset : length;
          if (b <= a) continue;
          const left = geo.left + geo.width * (a / length);
          const width = geo.width * ((b - a) / length);
          rects.push({ left, top: geo.top, right: left + width, bottom: geo.top + geo.height, width, height: geo.height });
        }
      }
    }
    const list = { length: rects.length, item: (index: number) => rects[index] ?? null } as unknown as DOMRectList;
    rects.forEach((rect, index) => { (list as unknown as FakeRect[])[index] = rect; });
    return list;
  };
});

afterEach(() => {
  Range.prototype.getClientRects = originalGetClientRects;
});

/** Sequential line geometry: span i sits at x 100·i, y 40·i, 80×20 on a 400×400 page. */
function placeGeometry(span: HTMLElement, index: number): void {
  spanGeometry.set(span, { left: 100 * index, top: 40 * index, width: 80, height: 20 });
}

/** Builds a text-layer-like container; `wrapped` emulates pdf.js markedContent. */
function buildLayer(texts: string[], wrappedIndexes: ReadonlyArray<number> = []): { layer: HTMLDivElement; spans: HTMLElement[] } {
  const layer = document.createElement('div');
  layer.className = 'pdf-text-layer';
  const spans: HTMLElement[] = [];
  texts.forEach((text, index) => {
    const span = document.createElement('span');
    span.textContent = text;
    placeGeometry(span, index);
    if (wrappedIndexes.includes(index)) {
      const wrapper = document.createElement('span');
      wrapper.className = 'markedContent';
      wrapper.appendChild(span);
      layer.appendChild(wrapper);
    } else {
      layer.appendChild(span);
    }
    spans.push(span);
  });
  document.body.appendChild(layer);
  return { layer, spans };
}

function leafSpans(layer: HTMLElement): HTMLElement[] {
  const leaves: HTMLElement[] = [];
  const spans = layer.getElementsByTagName('span');
  for (let i = 0; i < spans.length; i += 1) {
    if (!spans[i].querySelector('span')) leaves.push(spans[i]);
  }
  return leaves;
}

/** The extraction contract: filtered items are the non-whitespace raws, in order. */
function resolveContext(rawItemStrings: readonly string[]): SearchResolveContext {
  const rawIndexOfItem: number[] = [];
  rawItemStrings.forEach((str, rawIndex) => {
    if (str.trim().length > 0) rawIndexOfItem.push(rawIndex);
  });
  return { rawItemStrings, rawIndexOfItem };
}

function matchOf(boxes: Array<Pick<SearchMatchBox, 'itemIndex' | 'sliceStart' | 'sliceEnd'>>): SearchMatch {
  return {
    page: 1,
    str: 'x',
    boxes: boxes.map((box) => ({ ...box, transform: [1, 0, 0, 1, 0, 0], width: 0, height: 0 })),
  };
}

function pageRect(): DOMRect {
  return { left: 0, top: 0, right: 400, bottom: 400, width: 400, height: 400, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
}

describe('createSearchSpanMap (Wave 12.1)', () => {
  it('pins filtered items to their spans through the raw axis', () => {
    const { layer } = buildLayer(['Diff', ' ', 'erential']);
    const map = createSearchSpanMap(layer, resolveContext(['Diff', ' ', 'erential']));
    expect(map.mismatchedSpans).toBe(0);
    expect(map.verifiedSpans).toBe(3);
    expect(map.spanForItem).toHaveLength(2); // ' ' is dropped from the search domain
    expect(map.spanForItem[0]?.textContent).toBe('Diff');
    expect(map.spanForItem[1]?.textContent).toBe('erential');
  });

  it('skips empty raw items that produce no span (pdf.mjs:21512/21568 append gate)', () => {
    const { layer } = buildLayer(['Diff']);
    const map = createSearchSpanMap(layer, resolveContext(['', 'Diff']));
    expect(map.mismatchedSpans).toBe(0);
    expect(map.verifiedSpans).toBe(1);
    expect(map.spanForItem[0]?.textContent).toBe('Diff');
  });

  it('sees through markedContent wrappers (leaf detection)', () => {
    const { layer } = buildLayer(['Diff', 'erential'], [1]);
    const map = createSearchSpanMap(layer, resolveContext(['Diff', 'erential']));
    expect(map.mismatchedSpans).toBe(0);
    expect(map.spanForItem[1]?.textContent).toBe('erential');
  });

  it('records honest mismatches instead of mis-pinning (fallback trigger)', () => {
    const { layer } = buildLayer(['Diff']);
    const map = createSearchSpanMap(layer, resolveContext(['Diffx']));
    expect(map.mismatchedSpans).toBe(1);
    expect(map.spanForItem[0]).toBeNull();
  });
});

describe('resolveSearchMatchRects (Wave 12.1)', () => {
  it('resolves a single-item PARTIAL slice to the interpolated visual rect', () => {
    const { layer, spans } = buildLayer(['Differential Diagnosis']);
    const map = createSearchSpanMap(layer, resolveContext(['Differential Diagnosis']));
    // 'Differential' = chars [0, 12) of 22 — the production whole-line offset fix.
    const rects = resolveSearchMatchRects(map.spanForItem, matchOf([{ itemIndex: 0, sliceStart: 0, sliceEnd: 12 }]), pageRect());
    expect(rects).not.toBeNull();
    expect(rects).toHaveLength(1);
    expect(rects![0].x).toBeCloseTo(0, 6);
    expect(rects![0].w).toBeCloseTo((80 * 12) / 22 / 400, 5);
    expect(rects![0].y).toBeCloseTo(0, 6);
    expect(rects![0].h).toBeCloseTo(20 / 400, 6);
    expect(spans).toHaveLength(1);
  });

  it('bridges whitespace spans across items with ONE range (3 rects)', () => {
    const { layer } = buildLayer(['Diff', ' ', 'erential']);
    const map = createSearchSpanMap(layer, resolveContext(['Diff', ' ', 'erential']));
    const rects = resolveSearchMatchRects(
      map.spanForItem,
      matchOf([{ itemIndex: 0, sliceStart: 0, sliceEnd: 4 }, { itemIndex: 1, sliceStart: 0, sliceEnd: 8 }]),
      pageRect(),
    );
    expect(rects).not.toBeNull();
    expect(rects).toHaveLength(3);
    // The LAST rect must reach span 2's right edge — the range spans the
    // intermediate whitespace span automatically.
    expect(rects![2].x).toBeCloseTo(200 / 400, 6);
    expect(rects![2].w).toBeCloseTo(80 / 400, 6);
  });

  it('normalizes against the passed canvas box, not the viewport', () => {
    const { layer } = buildLayer(['Differential Diagnosis']);
    const map = createSearchSpanMap(layer, resolveContext(['Differential Diagnosis']));
    const zoomed = { left: 10, top: 10, right: 410, bottom: 410, width: 400, height: 400, x: 10, y: 10, toJSON: () => ({}) } as DOMRect;
    const rects = resolveSearchMatchRects(map.spanForItem, matchOf([{ itemIndex: 0, sliceStart: 0, sliceEnd: 12 }]), zoomed);
    expect(rects![0].w).toBeCloseTo((80 * 12) / 22 / 400, 5);
  });

  it('a collapsed range (sliceStart === sliceEnd, one span) resolves to null', () => {
    const { layer } = buildLayer(['Differential Diagnosis']);
    const map = createSearchSpanMap(layer, resolveContext(['Differential Diagnosis']));
    const rects = resolveSearchMatchRects(map.spanForItem, matchOf([{ itemIndex: 0, sliceStart: 5, sliceEnd: 5 }]), pageRect());
    expect(rects).toBeNull();
  });

  it('an unpinnable match (unverified span) resolves to null — fallback takes over', () => {
    const { layer } = buildLayer(['Diff']);
    const map = createSearchSpanMap(layer, resolveContext(['Diffx']));
    const rects = resolveSearchMatchRects(map.spanForItem, matchOf([{ itemIndex: 0, sliceStart: 0, sliceEnd: 2 }]), pageRect());
    expect(rects).toBeNull();
  });

  it('a slice inside an expansion-mapped item lands on the mapped characters', () => {
    // 'İa' — span text is the ORIGINAL string; slice [0, 1) = 'İ' only.
    const { layer } = buildLayer(['İa']);
    const map = createSearchSpanMap(layer, resolveContext(['İa']));
    const rects = resolveSearchMatchRects(map.spanForItem, matchOf([{ itemIndex: 0, sliceStart: 0, sliceEnd: 1 }]), pageRect());
    expect(rects).not.toBeNull();
    expect(rects![0].w).toBeCloseTo((80 * 1) / 2 / 400, 6);
  });
});
