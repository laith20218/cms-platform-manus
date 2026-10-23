/**
 * Playwright E2E — Device Binding Helper
 *
 * Injects a fixed device fingerprint into localStorage so the student-web
 * app sends a consistent X-Device-Fingerprint header that matches the
 * pre-seeded device_bindings row in Neon.
 *
 * The backend's SecurityService.VerifyDeviceBindingAsync rejects logins
 * from "unknown" devices (when SingleActiveDevice=true). Each Playwright
 * browser context has empty localStorage, so getOrCreateInstallationId()
 * would generate a new random fingerprint → rejected.
 *
 * By pre-seeding a device_binding row in Neon with fingerprint
 * 'web-deadbeefcafe1234567890abcdef1234' and injecting that same value
 * into localStorage before the app loads, the login flow succeeds.
 *
 * NOTE: Admin logins do NOT need device binding (RequiresStudentDeviceBinding
 * returns true only for role="student"). This helper is student-only.
 */

export const E2E_DEVICE_FINGERPRINT = 'web-deadbeefcafe1234567890abcdef1234';

/**
 * The localStorage key used by student-web's getOrCreateInstallationId().
 * Must match INSTALLATION_ID_KEY in apps/student-web/src/utils/index.ts.
 */
const STORAGE_KEY = 'cms-device-fingerprint';

/**
 * Injects the E2E device fingerprint into localStorage before any app
 * JavaScript runs. Must be called in test.beforeEach via page.addInitScript.
 *
 * Usage:
 *   test.beforeEach(async ({ page }) => {
 *     await injectDeviceFingerprint(page);
 *   });
 */
export async function injectDeviceFingerprint(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript((args: { key: string; value: string }) => {
    window.localStorage.setItem(args.key, args.value);
  }, { key: STORAGE_KEY, value: E2E_DEVICE_FINGERPRINT });
}
