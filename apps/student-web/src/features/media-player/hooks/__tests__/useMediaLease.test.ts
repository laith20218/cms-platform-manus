/**
 * Wave 11.7.x — PART I (P0) red-first regression specs for useMediaLease.
 *
 * One spec per race window closed by P0 hook hygiene:
 *   W4  overlapping refreshes (fetch → fetch in-flight guard)
 *   W5  stale response resolving across an in-place asset change
 *   W6  dead retry path (timer never re-armed after a failed refresh)
 *   W8  stale isRefresh closure (asset-change initial fetch misclassified)
 *   W10 stale capture refs surviving a failed refresh
 *
 * Each spec is written RED against the pre-P0 hook (evidence recorded in the
 * per-window commit) and must stay GREEN afterwards — they are permanent.
 *
 * House conventions (mirrors favorites/tests/hooks.test.tsx): the axios layer
 * + entitlement config + sonner are mocked; mediaApi's real mapping runs.
 * Every playback-url POST is a manually-resolvable deferred so fetch
 * interleaving is fully deterministic (fake timers drive the lease schedule).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// ---- shared mocks (hoisted) ----
const { postMock, toastInfoMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  toastInfoMock: vi.fn(),
}));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: () => {
      throw new Error('unexpected apiClient.get in lease tests');
    },
    post: (...args: unknown[]) => postMock(...args),
    delete: () => {
      throw new Error('unexpected apiClient.delete in lease tests');
    },
  },
}));

vi.mock('@/features/entitlements/services/entitlement-api', () => ({
  entitlementRequestConfig: async () => ({}),
}));

vi.mock('sonner', () => ({
  toast: {
    info: (...args: unknown[]) => toastInfoMock(...args),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { useMediaLease } from '../useMediaLease';
import type { PlaybackUrlInfo } from '../../services/media-api';

// ---- fixtures ----

function makeInfo(url: string, ttlSeconds = 8): PlaybackUrlInfo {
  return {
    url,
    ttlSeconds,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    contentType: 'video/mp4',
    supportsRange: true,
  };
}

/** Manually-resolvable playback-url POSTs, in call order. */
interface DeferredPost {
  resolve: (info: PlaybackUrlInfo) => void;
  reject: (err: unknown) => void;
}
function deferredPosts(): DeferredPost[] {
  const queue: DeferredPost[] = [];
  postMock.mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        queue.push({ resolve: (info) => resolve({ data: info }), reject });
      }),
  );
  return queue;
}

/** Minimal media element — the hook only reads currentTime/paused/ended. */
function stubMedia(overrides: { currentTime?: number; paused?: boolean; ended?: boolean } = {}) {
  return { currentTime: 0, paused: true, ended: false, ...overrides } as unknown as HTMLAudioElement;
}

/** Deterministically drain the microtask chain (entitlement await → apiClient
 * POST → deferred enqueue) — fake timers do not fake microtasks. */
async function flushAsync(ticks = 10) {
  for (let i = 0; i < ticks; i += 1) await Promise.resolve();
}

