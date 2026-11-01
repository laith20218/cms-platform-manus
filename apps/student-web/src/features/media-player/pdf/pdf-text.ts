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

/**
 * Wave 12.3.B (M2) — expansion-aware reverse index map.
 *
 * Maps each NORMALIZED UTF-16 index of `normalized` back to its ORIGINAL
 * UTF-16 index in `original`. NFKC expansion (the lam-alef family
 * U+FEFB/FEFC/FEF5-FEF8 and any other multi-char decomposition) makes one
 * original glyph produce SEVERAL normalized characters, so positional
 * arithmetic on the normalized domain mis-places every slice after the
 * first expansion — the map restores the GLYPH domain the item's advance
 * width actually covers.
 *
 * Contract:
 *  - the result has normalized.length + 1 entries; entry i is the original
 *    index of the original character that PRODUCED normalized unit i, and
 *    the FINAL entry is the exclusive-end sentinel (original.length), so
 *    both sliceStart and an exclusive sliceEnd === normalized.length map
 *    directly;
 *  - per-character normalization goes through the SAME production pipeline
 *    (normalizeArabicPresentationForms) — presentation-form chars NFKC-
 *    decompose, everything else passes through untouched — so the rebuilt
 *    string must reproduce `normalized` byte-identically. Any divergence
 *    (a future normalization change, an exotic engine) returns null and
 *    the caller keeps its honest fallback;
 *  - positional identity (equal lengths — the overwhelming majority of
 *    items) returns null: zero allocation, callers keep index math.
 *
 * Pure and dependency-free so vitest can falsify it directly (D.4 convention).
 */
export function buildReverseIndexMap(original: string, normalized: string): readonly number[] | null {
  if (normalized.length === original.length) return null;
  const map: number[] = [];
  let rebuilt = '';
  let originalIndex = 0;
  // Walk CODE POINTS (per-unit iteration would corrupt astral characters)
  // and record, for every normalized UTF-16 unit, the original unit index
  // of its source character.
  for (const ch of original) {
    const next = normalizeArabicPresentationForms(ch);
    for (let j = 0; j < next.length; j += 1) map.push(originalIndex);
    rebuilt += next;
    originalIndex += ch.length;
  }
  map.push(original.length);
  return rebuilt === normalized && map.length === normalized.length + 1 ? map : null;
}
