/**
 * Batch 3 — minimal, feature-detecting access to the native shell bridge
 * `window.CmsNative` injected by the hardened Android WebView shell
 * (apps/android `com.cms.student.bridge.CmsJsBridge`).
 *
 * The bridge surface is fixed to exactly four read-only methods plus the
 * optional D-JS-AUTH seal pair and the optional Phase P web-session-end
 * notification; this module is the ONLY place that touches it, so the
 * contract stays auditable in one file:
 *
 *   window.CmsNative.hasNativeShell()    -> true
 *   window.CmsNative.getPlatform()       -> "android"
 *   window.CmsNative.getAppVersion()     -> versionName
 *   window.CmsNative.getInstallationId()  -> per-install device identity (UUID)
 *   window.CmsNative.sealForLocalPersistence?(blob)      -> "v1:<base64>"  (D-JS-AUTH, optional)
 *   window.CmsNative.unsealForLocalPersistence?(sealed)  -> blob           (D-JS-AUTH, optional)
 *   window.CmsNative.notifyWebSessionEnded?()            -> "wiped"|"kept_native_session" (Phase P, optional)
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
  /** D-JS-AUTH (2026-11-24): present only in shells that ship the token seal. */
  sealForLocalPersistence?(plaintext: string): string;
  /** D-JS-AUTH (2026-11-24): inverse of sealForLocalPersistence. */
  unsealForLocalPersistence?(sealed: string): string;
  /** Phase P (containment): present only in shells that ship the wipe notification. */
  notifyWebSessionEnded?(): string;
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
/**
 * Envelope prefix the native seal puts on every sealed blob. Values without it
 * are legacy raw tokens (written before the seal shipped) and must pass through.
 */
export const SEALED_ENVELOPE_PREFIX = 'v1:';

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

// ---------------------------------------------------------------------------
// D-JS-AUTH (debt closure, 2026-11-24) — the optional remember-me token seal.
//
// Inside the Android shell, durable «تذكّرني» tokens are sealed with an
// AndroidKeyStore-bound AES-256-GCM key before they reach localStorage, so a
// disk dump / backup extraction of the WebView storage sees ciphertext only.
// The seal methods are OPTIONAL on the bridge (older shells lack them); every
// helper returns null when they are absent, so browser builds and pre-upgrade
// shells keep the previous raw-storage behavior. The native side re-checks the
// origin allowlist on every call; a denied origin answers "" → treated as null.
// ---------------------------------------------------------------------------

/** True when the shell exposes BOTH seal methods (availability probe, no data flows). */
export function isTokenSealAvailable(): boolean {
  const bridge = readNativeBridge();
  if (!bridge) return false;
  return (
    typeof bridge.sealForLocalPersistence === 'function' &&
    typeof bridge.unsealForLocalPersistence === 'function'
  );
}

/** Seals a page-owned blob for durable storage; null outside the shell / on any failure. */
export function sealForLocalPersistence(plaintext: string): string | null {
  const bridge = readNativeBridge();
  if (!bridge || typeof bridge.sealForLocalPersistence !== 'function') return null;
  try {
    const sealed = bridge.sealForLocalPersistence(plaintext);
    if (typeof sealed !== 'string' || sealed.length === 0) return null;
    return sealed.startsWith(SEALED_ENVELOPE_PREFIX) ? sealed : null;
  } catch {
    return null;
  }
}

/** Unseals a sealed blob; null when not sealed here / on any failure. */
export function unsealForLocalPersistence(sealed: string): string | null {
  const bridge = readNativeBridge();
  if (!bridge || typeof bridge.unsealForLocalPersistence !== 'function') return null;
  try {
    const plaintext = bridge.unsealForLocalPersistence(sealed);
    return typeof plaintext === 'string' && plaintext.length > 0 ? plaintext : null;
  } catch {
    return null;
  }
}

/** True for values carrying the native seal envelope prefix (v1:). */
export function isSealedValue(value: string): boolean {
  return value.startsWith(SEALED_ENVELOPE_PREFIX);
}

// ---------------------------------------------------------------------------
// Phase P (containment) — the web-session-end wipe notification.
//
// clearSession() (the single choke point behind logout AND the 401 verdict)
// notifies the shell when the WEB session ends so the native side can wipe its
// offline stores (question-package envelopes + bridge runtime state; media
// cache too when no native session survives). The method is OPTIONAL on the
// bridge: older shells simply lack it, in which case this is an honest no-op
// (version-skew gap — nothing is faked). No data crosses web→native — the
// only direction of effect is native data DESTRUCTION.
// ---------------------------------------------------------------------------

/**
 * Tells the native side the web session ended. Returns the native status
 * code ("wiped" | "kept_native_session") or null outside the shell / on an
 * older shell without the method / on any failure (fail closed, never throw).
 */
export function nativeNotifyWebSessionEnded(): string | null {
  const bridge = readNativeBridge();
  if (!bridge || typeof bridge.notifyWebSessionEnded !== 'function') return null;
  try {
    const code = bridge.notifyWebSessionEnded();
    if (typeof code !== 'string') return null;
    const trimmed = code.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
