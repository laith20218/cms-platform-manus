import type { NormalizedPoint, NormalizedRect } from './pdf-types';

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
