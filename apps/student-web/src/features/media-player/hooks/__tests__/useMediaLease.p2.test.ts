/**
 * Wave 11.7.x — PART I (P2) red-first specs for the deferred-intent queue.
 *
 * P2 adds the SWAPPING/RESTORING-phase intent queue to useMediaLease:
 *   - 5 stable-identity methods: play / pause / seek / togglePlay / seekBy
 *     (A1). On the P1 hook they are simply absent from the result object —
 *     every spec below fails on a clean typeof check, exactly like the P1
 *     file's surface spec did against P0.
 *   - togglePlay/seekBy classify swap-phase intents against the ACTIVE
 *     CTX's previousState (captured at the swap moment), never against the
 *     torn-down element (F1: P1's consumer togglePlay read el.paused of a
 *     mid-load element — inverted the user's intent; F2: the consumer's
 *     seekBy computed el.currentTime+delta of a reset element and its
 *     Number.isFinite(duration) guard silently dropped the intent).
 *   - A2: single slot per concern — { playPause?: 'play'|'pause'; seek?:
 *     number }; last-writer-wins; play()/pause() collapse into playPause.
 *   - A3: applyRestore computes ONE merged plan (queue ⊕ previousState),
 *     consumes the queue on EVERY invocation, inherits seekTook / readiness
 *     retry / RESTORE_TIMEOUT.
 *   - A4: terminal order replay → onSwapComplete → pendingRefresh drain.
 *   - A6: onSwapError terminal applies best-effort + clears; ASSET_CHANGE
 *     and unmount DROP (never apply — a stale queued play() must never
 *     ghost onto the next asset's element).
 *   - A7: gate = phase !== 'idle' (SWAPPING|RESTORING only; the real P1
 *     machine has no FETCHING/ERROR phases); never render state.
 *   - A8: IDLE path: immediate element apply; play() rejections swallowed
 *     (P1 #12 semantics: console.debug, never onSwapError); null element
 *     no-op; seeks clamp to [0, duration].
 *
 * House conventions (mirrors the P0/P1 files in this directory): axios
 * layer + entitlement config + sonner mocked; mediaApi's real mapping runs;
 * every playback-url POST is a manually-resolvable deferred; fake timers
 * drive the lease schedule (ttl=8 → first silent refresh at ~3s).
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

// Namespace import: on the P1 hook the five methods are simply absent —
// the surface spec fails on a clean typeof check instead of a link error.
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

/** Writable media element stub — seeks take; readyState 4; seekable 0..90.
 *  P2: play()/pause() flip `paused` like a real element (the queue specs
 *  assert POST-REPLAY element state; the e2e runs under
 *  --autoplay-policy=no-user-gesture-required, so play() resolving and
 *  flipping paused is the modeled environment). */
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
  // State-transition modeling (installed AFTER overrides so an override
  // supplied play/pause stays the raw source; the outer spies count calls).
  const rawPlay = el.play as unknown as ReturnType<typeof vi.fn>;
  const rawPause = el.pause as unknown as ReturnType<typeof vi.fn>;
  (el as unknown as { play: ReturnType<typeof vi.fn> }).play = vi.fn(
    () => { (el as unknown as { paused: boolean }).paused = false; return rawPlay(); },
  );
  (el as unknown as { pause: ReturnType<typeof vi.fn> }).pause = vi.fn(
    () => { (el as unknown as { paused: boolean }).paused = true; rawPause(); },
  );
  return el as unknown as HTMLAudioElement & { __fire(ev: string): void };
}

async function flushAsync(ticks = 10) {
  for (let i = 0; i < ticks; i += 1) await Promise.resolve();
}

/** HTMLMediaElement.paused is readonly in the TS lib — mutate through a cast. */
function setPaused(el: HTMLAudioElement, value: boolean) {
  (el as unknown as { paused: boolean }).paused = value;
}

type SwapEvent =
  | { type: 'start'; ctx: SwapContext }
  | { type: 'complete'; ctx: SwapContext }
  | { type: 'error'; ctx: SwapContext; err: Error };

interface Harness {
  result: { current: leaseModule.UseMediaLeaseResult };
  media: HTMLAudioElement;
  events: SwapEvent[];
  onSwapStart: ReturnType<typeof vi.fn>;
  onSwapComplete: ReturnType<typeof vi.fn>;
  onSwapError: ReturnType<typeof vi.fn>;
  rerender: (props: { id: string }) => void;
  unmount: () => void;
}

