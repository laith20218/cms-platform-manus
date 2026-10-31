import { describe, expect, it } from 'vitest';
import {
  arrowHeadPoints,
  hitTestShape,
  isDegenerateArrow,
  isDegenerateBox,
  MIN_SHAPE_SIZE,
  normalizeBox,
  polygonPointsAttr,
  starPolygonPoints,
} from '../pdf-geometry';
import type { ShapePayload } from '../pdf-types';

/** Wave 11.10 — shape geometry falsification: the star/arrow math and the
 *  pointer-tool hit test are persistence/selection-critical, so they get the
 *  same direct falsification the ink helpers got in Phase 1. */

describe('normalizeBox', () => {
  it('keeps a down-right drag as-is', () => {
    const box = normalizeBox(0.1, 0.2, 0.4, 0.5);
    expect(box.x).toBeCloseTo(0.1, 12);
    expect(box.y).toBeCloseTo(0.2, 12);
    expect(box.w).toBeCloseTo(0.3, 12);
    expect(box.h).toBeCloseTo(0.3, 12);
  });

  it('flips an up-left drag into a positive top-left box', () => {
    const box = normalizeBox(0.4, 0.5, 0.1, 0.2);
    expect(box.x).toBeCloseTo(0.1, 12);
    expect(box.y).toBeCloseTo(0.2, 12);
    expect(box.w).toBeCloseTo(0.3, 12);
    expect(box.h).toBeCloseTo(0.3, 12);
  });

  it('handles mixed-direction drags independently per axis', () => {
    const box = normalizeBox(0.4, 0.2, 0.1, 0.5);
    expect(box.x).toBeCloseTo(0.1, 12);
    expect(box.y).toBeCloseTo(0.2, 12);
    expect(box.w).toBeCloseTo(0.3, 12);
    expect(box.h).toBeCloseTo(0.3, 12);
  });
});

describe('starPolygonPoints', () => {
  const box = { x: 0.2, y: 0.3, w: 0.4, h: 0.2 };

  it('emits exactly 10 vertices (5 outer + 5 inner)', () => {
    expect(starPolygonPoints(box)).toHaveLength(10);
  });

  it('starts at the TOP-CENTER of the box', () => {
    const [first] = starPolygonPoints(box);
    expect(first.x).toBeCloseTo(0.4, 10);
    expect(first.y).toBeCloseTo(0.3, 10);
  });

  it('alternates outer/inner radii around the center', () => {
    const points = starPolygonPoints(box);
    const cx = 0.4;
    const cy = 0.4;
    for (let i = 0; i < 10; i += 2) {
      const outer = Math.hypot(points[i].x - cx, points[i].y - cy);
      const inner = Math.hypot(points[i + 1].x - cx, points[i + 1].y - cy);
      expect(outer).toBeGreaterThan(inner);
    }
    // Outer vertical vertex reaches the box edge (top-center).
    expect(Math.hypot(points[0].x - cx, points[0].y - cy)).toBeCloseTo(0.1, 10);
    // Inner vertices sit on the 0.42-scaled ELLIPSE (the star fills the box,
    // so on a stretched box the inner vertex distance is aspect-scaled too).
    const rx = box.w / 2;
    const ry = box.h / 2;
    const ellipticalRadius = Math.hypot((points[1].x - cx) / rx, (points[1].y - cy) / ry);
    expect(ellipticalRadius).toBeCloseTo(0.42, 10);
  });

  it('keeps every vertex inside the drag box', () => {
    for (const p of starPolygonPoints(box)) {
      expect(p.x).toBeGreaterThanOrEqual(box.x - 1e-12);
      expect(p.x).toBeLessThanOrEqual(box.x + box.w + 1e-12);
      expect(p.y).toBeGreaterThanOrEqual(box.y - 1e-12);
      expect(p.y).toBeLessThanOrEqual(box.y + box.h + 1e-12);
    }
  });

  it('serializes to an SVG points string', () => {
    expect(polygonPointsAttr([{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }])).toBe('0.1,0.2 0.3,0.4');
  });
});

