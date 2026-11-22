import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isNativeMediaCacheActive,
  nativeCacheDenyMessage,
  nativeCachePercent,
  nativeCacheStatus,
  nativeCacheTypeFor,
  nativeEnsureLocal,
  nativeOpenLocal,
  waitForNativeCacheReady,
} from './native-cache';
import { hasNativeShell } from './native-bridge';

type MutableGlobal = Record<string, unknown>;

function installFullBridge(overrides: Record<string, unknown> = {}): void {
  (globalThis as unknown as MutableGlobal).CmsNative = {
    hasNativeShell: () => true,
    getPlatform: () => 'android',
    getAppVersion: () => '0.2.0',
    getInstallationId: () => '11111111-2222-4333-8444-555555555555',
    listCached: () => '[]',
    ensureLocal: () => 'ready',
    openLocal: () => 'opened',
    cacheStatus: () => 'ready',
    cancelDownload: () => 'canceled',
    removeCached: () => 'removed',
    clearCache: () => 'cleared',
    ...overrides,
  };
}

/** Batch-3-only shell: the four identity methods, no cache surface. */
function installBatchThreeBridge(): void {
  (globalThis as unknown as MutableGlobal).CmsNative = {
    hasNativeShell: () => true,
    getPlatform: () => 'android',
    getAppVersion: () => '0.1.0',
    getInstallationId: () => '11111111-2222-4333-8444-555555555555',
  };
}

function removeBridge(): void {
  delete (globalThis as unknown as MutableGlobal).CmsNative;
}

const CONTENT_ID = '11111111-2222-4333-8444-555555555555';

