/**
 * Wave 11.7.x — PART I regression specs for useMediaLease.
 *
 * P0 (hook hygiene) closed W4/W5/W6/W8/W10; P1 (swap lifecycle) redesigned
 * the public contract. This file is the PERMANENT guardian of the five P0
 * behaviors, mechanically adapted to the P1 contract in one commit with a
 * documented 1:1 assertion mapping (supervisor-approved via X-b.1/DF-2):
 *
 *   ┌───────────────────────────────────┬───────────────────────────────────────────────┐
 *   │ P0 assertion                      │ P1 form                                        │
 *   ├───────────────────────────────────┼───────────────────────────────────────────────┤
 *   │ generation N (counts LOADS;       │ swapId N−1 (counts SWAPS; initial = 0)        │
 *   │ initial = 1)                      │ + onSwapStart spy count (initial is silent)   │
 *   ├───────────────────────────────────┼───────────────────────────────────────────────┤
 *   │ W4: generation 2 after a          │ ONE onSwapStart per coalesced refresh pair    │
 *   │ coalesced refresh pair            │ (swapId 1), postMock still 2 calls            │
 *   ├───────────────────────────────────┼───────────────────────────────────────────────┤
 *   │ W5: generation 1 after B's        │ swapId 0 + zero onSwapStart (B's initial was  │
 *   │ initial + A's stale discard       │ silent; A's stale response discarded)         │
 *   ├───────────────────────────────────┼───────────────────────────────────────────────┤
 *   │ W6: generation 2 after the retry  │ onSwapStart once (swapId 1) once the retry    │
 *   │ lands                             │ URL lands and is acked                        │
 *   ├───────────────────────────────────┼───────────────────────────────────────────────┤
 *   │ W8: error truthy (string)         │ error instanceof Error + no toast + no        │
 *   │                                   │ onSwapStart                                   │
 *   ├───────────────────────────────────┼───────────────────────────────────────────────┤
 *   │ W10: pendingTimeRef null +        │ STRONGER: no onSwapStart for the failed       │
 *   │ wasPlayingRef false after a       │ fetch (nothing was ever captured — capture    │
 *   │ failed refresh                    │ is at the swap moment), and the NEXT         │
 *   │                                   │ successful swap's ctx.previousState reflects  │
 *   │                                   │ FRESH capture, not the pre-failure state     │
 *   ├───────────────────────────────────┼───────────────────────────────────────────────┤
 *   │ fetchUrl({ preserveTime, … })     │ refresh(reason) — preserveTime is subsumed    │
 *   │                                   │ by capture-at-swap (DF-1)                     │
 *   └───────────────────────────────────┴───────────────────────────────────────────────┘
 *
 * House conventions (unchanged): axios layer + entitlement config + sonner
 * mocked; mediaApi's real mapping runs; every playback-url POST is a
 * manually-resolvable deferred; fake timers drive the lease schedule
 * (ttl=8 → first silent refresh at ~3s, retry at 15s).
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

import { useMediaLease, type SwapContext } from '../useMediaLease';
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

/** Writable media element stub (seeks take; readyState 4). */
function stubMedia(overrides: { currentTime?: number; paused?: boolean; ended?: boolean } = {}) {
  const el = {
    currentTime: 0,
    paused: true,
    ended: false,
    playbackRate: 1,
    volume: 1,
    muted: false,
    preservesPitch: true,
    duration: 90,
    readyState: 4,
    seekable: { length: 1, start: () => 0, end: () => 90 },
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.assign(el, overrides);
  return el as unknown as HTMLAudioElement & { play: ReturnType<typeof vi.fn> };
}

/** Deterministically drain the microtask chain (entitlement await → apiClient
 * POST → deferred enqueue) — fake timers do not fake microtasks. */
async function flushAsync(ticks = 10) {
  for (let i = 0; i < ticks; i += 1) await Promise.resolve();
}

/** HTMLMediaElement.paused is readonly in the TS lib — the stub is a plain
 *  writable object; mutate it through this cast. */
function setPaused(el: HTMLAudioElement, value: boolean) {
  (el as unknown as { paused: boolean }).paused = value;
}

function setup(assetId = 'lease-a', media = stubMedia()) {
  const events: Array<{ type: 'start' | 'complete' | 'error'; ctx: SwapContext }> = [];
  const onSwapStart = vi.fn((ctx: SwapContext) => {
    events.push({ type: 'start', ctx });
  });
  const onSwapComplete = vi.fn((ctx: SwapContext) => {
    events.push({ type: 'complete', ctx });
  });
  const onSwapError = vi.fn(() => {});
  const mediaRef = { current: media } as React.RefObject<HTMLMediaElement | null>;
  const rendered = renderHook(
    ({ id }) => useMediaLease({
      assetType: 'library-file',
      assetId: id,
      mediaRef,
      onSwapStart,
      onSwapComplete,
      onSwapError,
    }),
    { initialProps: { id: assetId } },
  );
  // auto-ack: models a consumer whose element is already swap-ready, so
  // start → ack → restore → complete is one synchronous cascade (the stub
  // element accepts seeks).
  const original = onSwapStart.getMockImplementation()!;
  onSwapStart.mockImplementation((ctx: SwapContext) => {
    original(ctx);
    rendered.result.current.ackSwap(ctx.swapId);
  });
  return {
    result: rendered.result,
    events,
    onSwapStart,
    rerender: rendered.rerender,
    media,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useMediaLease — P0 hook hygiene behaviors on the P1 contract (Wave 11.7.x)', () => {
  it('W4 — overlapping refreshes for the same asset coalesce into ONE swap', async () => {
    vi.useFakeTimers();
    const queue = deferredPosts();
    const { result, onSwapStart, events } = setup('lease-a', stubMedia({ currentTime: 42, paused: false }));

    // initial fetch resolves → SILENT (initial loads fire no lifecycle, C4);
    // mapping: P0 "generation 1" ⇔ swapId 0 + zero onSwapStart.
    await act(async () => {
      await flushAsync();
    });
    expect(queue.length).toBe(1);
    await act(async () => {
      queue[0].resolve(makeInfo('url-1', 8));
    });
    expect(onSwapStart).not.toHaveBeenCalled();
    expect(result.current.swapId).toBe(0);

    // the timer-driven silent refresh fires and stays pending…
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(queue.length).toBe(2);

    // …while an error-driven refresh arrives in the same window (the W4
    // overlap) — coalesced onto the in-flight fetch, never a second mint
    act(() => {
      result.current.refresh('error');
    });
    await act(async () => {
      await flushAsync();
    });
    expect(queue.length).toBe(2); // RED pre-P0: 3 — two presigned mints in flight

    // every in-flight response settles
    await act(async () => {
      queue[1].resolve(makeInfo('url-2', 8));
      queue[2]?.resolve(makeInfo('url-3', 8)); // absent post-fix (coalesced)
    });

    // mapping: P0 "generation 2 + double swap" ⇔ ONE onSwapStart (swapId 1)
    // for the coalesced pair — one mint, one swap, one restore.
    expect(postMock).toHaveBeenCalledTimes(2); // RED pre-P0: 3 presigned mints
    expect(onSwapStart).toHaveBeenCalledTimes(1); // RED pre-P0-shape: 2 swaps
    expect(events[0].ctx.swapId).toBe(1);
    expect(events[0].ctx.newUrl).toBe('url-2');
    expect(result.current.swapId).toBe(1); // RED pre-fix: 3 (double swap, second restore loses position)
    expect(result.current.info?.url).toBe('url-2');
    expect(result.current.refreshing).toBe(false);
  });

  it('W5 — a stale response from the previous asset is discarded after an in-place asset change', async () => {
    vi.useFakeTimers();
    const queue = deferredPosts();
    const { result, rerender, onSwapStart } = setup('lease-a');

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

    // B's response lands first: clean INITIAL state for B (silent — no swap)
    await act(async () => {
      queue[1].resolve(makeInfo('url-b', 8));
    });
    expect(result.current.info?.url).toBe('url-b');
    expect(result.current.info?.swapId).toBeNull();
    expect(result.current.swapId).toBe(0); // mapping: P0 "generation 1" ⇔ swapId 0
    expect(onSwapStart).not.toHaveBeenCalled();

    // A's stale response lands LAST — discarded: no state change, no swap
    await act(async () => {
      queue[0].resolve(makeInfo('url-a', 8));
    });

    expect(result.current.info?.url).toBe('url-b'); // RED pre-fix: 'url-a' overwrote B
    expect(result.current.swapId).toBe(0); // RED pre-fix: 2 (ghost bump)
    expect(onSwapStart).not.toHaveBeenCalled(); // the stale response never became a swap
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('W6 — the retry timer re-arms after a failed silent refresh', async () => {
    vi.useFakeTimers();
    const queue = deferredPosts();
    const { result, onSwapStart, events } = setup('lease-a', stubMedia({ currentTime: 42, paused: false }));

    // initial URL lands (ttl 8s -> first silent refresh at ~3s) — silent
    await act(async () => {
      await flushAsync();
    });
    await act(async () => {
      queue[0].resolve(makeInfo('url-1', 8));
    });
    expect(result.current.swapId).toBe(0);
    expect(onSwapStart).not.toHaveBeenCalled();

    // first silent refresh fires and FAILS
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(queue.length).toBe(2);
    await act(async () => {
      queue[1].reject(new Error('presign 503'));
    });
    expect(result.current.refreshing).toBe(false);
    expect(result.current.swapId).toBe(0); // no swap on failure
    expect(onSwapStart).not.toHaveBeenCalled(); // a failed fetch never starts a swap
    expect(toastInfoMock).toHaveBeenCalledTimes(1); // auto-renewal toast (attempt 1 < MAX)

    // RETRY_DELAY_MS (15s) passes — the retry must actually fire
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(queue.length).toBe(3); // RED pre-fix: 2 — retry never armed, lease rides the expiring URL

    await act(async () => {
      queue[2].resolve(makeInfo('url-2', 8));
    });
    // mapping: P0 "generation 2" ⇔ the retry URL becomes the FIRST swap
    expect(onSwapStart).toHaveBeenCalledTimes(1);
    expect(events[0].ctx.newUrl).toBe('url-2');
    expect(result.current.swapId).toBe(1); // RED pre-fix: stuck at 1 (P0 generation semantics)
    expect(result.current.info?.url).toBe('url-2');
    expect(result.current.error).toBeNull();
  });

  it('W8 — an asset change classifies the new asset\'s first fetch as INITIAL, not refresh', async () => {
    vi.useFakeTimers();
    const queue = deferredPosts();
    const { result, rerender, onSwapStart } = setup('lease-a');

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
    expect(result.current.error).toBeInstanceOf(Error); // RED pre-fix: null — misrouted to the silent branch
    expect(result.current.loading).toBe(false); // RED pre-fix: true — infinite spinner
    expect(toastInfoMock).not.toHaveBeenCalled(); // RED pre-fix: silent auto-renewal toast fired
    expect(onSwapStart).not.toHaveBeenCalled(); // no swap lifecycle for a failed initial
  });

  it('W10 — a failed refresh captures NOTHING; the next swap captures FRESH state (stronger than the P0 ref check)', async () => {
    vi.useFakeTimers();
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 42, paused: false }); // playing at 42s
    const { result, onSwapStart, events } = setup('lease-a', media);

    await act(async () => {
      await flushAsync();
    });
    await act(async () => {
      queue[0].resolve(makeInfo('url-1', 8));
    });
    expect(result.current.swapId).toBe(0);

    // the silent refresh fires; user intent lands DURING the fetch window
    // (P0 captured this at fetch ENTRY — the stale-capture poison source)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(queue.length).toBe(2);
    media.currentTime = 42;
    setPaused(media, false);

    // the refresh FAILS — the swap never starts, so NOTHING was captured
    // (P0 mapping: pendingTimeRef=null + wasPlayingRef=false ⇔ no ctx exists)
    await act(async () => {
      queue[1].reject(new Error('presign 503'));
    });
    expect(onSwapStart).not.toHaveBeenCalled(); // RED pre-fix-shape: a stale capture survived in refs

    // the retry lands (W6) — element state has CHANGED again since the
    // failed fetch; the new swap must capture FRESH state, not the 42s that
    // was live when the failed fetch entered.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(queue.length).toBe(3);
    media.currentTime = 77;
    setPaused(media, false);
    await act(async () => {
      queue[2].resolve(makeInfo('url-2', 8));
    });

    expect(onSwapStart).toHaveBeenCalledTimes(1);
    expect(events[0].ctx.previousState.currentTime).toBe(77); // FRESH capture — the 42 never poisoned it
    expect(events[0].ctx.previousState.paused).toBe(false);
    expect(media.currentTime).toBe(77); // restored to the fresh capture
    expect(result.current.swapId).toBe(1);
  });
});
