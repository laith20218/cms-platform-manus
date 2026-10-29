/**
 * Wave 11.7.x — PART I (P3) property-based specs for the P2 deferred-intent
 * queue.
 *
 * Purpose: 1000-iteration seeded-random verification of the queue's semantics
 * across the SWAPPING and RESTORING windows and all four terminals. The P2
 * file pins each behavior with a hand-written deterministic spec; this file
 * explores the combinatorial space around them. Five properties, fixed seeds
 * (42-46): any failure reproduces by re-running with the same seed — the
 * failure message carries seed + iteration + the generated action sequence.
 *
 * Harness provenance: copied verbatim from useMediaLease.p2.test.ts (P3
 * constraint: the P0/P1/P2 test files remain byte-untouched). Adaptations,
 * each labeled at its site:
 *   - makeInfo: expiresAt pinned to a fixed timestamp (the P3 file bans
 *     real-clock calls; the hook's schedule reads ttlSeconds, never
 *     expiresAt).
 *   - gatedStub: the A3 refusal mechanic extracted into a factory so the
 *     RESTORING property can parameterize it.
 *
 * Oracle sources (useMediaLease.ts @ main 862d3ae; each rule cited at its
 * model function):
 *   - seek queues max(0,t), no upper clamp at queue time (:710-712)
 *   - seekBy: base = queued seek (if present AND not ended) else
 *     ended ? 0 : previousState.currentTime; clamp [0, duration]
 *     (:264-268, :743-757)
 *   - togglePlay classifies against the queue-or-capture base, never the
 *     torn-down element (:731-735)
 *   - merged plan: seek = q.seek ?? (ended ? 0 : ps.currentTime);
 *     playPause = q.playPause ?? (!ps.paused ? 'play' : undefined)
 *     (:298-306)
 *   - apply-time clamp: min(max(0, plan.seek), seekableEnd − 0.25)
 *     (:404-415, SEEK_CLAMP_EPSILON_SECONDS :81)
 *   - error terminal applies the RAW queue entry (:349-359) — no
 *     previousState merge, no clamp; complete terminal applies the merged
 *     plan; ASSET_CHANGE and unmount DROP (never apply).
 *
 * Deliberately NOT generated: volume / playbackRate / mute intents (A10 —
 * P2 scope decision: restore legitimately reverts them from
 * previousState). Their omission here is a recorded scope boundary, not a
 * coverage gap.
 *
 * Determinism: the ONLY randomness is the seeded mulberry32 stream. No
 * real-clock or real-random calls anywhere in this file (enforced by the
 * hygiene check at the top of P3-P1, which parses this file's own source
 * with comments stripped). process.hrtime.bigint is used ONLY for the
 * measurement log lines, never in test logic.
 *
 * Measured: P1=1143ms P2=763ms P3=1114ms P4=2037ms P5=712ms (total 5769ms;
 * 1000 iterations) — full-suite run, 12 files / 164 tests, on wip/11.7.x-p3.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---- shared mocks (hoisted) — verbatim from useMediaLease.p2.test.ts ----
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

// Namespace import: on the pre-P2 hook the five methods are simply absent —
// every property below fails at its first intent call (red vs 3b41c11).
import * as leaseModule from '../useMediaLease';
import type { SwapContext } from '../useMediaLease';
import type { PlaybackUrlInfo } from '../../services/media-api';

const useMediaLease = leaseModule.useMediaLease;

// ---- fixtures — verbatim from useMediaLease.p2.test.ts (adaptation:
// expiresAt pinned; see header) ----

function makeInfo(url: string, ttlSeconds = 8): PlaybackUrlInfo {
  return {
    url,
    ttlSeconds,
    expiresAt: '1970-01-01T00:00:00.000Z',
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
 *  play()/pause() flip `paused` like a real element (the queue specs assert
 *  POST-REPLAY element state; the e2e runs under
 *  --autoplay-policy=no-user-gesture-required, so play() resolving and
 *  flipping paused is the modeled environment). — verbatim from p2 */
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
 *  torn the element down (onStart). Standard preamble for queue specs. —
 *  verbatim from p2 */
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

// ────────────────────────────────────────────────────────────────
// P3 additions below — PRNG, generator, oracle model
// ────────────────────────────────────────────────────────────────

/** mulberry32 — hand-rolled seeded PRNG (no dependency; pure imul/shift
 *  arithmetic, deterministic across engines and vitest versions). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** The element state the swap captures (previousState model). duration is
 *  fixed at 90 (the stub's seekable range 0..90). */