describe('native media cache helpers (Batch 4)', () => {
  beforeEach(() => {
    removeBridge();
  });

  afterEach(() => {
    removeBridge();
    vi.useRealTimers();
  });

  it('stays inactive in a plain browser — no shell, no cache bridge, null everywhere', () => {
    expect(hasNativeShell()).toBe(false);
    expect(isNativeMediaCacheActive()).toBe(false);
    expect(nativeEnsureLocal(CONTENT_ID, 'pdf', { title: 'x' })).toBeNull();
    expect(nativeOpenLocal(CONTENT_ID)).toBeNull();
    expect(nativeCacheStatus(CONTENT_ID)).toBeNull();
  });

  it('is active only when the shell exposes the Batch-4 cache methods', () => {
    installBatchThreeBridge();
    expect(hasNativeShell()).toBe(true);
    expect(isNativeMediaCacheActive()).toBe(false);

    installFullBridge();
    expect(isNativeMediaCacheActive()).toBe(true);
  });

  it('treats a throwing bridge as absent (fail closed, never propagate)', () => {
    installFullBridge({
      hasNativeShell: () => {
        throw new Error('bridge unavailable');
      },
      ensureLocal: () => {
        throw new Error('bridge unavailable');
      },
      cacheStatus: () => {
        throw new Error('bridge unavailable');
      },
    });
    expect(isNativeMediaCacheActive()).toBe(false);
    expect(nativeEnsureLocal(CONTENT_ID, 'pdf')).toBeNull();
    expect(nativeCacheStatus(CONTENT_ID)).toBeNull();
  });

  it('maps viewer kinds onto native cache types and refuses youtube rows', () => {
    expect(nativeCacheTypeFor('pdf')).toBe('pdf');
    expect(nativeCacheTypeFor('txt')).toBe('txt');
    expect(nativeCacheTypeFor('text')).toBe('txt');
    expect(nativeCacheTypeFor('html')).toBe('html');
    expect(nativeCacheTypeFor('image')).toBe('image');
    expect(nativeCacheTypeFor('video')).toBe('video');
    expect(nativeCacheTypeFor('audio')).toBe('audio');
    expect(nativeCacheTypeFor('other')).toBeNull();
    expect(nativeCacheTypeFor(null)).toBeNull();
    expect(nativeCacheTypeFor('video', 'dQw4w9WgXcQ')).toBeNull();
    expect(nativeCacheTypeFor('pdf', 'dQw4w9WgXcQ')).toBe('pdf');
  });

  it('passes trimmed args and JSON hints into ensureLocal and returns the native code', () => {
    const ensureLocal = vi.fn(() => 'started');
    installFullBridge({ ensureLocal });
    const code = nativeEnsureLocal(`  ${CONTENT_ID} `, 'pdf', { title: 'الدرس الأول' });
    expect(code).toBe('started');
    expect(ensureLocal).toHaveBeenCalledWith(CONTENT_ID, 'pdf', JSON.stringify({ title: 'الدرس الأول' }));
  });

  it('omits the hints payload entirely when there is nothing to hint', () => {
    const ensureLocal = vi.fn(() => 'ready');
    installFullBridge({ ensureLocal });
    expect(nativeEnsureLocal(CONTENT_ID, 'audio')).toBe('ready');
    expect(ensureLocal).toHaveBeenCalledWith(CONTENT_ID, 'audio', undefined);
  });

  it('returns null for blank or oversized ids instead of calling the bridge', () => {
    const ensureLocal = vi.fn(() => 'ready');
    installFullBridge({ ensureLocal });
    expect(nativeEnsureLocal('', 'pdf')).toBeNull();
    expect(nativeEnsureLocal('x'.repeat(300), 'pdf')).toBeNull();
    expect(ensureLocal).not.toHaveBeenCalled();
  });

  it('openLocal and cacheStatus return the native codes', () => {
    installFullBridge({ openLocal: () => 'denied_stale', cacheStatus: () => 'downloading:42' });
    expect(nativeOpenLocal(CONTENT_ID)).toBe('denied_stale');
    expect(nativeCacheStatus(CONTENT_ID)).toBe('downloading:42');
  });

  it('extracts the percent out of a downloading status', () => {
    expect(nativeCachePercent('downloading:42')).toBe(42);
    expect(nativeCachePercent('downloading:0')).toBe(0);
    expect(nativeCachePercent('downloading:100')).toBe(100);
    expect(nativeCachePercent('ready')).toBeNull();
    expect(nativeCachePercent('downloading:abc')).toBeNull();
    expect(nativeCachePercent('downloading:')).toBeNull();
  });

  it('maps every deny code to an Arabic message and stays silent for invalid_args', () => {
    expect(nativeCacheDenyMessage('denied_native_session')).toContain('وضع بدون إنترنت');
    expect(nativeCacheDenyMessage('denied_auth')).toContain('حسابك');
    expect(nativeCacheDenyMessage('denied_offline')).toContain('اتصل بالإنترنت');
    expect(nativeCacheDenyMessage('denied_stale')).toContain('صلاحية');
    expect(nativeCacheDenyMessage('quota')).toContain('ممتلئة');
    expect(nativeCacheDenyMessage('error:quota')).toContain('ممتلئة');
    expect(nativeCacheDenyMessage('unsupported_type')).toContain('غير مدعوم');
    expect(nativeCacheDenyMessage('error:network')).toContain('خطأ');
    expect(nativeCacheDenyMessage('invalid_args')).toBeNull();
    expect(nativeCacheDenyMessage('mystery')).toBeNull();
  });

  it('waits until the status flips to ready and reports progress', async () => {
    vi.useFakeTimers();
    const statuses = ['downloading:10', 'downloading:80', 'ready'];
    const cacheStatus = vi.fn(() => statuses.shift() ?? 'ready');
    installFullBridge({ cacheStatus });
    const onProgress = vi.fn();

    const pending = waitForNativeCacheReady(CONTENT_ID, { pollMs: 100, onProgress });
    await vi.advanceTimersByTimeAsync(300);
    const result = await pending;

    expect(result).toBe('ready');
    expect(onProgress).toHaveBeenNthCalledWith(1, 10);
    expect(onProgress).toHaveBeenNthCalledWith(2, 80);
  });

  it('resolves denied_auth and error outcomes without waiting forever', async () => {
    vi.useFakeTimers();
    const cacheStatus = vi.fn()
      .mockReturnValueOnce('downloading:10')
      .mockReturnValueOnce('denied_auth');
    installFullBridge({ cacheStatus });

    const pending = waitForNativeCacheReady(CONTENT_ID, { pollMs: 50 });
    await vi.advanceTimersByTimeAsync(150);
    expect(await pending).toBe('denied_auth');

    const failing = vi.fn().mockReturnValue('error:network');
    installFullBridge({ cacheStatus: failing });
    const second = waitForNativeCacheReady(CONTENT_ID, { pollMs: 50 });
    await vi.advanceTimersByTimeAsync(150);
    expect(await second).toBe('error');
  });

  it('stops early through the shouldStop callback', async () => {
    vi.useFakeTimers();
    const cacheStatus = vi.fn(() => 'downloading:20');
    installFullBridge({ cacheStatus });

    const pending = waitForNativeCacheReady(CONTENT_ID, { pollMs: 50, shouldStop: () => true });
    expect(await pending).toBe('absent');
    expect(cacheStatus).not.toHaveBeenCalled();
  });

  it('times out honestly after the configured window', async () => {
    vi.useFakeTimers();
    installFullBridge({ cacheStatus: () => 'downloading:20' });

    const pending = waitForNativeCacheReady(CONTENT_ID, { pollMs: 50, timeoutMs: 200 });
    await vi.advanceTimersByTimeAsync(250);
    expect(await pending).toBe('timeout');
  });
});
