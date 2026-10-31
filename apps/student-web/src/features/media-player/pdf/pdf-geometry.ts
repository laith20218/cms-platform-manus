import type { NormalizedPoint, NormalizedRect, ShapePayload } from './pdf-types';

/**
 * Wave 11.8 / F2 — pure geometry helpers for the PDF annotation layer.
 * Kept dependency-free so vitest can exercise them directly (D.4 strategies).
 */

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function newAnnotationId(): string {
  // crypto.randomUUID is secure-context only; the fallback keeps tests/jsdom alive.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ann-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Smooth stroke path (quadratic-midpoint interpolation): the live-drawn
 * polyline becomes a visually smooth curve without overshoot (D.4b).
 * A single point renders as a tiny dot segment so taps leave a visible mark.
 */
export function strokePathD(points: NormalizedPoint[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.0005} ${p.y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x} ${points[i].y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function perpendicularDistance(point: NormalizedPoint, start: NormalizedPoint, end: NormalizedPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    const ex = point.x - start.x;
    const ey = point.y - start.y;
    return Math.sqrt(ex * ex + ey * ey);
  }
  // Cross-product distance from the infinite line, clamped to the segment.
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  const projX = start.x + t * dx;
  const projY = start.y + t * dy;
  const ex = point.x - projX;
  const ey = point.y - projY;
  return Math.sqrt(ex * ex + ey * ey);
}

/**
 * Ramer–Douglas–Peucker simplification — applied ON COMMIT only (never live)
 * so stored payloads stay small (D.4b): a fast pen scribble at 120Hz collapses
 * to its perceptual skeleton before it ever reaches the jsonb column.
 */
export function simplifyPoints(points: NormalizedPoint[], tolerance = 0.0015): NormalizedPoint[] {
  if (points.length <= 2) return points;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const distance = perpendicularDistance(points[i], points[start], points[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > tolerance) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Converts a DOM selection range's client rects to page-normalized rects
 * (D.4d): visual boxes only — RTL-safe and zoom-independent. Rects whose
 * center falls outside this page (cross-page selections) are dropped
 * outright (hotfix R15.2) instead of being clamped into border slivers.
 *
 * Hotfix R16.2: the caller MUST pass the CANVAS surface box (the geometry
 * authority) — a degenerate (zero-sized, not-yet-laid-out) surface yields no
 * rects rather than divide-by-zero garbage.
 */
export function rectsFromRange(range: Range, pageRect: DOMRect): NormalizedRect[] {
  const rects: NormalizedRect[] = [];
  if (!(pageRect.width > 0) || !(pageRect.height > 0)) return rects;
  const clientRects = range.getClientRects();
  for (let i = 0; i < clientRects.length; i += 1) {
    const r = clientRects[i];
    if (r.width < 1 || r.height < 1) continue;
    // Hotfix R15.2: a rect belongs to this page only if its CENTER lies inside
    // the page box. Clamping alone let rects from neighbouring pages survive
    // as zero-edge slivers hugging the border (the "covers the text" artifact
    // from the production report).
    const centerX = r.left + r.width / 2;
    const centerY = r.top + r.height / 2;
    if (
      centerX < pageRect.left || centerX > pageRect.right ||
      centerY < pageRect.top || centerY > pageRect.bottom
    ) continue;
    const x = clamp01((r.left - pageRect.left) / pageRect.width);
    const y = clamp01((r.top - pageRect.top) / pageRect.height);
    const w = Math.min(1 - x, r.width / pageRect.width);
    const h = Math.min(1 - y, r.height / pageRect.height);
    if (w <= 0.0005 || h <= 0.0005) continue;
    rects.push({ x, y, w, h });
  }
  return rects;
}

/** Hotfix R16.4 — hard ceiling for a page-relative ink width: no legitimate
 *  pen reaches 10% of the page width, so anything stored above this is legacy
 *  or malformed RAW-PIXEL data (the pre-R15.3 live stroke emitted
 *  penWidth * pageWidthPx ≈ 2000) and must never reach the renderer as-is. */
const MAX_INK_WIDTH_FRACTION = 0.1;

/**
 * Hotfix R16.4 — single authority for ink stroke widths.
 *
 * Stored ink width is a PAGE-RELATIVE fraction (px ÷ pageWidth). With the
 * overlay's viewBox="0 0 1 1" the strokeWidth attribute must be that same
 * fraction — a raw pixel value against a unit viewBox is the production
 * "giant shape" bug (2.5 px × viewBox scale ≈ a 2000 px stroke). Legacy
 * payloads that carry a raw px value are recovered by dividing by the live
 * page width, and every result is clamped so a corrupt payload can never
 * paint more than MAX_INK_WIDTH_FRACTION of the page.
 */
export function resolveInkStrokeWidth(storedWidth: number, cssWidth: number): number {
  if (!Number.isFinite(storedWidth) || storedWidth <= 0) return 0;
  const pageWidth = Number.isFinite(cssWidth) && cssWidth > 0 ? cssWidth : 1;
  const fraction = storedWidth <= MAX_INK_WIDTH_FRACTION
    ? storedWidth
    : storedWidth / pageWidth;
  return Math.min(clamp01(fraction), MAX_INK_WIDTH_FRACTION);
}

/* ===== Wave 11.10 — shape geometry (F2 Phase 2) =====
 * Same purity contract as the ink helpers: dependency-free, unit-testable,
 * page-normalized 0..1 coordinates. */

/** Smallest drag (normalized) that commits a shape — shorter gestures are taps, not draws. */
export const MIN_SHAPE_SIZE = 0.012;

/** Turns a raw drag (start → end) into a positive top-left box. */
export function normalizeBox(x1: number, y1: number, x2: number, y2: number): NormalizedRect {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  return { x, y, w: Math.max(x1, x2) - x, h: Math.max(y1, y2) - y };
}

/**
 * 10-point star polygon (5 outer + 5 inner vertices, alternating) inscribed in
 * the drag box. The first outer vertex sits at the TOP-CENTER of the box; the
 * star stretches with the box (the same visual contract as rect/ellipse — you
 * drag a box, the shape fills it). Inner radius ratio 0.42 ≈ the classic
 * five-point star silhouette.
 */
export function starPolygonPoints(box: NormalizedRect, innerRatio = 0.42): NormalizedPoint[] {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rx = box.w / 2;
  const ry = box.h / 2;
  const points: NormalizedPoint[] = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const scale = i % 2 === 0 ? 1 : innerRatio;
    points.push({ x: cx + rx * scale * Math.cos(angle), y: cy + ry * scale * Math.sin(angle) });
  }
  return points;
}

/** SVG `points` attribute for a polygon of normalized points. */
export function polygonPointsAttr(points: NormalizedPoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

/**
 * Arrowhead triangle for an arrow tail→head given in page-normalized coords.
 *
 * The head is laid out in PIXEL space (using the live page box) and converted
 * back to normalized coordinates — the overlay's unit viewBox is stretched by
 * `preserveAspectRatio="none"`, so a triangle computed directly in normalized
 * space would shear with the page aspect (the same class of units bug the R16.4
 * ink-width hotfix eliminated). Returns [wing1, tip, wing2]; the shaft should
 * stop at the wing midpoint, not the tip.
 */
export function arrowHeadPoints(
  x1: number, y1: number, x2: number, y2: number,
  pageWidthPx: number, pageHeightPx: number,
  headLengthPx = 14, halfWidthPx = 5,
): NormalizedPoint[] {
  const w = Number.isFinite(pageWidthPx) && pageWidthPx > 0 ? pageWidthPx : 1;
  const h = Number.isFinite(pageHeightPx) && pageHeightPx > 0 ? pageHeightPx : 1;
  const tip: NormalizedPoint = { x: clamp01(x2), y: clamp01(y2) };
  const dxPx = (x2 - x1) * w;
  const dyPx = (y2 - y1) * h;
  const lengthPx = Math.hypot(dxPx, dyPx);
  if (lengthPx === 0) return [tip, tip, tip];
  const ux = dxPx / lengthPx;
  const uy = dyPx / lengthPx;
  const basePxX = x2 * w - ux * headLengthPx;
  const basePxY = y2 * h - uy * headLengthPx;
  const perpX = -uy;
  const perpY = ux;
  const toNormalized = (px: number, py: number): NormalizedPoint => ({ x: clamp01(px / w), y: clamp01(py / h) });
  return [
    toNormalized(basePxX + perpX * halfWidthPx, basePxY + perpY * halfWidthPx),
    tip,
    toNormalized(basePxX - perpX * halfWidthPx, basePxY - perpY * halfWidthPx),
  ];
}

/** Hit-test padding (normalized) so thin strokes stay tappable in select mode. */
const SHAPE_HIT_PAD = 0.012;

/**
 * Pure hit test for "did a page-normalized click land on this shape" — used by
 * the pointer tool's select flow. Runs against the payload geometry directly
 * (no DOM hit-testing: the text layer owns real pointer events in pointer
 * mode, exactly as the R18 blend contract requires). Thin shapes grow by
 * SHAPE_HIT_PAD so a click NEAR the stroke still selects.
 *
 * R25 fix — normalize the drag box BEFORE testing. The commit path stores
 * positive boxes, but payloads hydrated from the server (FileAnnotations
 * jsonb, older clients) may carry negative w/h: the previous raw test made
 * the padded box invert (left > right) and the ellipse branch bail on
 * rx <= 0, so such shapes rendered but could never be selected or deleted.
 * The arrow keeps its raw signed endpoints — the segment distance is
 * direction-agnostic by construction.
 */
export function hitTestShape(payload: ShapePayload, nx: number, ny: number): boolean {
  const pad = SHAPE_HIT_PAD;
  if (payload.shape === 'arrow') {
    if (payload.x1 === undefined || payload.y1 === undefined || payload.x2 === undefined || payload.y2 === undefined) return false;
    // Point-to-segment distance in normalized space (aspect distortion is
    // irrelevant at hit-test scale; the pad dominates).
    const sx = payload.x1;
    const sy = payload.y1;
    const ex = payload.x2;
    const ey = payload.y2;
    const dx = ex - sx;
    const dy = ey - sy;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((nx - sx) * dx + (ny - sy) * dy) / lengthSq));
    const cx = sx + t * dx;
    const cy = sy + t * dy;
    return Math.hypot(nx - cx, ny - cy) <= Math.max(pad, payload.strokeWidth * 3);
  }
  if (payload.w === undefined || payload.h === undefined) return false;
  // R25 fix: (x, y, w, h) → positive top-left box, whatever sign the drag (or
  // the persisted payload) carried.
  const box = normalizeBox(payload.x, payload.y, payload.x + payload.w, payload.y + payload.h);
  const left = box.x - pad;
  const top = box.y - pad;
  const right = box.x + box.w + pad;
  const bottom = box.y + box.h + pad;
  if (nx < left || nx > right || ny < top || ny > bottom) return false;
  if (payload.shape === 'ellipse') {
    // Standard ellipse equation on the NORMALIZED box, radii widened by the
    // pad so the outline band stays tappable.
    const rx = box.w / 2 + pad;
    const ry = box.h / 2 + pad;
    if (rx <= 0 || ry <= 0) return false;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    return ((nx - cx) / rx) ** 2 + ((ny - cy) / ry) ** 2 <= 1;
  }
  // rect + star: the padded bounding box (star vertices stay inside the box).
  return true;
}

/** True when a committed box shape is too small to be intentional (a tap). */
export function isDegenerateBox(box: NormalizedRect): boolean {
  return box.w < MIN_SHAPE_SIZE || box.h < MIN_SHAPE_SIZE;
}

/** True when an arrow's tail/head are too close to be intentional. */
export function isDegenerateArrow(x1: number, y1: number, x2: number, y2: number): boolean {
  return Math.hypot(x2 - x1, y2 - y1) < MIN_SHAPE_SIZE * 2;
}
