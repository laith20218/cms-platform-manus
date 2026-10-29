/**
 * Wave 11.7.x — PART I (P1) red-first specs for the REDESIGNED useMediaLease.
 *
 * W9 — the swap lifecycle contract (all RED against the P0 hook):
 *   - module surface: useMediaLease, isElementSwapReady, SWAP_ACK_TIMEOUT_MS,
 *     RESTORE_TIMEOUT_MS exported
 *   - onSwapStart / onSwapComplete / onSwapError fire with a correct, FROZEN
 *     SwapContext (same reference in all three), in the right order, swapId
 *     monotonic per hook instance
 *   - capture happens AT THE SWAP MOMENT (the fetch-resolution turn), never at
 *     fetch entry — the W3 core
 *   - initial load fires NO lifecycle events (info.swapId === null)
 *   - ackSwap validates swapId + in-flight state; wrong/double/no-flight acks
 *     are warn-no-ops (idempotent)
 *   - deadline exits: SWAP_ACK_TIMEOUT_MS (no URL rollback) and
 *     RESTORE_TIMEOUT_MS (element refused the seek), with one readiness retry
 *     before the restore deadline
 *   - swapAckTimeoutMs option overrides the ack deadline (clamped >= 500ms)
 *   - refresh(reason) — imperative entry point; coalesces during SWAPPING
 *     (queue depth 1, latest-wins) and executes at the swap's terminal
 *   - ASSET_CHANGE edge: in-flight swap terminal-cleared (no emission), late
 *     ack warns, swapId stays monotonic, next load is initial (swapId null)
 *   - a failed fetch NEVER emits onSwapError (fetch failure ≠ swap failure)
 *   - restore semantics: ended media → time 0 + no autoplay; seek target
 *     clamped to the seekable range (OPEN-9)
 *
 * House conventions (mirrors the P0 file in this directory): axios layer +
 * entitlement config + sonner mocked; mediaApi's real mapping runs; every
 * playback-url POST is a manually-resolvable deferred; fake timers drive the
 * lease schedule (ttl=8 → first silent refresh at ~3s).
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

// Namespace import: on the P0 hook the new exports are simply absent — the
// surface spec below fails on a clean typeof check instead of a link error.
import * as leaseModule from '../useMediaLease';
import type { SwapContext } from '../useMediaLease';
import type { PlaybackUrlInfo } from '../../services/media-api';

const useMediaLease = leaseModule.useMediaLease;

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

type MediaListener = () => void;

/** Writable media element stub — the hook reads state at capture and writes
 *  at restore; seeks always take (readyState 4, seekable spans 0..90). */
function stubMedia(overrides: Record<string, unknown> = {}) {
  const listeners = new Map<string, Set<MediaListener>>();
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
    addEventListener: vi.fn((ev: string, cb: MediaListener) => {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev)!.add(cb);
    }),
    removeEventListener: vi.fn(),
    __fire(ev: string) {
      for (const cb of listeners.get(ev) ?? []) cb();
    },
  };
  Object.assign(el, overrides);
  return el as unknown as HTMLAudioElement & { __fire(ev: string): void };
}

/** Media element whose seek is REFUSED until the consumer's load completes:
 *  the src swap resets it to 0 and every currentTime write is ignored until
 *  __markReady() (mirrors readyState < HAVE_METADATA refusing seeks). */
function gatedMedia(initialTime: number) {
  let t = initialTime;
  let ready = false;
  const listeners = new Map<string, Set<MediaListener>>();
  const el = {
    get currentTime() { return t; },
    set currentTime(v: number) { if (ready) t = v; },
    get readyState() { return ready ? 4 : 0; },
    paused: false,
    ended: false,
    playbackRate: 1,
    volume: 0.5,
    muted: false,
    preservesPitch: true,
    duration: 90,
    seekable: { length: 1, start: () => 0, end: () => 90 },
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    addEventListener: vi.fn((ev: string, cb: MediaListener) => {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev)!.add(cb);
    }),
    removeEventListener: vi.fn(),
    /** The consumer assigned a fresh src → element reset to 0, not ready. */
    __resetByConsumerLoad() { t = 0; },
    /** loadedmetadata/canplay landed → seeks now take; fire the listeners. */
    __markReady() {
      ready = true;
      el.__fire('canplay');
    },
    __fire(ev: string) {
      for (const cb of listeners.get(ev) ?? []) cb();
    },
  };
  return el as unknown as HTMLAudioElement & {
    __resetByConsumerLoad(): void;
    __markReady(): void;
  };
}

