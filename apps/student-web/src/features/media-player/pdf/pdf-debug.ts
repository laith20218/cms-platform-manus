/**
 * Wave 11.8 / F2 — PdfPlayer diagnostic flags (hotfix R18.1).
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
 *   ?pdfFonts=system      → getDocument({ disableFontFace: true }) — bypasses
 *                           the browser @font-face registration entirely:
 *                           glyph outlines are drawn as paths straight from
 *                           the embedded font programs. If the canvas becomes
 *                           perfect under this flag, the @font-face pipeline
 *                           (synthetic cmap of subset fonts) was the culprit.
 *
 * Pure diagnostics: with no parameters the player behaves exactly as before.
 */

export interface PdfDebugFlags {
  readonly textLayer: 'default' | 'hide' | 'visible';
  readonly systemFontsOnly: boolean;
}

function readFlags(search: string): PdfDebugFlags {
  const params = new URLSearchParams(search);
  const raw = (params.get('pdfDebugText') ?? '').trim().toLowerCase();
  const textLayer = raw === 'hide' || raw === 'visible' ? raw : 'default';
  const systemFontsOnly = (params.get('pdfFonts') ?? '').trim().toLowerCase() === 'system';
  return { textLayer, systemFontsOnly };
}

const PDF_DEBUG_SEARCH = typeof window !== 'undefined' ? window.location.search : '';

export const PDF_DEBUG: PdfDebugFlags = readFlags(PDF_DEBUG_SEARCH);

/** Class fragment for the text-layer container (empty string when default). */
export function textLayerDebugClass(): string {
  if (PDF_DEBUG.textLayer === 'hide') return ' is-debug-hidden';
  if (PDF_DEBUG.textLayer === 'visible') return ' is-debug-visible';
  return '';
}
