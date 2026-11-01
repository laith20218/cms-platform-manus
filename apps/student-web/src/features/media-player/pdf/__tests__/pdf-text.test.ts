import { describe, expect, it } from 'vitest';
import { buildReverseIndexMap, normalizeArabicPresentationForms } from '../pdf-text';

/** Hotfix R15.1 — Arabic presentation forms must return to base letters so the
 *  text layer can shape/join them; everything else passes through untouched. */

describe('normalizeArabicPresentationForms', () => {
  it('maps isolated presentation forms back to base letters', () => {
    // U+FEF3 (YEH FINAL) → U+064A, U+FE98 (TEH MEDIAL) → U+062A, U+FEF2 → U+064A.
    expect(normalizeArabicPresentationForms('\uFEF3\uFE98\uFEF2')).toBe('\u064A\u062A\u064A');
  });

  it('expands the lam-alef ligature into two base characters', () => {
    // U+FEFB (LAM WITH ALEF ISOLATED) → U+0644 + U+0627.
    expect(normalizeArabicPresentationForms('\uFEFB')).toBe('\u0644\u0627');
  });

  it('leaves base-block Arabic untouched (already shapable)', () => {
    const base = '\u064A\u0642\u0631\u0623';
    expect(normalizeArabicPresentationForms(base)).toBe(base);
  });

  it('leaves Latin and digits byte-identical', () => {
    const mixed = 'Page 42 — notes';
    expect(normalizeArabicPresentationForms(mixed)).toBe(mixed);
  });

  it('normalizes mixed runs while preserving surrounding text', () => {
    expect(normalizeArabicPresentationForms('a\uFEF2b')).toBe('a\u064Ab');
  });

  it('handles empty and presentation-free strings without allocation surprises', () => {
    expect(normalizeArabicPresentationForms('')).toBe('');
    expect(normalizeArabicPresentationForms('\u0640')).toBe('\u0640'); // tatweel
  });
});

/** Wave 12.3.B (M2) — the expansion-aware reverse index map: every
 *  normalized UTF-16 index must resolve to the ORIGINAL glyph index that
 *  produced it, so the data-only search fallback can measure slice
 *  fractions on the advance-width (glyph) domain instead of the expanded
 *  character domain. */

describe('buildReverseIndexMap (12.3.B M2)', () => {
  it('round-trips a lam-alef expansion: rebuilt normalized string is byte-identical', () => {
    const original = '\u0639\uFEFB\u062C'; // ع + LAM-ALEF ISOLATED + ج
    const normalized = normalizeArabicPresentationForms(original);
    expect(normalized).toBe('\u0639\u0644\u0627\u062C'); // 3 glyphs → 4 chars
    const map = buildReverseIndexMap(original, normalized);
    expect(map).not.toBeNull();
    expect(map).toEqual([0, 1, 1, 2, 3]); // ل,ا both come from glyph 1; sentinel 3
    // Round-trip: re-normalizing the original reproduces `normalized`, and
    // every normalized unit maps INSIDE the source glyph's span.
    expect(normalizeArabicPresentationForms(original)).toBe(normalized);
    for (let i = 0; i < normalized.length; i += 1) {
      expect(map![i]).toBeGreaterThanOrEqual(0);
      expect(map![i]).toBeLessThan(original.length);
    }
    expect(map![normalized.length]).toBe(original.length); // exclusive-end sentinel
  });

  it('round-trips the MADDA lam-alef variant (U+FEF5) and back-to-back ligatures', () => {
    const original = '\uFEF5\uFEFB'; // لآ + لا → 2 glyphs → 4 base chars
    const normalized = normalizeArabicPresentationForms(original);
    expect(normalized).toBe('\u0644\u0622\u0644\u0627');
    expect(buildReverseIndexMap(original, normalized)).toEqual([0, 0, 1, 1, 2]);
  });

  it('returns null for positional identity (no expansion, zero allocation)', () => {
    const text = '\u064A\u0642\u0631\u0623 base';
    expect(buildReverseIndexMap(text, text)).toBeNull();
    expect(buildReverseIndexMap('Page 12', 'Page 12')).toBeNull();
  });

  it('maps slices after the expansion onto the correct glyph spans', () => {
    const original = '\u0628\uFEFB\u062B\u064A'; // ب + لا + ث + ي (4 glyphs → 5 chars)
    const normalized = normalizeArabicPresentationForms(original);
    expect(normalized).toBe('\u0628\u0644\u0627\u062B\u064A');
    const map = buildReverseIndexMap(original, normalized);
    expect(map).toEqual([0, 1, 1, 2, 3, 4]);
  });

  it('rejects a unfaithful pair (normalized does not match the pipeline)', () => {
    // A caller passing a mismatched pair gets null — the defensive contract
    // that keeps the fallback honest instead of confidently wrong.
    expect(buildReverseIndexMap('\uFEFB', '\u0628\u0627')).toBeNull();
  });
});
