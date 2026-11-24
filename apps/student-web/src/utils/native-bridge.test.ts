import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getNativeAppVersion,
  getNativeInstallationId,
  getNativePlatform,
  hasNativeShell,
  isSealedValue,
  isTokenSealAvailable,
  sealForLocalPersistence,
  unsealForLocalPersistence,
} from './native-bridge';
import { getOrCreateInstallationId } from '@/utils';

type MutableGlobal = Record<string, unknown>;

function installNativeBridge(overrides: Record<string, unknown> = {}): void {
  (globalThis as unknown as MutableGlobal).CmsNative = {
    hasNativeShell: () => true,
    getPlatform: () => 'android',
    getAppVersion: () => '0.1.0',
    getInstallationId: () => '11111111-2222-4333-8444-555555555555',
    ...overrides,
  };
}

function removeNativeBridge(): void {
  delete (globalThis as unknown as MutableGlobal).CmsNative;
}

/** D-JS-AUTH fixture: a fake seal shaped like the real AndroidKeyStore envelope. */
function installSealingBridge(overrides: Record<string, unknown> = {}): void {
  installNativeBridge({
    sealForLocalPersistence: (plaintext: string) => `v1:${plaintext}`,
    unsealForLocalPersistence: (sealed: string) => sealed.slice(3),
    ...overrides,
  });
}

describe('native shell bridge helper (Batch 3)', () => {
  beforeEach(() => {
    localStorage.clear();
    removeNativeBridge();
  });

  afterEach(() => {
    removeNativeBridge();
    localStorage.clear();
  });

  it('returns falsy for every helper when window.CmsNative is absent', () => {
    expect(hasNativeShell()).toBe(false);
    expect(getNativePlatform()).toBeNull();
    expect(getNativeAppVersion()).toBeNull();
    expect(getNativeInstallationId()).toBeNull();
  });

  it('detects the native shell when the bridge answers affirmatively', () => {
    installNativeBridge();

    expect(hasNativeShell()).toBe(true);
    expect(getNativePlatform()).toBe('android');
    expect(getNativeAppVersion()).toBe('0.1.0');
    expect(getNativeInstallationId()).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('rejects malformed bridge objects instead of trusting partial surfaces', () => {
    (globalThis as unknown as MutableGlobal).CmsNative = {
      hasNativeShell: () => true,
      getPlatform: () => 'android',
      // getAppVersion / getInstallationId missing — must degrade to falsy everywhere.
    };

    expect(hasNativeShell()).toBe(false);
    expect(getNativePlatform()).toBeNull();
    expect(getNativeAppVersion()).toBeNull();
    expect(getNativeInstallationId()).toBeNull();
  });

  it('treats a throwing bridge as absent (fail closed, never propagate)', () => {
    installNativeBridge({
      hasNativeShell: () => {
        throw new Error('bridge unavailable');
      },
      getInstallationId: () => {
        throw new Error('bridge unavailable');
      },
    });

    expect(hasNativeShell()).toBe(false);
    expect(getNativeInstallationId()).toBeNull();
  });

  it('ignores blank, oversized, or non-string installation ids from the bridge', () => {
    installNativeBridge({ getInstallationId: () => '' });
    expect(getNativeInstallationId()).toBeNull();

    installNativeBridge({ getInstallationId: () => '   ' });
    expect(getNativeInstallationId()).toBeNull();

    installNativeBridge({ getInstallationId: () => 'x'.repeat(65) });
    expect(getNativeInstallationId()).toBeNull();

    installNativeBridge({ getInstallationId: () => 12345 as unknown as string });
    expect(getNativeInstallationId()).toBeNull();
  });

  it('keeps the browser fallback identity when the bridge is absent', () => {
    const installationId = getOrCreateInstallationId();

    expect(installationId).toMatch(/^web-[a-f0-9]{32}$/i);
    expect(localStorage.getItem('cms-device-fingerprint')).toBe(installationId);
  });

  it('prefers the native installation id for header parity inside the shell', () => {
    installNativeBridge();

    const installationId = getOrCreateInstallationId();

    expect(installationId).toBe('11111111-2222-4333-8444-555555555555');
    // The web fallback must NOT be created in the shell — one identity, no second id.
    expect(localStorage.getItem('cms-device-fingerprint')).toBeNull();
  });

  it('falls back to the browser identity when the bridge exists but returns no id', () => {
    installNativeBridge({ getInstallationId: () => '' });

    const installationId = getOrCreateInstallationId();

    expect(installationId).toMatch(/^web-[a-f0-9]{32}$/i);
    expect(localStorage.getItem('cms-device-fingerprint')).toBe(installationId);
  });
});

describe('native token seal helpers (D-JS-AUTH)', () => {
  beforeEach(() => {
    localStorage.clear();
    removeNativeBridge();
  });

  afterEach(() => {
    removeNativeBridge();
    localStorage.clear();
  });

  it('reports the seal unavailable in a plain browser and on pre-upgrade shells', () => {
    expect(isTokenSealAvailable()).toBe(false);
    expect(sealForLocalPersistence('blob')).toBeNull();
    expect(unsealForLocalPersistence('v1:blob')).toBeNull();

    // Old shell: four required methods, no seal pair — availability must stay false.
    installNativeBridge();
    expect(isTokenSealAvailable()).toBe(false);
    expect(sealForLocalPersistence('blob')).toBeNull();
    expect(unsealForLocalPersistence('v1:blob')).toBeNull();
  });

  it('seals and unseals page-owned blobs when the shell exposes the pair', () => {
    installSealingBridge();

    expect(isTokenSealAvailable()).toBe(true);
    const sealed = sealForLocalPersistence('{"accessToken":"a","refreshToken":"r"}');
    expect(sealed).toBe('v1:{"accessToken":"a","refreshToken":"r"}');
    expect(unsealForLocalPersistence(sealed!)).toBe('{"accessToken":"a","refreshToken":"r"}');
    expect(isSealedValue(sealed!)).toBe(true);
    expect(isSealedValue('raw-legacy-token')).toBe(false);
  });

  it('treats empty answers, wrong envelopes, and throwing bridges as absent (fail closed)', () => {
    installSealingBridge({ sealForLocalPersistence: () => '' });
    expect(sealForLocalPersistence('blob')).toBeNull();

    installSealingBridge({ sealForLocalPersistence: () => 'not-v1-envelope' });
    expect(sealForLocalPersistence('blob')).toBeNull();

    installSealingBridge({
      sealForLocalPersistence: () => { throw new Error('keystore gone'); },
      unsealForLocalPersistence: () => { throw new Error('keystore gone'); },
    });
    expect(sealForLocalPersistence('blob')).toBeNull();
    expect(unsealForLocalPersistence('v1:blob')).toBeNull();
  });
});
