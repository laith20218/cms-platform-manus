import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  REMEMBER_ME_FLAG,
  clearSession,
  readSession,
  writeRotatedTokens,
  writeSession,
} from '@/services/session-store';

/**
 * D-JS-AUTH (debt closure, 2026-11-24) — remember-me token sealing inside the
 * Android WebView shell.
 *
 * The durable (localStorage) copies of an opted-in «تذكّرني» login are sealed
 * via the origin-guarded native bridge (`v1:` AndroidKeyStore AES-256-GCM
 * envelopes) so a WebView-storage disk dump sees ciphertext, not raw JWTs.
 * This suite locks the full behavioral contract:
 *
 *   1. Shell + seal available  → localStorage holds v1: sealed blobs, reads
 *      transparently unseal them (login, WebView restart, rotations).
 *   2. Logout clears the sealed material with everything else.
 *   3. Legacy raw localStorage values (pre-upgrade installs) keep working.
 *   4. Browser / pre-upgrade shell → the previous raw behavior is untouched.
 *   5. A sealed value that cannot be unsealed fails closed to "no session".
 *   6. Tab-scoped (non-«تذكّرني») logins stay raw in sessionStorage and leave
 *      nothing durable behind.
 */

type MutableGlobal = Record<string, unknown>;

function installSealingBridge(overrides: Record<string, unknown> = {}): void {
  (globalThis as unknown as MutableGlobal).CmsNative = {
    hasNativeShell: () => true,
    getPlatform: () => 'android',
    getAppVersion: () => '0.1.0',
    getInstallationId: () => '11111111-2222-4333-8444-555555555555',
    sealForLocalPersistence: (plaintext: string) => `v1:${plaintext}`,
    unsealForLocalPersistence: (sealed: string) => (sealed.startsWith('v1:') ? sealed.slice(3) : ''),
    ...overrides,
  };
}

function removeNativeBridge(): void {
  delete (globalThis as unknown as MutableGlobal).CmsNative;
}

const TOKENS = { accessToken: 'access.jwt.value', refreshToken: 'refresh.jwt.value' };
const ROTATED = { accessToken: 'access.jwt.rotated', refreshToken: 'refresh.jwt.rotated' };

describe('remember-me token seal inside the Android shell (D-JS-AUTH)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    removeNativeBridge();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    removeNativeBridge();
  });

  it('seals the durable copies of an opted-in remember-me login', () => {
    installSealingBridge();

    writeSession(TOKENS, true);

    const storedAccess = localStorage.getItem(ACCESS_TOKEN_KEY)!;
    const storedRefresh = localStorage.getItem(REFRESH_TOKEN_KEY)!;
    expect(storedAccess).toBe(`v1:${TOKENS.accessToken}`);
    expect(storedRefresh).toBe(`v1:${TOKENS.refreshToken}`);
    // The durable store never holds the raw JWT as-is — only sealed envelopes.
    expect(storedAccess).not.toBe(TOKENS.accessToken);
    expect(storedRefresh).not.toBe(TOKENS.refreshToken);
    // The tab-scoped mirror stays raw (fastest path, dies with the tab).
    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBe(TOKENS.accessToken);
    expect(localStorage.getItem(REMEMBER_ME_FLAG)).toBe('1');
  });

  it('unseals transparently on read, including after a WebView restart', () => {
    installSealingBridge();
    writeSession(TOKENS, true);

    // Simulate the WebView restart: the tab-scoped store is gone, only the
    // sealed durable copy survives.
    sessionStorage.clear();
    const restored = readSession();
    expect(restored).toEqual(TOKENS);
  });

  it('re-seals rotated tokens on the durable store', () => {
    installSealingBridge();
    writeSession(TOKENS, true);

    writeRotatedTokens(ROTATED);

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe(`v1:${ROTATED.accessToken}`);
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe(`v1:${ROTATED.refreshToken}`);
    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBe(ROTATED.accessToken);
    expect(readSession()).toEqual(ROTATED);
  });

  it('logout clears the sealed material together with the whole session', () => {
    installSealingBridge();
    writeSession(TOKENS, true);
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toMatch(/^v1:/);

    clearSession();

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REMEMBER_ME_FLAG)).toBeNull();
    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(readSession()).toBeNull();
  });

  it('legacy raw localStorage tokens keep working and upgrade to sealed on the next write', () => {
    installSealingBridge();
    // Pre-upgrade install: raw tokens written by the old build.
    localStorage.setItem(ACCESS_TOKEN_KEY, TOKENS.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, TOKENS.refreshToken);
    sessionStorage.clear();

    expect(readSession()).toEqual(TOKENS);

    // The next rotation rewrites them sealed.
    localStorage.setItem(REMEMBER_ME_FLAG, '1');
    writeRotatedTokens(ROTATED);
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe(`v1:${ROTATED.accessToken}`);
  });

  it('keeps the previous raw behavior in a plain browser (no bridge)', () => {
    writeSession(TOKENS, true);

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe(TOKENS.accessToken);
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe(TOKENS.refreshToken);
    expect(readSession()).toEqual(TOKENS);
  });

  it('falls back to raw durable storage when the seal answers empty (best-effort seal)', () => {
    installSealingBridge({ sealForLocalPersistence: () => '' });

    writeSession(TOKENS, true);

    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBe(TOKENS.accessToken);
    expect(readSession()).toEqual(TOKENS);
  });

  it('a sealed value that cannot be unsealed fails closed to no session', () => {
    installSealingBridge({ unsealForLocalPersistence: () => '' });
    // A value sealed by a previous install's key (e.g. app data restored to a
    // new device): structurally sealed, but this key cannot open it.
    localStorage.setItem(ACCESS_TOKEN_KEY, 'v1:foreign-ciphertext');
    localStorage.setItem(REFRESH_TOKEN_KEY, 'v1:foreign-ciphertext');
    sessionStorage.clear();

    expect(readSession()).toBeNull();
  });

  it('non-persistent logins stay raw in sessionStorage and leave nothing durable', () => {
    installSealingBridge();

    writeSession(TOKENS, false);

    expect(sessionStorage.getItem(ACCESS_TOKEN_KEY)).toBe(TOKENS.accessToken);
    expect(localStorage.getItem(ACCESS_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
  });
});
