import { describe, expect, it } from 'vitest';
import {
  collectEraserHitIds,
  densifyPath,
  eraserHitTest,
  NOTE_ICON_RADIUS_PX,
  perpendicularDistance,
} from '../pdf-geometry';
import type { HighlightPayload, InkPayload, NotePayload, PdfAnnotation, ShapePayload } from '../pdf-types';

/** Wave 11.11 — smart-eraser falsification: whole-annotation erase covers Ink
 *  + Shapes + Notes (highlights locked OUT of scope). The gesture path is
 *  densified before the per-point tests, so thin geometry can't be tunneled
 *  through, and legacy negative-w/h shape payloads must behave like the
 *  R25-corrected selection path. */

const SHAPE_STROKE = 0.004;

const inkStroke = (points: InkPayload['points'], width = 0.003): InkPayload => ({ points, color: '#111827', width });

const rectShape = (x: number, y: number, w: number, h: number): ShapePayload =>
  ({ shape: 'rect', x, y, w, h, color: '#dc2626', strokeWidth: SHAPE_STROKE });

const ellipseShape = (x: number, y: number, w: number, h: number): ShapePayload =>
  ({ shape: 'ellipse', x, y, w, h, color: '#dc2626', strokeWidth: SHAPE_STROKE });

const starShape = (x: number, y: number, w: number, h: number): ShapePayload =>
  ({ shape: 'star', x, y, w, h, color: '#dc2626', strokeWidth: SHAPE_STROKE });

const arrowShape = (x1: number, y1: number, x2: number, y2: number): ShapePayload =>
  ({ shape: 'arrow', x: x1, y: y1, x1, y1, x2, y2, color: '#dc2626', strokeWidth: SHAPE_STROKE });

const noteAt = (x: number, y: number): NotePayload => ({ x, y, text: 'ملاحظة', color: '#fde047' });

const highlightPayload: HighlightPayload = { rects: [{ x: 0.1, y: 0.1, w: 0.3, h: 0.03 }], color: '#fde047' };

const ann = (id: string, payload: PdfAnnotation['payload']): PdfAnnotation =>
  ({ id, pageNumber: 1, annotationType: 'Ink', payload } as PdfAnnotation);

describe('perpendicularDistance (now exported for the eraser)', () => {
  it('measures the true segment distance, not the infinite-line distance', () => {
    // Point beyond the segment end: distance to the ENDPOINT, not the line.
    expect(perpendicularDistance({ x: 0.9, y: 0.5 }, { x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 })).toBeCloseTo(0.4, 12);
    // Perpendicular foot inside the segment.
    expect(perpendicularDistance({ x: 0.3, y: 0.6 }, { x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 })).toBeCloseTo(0.1, 12);
    // Degenerate segment behaves as a point.
    expect(perpendicularDistance({ x: 0.3, y: 0.6 }, { x: 0.3, y: 0.5 }, { x: 0.3, y: 0.5 })).toBeCloseTo(0.1, 12);
  });
});

describe('densifyPath', () => {
  it('keeps endpoints and caps the step length', () => {
    const dense = densifyPath([{ x: 0, y: 0 }, { x: 0.1, y: 0 }], 0.02);
    expect(dense[0]).toEqual({ x: 0, y: 0 });
    expect(dense[dense.length - 1]).toEqual({ x: 0.1, y: 0 });
    for (let i = 1; i < dense.length; i += 1) {
      expect(Math.hypot(dense[i].x - dense[i - 1].x, dense[i].y - dense[i - 1].y)).toBeLessThanOrEqual(0.02 + 1e-12);
    }
    // 0.1 / 0.02 = 5 exact steps.
    expect(dense).toHaveLength(6);
  });

  it('returns a copy untouched for a non-positive step', () => {
    const points = [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }];
    const out = densifyPath(points, 0);
    expect(out).toEqual(points);
    expect(out).not.toBe(points);
  });

  it('returns empty for an empty path', () => {
    expect(densifyPath([], 0.01)).toEqual([]);
  });
});

