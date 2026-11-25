import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Phase P (containment) — wipe-on-logout / wipe-on-401 regression suite.
 *
 * clearSession() (src/services/session-store.ts) is the SINGLE choke point the
 * logout button and the api-client 401 verdict (isSessionEndingFailure →
 * clearSession, src/services/api-client.ts) both route through. Phase P adds
 * one best-effort call to the native shell — window.CmsNative.notifyWebSessionEnded()
 * (bridge method #19) — so the offline stores wipe with the web session.
 *
 * Path coverage note: the 401-verdict path is covered by calling clearSession()
 * directly — the same function the api-client interceptor invokes at its
 * `isSessionEndingFailure` branch (replicating the full axios
 * 401→refresh→retry→verdict pipeline in jsdom adds no assertion value over the
 * choke point itself; the interceptor's routing into clearSession is the
 * pre-existing, already-tested Wave A behavior).
 *
 * Locks:
 *  1. With the bridge present, clearSession() fires notifyWebSessionEnded
 *     exactly ONCE per call (logout path AND the 401-verdict path share it).
 *  2. Without the bridge (plain browser / pre-Phase-P shell), clearSession()
 *     still wipes everything and never throws — the hook is a no-op.
 *  3. A THROWING bridge never breaks logout: the wipe still completes.
 *  4. The hook never resurrects tokens: both stores + the flag end up empty.
 */

type MutableGlobal = Record<string, unknown>;

function removeBridge(): void {
  delete (globalThis as unknown as MutableGlobal).CmsNative;
}

function installWipeBridge(overrides: Record<string, unknown> = {}): void {
  (globalThis as unknown as MutableGlobal).CmsNative = {
    hasNativeShell: () => true,
    getPlatform: () => 'android',
    getAppVersion: () => '0.4.0',
    getInstallationId: () => '11111111-2222-4333-8444-555555555555',
    ...overrides,
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  removeBridge();
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  removeBridge();
  vi.restoreAllMocks();
});

describe('Phase P — clearSession notifies the native shell (wipe hook)', () => {
  it('fires notifyWebSessionEnded exactly once per clearSession call and wipes the web session', async () => {
    const notifySpy = vi.fn(() => 'wiped');
    installWipeBridge({ notifyWebSessionEnded: notifySpy });

    const { writeSession, clearSession, readSession, isRememberMeEnabled } = await import('@/services/session-store');
    writeSession({ accessToken: 'A1', refreshToken: 'R1' }, true);

    clearSession();

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(readSession()).toBeNull();
    expect(isRememberMeEnabled()).toBe(false);
    expect(window.sessionStorage.getItem('cms-access-token')).toBeNull();
    expect(window.localStorage.getItem('cms-access-token')).toBeNull();
    expect(window.localStorage.getItem('cms-remembered-user')).toBeNull();
  });

  it('the 401-verdict path shares the same choke point: the hook fires once per call', async () => {
    // api-client's interceptor calls clearSession() when the server rules the
    // refresh dead (isSessionEndingFailure). Direct invocation of the same
    // choke point — see the suite header for the honest coverage note.
    const notifySpy = vi.fn(() => 'kept_native_session');
    installWipeBridge({ notifyWebSessionEnded: notifySpy });

    const { writeSession, clearSession, readSession } = await import('@/services/session-store');
    writeSession({ accessToken: 'A2', refreshToken: 'R2' }, false);

    expect(() => clearSession()).not.toThrow();
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(readSession()).toBeNull();

    // Idempotent: a second verdict/logout call notifies exactly once again.
    clearSession();
    expect(notifySpy).toHaveBeenCalledTimes(2);
  });

  it('without any bridge (plain browser / older shell) clearSession still works and never throws', async () => {
    removeBridge();

    const { writeSession, clearSession, readSession, isRememberMeEnabled } = await import('@/services/session-store');
    writeSession({ accessToken: 'A3', refreshToken: 'R3' }, true);

    expect(() => clearSession()).not.toThrow();
    expect(readSession()).toBeNull();
    expect(isRememberMeEnabled()).toBe(false);
    expect(window.sessionStorage.getItem('cms-refresh-token')).toBeNull();
    expect(window.localStorage.getItem('cms-refresh-token')).toBeNull();
  });

  it('a pre-Phase-P shell (bridge without notifyWebSessionEnded) is an honest no-op', async () => {
    installWipeBridge({ notifyWebSessionEnded: undefined });

    const { writeSession, clearSession, readSession } = await import('@/services/session-store');
    writeSession({ accessToken: 'A4', refreshToken: 'R4' }, true);

    expect(() => clearSession()).not.toThrow();
    expect(readSession()).toBeNull();
  });

  it('a throwing bridge never breaks logout — the wipe still completes', async () => {
    installWipeBridge({
      notifyWebSessionEnded: () => {
        throw new Error('bridge gone');
      },
    });

    const { writeSession, clearSession, readSession } = await import('@/services/session-store');
    writeSession({ accessToken: 'A5', refreshToken: 'R5' }, true);

    expect(() => clearSession()).not.toThrow();
    expect(readSession()).toBeNull();
    expect(window.localStorage.getItem('cms-access-token')).toBeNull();
  });
});