function setupHook(
  assetId: string,
  media: HTMLAudioElement,
  options: {
    swapAckTimeoutMs?: number;
    /** Runs inside onSwapStart AFTER the capture — models the consumer's
     *  src assignment resetting the element mid-load (the torn-down state
     *  the F1/F2 guardians must classify against). */
    onStart?: (ctx: SwapContext) => void;
  } = {},
): Harness {
  const events: SwapEvent[] = [];
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
  const originalStart = onSwapStart.getMockImplementation()!;
  onSwapStart.mockImplementation((ctx: SwapContext) => {
    originalStart(ctx);
    options.onStart?.(ctx);
  });
  return {
    result: rendered.result as unknown as Harness['result'],
    media,
    events,
    onSwapStart,
    onSwapComplete,
    onSwapError,
    rerender: rendered.rerender,
    unmount: rendered.unmount,
  };
}

let warnSpy: ReturnType<typeof vi.spyOn>;

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  warnSpy?.mockRestore();
});

/** Reaches a swap held in SWAPPING: initial load → silent refresh resolves
 *  → onSwapStart fired (capture already taken) → the consumer's load has
 *  torn the element down (onStart). Standard preamble for queue specs. */
async function reachSwapping(
  h: Harness,
  queue: DeferredPost[],
  opts: { torn: { time: number; paused: boolean } },
) {
  await act(async () => { await flushAsync(); });
  await act(async () => { queue[0].resolve(makeInfo('url-1', 8)); });
  await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
  await act(async () => { queue[1].resolve(makeInfo('url-2', 8)); });
  expect(h.onSwapStart).toHaveBeenCalledTimes(1);
  // the torn-down element state the consumer would see (F1/F2 model)
  setPaused(h.media, opts.torn.paused);
  h.media.currentTime = opts.torn.time;
}

