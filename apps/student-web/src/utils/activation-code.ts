/**
 * Wave 18.2 (D-03) — the ONE activation-code format shared by the modal
 * (features/subjects/ActivationCodeModal) and the page (ActivateCodePage).
 *
 * Contract (mirrors the backend redeem endpoint, which strips dashes and
 * matches any length):
 *   • free typing is normalized into 4-char dash groups (XXXX-XXXX-…)
 *   • standard codes = 16 significant chars, prefixed admin codes = 22+,
 *     legacy no-dash codes = 12 — the UI must accept ALL of them and must
 *     never truncate a prefixed admin code
 *   • anything below 12 significant chars is too short to submit
 */
export const ACTIVATION_CODE_MIN_SIGNIFICANT = 12;

/** Upper-cases, strips non-alphanumerics (cap 32), groups into 4-char dashes. */
export function normalizeActivationCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
  return (cleaned.match(/.{1,4}/g) ?? []).join('-');
}

/** Significant (dash-stripped) length of a normalized code (internal). */
function activationCodeLength(code: string): number {
  return code.replace(/-/g, '').length;
}

/** True when the code is long enough to send to the redeem endpoint. */
export function activationCodeIsSubmittable(code: string): boolean {
  return activationCodeLength(code) >= ACTIVATION_CODE_MIN_SIGNIFICANT;
}