describe('eraserHitTest — Ink', () => {
  const stroke = inkStroke([{ x: 0.1, y: 0.5 }, { x: 0.3, y: 0.5 }, { x: 0.5, y: 0.5 }]);

  it('hits the stroke body within the radius', () => {
    expect(eraserHitTest(stroke, 0.2, 0.5, 0.01)).toBe(true);
    expect(eraserHitTest(stroke, 0.2, 0.508, 0.01)).toBe(true);
  });

  it('misses clear space', () => {
    expect(eraserHitTest(stroke, 0.2, 0.6, 0.01)).toBe(false);
    expect(eraserHitTest(stroke, 0.7, 0.5, 0.01)).toBe(false);
  });

  it('honors the segment distance at the stroke ends', () => {
    // Just past the endpoint: within a generous radius, outside a tight one.
    expect(eraserHitTest(stroke, 0.505, 0.5, 0.01)).toBe(true);
    expect(eraserHitTest(stroke, 0.52, 0.5, 0.01)).toBe(false);
  });

  it('bbox prefilter never rejects an in-radius point', () => {
    // Exactly on the boundary + radius must still hit (pad includes radius).
    expect(eraserHitTest(stroke, 0.5 + 0.0135, 0.5, 0.01)).toBe(false);
    expect(eraserHitTest(stroke, 0.5 + 0.0115, 0.5, 0.01)).toBe(true);
  });

  it('single-point dot strokes hit like a point', () => {
    const dot = inkStroke([{ x: 0.4, y: 0.4 }]);
    expect(eraserHitTest(dot, 0.405, 0.4, 0.01)).toBe(true);
    expect(eraserHitTest(dot, 0.45, 0.4, 0.01)).toBe(false);
  });
});

describe('eraserHitTest — Shapes', () => {
  it('rect: hits the outline, not the interior', () => {
    const rect = rectShape(0.2, 0.2, 0.4, 0.3);
    expect(eraserHitTest(rect, 0.2, 0.35, 0.01)).toBe(true); // left edge
    expect(eraserHitTest(rect, 0.4, 0.2, 0.01)).toBe(true); // top edge
    expect(eraserHitTest(rect, 0.4, 0.35, 0.01)).toBe(false); // interior
  });

  it('rect: legacy negative-w/h payloads behave like the positive box (R25 parity)', () => {
    const legacy = rectShape(0.6, 0.5, -0.4, -0.3);
    expect(eraserHitTest(legacy, 0.2, 0.35, 0.01)).toBe(true);
    expect(eraserHitTest(legacy, 0.4, 0.35, 0.01)).toBe(false);
  });

  it('ellipse: outline contact only', () => {
    const ellipse = ellipseShape(0.2, 0.2, 0.4, 0.3); // center (0.4, 0.35), rx 0.2, ry 0.15
    expect(eraserHitTest(ellipse, 0.6, 0.35, 0.01)).toBe(true); // right vertex
    expect(eraserHitTest(ellipse, 0.4, 0.35, 0.01)).toBe(false); // center
    expect(eraserHitTest(ellipse, 0.4 + 0.208, 0.35, 0.01)).toBe(true); // just outside + radius
  });

  it('star: vertex contact hits, center misses', () => {
    const star = starShape(0.2, 0.2, 0.4, 0.4); // top outer vertex at (0.4, 0.2)
    expect(eraserHitTest(star, 0.4, 0.2, 0.01)).toBe(true);
    expect(eraserHitTest(star, 0.4, 0.4, 0.01)).toBe(false);
    expect(eraserHitTest(star, 0.9, 0.9, 0.01)).toBe(false);
  });

  it('arrow: shaft and reversed-endpoint payloads both hit', () => {
    expect(eraserHitTest(arrowShape(0.1, 0.5, 0.5, 0.5), 0.3, 0.5, 0.01)).toBe(true);
    expect(eraserHitTest(arrowShape(0.5, 0.5, 0.1, 0.5), 0.3, 0.5, 0.01)).toBe(true);
    // Lateral miss beyond contact + half stroke width.
    expect(eraserHitTest(arrowShape(0.1, 0.5, 0.5, 0.5), 0.3, 0.56, 0.01)).toBe(false);
  });

  it('arrow: incomplete endpoints never hit', () => {
    const broken: ShapePayload = { shape: 'arrow', x: 0.1, y: 0.1, color: '#000', strokeWidth: SHAPE_STROKE };
    expect(eraserHitTest(broken, 0.1, 0.1, 0.01)).toBe(false);
  });

  it('box shapes without w/h never hit', () => {
    const broken: ShapePayload = { shape: 'rect', x: 0.1, y: 0.1, color: '#000', strokeWidth: SHAPE_STROKE };
    expect(eraserHitTest(broken, 0.1, 0.1, 0.01)).toBe(false);
  });

  it('zero radius never hits anything', () => {
    expect(eraserHitTest(rectShape(0.2, 0.2, 0.4, 0.3), 0.2, 0.35, 0)).toBe(false);
  });
});