describe('arrowHeadPoints', () => {
  it('puts the TIP exactly on the arrow head point', () => {
    const [wing1, tip, wing2] = arrowHeadPoints(0.1, 0.5, 0.6, 0.5, 800, 1000);
    expect(tip).toEqual({ x: 0.6, y: 0.5 });
    // Wings are symmetric AROUND the shaft in pixel space — on a non-square
    // page their NORMALIZED y values differ; the midpoint must sit on y=0.5.
    expect((wing1.y + wing2.y) / 2).toBeCloseTo(0.5, 10);
    expect(Math.abs(wing1.y - wing2.y) * 1000).toBeCloseTo(10, 6); // ±5px
    // Wings sit BEHIND the tip along the shaft (left of it for a rightward arrow).
    expect(wing1.x).toBeLessThan(0.6);
    expect(wing2.x).toBeLessThan(0.6);
    expect(wing1.x).toBeCloseTo(wing2.x, 10); // same base x for a horizontal shaft
  });

  it('builds the head in PIXEL space so a non-square page cannot shear it', () => {
    // Horizontal arrow on a tall page: the head length must stay ~14px in x.
    const pageW = 800;
    const pageH = 1200;
    const [wing1, , wing2] = arrowHeadPoints(0.1, 0.5, 0.5, 0.5, pageW, pageH, 14, 5);
    const wingBase = ((wing1.x + wing2.x) / 2) * pageW;
    expect(0.5 * pageW - wingBase).toBeCloseTo(14, 6);
    // Wing spread must be 10px TOTAL (±5px) in pixel space.
    expect(Math.abs(wing1.y - wing2.y) * pageH).toBeCloseTo(10, 6);
  });

  it('degenerates to the tip triplet for a zero-length arrow', () => {
    const head = arrowHeadPoints(0.5, 0.5, 0.5, 0.5, 800, 1000);
    expect(head).toHaveLength(3);
    for (const p of head) expect(p).toEqual({ x: 0.5, y: 0.5 });
  });

  it('points the head along the drag direction (upward arrow)', () => {
    const [wing1, , wing2] = arrowHeadPoints(0.5, 0.8, 0.5, 0.3, 800, 1000, 14, 5);
    // Head base must be BELOW the tip (arrow points up), wings spread in x.
    expect(wing1.y).toBeGreaterThan(0.3);
    expect(wing2.y).toBeGreaterThan(0.3);
    // Wings mirror around the shaft in pixel space: midpoint on x=0.5,
    // normalized x values differ by the pixel spread (±5px on an 800px page).
    expect((wing1.x + wing2.x) / 2).toBeCloseTo(0.5, 10);
    expect(Math.abs(wing1.x - wing2.x) * 800).toBeCloseTo(10, 6);
    expect(wing1.y).toBeCloseTo(wing2.y, 10); // same base y for a vertical shaft
  });
});

describe('hitTestShape', () => {
  const rect: ShapePayload = { shape: 'rect', x: 0.2, y: 0.2, w: 0.3, h: 0.2, color: '#000', strokeWidth: 0.004 };

  it('rect: inside the padded box → true', () => {
    expect(hitTestShape(rect, 0.35, 0.3)).toBe(true);
    // Padding ring: just outside the box but within SHAPE_HIT_PAD.
    expect(hitTestShape(rect, 0.2 - 0.008, 0.3)).toBe(true);
  });

  it('rect: clearly outside → false', () => {
    expect(hitTestShape(rect, 0.7, 0.3)).toBe(false);
    expect(hitTestShape(rect, 0.35, 0.7)).toBe(false);
  });

  const ellipse: ShapePayload = { shape: 'ellipse', x: 0.2, y: 0.3, w: 0.4, h: 0.2, color: '#000', strokeWidth: 0.004 };

  it('ellipse: center inside, corner outside (ellipse equation, not bbox)', () => {
    expect(hitTestShape(ellipse, 0.4, 0.4)).toBe(true);
    // Bbox corner is OUTSIDE the ellipse (with padding it stays outside).
    expect(hitTestShape(ellipse, 0.2 + 0.002, 0.3 + 0.002)).toBe(false);
    // The padded ellipse still catches a click just outside the stroke.
    expect(hitTestShape(ellipse, 0.4 + 0.4 / 2 + 0.004, 0.4)).toBe(true);
  });

  const arrow: ShapePayload = {
    shape: 'arrow', x: 0.1, y: 0.5, x1: 0.1, y1: 0.5, x2: 0.7, y2: 0.5,
    color: '#000', strokeWidth: 0.004,
  };

  it('arrow: near the shaft → true, far away → false', () => {
    expect(hitTestShape(arrow, 0.4, 0.505)).toBe(true);
    expect(hitTestShape(arrow, 0.4, 0.6)).toBe(false);
    // Beyond the tip along the shaft line: projection clamps to the segment.
    expect(hitTestShape(arrow, 0.9, 0.5)).toBe(false);
  });

  it('arrow: degenerate payloads without endpoints never hit', () => {
    expect(hitTestShape({ shape: 'arrow', x: 0.1, y: 0.5, color: '#000', strokeWidth: 0.004 }, 0.4, 0.5)).toBe(false);
  });

  it('box kinds without w/h never hit', () => {
    expect(hitTestShape({ shape: 'rect', x: 0.2, y: 0.2, color: '#000', strokeWidth: 0.004 }, 0.3, 0.3)).toBe(false);
  });

  it('star behaves like its bounding box (approximate selection surface)', () => {
    const star: ShapePayload = { shape: 'star', x: 0.2, y: 0.2, w: 0.3, h: 0.3, color: '#000', strokeWidth: 0.004 };
    expect(hitTestShape(star, 0.35, 0.35)).toBe(true);
    expect(hitTestShape(star, 0.8, 0.8)).toBe(false);
  });
});

describe('degeneracy guards', () => {
  it('a tap-sized box does not commit', () => {
    expect(isDegenerateBox({ x: 0.5, y: 0.5, w: MIN_SHAPE_SIZE / 2, h: 0.2 })).toBe(true);
    expect(isDegenerateBox({ x: 0.5, y: 0.5, w: 0.2, h: MIN_SHAPE_SIZE / 2 })).toBe(true);
    expect(isDegenerateBox({ x: 0.5, y: 0.5, w: 0.2, h: 0.2 })).toBe(false);
  });

  it('a tap-short arrow does not commit', () => {
    expect(isDegenerateArrow(0.5, 0.5, 0.5 + MIN_SHAPE_SIZE, 0.5)).toBe(true);
    expect(isDegenerateArrow(0.5, 0.5, 0.5 + MIN_SHAPE_SIZE * 3, 0.5)).toBe(false);
  });
});
