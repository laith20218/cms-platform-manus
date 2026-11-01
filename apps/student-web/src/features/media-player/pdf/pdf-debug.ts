/**
 * Wave 11.8 / F2 — PdfPlayer diagnostic flags (hotfix R18.1 / R19.1).
 *
 * URL-driven, read ONCE per page load, zero UI surface. They exist so a field
 * engineer can split the canvas from the DOM text layer in production — the
 * "broken Arabic" screenshot alone cannot say WHICH surface is at fault:
 *
 *   ?pdfDebugText=hide    → text layer display:none (canvas-only view). If the
 *                           Arabic is PERFECT here, the canvas/font/cmap stack
 *                           is healthy and the leak is 100% the text layer.
 *   ?pdfDebugText=visible → spans forced VISIBLE — reproduces exactly what the
 *                           production screenshot shows when span transparency
 *                           is lost: double render, spaced-out Latin ("W ebS
 *                           o ck et"), isolated Arabic glyphs.
 *   ?pdfFonts=embedded    → revert the CANVAS to the pre-R19 font pipeline
 *                           (disableFontFace: false). Hotfix R19 made path
 *                           rendering (glyph outlines drawn as paths straight
 *                           from the embedded font programs) the DEFAULT,
 *                           because the browser @font-face pipeline mis-maps
 *                           the synthetic cmap of subset fonts: dropped
 *                           glyphs ('i'), wrong glyphs ('a'→'ã'), inter-
 *                           cluster gaps ("W ebS o ck et"). This override
 *                           exists ONLY for field A/B regression of that
 *                           diagnosis.
 *   ?pdfForceFallback=1   → Wave 12.3.D — force EVERY search match to the
 *                           data-only fallback (the DOM resolver is skipped),
 *                           deterministically reproducing the "unrendered
 *                           pages" state so the search panel's approximation
 *                           banner (M3 observability UI) can be exercised in
 *                           e2e/axe without racing a real layer teardown.
 *
 * Pure diagnostics: with no parameters the player renders exactly as
 * production defaults (path rendering, hard-transparent text layer).
 */

export interface PdfDebugFlags {
  readonly textLayer: 'default' | 'hide' | 'visible';
  readonly embeddedFontFaceOverride: boolean;
  readonly forceSearchFallback: boolean;
}

function readFlags(search: string): PdfDebugFlags {
  const params = new URLSearchParams(search);
  const raw = (params.get('pdfDebugText') ?? '').trim().toLowerCase();
  const textLayer = raw === 'hide' || raw === 'visible' ? raw : 'default';
  const embeddedFontFaceOverride = (params.get('pdfFonts') ?? '').trim().toLowerCase() === 'embedded';
  const forceSearchFallback = (params.get('pdfForceFallback') ?? '').trim() === '1';
  return { textLayer, embeddedFontFaceOverride, forceSearchFallback };
}

const PDF_DEBUG_SEARCH = typeof window !== 'undefined' ? window.location.search : '';

export const PDF_DEBUG: PdfDebugFlags = readFlags(PDF_DEBUG_SEARCH);

/** Class fragment for the text-layer container (empty string when default). */
export function textLayerDebugClass(): string {
  if (PDF_DEBUG.textLayer === 'hide') return ' is-debug-hidden';
  if (PDF_DEBUG.textLayer === 'visible') return ' is-debug-visible';
  return '';
}