describe('useMediaLease P2 — deferred-intent queue (Wave 11.7.x / SWAPPING-phase W1/W7a/W7b)', () => {
  // ────────────────────────────────────────────────────────────────
  // A1/A8 — surface + IDLE immediate-apply (RED vs P1: all five absent)
  // ────────────────────────────────────────────────────────────────
  it('P2 surface — five stable-identity intent methods on the result', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 10, paused: true });
    const h = setupHook('lease-a', media);
    await act(async () => { await flushAsync(); });
    await act(async () => { queue[0].resolve(makeInfo('url-1', 8)); });

    const r = h.result.current as unknown as Record<string, unknown>;
    expect(typeof r.play).toBe('function');
    expect(typeof r.pause).toBe('function');
    expect(typeof r.seek).toBe('function');
    expect(typeof r.togglePlay).toBe('function');
    expect(typeof r.seekBy).toBe('function');
  });

  it('A8 — IDLE: play/pause/seek/togglePlay/seekBy apply immediately to the element', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 10, paused: true });
    const h = setupHook('lease-a', media);
    await act(async () => { await flushAsync(); });
    await act(async () => { queue[0].resolve(makeInfo('url-1', 8)); });

    // paused element → togglePlay plays
    act(() => { h.result.current.togglePlay(); });
    expect(media.play).toHaveBeenCalledTimes(1);
    setPaused(media, false);
    // playing element → togglePlay pauses (single source of truth: el.paused
    // is valid in IDLE)
    act(() => { h.result.current.togglePlay(); });
    expect(media.pause).toHaveBeenCalledTimes(1);

    // absolute seek clamps to duration
    act(() => { h.result.current.seek(999); });
    expect(media.currentTime).toBe(90);
    // relative seek from live position, clamped at 0
    act(() => { h.media.currentTime = 5; });
    act(() => { h.result.current.seekBy(-30); });
    expect(media.currentTime).toBe(0);
    // relative seek forward
    act(() => { h.result.current.seekBy(10); });
    expect(media.currentTime).toBe(10);
    // explicit play/pause
    act(() => { h.result.current.pause(); });
    expect(media.pause).toHaveBeenCalledTimes(2);
    act(() => { h.result.current.play(); });
    expect(media.play).toHaveBeenCalledTimes(2);
  });

  it('A8 — IDLE: null element is a silent no-op; play() rejection swallowed (P1 #12 semantics)', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const media = stubMedia({ currentTime: 10 });
    const h = setupHook('lease-a', media, {});
    await act(async () => { await flushAsync(); });
    await act(async () => { queue[0].resolve(makeInfo('url-1', 8)); });
    expect(debugSpy).not.toHaveBeenCalled();

    // a rejecting play() never raises and never fires onSwapError
    (h.media as unknown as { play: ReturnType<typeof vi.fn> }).play =
      vi.fn(() => Promise.reject(new Error('autoplay policy')));
    act(() => { h.result.current.play(); });
    await act(async () => { await flushAsync(); });
    expect(h.onSwapError).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledTimes(1); // swallowed, logged
    expect(debugSpy.mock.calls[0][0]).toContain('play rejected');
    debugSpy.mockRestore();
  });

  // ────────────────────────────────────────────────────────────────
  // A2/A1 — collapse semantics during SWAPPING
  // ────────────────────────────────────────────────────────────────
  it('A2 — queue collapse: seek×2 → latest; play/pause → latest; one slot per concern', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    // playing at 42 — the SWAPPING-phase pause intent (W7a) must be issuable
    const media = stubMedia({ currentTime: 42, paused: false });
    const h = setupHook('lease-a', media);
    await reachSwapping(h, queue, { torn: { time: 0, paused: true } });
    expect(h.result.current.isSwapInFlight).toBe(true); // gate check

    // the queue collapses per concern
    act(() => { h.result.current.seek(30); });
    act(() => { h.result.current.seek(50); }); // latest wins
    act(() => { h.result.current.play(); });
    act(() => { h.result.current.pause(); }); // latest wins
    act(() => { h.result.current.play(); }); // …and flips back

    // ack → RESTORING → merged plan applies: seek 50 first, then play.
    // Order proof (A4): element state matches intent when complete fires.
    act(() => { h.result.current.ackSwap(1); });
    expect(h.onSwapComplete).toHaveBeenCalledTimes(1);
    expect(media.currentTime).toBe(50); // NOT 42 (capture) and not 30 (stale seek)
    expect(media.paused).toBe(false);
    expect(media.play).toHaveBeenCalledTimes(1);
    expect(media.pause).not.toHaveBeenCalled();
  });

  it('F1 guardian — togglePlay during SWAPPING classifies against previousState, not the torn-down element', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    // PRE-SWAP the user was PLAYING (the W7a prerequisite). P1's consumer
    // togglePlay would read the torn element (paused=true) and issue play()
    // — inverting the user's pause intent.
    const media = stubMedia({ currentTime: 42, paused: false });
    const h = setupHook('lease-a', media);
    await reachSwapping(h, queue, { torn: { time: 0, paused: true } });
    expect(h.events[0].ctx.previousState.paused).toBe(false); // captured playing

    // user presses the toggle DURING SWAPPING intending to PAUSE
    act(() => { h.result.current.togglePlay(); });

    // the queue must hold PAUSE (opposite of the playing base) — never
    // play (the torn element's lie)
    act(() => { h.result.current.ackSwap(1); });
    expect(h.onSwapComplete).toHaveBeenCalledTimes(1);
    expect(media.pause).toHaveBeenCalledTimes(1); // PAUSE replayed
    expect(media.play).not.toHaveBeenCalled(); // the F1 inversion never happened
    expect(media.paused).toBe(true);
    expect(media.currentTime).toBe(42); // position still restored from capture
  });

  it('F2 guardian — seekBy during SWAPPING computes from previousState.currentTime, not the reset element', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    // playing at 12.5; user hits +10 (l key) during SWAPPING expecting 22.5.
    const media = stubMedia({ currentTime: 12.5, paused: false });
    const h = setupHook('lease-a', media);
    await reachSwapping(h, queue, { torn: { time: 0, paused: true } });

    act(() => { h.result.current.seekBy(10); });
    act(() => { h.result.current.ackSwap(1); });

    expect(h.onSwapComplete).toHaveBeenCalledTimes(1);
    expect(media.currentTime).toBe(22.5); // 12.5+10 — NOT 0+10=10 (the F2 trap)
    expect(media.play).toHaveBeenCalledTimes(1); // was playing at capture → replay
    expect(media.paused).toBe(false);
  });

  it('F2 guardian — seekBy clamps to previousState duration; ended media seeks relative to 0', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    // ended media: previousState.currentTime would be 90/ended — the base for
    // seekBy must be 0 (A1), so +10 lands at 10, not 100→clamped-90.
    const media = stubMedia({ currentTime: 90, ended: true, paused: true });
    const h = setupHook('lease-a', media);
    await reachSwapping(h, queue, { torn: { time: 0, paused: true } });
    expect(h.events[0].ctx.previousState.ended).toBe(true);

    act(() => { h.result.current.seekBy(10); });
    act(() => { h.result.current.ackSwap(1); });
    expect(media.currentTime).toBe(10); // base 0, not 90
  });

  it('F1 guardian — togglePlay on a PAUSED base enqueues play (W1 in its queue form)', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    // PRE-SWAP paused (the W1 prerequisite: a play intent during the window)
    const media = stubMedia({ currentTime: 42, paused: true });
    const h = setupHook('lease-a', media);
    await reachSwapping(h, queue, { torn: { time: 0, paused: false } });
    expect(h.events[0].ctx.previousState.paused).toBe(true);

    act(() => { h.result.current.togglePlay(); });
    act(() => { h.result.current.ackSwap(1); });

    expect(media.play).toHaveBeenCalledTimes(1); // the dead-tap play is replayed
    expect(media.paused).toBe(false);
    expect(media.currentTime).toBe(42);
  });

  // ────────────────────────────────────────────────────────────────
  // A3 — merged plan + consumption on every applyRestore invocation
  // ────────────────────────────────────────────────────────────────
  it('A3 — refused seek + late RESTORING intent: the readiness retry consumes the LATEST queue', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    // gatedMedia-style: seek refused until markReady — models a real element
    // that cannot seek before loadedmetadata.
    let t = 30;
    let ready = false;
    const listeners = new Map<string, Set<MediaListener>>();
    const media = stubMedia({ currentTime: 30, paused: false });
    const gate = media as unknown as {
      currentTime: number; readyState: number; __fire(ev: string): void;
    };
    Object.defineProperty(media, 'currentTime', {
      get: () => t,
      set: (v: number) => { if (ready) t = v; },
      configurable: true,
    });
    Object.defineProperty(media, 'readyState', {
      get: () => (ready ? 4 : 0),
      configurable: true,
    });
    (media as unknown as { addEventListener: unknown }).addEventListener = vi.fn(
      (ev: string, cb: MediaListener) => {
        if (!listeners.has(ev)) listeners.set(ev, new Set());
        listeners.get(ev)!.add(cb);
      },
    );
    (media as unknown as { removeEventListener: unknown }).removeEventListener = vi.fn();
    const fire = (ev: string) => { for (const cb of listeners.get(ev) ?? []) cb(); };
    const h = setupHook('lease-a', media, {
      // the consumer's src assignment resets the element and refuses seeks
      onStart: () => { t = 0; },
    });
    await reachSwapping(h, queue, { torn: { time: 0, paused: false } });
    // reachSwapping's torn-write happens after onStart; re-reset for the gate
    gate.currentTime = 0;
    expect(h.result.current.isSwapInFlight).toBe(true);

    // seek queued during SWAPPING
    act(() => { h.result.current.seek(30); });
    act(() => { h.result.current.ackSwap(1); });
    expect(h.onSwapComplete).not.toHaveBeenCalled(); // seek refused (not ready)

    // LATE intent during RESTORING (after the first refused applyRestore):
    // user changed their mind — 50, and wants pause now (was playing base).
    act(() => { h.result.current.seek(50); });
    act(() => { h.result.current.pause(); });

    // readiness lands → the retry re-runs the merged plan with the LATEST
    // queue (50 + pause), not the first one (30 + play).
    act(() => { ready = true; });
    act(() => { fire('canplay'); });
    expect(h.onSwapComplete).toHaveBeenCalledTimes(1);
    expect(gate.currentTime).toBe(50);
    expect(media.paused).toBe(true);
    // The FIRST invocation applied its then-current base (wasPlaying → play,
    // P1 semantics: play lands before the seekTook determination); the
    // readiness retry then UPGRADED the plan to the LATEST queue — pause
    // replaced the pending play, and the seek landed at 50, not 30.
    expect(media.play).toHaveBeenCalledTimes(1);
    expect(media.pause).toHaveBeenCalledTimes(1);
  });

  // ────────────────────────────────────────────────────────────────
  // A4 — onSwapComplete AFTER replay (order proof)
  // ────────────────────────────────────────────────────────────────
  it('A4 — onSwapComplete fires AFTER the replay; element state matches intent in the callback', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 42, paused: false });
    const h = setupHook('lease-a', media);
    await reachSwapping(h, queue, { torn: { time: 0, paused: true } });

    let stateInCallback: { time: number; paused: boolean } | null = null;
    h.onSwapComplete.mockImplementation((ctx: SwapContext) => {
      stateInCallback = { time: media.currentTime, paused: media.paused };
      void ctx;
    });

    act(() => { h.result.current.pause(); }); // W7a intent
    act(() => { h.result.current.ackSwap(1); });
    expect(h.onSwapComplete).toHaveBeenCalledTimes(1);
    expect(stateInCallback).toEqual({ time: 42, paused: true }); // replay already applied
  });

  // ────────────────────────────────────────────────────────────────
  // A6 — terminal handling
  // ────────────────────────────────────────────────────────────────
  it('A6 — onSwapError terminal: best-effort apply (seek → playPause) + queue cleared; no onSwapError loop', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 42, paused: true });
    const h = setupHook('lease-a', media);
    await reachSwapping(h, queue, { torn: { time: 0, paused: false } });

    // queued intents; the swap will ack-timeout
    act(() => { h.result.current.seek(55); });
    act(() => { h.result.current.play(); });

    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(h.onSwapError).toHaveBeenCalledTimes(1);
    expect(h.events[1].type).toBe('error');
    // best-effort applied onto the element (which is mid-load on the new URL)
    expect(media.currentTime).toBe(55);
    expect(media.paused).toBe(false);
    expect(media.play).toHaveBeenCalledTimes(1);
  });

  it('A6 — ASSET_CHANGE mid-queue: DROP (never apply); the next asset never sees the stale intent', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 42, paused: true });
    const h = setupHook('lease-a', media);
    await reachSwapping(h, queue, { torn: { time: 0, paused: false } });

    // the user's play intent lands mid-swap…
    act(() => { h.result.current.play(); });

    // …then the asset changes in-place before any terminal
    act(() => { h.rerender({ id: 'lease-b' }); });
    await act(async () => { await flushAsync(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });

    // the queue was DROPPED — the element never received the intent
    expect(media.play).not.toHaveBeenCalled();
    expect(media.currentTime).toBe(0); // fresh element, untouched
    expect(h.onSwapError).not.toHaveBeenCalled();
    expect(h.onSwapComplete).not.toHaveBeenCalled();

    // the new asset's initial fetch resolves → IDLE path now applies directly
    expect(queue.length).toBeGreaterThanOrEqual(3);
    await act(async () => { queue[queue.length - 1].resolve(makeInfo('url-b1', 8)); });
    expect(h.result.current.info?.swapId).toBeNull();
    act(() => { h.result.current.play(); });
    expect(media.play).toHaveBeenCalledTimes(1); // works again through the live path
  });

  it('A6 — unmount mid-queue: DROP (never apply)', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 42, paused: true });
    const h = setupHook('lease-a', media);
    await reachSwapping(h, queue, { torn: { time: 0, paused: false } });

    act(() => { h.result.current.play(); }); // queued mid-swap
    act(() => { h.unmount(); });
    await act(async () => { await flushAsync(); });

    expect(media.play).not.toHaveBeenCalled(); // dropped, never applied
    expect(media.currentTime).toBe(0);
  });

  // ────────────────────────────────────────────────────────────────
  // A7 — phase gate (SWAPPING|RESTORING only; no FETCHING-phase queue)
  // ────────────────────────────────────────────────────────────────
  it('A7 — intents during the refresh FETCH apply immediately to the element (no queue) — capture-at-swap reads them', async () => {
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = deferredPosts();
    const media = stubMedia({ currentTime: 42, paused: true });
    const h = setupHook('lease-a', media);
    await act(async () => { await flushAsync(); });
    await act(async () => { queue[0].resolve(makeInfo('url-1', 8)); });

    // the fetch window (P1 refreshing=true, phase still idle)
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(h.result.current.refreshing).toBe(true);
    expect(h.result.current.isSwapInFlight).toBe(false);

    // a play intent during FETCHING applies DIRECTLY (P1's model) — the swap
    // never sees a queue
    act(() => { h.result.current.play(); });
    expect(media.play).toHaveBeenCalledTimes(1);

    // the fetch resolves; the capture at the swap moment reads the user's
    // fetch-phase intent (paused=false) and the restore replays play.
    setPaused(media, false);
    await act(async () => { queue[1].resolve(makeInfo('url-2', 8)); });
    expect(h.events[0].ctx.previousState.paused).toBe(false);
    act(() => { h.result.current.ackSwap(1); });
    expect(h.onSwapComplete).toHaveBeenCalledTimes(1);
    expect(media.play).toHaveBeenCalledTimes(2); // restore-replayed
  });
});