function setup(assetId = 'lease-a', media = stubMedia()) {
  const mediaRef = { current: media };
  return renderHook(
    ({ id }) => useMediaLease({ assetType: 'library-file', assetId: id, mediaRef }),
    { initialProps: { id: assetId } },
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useMediaLease P0 — hook hygiene (Wave 11.7.x)', () => {
  it('W4 — overlapping refreshes for the same asset coalesce into ONE generation bump', async () => {
    vi.useFakeTimers();
    const queue = deferredPosts();
    const { result } = setup('lease-a', stubMedia({ currentTime: 42, paused: false }));

    // initial fetch reaches the mocked POST -> resolve it -> generation 1
    // (ttl 8s clamps the next silent refresh to ~3s)
    await act(async () => {
      await flushAsync();
    });
    expect(queue.length).toBe(1);
    await act(async () => {
      queue[0].resolve(makeInfo('url-1', 8));
    });
    expect(result.current.generation).toBe(1);

    // the timer-driven silent refresh fires and stays pending...
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(queue.length).toBe(2);

    // ...while an error-driven refresh arrives in the same window (the W4 overlap)
    act(() => {
      void result.current.fetchUrl({ preserveTime: true, reason: 'error' });
    });
    await act(async () => {
      await flushAsync();
    });
    expect(queue.length).toBe(2); // RED pre-fix: 3 — two presigned mints in flight

    // every in-flight response settles
    await act(async () => {
      queue[1].resolve(makeInfo('url-2', 8));
      queue[2]?.resolve(makeInfo('url-3', 8)); // absent post-fix (coalesced)
    });

    expect(postMock).toHaveBeenCalledTimes(2); // RED pre-fix: 3 presigned mints
    expect(result.current.generation).toBe(2); // RED pre-fix: 3 (double swap, second restore loses position)
    expect(result.current.info?.url).toBe('url-2');
    expect(result.current.refreshing).toBe(false);
  });

  it('W5 — a stale response from the previous asset is discarded after an in-place asset change', async () => {
    vi.useFakeTimers();
    const queue = deferredPosts();
    const { result, rerender } = setup('lease-a');

    // asset switches BEFORE the initial response for A lands
    await act(async () => {
      await flushAsync();
    });
    expect(queue.length).toBe(1); // A's initial fetch, still pending
    act(() => {
      rerender({ id: 'lease-b' });
    });
    await act(async () => {
      await flushAsync();
    });
    expect(queue.length).toBe(2); // B's initial fetch issued

    // B's response lands first: clean state for B
    await act(async () => {
      queue[1].resolve(makeInfo('url-b', 8));
    });
    expect(result.current.info?.url).toBe('url-b');
    expect(result.current.generation).toBe(1);

    // A's stale response lands LAST — it must be discarded, not swapped in
    await act(async () => {
      queue[0].resolve(makeInfo('url-a', 8));
    });

    expect(result.current.info?.url).toBe('url-b'); // RED pre-fix: 'url-a' overwrote B
    expect(result.current.generation).toBe(1); // RED pre-fix: 2 (ghost bump)
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('W6 — the retry timer re-arms after a failed silent refresh', async () => {
    vi.useFakeTimers();
    const queue = deferredPosts();
    const { result } = setup('lease-a');

    // initial URL lands (ttl 8s -> first silent refresh at ~3s)
    await act(async () => {
      await flushAsync();
    });
    await act(async () => {
      queue[0].resolve(makeInfo('url-1', 8));
    });
    expect(result.current.generation).toBe(1);

    // first silent refresh fires and FAILS
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(queue.length).toBe(2);
    await act(async () => {
      queue[1].reject(new Error('presign 503'));
    });
    expect(result.current.refreshing).toBe(false);
    expect(result.current.generation).toBe(1); // no bump on failure
    expect(toastInfoMock).toHaveBeenCalledTimes(1); // auto-renewal toast (attempt 1 < MAX)

    // RETRY_DELAY_MS (15s) passes — the retry must actually fire
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(queue.length).toBe(3); // RED pre-fix: 2 — retry never armed, lease rides the expiring URL

    await act(async () => {
      queue[2].resolve(makeInfo('url-2', 8));
    });
    expect(result.current.generation).toBe(2); // RED pre-fix: stuck at 1
    expect(result.current.info?.url).toBe('url-2');
    expect(result.current.error).toBeNull();
  });

  it('W8 — an asset change classifies the new asset\'s first fetch as INITIAL, not refresh', async () => {
    vi.useFakeTimers();
    const queue = deferredPosts();
    const { result, rerender } = setup('lease-a');

    // asset A loads fully
    await act(async () => {
      await flushAsync();
    });
    await act(async () => {
      queue[0].resolve(makeInfo('url-a', 8));
    });
    expect(result.current.info?.url).toBe('url-a');

    // switch asset; the NEW asset's initial fetch will fail
    act(() => {
      rerender({ id: 'lease-b' });
    });
    await act(async () => {
      await flushAsync();
    });
    expect(queue.length).toBe(2);
    await act(async () => {
      queue[1].reject(new Error('presign 500'));
    });

    // the failure must take the INITIAL branch: surfaced error, loading done
    expect(result.current.error).toBeTruthy(); // RED pre-fix: null — misrouted to the silent branch
    expect(result.current.loading).toBe(false); // RED pre-fix: true — infinite spinner
    expect(toastInfoMock).not.toHaveBeenCalled(); // RED pre-fix: silent auto-renewal toast fired
  });
});