interface PsState {
  currentTime: number;
  paused: boolean;
  ended: boolean;
  duration: number;
}

function genPs(rng: () => number): PsState {
  if (rng() < 0.15) return { currentTime: 90, paused: true, ended: true, duration: 90 };
  return { currentTime: rng() * 90, paused: rng() < 0.5, ended: false, duration: 90 };
}

function genTorn(rng: () => number): { time: number; paused: boolean } {
  return { time: rng() * 90, paused: rng() < 0.5 };
}

type Action =
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'togglePlay' }
  | { kind: 'seek'; t: number }
  | { kind: 'seekBy'; d: number };

/** All five intent methods; seeks span 0..1.3×duration (past the clamp);
 *  occasional non-finite / negative values pin the queue-time guards
 *  (documented no-ops). */
function genAction(rng: () => number): Action {
  const roll = rng();
  if (roll < 0.2) return { kind: 'play' };
  if (roll < 0.4) return { kind: 'pause' };
  if (roll < 0.55) return { kind: 'togglePlay' };
  if (roll < 0.8) {
    const special = rng();
    if (special < 0.05) return { kind: 'seek', t: NaN };
    if (special < 0.10) return { kind: 'seek', t: Infinity };
    if (special < 0.15) return { kind: 'seek', t: -Infinity };
    if (special < 0.25) return { kind: 'seek', t: -(rng() * 30) };
    return { kind: 'seek', t: rng() * 117 };
  }
  const special = rng();
  if (special < 0.05) return { kind: 'seekBy', d: NaN };
  if (special < 0.10) return { kind: 'seekBy', d: Infinity };
  return { kind: 'seekBy', d: -15 + rng() * 30 };
}

function genActions(rng: () => number, min: number, max: number): Action[] {
  const n = randInt(rng, min, max);
  const out: Action[] = [];
  for (let i = 0; i < n; i += 1) out.push(genAction(rng));
  return out;
}

function applyAction(r: leaseModule.UseMediaLeaseResult, a: Action): void {
  switch (a.kind) {
    case 'play': r.play(); break;
    case 'pause': r.pause(); break;
    case 'togglePlay': r.togglePlay(); break;
    case 'seek': r.seek(a.t); break;
    case 'seekBy': r.seekBy(a.d); break;
  }
}

function fmtActions(actions: Action[]): string[] {
  return actions.map((a) =>
    a.kind === 'seek' ? `seek(${a.t})` : a.kind === 'seekBy' ? `seekBy(${a.d})` : a.kind,
  );
}

// ---- the oracle model (rule cites: useMediaLease.ts @ 862d3ae) ----

type QueueShape = { playPause?: 'play' | 'pause'; seek?: number };

/** Models intentRef collapse. */
function modelQueue(actions: Action[], ps: PsState): QueueShape {
  const q: QueueShape = {};
  for (const a of actions) {
    if (a.kind === 'play') {
      q.playPause = 'play'; // :696
    } else if (a.kind === 'pause') {
      q.playPause = 'pause'; // :703
    } else if (a.kind === 'togglePlay') {
      // :731-735 — base = the queue's playPause or the capture's paused
      const wasPlaying = q.playPause !== undefined ? q.playPause === 'play' : !ps.paused;
      q.playPause = wasPlaying ? 'pause' : 'play';
    } else if (a.kind === 'seek') {
      if (!Number.isFinite(a.t)) continue; // :710 — non-finite no-op
      q.seek = Math.max(0, a.t); // :712 — no upper clamp at queue time
    } else {
      if (!Number.isFinite(a.d)) continue; // :743 — non-finite no-op
      // :264-268 + :753 — base = queued seek (if present AND not ended)
      // else ended ? 0 : ps.currentTime
      const base = ps.ended ? 0 : q.seek !== undefined ? q.seek : ps.currentTime;
      let target = Math.max(0, base + a.d); // :755
      if (Number.isFinite(ps.duration) && ps.duration > 0) {
        target = Math.min(target, ps.duration); // :756
      }
      q.seek = target; // :757
    }
  }
  return q;
}

/** Models consumeQueueForRestore — the merged plan. */
function modelPlan(q: QueueShape, ps: PsState): { seek: number; playPause?: 'play' | 'pause' } {
  // :301 — the queue's seek or the capture's position / 0-if-ended
  const seek = q.seek !== undefined ? q.seek : ps.ended ? 0 : ps.currentTime;
  const plan: { seek: number; playPause?: 'play' | 'pause' } = { seek };
  if (q.playPause !== undefined) plan.playPause = q.playPause; // :303
  else if (!ps.paused) plan.playPause = 'play'; // :304
  return plan;
}

