/**
 * Wave 11.8 / F2 — text-layer content helpers (hotfix R15.1).
 *
 * Arabic PDFs frequently carry ToUnicode maps that resolve glyphs to Unicode
 * ARABIC PRESENTATION FORMS (U+FB50–U+FDFF, U+FE70–U+FEFF). Presentation-form
 * codepoints have fixed joining properties — the browser renders each one as
 * an isolated glyph and contextual shaping never happens, which is exactly the
 * "ﻲ|ﻘ|ﻳ isolated letters" production report. Mapping them back to their base
 * letters (U+0621–U+064A block) restores joining before the TextLayer
 * materializes the spans; the stylesheet (unicode-bidi: plaintext on spans)
 * gives the bidi direction back to the content itself.
 *
 * Pure and dependency-free so vitest can falsify it directly (D.4 convention).
 */

const ARABIC_PRESENTATION_FORM = /[\uFB50-\uFDFF\uFE70-\uFEFF]/;
const ARABIC_PRESENTATION_FORM_GLOBAL = /[\uFB50-\uFDFF\uFE70-\uFEFF]/gu;

export function normalizeArabicPresentationForms(text: string): string {
  if (!ARABIC_PRESENTATION_FORM.test(text)) return text;
  // Per-character NFKC: every presentation form decomposes to its base
  // letter(s) — lam-alef ligatures correctly expand to two characters.
  // Characters outside the presentation blocks are left untouched.
  return text.replace(ARABIC_PRESENTATION_FORM_GLOBAL, (ch) => ch.normalize('NFKC'));
}