describe('eraserHitTest — Notes and Highlights', () => {
  it('note: anchor + fixed-px icon radius (normalized via pageWidthPx)', () => {
    const note = noteAt(0.5, 0.5);
    const pageWidthPx = 800;
    const iconPad = NOTE_ICON_RADIUS_PX / pageWidthPx; // 0.0225
    expect(eraserHitTest(note, 0.5, 0.5, 0.01, pageWidthPx)).toBe(true);
    expect(eraserHitTest(note, 0.5 + iconPad, 0.5, 0.01, pageWidthPx)).toBe(true);
    expect(eraserHitTest(note, 0.5 + iconPad + 0.02, 0.5, 0.01, pageWidthPx)).toBe(false);
  });

  it('note: without pageWidthPx only the raw radius applies', () => {
    const note = noteAt(0.5, 0.5);
    expect(eraserHitTest(note, 0.52, 0.5, 0.01)).toBe(false);
    expect(eraserHitTest(note, 0.508, 0.5, 0.01)).toBe(true);
  });

  it('highlights are NEVER erased (locked scope)', () => {
    expect(eraserHitTest(highlightPayload, 0.25, 0.115, 0.05)).toBe(false);
  });
});

describe('collectEraserHitIds', () => {
  const annotations: PdfAnnotation[] = [
    ann('ink-1', inkStroke([{ x: 0.1, y: 0.5 }, { x: 0.3, y: 0.5 }])),
    ann('rect-1', rectShape(0.2, 0.2, 0.4, 0.3)),
    ann('note-1', noteAt(0.8, 0.8)),
    ann('hl-1', highlightPayload),
  ];

  it('collects only touched annotations, without duplicates, in order', () => {
    // One gesture sweeping through the ink stroke and the rect's left edge.
    const path = [{ x: 0.05, y: 0.5 }, { x: 0.35, y: 0.5 }, { x: 0.2, y: 0.2 }];
    const ids = collectEraserHitIds(annotations, path, 0.01, 800);
    expect(ids).toContain('ink-1');
    expect(ids).toContain('rect-1');
    expect(ids).not.toContain('note-1');
    expect(ids).not.toContain('hl-1');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('densification tunnels through nothing: two far samples still catch the stroke', () => {
    // Raw samples straddle the stroke (y 0.4 → 0.6) far from it; only the
    // interpolated midpoints come near y=0.5.
    const ids = collectEraserHitIds(annotations, [{ x: 0.2, y: 0.4 }, { x: 0.2, y: 0.6 }], 0.01, 800);
    expect(ids).toContain('ink-1');
  });

  it('empty gesture erases nothing', () => {
    expect(collectEraserHitIds(annotations, [], 0.01, 800)).toEqual([]);
  });

  it('zero radius erases nothing', () => {
    expect(collectEraserHitIds(annotations, [{ x: 0.2, y: 0.5 }], 0, 800)).toEqual([]);
  });
});
