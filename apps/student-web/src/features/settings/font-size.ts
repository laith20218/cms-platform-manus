/**
 * Wave 16.4 — student font-size preference: pure logic, no React.
 *
 * Persistence channels (both, deliberately):
 *  - localStorage 'cms-font-size'  → per-device instant boot apply (main.tsx),
 *    mirroring the existing 'cms-theme' dark-mode pattern;
 *  - the server-side /student/preferences JSON object (key `fontSize`) via
 *    useFontSize — the value follows the account across devices.
 *
 * Application: the app is rem-based (Tailwind), so scaling the root
 * font-size scales the whole UI. globals.css stays untouched (C1).
 */
export type FontSizeStep = 'sm' | 'md' | 'lg' | 'xl';

export const FONT_SIZE_STORAGE_KEY = 'cms-font-size';

export const FONT_SIZE_STEPS: { step: FontSizeStep; label: string; px: number }[] = [
  { step: 'sm', label: 'صغير', px: 14 },
  { step: 'md', label: 'متوسط', px: 16 },
  { step: 'lg', label: 'كبير', px: 18 },
  { step: 'xl', label: 'كبير جداً', px: 20 },
];

export function isFontSizeStep(value: unknown): value is FontSizeStep {
  return typeof value === 'string' && FONT_SIZE_STEPS.some((s) => s.step === value);
}

export function fontSizePx(step: FontSizeStep): number {
  return FONT_SIZE_STEPS.find((s) => s.step === step)?.px ?? 16;
}

/** Boot/localStorage reader — invalid values fall back to the default step. */
export function readStoredFontSizeStep(): FontSizeStep {
  try {
    const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    return isFontSizeStep(stored) ? stored : 'md';
  } catch {
    return 'md';
  }
}

/** Applies the step to <html> — one call, idempotent, safe in jsdom. */
export function applyFontSizeStep(step: FontSizeStep): void {
  document.documentElement.style.fontSize = `${fontSizePx(step)}px`;
}
