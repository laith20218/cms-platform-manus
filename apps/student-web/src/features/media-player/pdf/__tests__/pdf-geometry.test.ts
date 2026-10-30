import { describe, expect, it } from 'vitest';
import { clamp01, newAnnotationId, rectsFromRange, resolveInkStrokeWidth, simplifyPoints, strokePathD } from '../pdf-geometry';
import type { NormalizedPoint } from '../pdf-types';

/** Wave 11.8 / F2 — geometry helpers: stroke smoothing/simplification and
 *  selection-rect normalization are the persistence-critical math (bad math
 *  here corrupts every saved annotation), so they get direct falsification. */

function makePageRect(): DOMRect {
  return {
    left: 100, top: 200, width: 500, height: 800,
    right: 600, bottom: 1000, x: 100, y: 200, toJSON: () => ({}),
  } as DOMRect;
}

function fakeRange(rects: Array<{ left: number; top: number; width: number; height: number }>): Range {
  return {
    getClientRects: () => rects.map((r) => ({ ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top, toJSON: () => ({}) })) as unknown as DOMRectList,
  } as unknown as Range;
}

describe('strokePathD', () => {
  it('returns empty for zero points', () => {
    expect(strokePathD([])).toBe('');
  });

  it('renders a single point as a tiny dot segment (taps leave a mark)', () => {
    const d = strokePathD([{ x: 0.5, y: 0.5 }]);
    expect(d).toMatch(/^M 0\.5 0\.5 L/);
  });

  it('builds a quadratic-midpoint curve for multi-point strokes', () => {
    const points: NormalizedPoint[] = [
      { x: 0, y: 0 }, { x: 0.1, y: 0.2 }, { x: 0.2, y: 0.4 }, { x: 0.3, y: 0.6 },
    ];
    const d = strokePathD(points);
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d).toContain('Q 0.1 0.2');
    expect(d.endsWith('L 0.3 0.6')).toBe(true);
  });
});

describe('simplifyPoints', () => {
  it('keeps short strokes intact', () => {
    const points = [{ x: 0, y: 0 }, { x: 0.01, y: 0.01 }];
    expect(simplifyPoints(points)).toEqual(points);
  });

  it('collapses collinear jitter to the skeleton', () => {
    const points: NormalizedPoint[] = [];
    for (let i = 0; i <= 100; i += 1) {
      // A straight line with sub-tolerance jitter.
      points.push({ x: i / 100, y: 0.5 + (i % 2 === 0 ? 0.0001 : -0.0001) });
    }
    const simplified = simplifyPoints(points, 0.0015);
    expect(simplified.length).toBeLessThan(10);
    const first = simplified[0];
    const last = simplified[simplified.length - 1];
    expect(first.x).toBeCloseTo(0, 5);
    expect(last.x).toBeCloseTo(1, 5);
    expect(first.y).toBeCloseTo(0.5, 2);
    expect(last.y).toBeCloseTo(0.5, 2);
  });

  it('preserves genuine corners (above tolerance)', () => {
    const points: NormalizedPoint[] = [
      { x: 0, y: 0 }, { x: 0.05, y: 0.05 }, { x: 0.1, y: 0.5 }, { x: 0.15, y: 0.55 },
    ];
    const simplified = simplifyPoints(points, 0.0015);
    expect(simplified.some((p) => p.x === 0.1 && p.y === 0.5)).toBe(true);
  });
});

describe('rectsFromRange', () => {
  const pageRect = makePageRect();

  it('normalizes client rects into page space (0..1)', () => {
    // A rect at page-relative (50px, 80px) of a 500x800 page.
    const range = fakeRange([{ left: 150, top: 280, width: 200, height: 16 }]);
    const rects = rectsFromRange(range, pageRect);
    expect(rects).toHaveLength(1);
    expect(rects[0].x).toBeCloseTo(0.1, 5);
    expect(rects[0].y).toBeCloseTo(0.1, 5);
    expect(rects[0].w).toBeCloseTo(0.4, 5);
    expect(rects[0].h).toBeCloseTo(0.02, 5);
  });

  it('filters rects that belong to a different page (cross-page selection)', () => {
    const range = fakeRange([
      { left: 150, top: 280, width: 200, height: 16 },      // inside this page
      { left: 150, top: 5000, width: 200, height: 16 },     // far below → other page
    ]);
    const rects = rectsFromRange(range, pageRect);
    expect(rects).toHaveLength(1);
  });

  it('hotfix R15.2: keeps a rect straddling the page edge (center inside)', () => {
    // Line box poking 10px above the page top — center is still inside.
    const range = fakeRange([{ left: 150, top: 195, width: 200, height: 16 }]);
    expect(rectsFromRange(range, pageRect)).toHaveLength(1);
  });

  it('hotfix R15.2: rejects rects fully outside the page even when clamping would admit them', () => {
    // Entirely right of the page: clamp01 used to fold this into a sliver
    // at x≈1; the center rule rejects it outright.
    const range = fakeRange([{ left: 700, top: 280, width: 200, height: 16 }]);
    expect(rectsFromRange(range, pageRect)).toHaveLength(0);
  });

  it('filters degenerate zero-size rects', () => {
    const range = fakeRange([{ left: 150, top: 280, width: 0, height: 0 }]);
    expect(rectsFromRange(range, pageRect)).toHaveLength(0);
  });

  it('hotfix R16.2: yields no rects for a degenerate (not-yet-laid-out) surface', () => {
    const range = fakeRange([{ left: 150, top: 280, width: 200, height: 16 }]);
    const empty = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    expect(rectsFromRange(range, empty)).toHaveLength(0);
  });
});

describe('resolveInkStrokeWidth — hotfix R16.4 (page-relative fractions, never raw px)', () => {
  it('passes modern fraction payloads through unchanged', () => {
    // 2.5px pen on an ~800px page — the exact value commitInk stores.
    expect(resolveInkStrokeWidth(2.5 / 800, 800)).toBeCloseTo(0.003125, 9);
  });

  it('recovers legacy raw-pixel payloads by dividing by the page width', () => {
    // A pre-R15.3 payload that stored 2.5 RAW px must render 2.5px — i.e.
    // 2.5/800 user units against the unit viewBox — never 2.5 units.
    expect(resolveInkStrokeWidth(2.5, 800)).toBeCloseTo(2.5 / 800, 9);
  });

  it('neutralizes corrupt giant payloads (the 2000px black circle)', () => {
    expect(resolveInkStrokeWidth(2000, 800)).toBeLessThanOrEqual(0.1);
    expect(resolveInkStrokeWidth(2.5, 800)).toBeLessThan(0.01);
  });

  it('rejects non-finite, zero and negative widths', () => {
    expect(resolveInkStrokeWidth(Number.NaN, 800)).toBe(0);
    expect(resolveInkStrokeWidth(0, 800)).toBe(0);
    expect(resolveInkStrokeWidth(-3, 800)).toBe(0);
  });

  it('degrades safely when the live page width is unavailable', () => {
    // cssWidth ≤ 0 falls back to 1, and the ceiling clamp keeps a legacy px
    // payload at ≤ 10% of the page — never a full-page stroke.
    expect(resolveInkStrokeWidth(2.5, 0)).toBeLessThanOrEqual(0.1);
  });
});

describe('helpers', () => {
  it('clamp01 clamps both sides', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(1.5)).toBe(1);
  });

  it('newAnnotationId produces unique ids', () => {
    const a = newAnnotationId();
    const b = newAnnotationId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(8);
  });
});