async function flushAsync(ticks = 10) {
  for (let i = 0; i < ticks; i += 1) await Promise.resolve();
}

type SwapEvent =
  | { type: 'start'; ctx: SwapContext }
  | { type: 'complete'; ctx: SwapContext }
  | { type: 'error'; ctx: SwapContext; err: Error };

interface Harness {
  result: { current: leaseModule.UseMediaLeaseResult };
  media: HTMLAudioElement & { __fire?(ev: string): void };
  events: SwapEvent[];
  onSwapStart: ReturnType<typeof vi.fn>;
  onSwapComplete: ReturnType<typeof vi.fn>;
  onSwapError: ReturnType<typeof vi.fn>;
  autoAck: { current: boolean };
  rerender: (props: { id: string }) => void;
}

function setupHook(
  assetId: string,
  media: HTMLAudioElement,
  options: { autoAck?: boolean; swapAckTimeoutMs?: number } = {},
): Harness {
  const events: SwapEvent[] = [];
  const autoAck = { current: options.autoAck ?? false };
  const onSwapStart = vi.fn((ctx: SwapContext) => {
    events.push({ type: 'start', ctx });
  });
  const onSwapComplete = vi.fn((ctx: SwapContext) => {
    events.push({ type: 'complete', ctx });
  });
  const onSwapError = vi.fn((ctx: SwapContext, err: Error) => {
    events.push({ type: 'error', ctx, err });
  });
  const mediaRef = { current: media } as React.RefObject<HTMLMediaElement | null>;
  const rendered = renderHook(
    ({ id }: { id: string }) => {
      const result = useMediaLease({
        assetType: 'library-file',
        assetId: id,
        mediaRef,
        onSwapStart,
        onSwapComplete,
        onSwapError,
        ...(options.swapAckTimeoutMs !== undefined ? { swapAckTimeoutMs: options.swapAckTimeoutMs } : {}),
      });
      return result;
    },
    { initialProps: { id: assetId } },
  );
  // Auto-ack fires INSIDE onSwapStart — the element is already ready in these
  // specs, so ack→restore→complete is one synchronous cascade.
  const ackNow = (ctx: SwapContext) => {
    if (autoAck.current) rendered.result.current.ackSwap(ctx.swapId);
  };
  const originalStart = onSwapStart.getMockImplementation()!;
  onSwapStart.mockImplementation((ctx: SwapContext) => {
    originalStart(ctx);
    ackNow(ctx);
  });
  return {
    result: rendered.result as unknown as Harness['result'],
    media,
    events,
    onSwapStart,
    onSwapComplete,
    onSwapError,
    autoAck,
    rerender: rendered.rerender,
  };
}

let warnSpy: ReturnType<typeof vi.spyOn>;

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  warnSpy?.mockRestore();
});

