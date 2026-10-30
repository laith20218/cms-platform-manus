import { describe, expect, it } from 'vitest';
import { normalizeArabicPresentationForms } from '../pdf-text';

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
