/**
 * Batch 3 — minimal, feature-detecting access to the native shell bridge
 * `window.CmsNative` injected by the hardened Android WebView shell
 * (apps/android `com.cms.student.bridge.CmsJsBridge`).
 *
 * The bridge surface is fixed to exactly four read-only methods; this module is the
 * ONLY place that touches it, so the contract stays auditable in one file:
 *
 *   window.CmsNative.hasNativeShell()    -> true
 *   window.CmsNative.getPlatform()       -> "android"
 *   window.CmsNative.getAppVersion()     -> versionName
 *   window.CmsNative.getInstallationId()  -> per-install device identity (UUID)
 *
 * Everything is feature-detected: in a plain browser (no `window.CmsNative`) every
 * helper returns a falsy value and callers keep their existing web behavior, so the
 * browser builds are untouched. The native side re-checks the HTTPS origin
 * allowlist per call; outside the allowlisted origin it returns empty values, which
 * the helpers below also treat as "absent".
 */

/** Typed shape of the native bridge — mirrors the Kotlin @JavascriptInterface surface. */
export interface CmsNativeBridge {
  hasNativeShell(): boolean;
  getPlatform(): string;
  getAppVersion(): string;
  getInstallationId(): string;
}

const NATIVE_BRIDGE_NAME = 'CmsNative';
const REQUIRED_METHODS: Array<keyof CmsNativeBridge> = [
  'hasNativeShell',
  'getPlatform',
  'getAppVersion',
  'getInstallationId',
];
/** Sanity cap so a broken/hostile injection can never smuggle a huge value into headers. */
const MAX_INSTALLATION_ID_LENGTH = 64;

function readNativeBridge(): CmsNativeBridge | null {
  const candidate = (globalThis as unknown as Record<string, unknown>)[NATIVE_BRIDGE_NAME];
  if (!candidate || typeof candidate !== 'object') return null;
  const bridge = candidate as unknown as Record<string, unknown>;
  if (REQUIRED_METHODS.some((method) => typeof bridge[method] !== 'function')) return null;
  return candidate as CmsNativeBridge;
}

/** True only when the native shell bridge is present and answers affirmatively. */
export function hasNativeShell(): boolean {
  const bridge = readNativeBridge();
  if (!bridge) return false;
  try {
    return bridge.hasNativeShell() === true;
  } catch {
    return false;
  }
}

/** Native platform name ("android") or null outside the shell / when unavailable. */
export function getNativePlatform(): string | null {
  const bridge = readNativeBridge();
  if (!bridge) return null;
  try {
    const value = bridge.getPlatform();
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/** Native app versionName or null outside the shell / when unavailable. */
export function getNativeAppVersion(): string | null {
  const bridge = readNativeBridge();
  if (!bridge) return null;
  try {
    const value = bridge.getAppVersion();
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Native installation id (UUID, same value the native offline path sends as
 * X-Installation-Id) or null outside the shell / when unavailable or malformed.
 * Used for header parity: inside the shell, web and native requests then share one
 * device identity. Never a credential — tokens stay out of the bridge by design.
 */
export function getNativeInstallationId(): string | null {
  const bridge = readNativeBridge();
  if (!bridge) return null;
  try {
    const value = bridge.getInstallationId();
    if (typeof value !== 'string') return null;
    const installationId = value.trim();
    if (installationId.length === 0 || installationId.length > MAX_INSTALLATION_ID_LENGTH) return null;
    return installationId;
  } catch {
    return null;
  }
}