const SEEK_CLAMP_EPSILON = 0.25; // :81

/** Models the apply-time clamp (:407-415) with the stub's seekable 0..90. */
function clampApply(seek: number): number {
  return Math.min(Math.max(0, seek), 90 - SEEK_CLAMP_EPSILON);
}

function callCount(fn: unknown): number {
  return (fn as ReturnType<typeof vi.fn>).mock.calls.length;
}

function fail(label: string, seed: number, iter: number, detail: Record<string, unknown>): never {
  throw new Error(
    `${label} FAILED — seed=${seed} iteration=${iter}\n${JSON.stringify(detail, null, 2)}`,
  );
}

/** The A3 refusal mechanic as a factory: the element refuses seeks (and
 *  reports not-ready) until markReady; readiness listeners are captured. */
function gatedStub(initialTime: number) {
  let t = initialTime;
  let ready = false;
  const listeners = new Map<string, Set<MediaListener>>();
  const media = stubMedia({ currentTime: initialTime });
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
  return {
    media,
    markReady: () => { ready = true; },
    resetTime: () => { t = 0; },
    fire: (ev: string) => { for (const cb of listeners.get(ev) ?? []) cb(); },
    get time() { return t; },
  };
}

const ITERATIONS = 1000;

describe('useMediaLease P3 — queue property suite (Wave 11.7.x / seeds 42-46)', () => {
  // ────────────────────────────────────────────────────────────────
  it('P3-P1 — collapse + no-lost-intent over 1000 random SWAPPING sequences (seed 42)', async () => {
    // hygiene: this file must not contain real-clock / real-random calls
    // (comments stripped first — the rule is about executable code).
    const own = readFileSync(fileURLToPath(new URL(import.meta.url)), 'utf8');
    const code = own.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (/Date\.now\(/.test(code) || /Math\.random\(/.test(code)) {
      throw new Error('P3 hygiene: real-clock / real-random call found in this file');
    }

    const SEED = 42;
    const rng = mulberry32(SEED);
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t0 = process.hrtime.bigint();

    for (let iter = 0; iter < ITERATIONS; iter += 1) {
      const ps = genPs(rng);
      const torn = genTorn(rng);
      const actions = genActions(rng, 1, 5);
      const queue = deferredPosts();
      const media = stubMedia({ currentTime: ps.currentTime, paused: ps.paused, ended: ps.ended });
      const h = setupHook('lease-a', media);
      await reachSwapping(h, queue, { torn });

      // capture-at-swap echo: the ctx must snapshot the element state that
      // was in effect at the fetch-resolution turn (the W3 core).
      const cap = h.events[0].ctx.previousState;
      if (cap.currentTime !== ps.currentTime || cap.paused !== ps.paused || cap.ended !== ps.ended) {
        fail('P3-P1 capture', SEED, iter, { ps, captured: cap, actions: fmtActions(actions) });
      }

      // intents land during SWAPPING (element torn down; queue must hold them)
      act(() => { for (const a of actions) applyAction(h.result.current, a); });

      // A4 order proof: snapshot the element state INSIDE onSwapComplete.
      let atCb: { time: number; paused: boolean; play: number; pause: number } | null = null;
      const origComplete = h.onSwapComplete.getMockImplementation()!;
      h.onSwapComplete.mockImplementation((ctx: SwapContext) => {
        origComplete(ctx);
        atCb = {
          time: media.currentTime,
          paused: media.paused,
          play: callCount(media.play),
          pause: callCount(media.pause),
        };
      });

      act(() => { h.result.current.ackSwap(1); });

      const q = modelQueue(actions, ps);
      const plan = modelPlan(q, ps);
      const expectedTime = clampApply(plan.seek);
      const expectedPlay = plan.playPause === 'play' ? 1 : 0;
      const expectedPause = plan.playPause === 'pause' ? 1 : 0;
      const expectedPaused =
        plan.playPause === 'play' ? false : plan.playPause === 'pause' ? true : torn.paused;
      const ctx = {
        ps, torn, actions: fmtActions(actions), q, plan,
        expectedTime, expectedPlay, expectedPause, expectedPaused,
        actual: {
          completeCalls: callCount(h.onSwapComplete),
          time: media.currentTime, paused: media.paused,
          play: callCount(media.play), pause: callCount(media.pause),
          atCallback: atCb,
        },
      };
      if (callCount(h.onSwapComplete) !== 1) fail('P3-P1 terminal', SEED, iter, ctx);
      if (media.currentTime !== expectedTime) fail('P3-P1 time', SEED, iter, ctx);
      if (callCount(media.play) !== expectedPlay) fail('P3-P1 play-count', SEED, iter, ctx);
      if (callCount(media.pause) !== expectedPause) fail('P3-P1 pause-count', SEED, iter, ctx);
      if (media.paused !== expectedPaused) fail('P3-P1 paused', SEED, iter, ctx);
      // TS CFA note: atCb is assigned inside a callback — read it back
      // through a widened cast so the null-narrowing from the initializer
      // does not poison the guard.
      const snap = atCb as { time: number; paused: boolean; play: number; pause: number } | null;
      if (!snap || snap.time !== expectedTime || snap.paused !== expectedPaused
        || snap.play !== expectedPlay || snap.pause !== expectedPause) {
        fail('P3-P1 callback-order', SEED, iter, ctx);
      }
      if (h.result.current.isSwapInFlight) fail('P3-P1 in-flight', SEED, iter, ctx);
      act(() => { h.unmount(); });
    }

    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`P3-P1: ${ITERATIONS} iter, ${ms.toFixed(0)} ms`);
  }, 30_000);

  // ────────────────────────────────────────────────────────────────
  it('P3-P2 — late RESTORING intent upgrades readiness-retry plan (seed 43)', async () => {
    const SEED = 43;
    const rng = mulberry32(SEED);
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t0 = process.hrtime.bigint();

    for (let iter = 0; iter < ITERATIONS; iter += 1) {
      const ps = genPs(rng);
      const torn = genTorn(rng);
      // window 1 (SWAPPING): random actions + a final seek in [2, 88] — the
      // final seek guarantees the first restore's target sits >0.5s from the
      // stuck position 0, so the refusal path (readiness retry) is taken
      // deterministically.
      const window1 = genActions(rng, 1, 3);
      window1.push({ kind: 'seek', t: 2 + rng() * 86 });
      // window 2 (RESTORING): at least one late intent
      const window2 = genActions(rng, 1, 3);

      const gate = gatedStub(ps.currentTime);
      // keep the plain ended/paused flags from genPs (gatedStub only gates
      // currentTime/readyState)
      (gate.media as unknown as { paused: boolean }).paused = ps.paused;
      (gate.media as unknown as { ended: boolean }).ended = ps.ended;

      const queue = deferredPosts();
      const h = setupHook('lease-a', gate.media, {
        onStart: () => { gate.resetTime(); }, // consumer load resets position
      });
      await reachSwapping(h, queue, { torn: { time: 0, paused: torn.paused } });
      gate.resetTime(); // reachSwapping's torn-write is swallowed by the gate

      // window 1 lands during SWAPPING; ack → first applyRestore (plan 1)
      act(() => { for (const a of window1) applyAction(h.result.current, a); });
      act(() => { h.result.current.ackSwap(1); });
      if (callCount(h.onSwapComplete) !== 0) {
        fail('P3-P2 first-restore-completed', SEED, iter, {
          ps, window1: fmtActions(window1), window2: fmtActions(window2),
        });
      }

      // window 2 lands during RESTORING — the queue was consumed by the
      // first invocation, so plan 2 re-plans from window 2's collapse.
      act(() => { for (const a of window2) applyAction(h.result.current, a); });

      // readiness lands → the retry re-runs the merged plan with the LATEST queue
      act(() => { gate.markReady(); });
      act(() => { gate.fire('canplay'); });

      const plan1 = modelPlan(modelQueue(window1, ps), ps);
      const plan2 = modelPlan(modelQueue(window2, ps), ps);
      const expectedTime = clampApply(plan2.seek);
      const expectedPlay =
        (plan1.playPause === 'play' ? 1 : 0) + (plan2.playPause === 'play' ? 1 : 0);
      const expectedPause =
        (plan1.playPause === 'pause' ? 1 : 0) + (plan2.playPause === 'pause' ? 1 : 0);
      const finalFlip = plan2.playPause ?? plan1.playPause;
      const expectedPaused =
        finalFlip === 'play' ? false : finalFlip === 'pause' ? true : torn.paused;
      const ctx = {
        ps, torn, window1: fmtActions(window1), window2: fmtActions(window2),
        plan1, plan2, expectedTime, expectedPlay, expectedPause, expectedPaused,
        actual: {
          completeCalls: callCount(h.onSwapComplete),
          time: gate.time, paused: gate.media.paused,
          play: callCount(gate.media.play), pause: callCount(gate.media.pause),
        },
      };
      if (callCount(h.onSwapComplete) !== 1) fail('P3-P2 terminal', SEED, iter, ctx);
      if (gate.time !== expectedTime) fail('P3-P2 time', SEED, iter, ctx);
      if (callCount(gate.media.play) !== expectedPlay) fail('P3-P2 play-count', SEED, iter, ctx);
      if (callCount(gate.media.pause) !== expectedPause) fail('P3-P2 pause-count', SEED, iter, ctx);
      if (gate.media.paused !== expectedPaused) fail('P3-P2 paused', SEED, iter, ctx);
      if (h.result.current.swapId !== 1) fail('P3-P2 swapId', SEED, iter, ctx);
      act(() => { h.unmount(); });
    }

    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`P3-P2: ${ITERATIONS} iter, ${ms.toFixed(0)} ms`);
  }, 30_000);

  // ────────────────────────────────────────────────────────────────
  it('P3-P3 — terminal differentiation: complete = plan / error = raw queue / asset-change = DROP / unmount = DROP (seed 44)', async () => {
    const SEED = 44;
    const rng = mulberry32(SEED);
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t0 = process.hrtime.bigint();
    const terminals = ['complete', 'error', 'asset-change', 'unmount'] as const;
    type Terminal = (typeof terminals)[number];

    for (let iter = 0; iter < ITERATIONS; iter += 1) {
      const terminal: Terminal = terminals[randInt(rng, 0, 3)];
      const ps = genPs(rng);
      const torn = genTorn(rng);
      const actions = genActions(rng, 1, 5);
      const queue = deferredPosts();
      const media = stubMedia({ currentTime: ps.currentTime, paused: ps.paused, ended: ps.ended });
      const h = setupHook('lease-a', media);
      await reachSwapping(h, queue, { torn });
      act(() => { for (const a of actions) applyAction(h.result.current, a); });

      const q = modelQueue(actions, ps);

      if (terminal === 'complete') {
        act(() => { h.result.current.ackSwap(1); });
        const plan = modelPlan(q, ps);
        const expectedTime = clampApply(plan.seek);
        const expectedPlay = plan.playPause === 'play' ? 1 : 0;
        const expectedPause = plan.playPause === 'pause' ? 1 : 0;
        const expectedPaused =
          plan.playPause === 'play' ? false : plan.playPause === 'pause' ? true : torn.paused;
        const ctx = { terminal, ps, torn, actions: fmtActions(actions), q, plan, expectedTime,
          expectedPlay, expectedPause, expectedPaused,
          actual: { time: media.currentTime, paused: media.paused,
            play: callCount(media.play), pause: callCount(media.pause),
            complete: callCount(h.onSwapComplete), error: callCount(h.onSwapError) } };
        if (callCount(h.onSwapComplete) !== 1 || callCount(h.onSwapError) !== 0) {
          fail('P3-P3 complete-terminal', SEED, iter, ctx);
        }
        if (media.currentTime !== expectedTime) fail('P3-P3 complete-time', SEED, iter, ctx);
        if (callCount(media.play) !== expectedPlay) fail('P3-P3 complete-play', SEED, iter, ctx);
        if (callCount(media.pause) !== expectedPause) fail('P3-P3 complete-pause', SEED, iter, ctx);
        if (media.paused !== expectedPaused) fail('P3-P3 complete-paused', SEED, iter, ctx);
        act(() => { h.unmount(); });
      } else if (terminal === 'error') {
        await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
        // :349-359 — RAW queue entry, best-effort: seek applies ONLY if one
        // was queued (unclamped — :274-277 has no clamp), playPause ONLY if
        // queued; NO previousState merge.
        const expectedTime = q.seek !== undefined ? q.seek : torn.time;
        const expectedPlay = q.playPause === 'play' ? 1 : 0;
        const expectedPause = q.playPause === 'pause' ? 1 : 0;
        const expectedPaused =
          q.playPause === 'play' ? false : q.playPause === 'pause' ? true : torn.paused;
        const ctx = { terminal, ps, torn, actions: fmtActions(actions), q, expectedTime,
          expectedPlay, expectedPause, expectedPaused,
          actual: { time: media.currentTime, paused: media.paused,
            play: callCount(media.play), pause: callCount(media.pause),
            complete: callCount(h.onSwapComplete), error: callCount(h.onSwapError),
            posts: queue.length } };
        if (callCount(h.onSwapError) !== 1 || callCount(h.onSwapComplete) !== 0) {
          fail('P3-P3 error-terminal', SEED, iter, ctx);
        }
        if (media.currentTime !== expectedTime) fail('P3-P3 error-time', SEED, iter, ctx);
        if (callCount(media.play) !== expectedPlay) fail('P3-P3 error-play', SEED, iter, ctx);
        if (callCount(media.pause) !== expectedPause) fail('P3-P3 error-pause', SEED, iter, ctx);
        if (media.paused !== expectedPaused) fail('P3-P3 error-paused', SEED, iter, ctx);
        if (queue.length !== 3) fail('P3-P3 error-drain', SEED, iter, ctx); // coalesced timer refresh drained
        act(() => { h.unmount(); });
      } else if (terminal === 'asset-change') {
        act(() => { h.rerender({ id: 'lease-b' }); });
        await act(async () => { await flushAsync(); });
        await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
        // DROP: the queued intent NEVER reaches the element
        const ctx = { terminal, ps, torn, actions: fmtActions(actions), q,
          actual: { time: media.currentTime, play: callCount(media.play),
            pause: callCount(media.pause),
            complete: callCount(h.onSwapComplete), error: callCount(h.onSwapError),
            posts: queue.length } };
        if (callCount(media.play) !== 0 || callCount(media.pause) !== 0) {
          fail('P3-P3 asset-change-apply', SEED, iter, ctx);
        }
        if (media.currentTime !== torn.time) fail('P3-P3 asset-change-time', SEED, iter, ctx);
        if (callCount(h.onSwapComplete) !== 0 || callCount(h.onSwapError) !== 0) {
          fail('P3-P3 asset-change-emission', SEED, iter, ctx);
        }
        // recovery: the next asset's initial lands and the live path works
        await act(async () => { queue[queue.length - 1].resolve(makeInfo('url-b1', 8)); });
        if (h.result.current.info?.swapId !== null) fail('P3-P3 asset-change-swapId', SEED, iter, ctx);
        act(() => { h.result.current.play(); });
        if (callCount(media.play) !== 1) fail('P3-P3 asset-change-recovery', SEED, iter, ctx);
        act(() => { h.unmount(); });
      } else {
        act(() => { h.unmount(); });
        await act(async () => { await flushAsync(); });
        const ctx = { terminal, ps, torn, actions: fmtActions(actions), q,
          actual: { time: media.currentTime, play: callCount(media.play),
            pause: callCount(media.pause) } };
        if (callCount(media.play) !== 0 || callCount(media.pause) !== 0) {
          fail('P3-P3 unmount-apply', SEED, iter, ctx);
        }
        if (media.currentTime !== torn.time) fail('P3-P3 unmount-time', SEED, iter, ctx);
      }
    }

    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`P3-P3: ${ITERATIONS} iter, ${ms.toFixed(0)} ms`);
  }, 30_000);

  // ────────────────────────────────────────────────────────────────
  it('P3-P4 — swapId monotonicity across k swaps and lifecycle boundaries (seed 45)', async () => {
    const SEED = 45;
    const rng = mulberry32(SEED);
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t0 = process.hrtime.bigint();

    for (let iter = 0; iter < ITERATIONS; iter += 1) {
      const k = randInt(rng, 1, 10);
      const changeAfter = randInt(rng, 0, k); // === k → no mid-sequence change
      const queue = deferredPosts();
      const media = stubMedia({ currentTime: 10, paused: false });
      const h = setupHook('lease-a', media);

      // initial load: counter 0, info.swapId null, no lifecycle events
      await act(async () => { await flushAsync(); });
      await act(async () => { queue[queue.length - 1].resolve(makeInfo('url-init', 8)); });
      const initCtx = {
        k, changeAfter,
        actual: { swapId: h.result.current.swapId, infoSwapId: h.result.current.info?.swapId,
          events: h.events.length } };
      // fresh locals per use-site: TS literal-narrows property chains across
      // fail() guards (never-return), and two literal compares on the same
      // chain (=== 0 here, === i below) let CFA prove the loop body
      // unreachable — locals break the chain.
      const initSwapId = h.result.current.swapId;
      const initInfoSwapId = h.result.current.info?.swapId;
      if (initSwapId !== 0) fail('P3-P4 initial-counter', SEED, iter, initCtx);
      if (initInfoSwapId !== null) fail('P3-P4 initial-info', SEED, iter, initCtx);
      if (h.events.length !== 0) fail('P3-P4 initial-events', SEED, iter, initCtx);

      for (let i = 1; i <= k; i += 1) {
        if (changeAfter === i - 1) {
          // ASSET_CHANGE mid-sequence: counter preserved, next load initial
          act(() => { h.rerender({ id: 'lease-b' }); });
          await act(async () => { await flushAsync(); });
          await act(async () => { queue[queue.length - 1].resolve(makeInfo('url-b-init', 8)); });
          const chCtx = { k, changeAfter, i,
            actual: { swapId: h.result.current.swapId,
              infoSwapId: h.result.current.info?.swapId } };
          const changeSwapId = h.result.current.swapId;
          const changeInfoSwapId = h.result.current.info?.swapId;
          if (changeSwapId !== i - 1) fail('P3-P4 change-counter', SEED, iter, chCtx);
          if (changeInfoSwapId !== null) fail('P3-P4 change-info', SEED, iter, chCtx);
        }
        await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
        await act(async () => {
          queue[queue.length - 1].resolve(makeInfo(`url-${i}`, 8));
          await flushAsync();
          h.result.current.ackSwap(i);
        });
        // the ack cascades start→restore→complete inside the same act, so
        // swap i's start is the i-th 'start' event and the last event is
        // its 'complete'.
        const starts = h.events.filter((e) => e.type === 'start');
        const completes = h.events.filter((e) => e.type === 'complete');
        const swCtx = { k, changeAfter, i,
          actual: { startCount: starts.length, completeCount: completes.length,
            lastStartSwapId: starts[starts.length - 1]?.ctx.swapId,
            stateSwapId: h.result.current.swapId,
            infoSwapId: h.result.current.info?.swapId } };
        const stateSwapId = h.result.current.swapId;
        const stateInfoSwapId = h.result.current.info?.swapId;
        if (starts.length !== i || completes.length !== i) {
          fail('P3-P4 lifecycle-count', SEED, iter, swCtx);
        }
        if (starts[i - 1].ctx.swapId !== i) fail('P3-P4 emission', SEED, iter, swCtx);
        if (stateSwapId !== i) fail('P3-P4 counter', SEED, iter, swCtx);
        if (stateInfoSwapId !== i) fail('P3-P4 info-swapId', SEED, iter, swCtx);
      }
      act(() => { h.unmount(); });

      // fresh instance: counter restarts at 0 (unmount corrupts nothing)
      const queue2 = deferredPosts();
      const media2 = stubMedia({ currentTime: 5, paused: true });
      const h2 = setupHook('lease-c', media2);
      await act(async () => { await flushAsync(); });
      await act(async () => { queue2[queue2.length - 1].resolve(makeInfo('url-fresh', 8)); });
      const freshCtx = { k, changeAfter,
        actual: { swapId: h2.result.current.swapId,
          infoSwapId: h2.result.current.info?.swapId, events: h2.events.length } };
      if (h2.result.current.swapId !== 0) fail('P3-P4 fresh-counter', SEED, iter, freshCtx);
      if (h2.result.current.info?.swapId !== null) fail('P3-P4 fresh-info', SEED, iter, freshCtx);
      if (h2.events.length !== 0) fail('P3-P4 fresh-events', SEED, iter, freshCtx);
      act(() => { h2.unmount(); });
    }

    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`P3-P4: ${ITERATIONS} iter, ${ms.toFixed(0)} ms`);
  }, 30_000);

  // ────────────────────────────────────────────────────────────────
  it('P3-P5 — pendingRefresh drain-after-terminal (seed 46)', async () => {
    const SEED = 46;
    const rng = mulberry32(SEED);
    vi.useFakeTimers();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t0 = process.hrtime.bigint();

    for (let iter = 0; iter < ITERATIONS; iter += 1) {
      const terminal = rng() < 0.5 ? 'complete' : 'error';
      const ps = genPs(rng);
      const torn = genTorn(rng);
      const actions = genActions(rng, 1, 4);
      const queue = deferredPosts();
      const media = stubMedia({ currentTime: ps.currentTime, paused: ps.paused, ended: ps.ended });
      const h = setupHook('lease-a', media);
      await reachSwapping(h, queue, { torn });

      // intents + an imperative refresh() during SWAPPING (the schedule
      // timer may coalesce a second one on the error path — depth 1,
      // latest-wins → exactly ONE drained POST at the terminal)
      act(() => { for (const a of actions) applyAction(h.result.current, a); });
      act(() => { h.result.current.refresh('manual'); });

      const q1 = modelQueue(actions, ps);
      if (terminal === 'complete') {
        act(() => { h.result.current.ackSwap(1); });
      } else {
        await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
      }
      await act(async () => { await flushAsync(); });

      const drainCtx = { terminal, ps, torn, actions: fmtActions(actions), q1,
        actual: { errorCalls: callCount(h.onSwapError), posts: queue.length } };
      if (terminal === 'error' && callCount(h.onSwapError) !== 1) {
        fail('P3-P5 error-terminal', SEED, iter, drainCtx);
      }
      if (queue.length !== 3) fail('P3-P5 drain-count', SEED, iter, drainCtx); // initial + swap-1 refresh + drained

      // the element moves on (user keeps watching) — FRESH state for swap 2
      const fresh = genPs(rng);
      act(() => {
        media.currentTime = fresh.currentTime;
        setPaused(media, fresh.paused);
        (media as unknown as { ended: boolean }).ended = fresh.ended;
      });

      await act(async () => {
        queue[2].resolve(makeInfo('url-3', 8));
        await flushAsync();
      });
      // swap-2's start is the SECOND 'start' event (swap 1 emitted start +
      // its terminal before it)
      const start2 = h.events.filter((e) => e.type === 'start')[1];
      const capCtx = { terminal, ps, torn, fresh, actions: fmtActions(actions), q1,
        actual: { events: h.events.map((e) => e.type),
          cap: start2 ? {
            time: start2.ctx.previousState.currentTime,
            paused: start2.ctx.previousState.paused,
            ended: start2.ctx.previousState.ended,
            swapId: start2.ctx.swapId,
          } : null } };
      if (!start2 || start2.ctx.swapId !== 2) {
        fail('P3-P5 swap2-start', SEED, iter, capCtx);
      }
      // FRESH capture — the consumed swap-1 queue never ghosts into it
      if (start2.ctx.previousState.currentTime !== fresh.currentTime
        || start2.ctx.previousState.paused !== fresh.paused
        || start2.ctx.previousState.ended !== fresh.ended) {
        fail('P3-P5 fresh-capture', SEED, iter, capCtx);
      }

      act(() => { h.result.current.ackSwap(2); });

      // swap 2 has no queued intents → plan 2 = fresh capture ⊕ nothing
      const plan2 = modelPlan({}, fresh);
      const expectedTime = clampApply(plan2.seek);
      const swap1Play = terminal === 'complete'
        ? (modelPlan(q1, ps).playPause === 'play' ? 1 : 0)
        : (q1.playPause === 'play' ? 1 : 0);
      const swap1Pause = terminal === 'complete'
        ? (modelPlan(q1, ps).playPause === 'pause' ? 1 : 0)
        : (q1.playPause === 'pause' ? 1 : 0);
      const expectedPlay = swap1Play + (plan2.playPause === 'play' ? 1 : 0);
      const expectedPause = swap1Pause + (plan2.playPause === 'pause' ? 1 : 0);
      const finCtx = { terminal, ps, torn, fresh, actions: fmtActions(actions), q1, plan2,
        expectedTime, expectedPlay, expectedPause,
        actual: { time: media.currentTime, paused: media.paused,
          play: callCount(media.play), pause: callCount(media.pause),
          swapId: h.result.current.swapId,
          events: h.events.map((e) => e.type) } };
      if (h.events[h.events.length - 1].type !== 'complete') fail('P3-P5 swap2-complete', SEED, iter, finCtx);
      if (media.currentTime !== expectedTime) fail('P3-P5 time', SEED, iter, finCtx);
      if (callCount(media.play) !== expectedPlay) fail('P3-P5 play-count', SEED, iter, finCtx);
      if (callCount(media.pause) !== expectedPause) fail('P3-P5 pause-count', SEED, iter, finCtx);
      if (media.paused !== fresh.paused) fail('P3-P5 paused', SEED, iter, finCtx);
      if (h.result.current.swapId !== 2) fail('P3-P5 swapId', SEED, iter, finCtx);
      act(() => { h.unmount(); });
    }

    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`P3-P5: ${ITERATIONS} iter, ${ms.toFixed(0)} ms`);
  }, 30_000);
});
