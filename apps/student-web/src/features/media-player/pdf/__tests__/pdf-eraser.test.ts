import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  collectEraserHitIds,
  densifyPath,
  eraserHitTest,
  NOTE_ICON_RADIUS_PX,
  perpendicularDistance,
} from '../pdf-geometry';
import type { HighlightPayload, InkPayload, NotePayload, PdfAnnotation, ShapePayload } from '../pdf-types';
import { usePdfAnnotations } from '../usePdfAnnotations';

// The store test mounts the real hook: the network layer is mocked out (the
// debounced flush never needs a server in jsdom).
vi.mock('@/features/library/services/library-api', () => ({
  libraryApi: {
    getAnnotations: async () => [],
    saveAnnotations: async () => ({ appliedCount: 0, serverTime: new Date().toISOString() }),
  },
}));

/** Wave 11.11 — smart-eraser falsification: whole-annotation erase covers Ink
 *  + Shapes + Notes, and since Wave 12.2.A (E1 lift-lock) Highlights too —
 *  their stored rects are plain page-normalized geometry. The gesture path is
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

  it('highlights ARE erasable (12.2.A lift-lock): contact inside a line rect hits', () => {
    expect(eraserHitTest(highlightPayload, 0.25, 0.115, 0.05)).toBe(true);
    expect(eraserHitTest(highlightPayload, 0.12, 0.105, 0.01)).toBe(true);
  });
});

describe('eraserHitTest — Highlights (12.2.A)', () => {
  it('hits inside the rect', () => {
    expect(eraserHitTest(highlightPayload, 0.25, 0.115, 0.01)).toBe(true);
    expect(eraserHitTest(highlightPayload, 0.39, 0.12, 0.01)).toBe(true);
  });

  it('misses outside the rect', () => {
    expect(eraserHitTest(highlightPayload, 0.5, 0.115, 0.01)).toBe(false); // past the right edge
    expect(eraserHitTest(highlightPayload, 0.25, 0.2, 0.01)).toBe(false); // below the rect
    expect(eraserHitTest(highlightPayload, 0.05, 0.115, 0.01)).toBe(false); // past the left edge
  });

  it('pad edge: the contact radius widens the rect by exactly pad', () => {
    // radius 0.02: a point 0.019 beyond the right edge hits; 0.03 misses.
    expect(eraserHitTest(highlightPayload, 0.4 + 0.019, 0.115, 0.02)).toBe(true);
    expect(eraserHitTest(highlightPayload, 0.4 + 0.03, 0.115, 0.02)).toBe(false);
    // Zero radius: the top-level contact guard never hits anything (same
    // contract as Ink/Shapes/Notes).
    expect(eraserHitTest(highlightPayload, 0.25, 0.115, 0)).toBe(false);
  });

  it('multi-rect payloads hit through ANY stored line rect', () => {
    const multi: HighlightPayload = {
      rects: [
        { x: 0.1, y: 0.1, w: 0.3, h: 0.03 },
        { x: 0.1, y: 0.2, w: 0.5, h: 0.03 },
      ],
      color: '#fde047',
    };
    expect(eraserHitTest(multi, 0.5, 0.215, 0.01)).toBe(true); // second line only
    expect(eraserHitTest(multi, 0.05, 0.215, 0.01)).toBe(false); // clear of both
  });

  it('zero radius never hits clear space', () => {
    expect(eraserHitTest(highlightPayload, 0.5, 0.5, 0)).toBe(false);
  });

  it('collectEraserHitIds: ONE gesture erases every highlight it sweeps (multi-highlight)', () => {
    const annotations: PdfAnnotation[] = [
      ann('hl-a', highlightPayload),
      ann('hl-b', { rects: [{ x: 0.1, y: 0.3, w: 0.4, h: 0.03 }], color: '#86efac' }),
      ann('hl-far', { rects: [{ x: 0.7, y: 0.8, w: 0.2, h: 0.03 }], color: '#f9a8d4' }),
    ];
    // A vertical swipe through both first rects, well clear of the third.
    const ids = collectEraserHitIds(annotations, [{ x: 0.25, y: 0.05 }, { x: 0.25, y: 0.35 }], 0.02, 800);
    expect(ids).toContain('hl-a');
    expect(ids).toContain('hl-b');
    expect(ids).not.toContain('hl-far');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('eraser → undo restores a highlight (12.2.A store contract)', () => {
  it('remove() of an erased highlight is one undo unit; undo() restores it whole', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => usePdfAnnotations('file-hl-undo'), { wrapper });
    // Hydration must land BEFORE the first mutation (the hydrate effect would
    // otherwise overwrite the optimistic local map — same contract as prod,
    // where the student can only touch the player after the fetch settles).
    await waitFor(() => { expect(result.current.isLoading).toBe(false); });
    expect(result.current.annotations.size).toBe(0);

    const highlight: PdfAnnotation = {
      id: 'hl-undo-1', pageNumber: 1, annotationType: 'Highlight', payload: highlightPayload,
    };
    await act(async () => { result.current.upsert(highlight); });
    expect(result.current.annotations.get('hl-undo-1')?.annotationType).toBe('Highlight');

    // The eraser gesture = ONE remove() call (the locked undo unit).
    await act(async () => { result.current.remove(['hl-undo-1']); });
    expect(result.current.annotations.has('hl-undo-1')).toBe(false);

    await act(async () => { result.current.undo(); });
    const restored = result.current.annotations.get('hl-undo-1');
    expect(restored?.annotationType).toBe('Highlight');
    expect(restored?.payload).toEqual(highlightPayload);
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