describe('useMediaLease P1 — swap lifecycle contract (Wave 11.7.x / W9)', () => {
  it('W9 — module surface: lifecycle exports + contract constants', () => {
    expect(typeof leaseModule.useMediaLease).toBe('function');
    expect(typeof (leaseModule as unknown as { isElementSwapReady?: unknown }).isElementSwapReady).toBe('function');
    expect((leaseModule as unknown as Record<string, unknown>).SWAP_ACK_TIMEOUT_MS).toBe(5_000);
    expect((leaseModule as unknown as Record<string, unknown>).RESTORE_TIMEOUT_MS).toBe(3_000);
  });

  it('W9 — isElementSwapReady: seekable + HAVE_METADATA, both required', () => {
    const isElementSwapReady = (leaseModule as unknown as {
      isElementSwapReady: (el: unknown) => boolean;
    }).isElementSwapReady;
    // seekable populated + HAVE_METADATA → ready
    expect(isElementSwapReady({ seekable: { length: 1 }, readyState: 1 })).toBe(true);
    expect(isElementSwapReady({ seekable: { length: 1 }, readyState: 4 })).toBe(true);
    // no seekable range yet → not ready (the HLS ack gate)
    expect(isElementSwapReady({ seekable: { length: 0 }, readyState: 4 })).toBe(false);
    // metadata not parsed yet → not ready
    expect(isElementSwapReady({ seekable: { length: 1 }, readyState: 0 })).toBe(false);
  });

  it('W9 — lifecycle: initial load is silent; capture AT the swap moment; frozen ctx; monotonic swapId; sync ack cascade', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 10, paused: true });
    const h = setupHook('lease-a', media, { autoAck: true });

    // initial fetch → NO lifecycle events (C4), info delivered with swapId null
    await act(async () => { await flushAsync(); });
    expect(queue.length).toBe(1);
    await act(async () => { queue[0].resolve(makeInfo('url-1', 8)); });
    expect(h.onSwapStart).not.toHaveBeenCalled();
    expect(h.onSwapComplete).not.toHaveBeenCalled();
    expect(h.onSwapError).not.toHaveBeenCalled();
    expect(h.result.current.info?.url).toBe('url-1');
    expect(h.result.current.info?.swapId).toBeNull();
    expect(h.result.current.swapId).toBe(0);
    expect(h.result.current.isSwapInFlight).toBe(false);
    expect(h.result.current.loading).toBe(false);

    // silent refresh fetch enters (refreshing true per DF-5) …
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(queue.length).toBe(2);
    expect(h.result.current.refreshing).toBe(true);

    // … user intent lands INSIDE the fetch window (the W3 core: P0 captured
    // at fetch ENTRY — these mutations would be invisible to that capture)
    media.currentTime = 42;
    media.paused = false;
    media.playbackRate = 1.5;

    const startedAt = Date.now();
    await act(async () => { queue[1].resolve(makeInfo('url-2', 8)); });

    // onSwapStart fired with capture-at-swap values, frozen ctx
    expect(h.onSwapStart).toHaveBeenCalledTimes(1);
    const ctx = h.events[0].ctx;
    expect(ctx.swapId).toBe(1);
    expect(ctx.assetType).toBe('library-file');
    expect(ctx.assetId).toBe('lease-a');
    expect(ctx.newUrl).toBe('url-2');
    expect(ctx.previousState.currentTime).toBe(42);
    expect(ctx.previousState.paused).toBe(false);
    expect(ctx.previousState.playbackRate).toBe(1.5);
    expect(ctx.previousState.ended).toBe(false);
    expect(ctx.previousState.volume).toBe(1);
    expect(ctx.previousState.muted).toBe(false);
    expect(ctx.previousState.preservesPitch).toBe(true);
    expect(ctx.previousState.duration).toBe(90);
    expect(ctx.deadlineAt).toBe(startedAt + 5_000); // effective ack timeout
    expect(Object.isFrozen(ctx)).toBe(true); // DF-7
    expect(Object.isFrozen(ctx.previousState)).toBe(true);

    // SWAPPING + RESTORING ran through (auto-ack inside onSwapStart) →
    // the hook applied previousState and completed synchronously
    expect(h.result.current.isSwapInFlight).toBe(false);
    expect(h.result.current.refreshing).toBe(false); // DF-5: false at terminal
    expect(h.result.current.swapId).toBe(1);
    expect(h.result.current.info?.url).toBe('url-2');
    expect(h.result.current.info?.swapId).toBe(1);
    expect(media.currentTime).toBe(42);
    expect(media.playbackRate).toBe(1.5);
    expect(media.play).toHaveBeenCalled(); // wasPlaying → play replayed
    expect(h.onSwapComplete).toHaveBeenCalledTimes(1);
    expect(h.events[1].ctx).toBe(ctx); // DF-7: same frozen reference
    expect(warnSpy).not.toHaveBeenCalled();

    // second swap → swapId monotonic
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    media.currentTime = 50;
    await act(async () => { queue[2].resolve(makeInfo('url-3', 8)); });
    expect(h.events.filter((e) => e.type === 'start')).toHaveLength(2);
    expect(h.events.at(-1)!.type).toBe('complete');
    expect(h.events.at(-1)!.ctx.swapId).toBe(2);
    expect(h.result.current.swapId).toBe(2);
  });

  it('W9 — ackSwap: wrong swapId / double ack / no swap in flight are warn-no-ops (idempotent)', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 20, paused: false });
    const h = setupHook('lease-a', media); // autoAck OFF — swap held in SWAPPING

    await act(async () => { await flushAsync(); });
    await act(async () => { queue[0].resolve(makeInfo('url-1', 8)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    await act(async () => { queue[1].resolve(makeInfo('url-2', 8)); });
    expect(h.onSwapStart).toHaveBeenCalledTimes(1);
    expect(h.result.current.isSwapInFlight).toBe(true);

    // wrong swapId → warn, no transition
    act(() => { h.result.current.ackSwap(999); });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(h.onSwapComplete).not.toHaveBeenCalled();
    expect(h.result.current.isSwapInFlight).toBe(true);

    // valid ack → RESTORING → restore takes (writable stub) → complete
    act(() => { h.result.current.ackSwap(1); });
    expect(h.onSwapComplete).toHaveBeenCalledTimes(1);
    expect(h.result.current.isSwapInFlight).toBe(false);

    // double ack (same id, swap already terminal) → warn, still one complete
    act(() => { h.result.current.ackSwap(1); });
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(h.onSwapComplete).toHaveBeenCalledTimes(1);

    // ack with no swap in flight at all → warn
    act(() => { h.result.current.ackSwap(2); });
    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(h.onSwapComplete).toHaveBeenCalledTimes(1);
  });

  it('W9 — ack timeout: onSwapError after the deadline, NO URL rollback, terminal cleanup, late ack warns', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 33, paused: false });
    const h = setupHook('lease-a', media); // no ack — deadline must fire

    await act(async () => { await flushAsync(); });
    await act(async () => { queue[0].resolve(makeInfo('url-1', 8)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    await act(async () => { queue[1].resolve(makeInfo('url-2', 8)); });
    const ctx = h.events[0].ctx;
    expect(h.result.current.isSwapInFlight).toBe(true);

    // no ack within SWAP_ACK_TIMEOUT_MS → sync onSwapError, no rollback
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(h.onSwapError).toHaveBeenCalledTimes(1);
    expect(h.events[1].type).toBe('error');
    expect(h.events[1].ctx).toBe(ctx);
    expect(h.events[1].err.message).toMatch(/ack/i);
    expect(h.result.current.isSwapInFlight).toBe(false);
    expect(h.result.current.refreshing).toBe(false);
    expect(h.result.current.info?.url).toBe('url-2'); // NO rollback
    expect(h.result.current.error).toBeNull(); // swap timeout ≠ lease error

    // late ack → warn-no-op (the consumer's cleanup duty has passed)
    act(() => { h.result.current.ackSwap(1); });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(h.onSwapComplete).not.toHaveBeenCalled();
  });

  it('W9 — restore timeout when the element refuses the seek (no readiness event before the deadline)', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = gatedMedia(30); // playing at 30, refuses seeks until ready
    const h = setupHook('lease-a', media);

    await act(async () => { await flushAsync(); });
    await act(async () => { queue[0].resolve(makeInfo('url-1', 8)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    // the swap resolves; the consumer resets the element (src assign) — it is
    // now at 0 and not ready, exactly like a mid-load element
    media.__resetByConsumerLoad();
    await act(async () => { queue[1].resolve(makeInfo('url-2', 8)); });
    expect(h.onSwapStart).toHaveBeenCalledTimes(1);

    // ack → RESTORING: rate/vol/mute applied, seek REFUSED (target 30, stuck 0)
    // → one retry armed on readiness events → none fires
    act(() => { h.result.current.ackSwap(1); });
    expect(h.onSwapComplete).not.toHaveBeenCalled();
    expect(h.result.current.isSwapInFlight).toBe(true);

    // RESTORE_TIMEOUT_MS elapses → onSwapError (restore reason), terminal
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(h.onSwapError).toHaveBeenCalledTimes(1);
    expect(h.events[1].type).toBe('error');
    expect(h.events[1].err.message).toMatch(/restore/i);
    expect(h.events[1].ctx.previousState.currentTime).toBe(30);
    expect(h.result.current.isSwapInFlight).toBe(false);
    expect(h.result.current.info?.url).toBe('url-2'); // no rollback
  });

  it('W9 — restore retry: a readiness event before the deadline completes the swap', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = gatedMedia(30);
    const h = setupHook('lease-a', media);

    await act(async () => { await flushAsync(); });
    await act(async () => { queue[0].resolve(makeInfo('url-1', 8)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    media.__resetByConsumerLoad();
    await act(async () => { queue[1].resolve(makeInfo('url-2', 8)); });

    act(() => { h.result.current.ackSwap(1); }); // seek refused, retry armed
    expect(h.onSwapComplete).not.toHaveBeenCalled();

    // readiness lands BEFORE the restore deadline → retry applies the seek
    // (now accepted) → swap completes
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    act(() => { media.__markReady(); });
    expect(h.onSwapComplete).toHaveBeenCalledTimes(1);
    expect(h.onSwapError).not.toHaveBeenCalled();
    expect(media.currentTime).toBe(30);
    expect(media.play).toHaveBeenCalled(); // wasPlaying at capture
    expect(h.result.current.isSwapInFlight).toBe(false);

    // the restore deadline is cleared at completion — no late error
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(h.onSwapError).not.toHaveBeenCalled();
  });

  it('W9 — swapAckTimeoutMs overrides the ack deadline (clamped to >= 500ms)', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 5, paused: true });
    const h = setupHook('lease-a', media, { swapAckTimeoutMs: 800 });

    await act(async () => { await flushAsync(); });
    await act(async () => { queue[0].resolve(makeInfo('url-1', 8)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    const startedAt = Date.now();
    await act(async () => { queue[1].resolve(makeInfo('url-2', 8)); });

    // deadline computed from the EFFECTIVE timeout (OPEN-8/17)
    expect(h.events[0].ctx.deadlineAt).toBe(startedAt + 800);
    await act(async () => { await vi.advanceTimersByTimeAsync(800); });
    expect(h.onSwapError).toHaveBeenCalledTimes(1);
    expect(h.events[1].err.message).toMatch(/ack/i);

    // clamp: sub-500 values are raised to the floor
    const queue2 = deferredPosts();
    const h2 = setupHook('lease-b', stubMedia(), { swapAckTimeoutMs: 100 });
    await act(async () => { await flushAsync(); });
    await act(async () => { queue2[0].resolve(makeInfo('url-b1', 8)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    const startedAt2 = Date.now();
    await act(async () => { queue2[1].resolve(makeInfo('url-b2', 8)); });
    expect(h2.events[0].ctx.deadlineAt).toBe(startedAt2 + 500);
  });

  it('W9 — refresh() coalesces during SWAPPING (depth 1, latest-wins) and executes at the swap terminal', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 15, paused: false });
    const h = setupHook('lease-a', media); // no auto-ack

    await act(async () => { await flushAsync(); });
    await act(async () => { queue[0].resolve(makeInfo('url-1', 8)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    await act(async () => { queue[1].resolve(makeInfo('url-2', 8)); });
    expect(h.result.current.isSwapInFlight).toBe(true);
    expect(queue.length).toBe(2);

    // refresh() exists as the imperative entry point (DF-1) and triggers
    // a fetch from IDLE…
    expect(typeof h.result.current.refresh).toBe('function');

    // …but during SWAPPING it COALESCES (never rejects, OPEN-6)
    act(() => { h.result.current.refresh('manual'); });
    act(() => { h.result.current.refresh('error'); });
    await act(async () => { await flushAsync(); });
    expect(queue.length).toBe(2); // deferred — no third POST while swapping
    expect(h.onSwapStart).toHaveBeenCalledTimes(1);

    // terminal → the deferred refresh executes (ONE fetch, latest-wins)
    act(() => { h.result.current.ackSwap(1); });
    expect(h.onSwapComplete).toHaveBeenCalledTimes(1);
    await act(async () => { await flushAsync(); });
    expect(queue.length).toBe(3); // depth-1: two refresh() calls, ONE POST
    expect(h.result.current.refreshing).toBe(true);

    // the deferred fetch resolves into the NEXT swap — order: complete(1)
    // then start(2)
    await act(async () => { queue[2].resolve(makeInfo('url-3', 8)); });
    expect(h.events.map((e) => `${e.type}:${e.ctx.swapId}`)).toEqual([
      'start:1', 'complete:1', 'start:2',
    ]);
    expect(h.result.current.info?.url).toBe('url-3');
  });

  it('W9 — ASSET_CHANGE clears the in-flight swap (no emission); late ack warns; swapId stays monotonic; next load is initial', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 25, paused: false });
    const h = setupHook('lease-a', media); // no auto-ack

    await act(async () => { await flushAsync(); });
    await act(async () => { queue[0].resolve(makeInfo('url-a1', 8)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    await act(async () => { queue[1].resolve(makeInfo('url-a2', 8)); });
    expect(h.result.current.isSwapInFlight).toBe(true); // swap 1 held

    // in-place asset change mid-swap
    act(() => { h.rerender({ id: 'lease-b' }); });
    await act(async () => { await flushAsync(); });

    // the active swap was terminal-cleared: no error, no complete, deadlines
    // gone (advancing past BOTH deadlines emits nothing)
    expect(h.onSwapComplete).not.toHaveBeenCalled();
    expect(h.onSwapError).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    expect(h.onSwapError).not.toHaveBeenCalled();
    expect(h.result.current.isSwapInFlight).toBe(false);

    // the new asset's initial fetch is in flight; its URL lands as INITIAL
    // (swapId null — W8 classification via info identity, not closure state)
    expect(queue.length).toBe(3);
    await act(async () => { queue[2].resolve(makeInfo('url-b1', 8)); });
    expect(h.result.current.info?.url).toBe('url-b1');
    expect(h.result.current.info?.swapId).toBeNull();
    expect(h.onSwapStart).toHaveBeenCalledTimes(1); // still only swap 1's start

    // a late ack for the cleared swap warns and does nothing
    act(() => { h.result.current.ackSwap(1); });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(h.onSwapComplete).not.toHaveBeenCalled();

    // the next swap for asset B CONTINUES the instance's counter (DF-4)
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    await act(async () => { queue[3].resolve(makeInfo('url-b2', 8)); });
    expect(h.events.filter((e) => e.type === 'start')).toHaveLength(2);
    expect(h.events.at(-1)!.ctx.swapId).toBe(2);
    expect(h.events.at(-1)!.ctx.assetId).toBe('lease-b');
  });

  it('W9 — a failed fetch NEVER emits onSwapError; the surfaced error is an Error instance (fetch failure ≠ swap failure)', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 30, paused: false });
    const h = setupHook('lease-a', media);

    // initial fetch fails → surfaced error state, NO swap lifecycle
    await act(async () => { await flushAsync(); });
    await act(async () => { queue[0].reject(new Error('presign 500')); });
    expect(h.result.current.error).toBeInstanceOf(Error);
    expect(h.result.current.loading).toBe(false);
    expect(h.onSwapStart).not.toHaveBeenCalled();
    expect(h.onSwapError).not.toHaveBeenCalled();

    // manual retry via refresh() succeeds → initial-classified info lands
    act(() => { h.result.current.refresh(); });
    await act(async () => { await flushAsync(); });
    expect(queue.length).toBe(2);
    await act(async () => { queue[1].resolve(makeInfo('url-1', 8)); });
    expect(h.result.current.info?.url).toBe('url-1');
    expect(h.result.current.info?.swapId).toBeNull();
    expect(h.onSwapStart).not.toHaveBeenCalled(); // initial, not a swap

    // a failed REFRESH also never emits onSwapError (silent retry path)
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    await act(async () => { queue[2].reject(new Error('presign 503')); });
    expect(h.onSwapError).not.toHaveBeenCalled();
    expect(h.onSwapStart).not.toHaveBeenCalled();
    expect(h.result.current.info?.url).toBe('url-1'); // kept playing
  });

  it('W9 — ended media restores to time 0 and does not autoplay', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 90, ended: true, paused: true });
    const h = setupHook('lease-a', media, { autoAck: true });

    await act(async () => { await flushAsync(); });
    await act(async () => { queue[0].resolve(makeInfo('url-1', 8)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    await act(async () => { queue[1].resolve(makeInfo('url-2', 8)); });

    expect(h.onSwapStart).toHaveBeenCalledTimes(1);
    expect(h.events[0].ctx.previousState.ended).toBe(true);
    expect(h.onSwapComplete).toHaveBeenCalledTimes(1);
    expect(media.currentTime).toBe(0); // ended → restart from the top
    expect(media.play).not.toHaveBeenCalled(); // …and do not autoplay
  });

  it('W9 — restore clamps the seek target to the seekable range (OPEN-9)', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    // seekable ends at 60 although duration says 90 (shorter ladder/variant)
    const media = stubMedia({
      currentTime: 80,
      paused: false,
      seekable: { length: 1, start: () => 0, end: () => 60 },
    });
    const h = setupHook('lease-a', media, { autoAck: true });

    await act(async () => { await flushAsync(); });
    await act(async () => { queue[0].resolve(makeInfo('url-1', 8)); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    await act(async () => { queue[1].resolve(makeInfo('url-2', 8)); });

    expect(h.onSwapComplete).toHaveBeenCalledTimes(1);
    expect(media.currentTime).toBeCloseTo(60 - 0.25, 5); // clamped, not 80
    expect(media.play).toHaveBeenCalled();
  });
});
