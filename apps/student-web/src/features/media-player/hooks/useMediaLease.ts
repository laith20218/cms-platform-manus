import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { mediaApi, type MediaAssetType, type PlaybackUrlInfo } from '../services/media-api';

/**
 * Wave 11.7.x / P1 — the media lease engine, redesigned around an explicit
 * swap lifecycle (PART X-a directives + X-b.1 amendment set).
 *
 * Presigned playback URLs live ~ttlSeconds (540 in production). The hook
 * schedules a SILENT refresh at ttlSeconds − 60s. The P0 design captured the
 * element's state at fetch ENTRY and left the restore to the consumer's
 * onLoadedMetadata — five race windows (W1/W2/W3/W7/W9) live in that gap.
 * The P1 contract closes them:
 *
 *   IDLE ── timer / refresh() ──▶ FETCHING (no capture, no events;
 *   │                            W4 fetch→fetch guard; W5 stale discard)
 *   │ fetch resolves — SYNCHRONOUSLY in that turn:
 *   │   1. capture previousState from the element (W1/W2/W3/W7 — the state
 *   │      actually in effect at the swap moment, not at fetch entry)
 *   │   2. swapId += 1, build the FROZEN SwapContext (DF-7)
 *   │   3. emit onSwapStart(ctx) — sync (OPEN-7/16)
 *   ▼
 *   SWAPPING (isSwapInFlight; ack deadline armed at ctx.deadlineAt)
 *   │ consumer assigns src / hls.loadSource(ctx.newUrl), waits for element
 *   │ readiness (isElementSwapReady), calls ackSwap(ctx.swapId)
 *   ▼
 *   RESTORING (restore deadline RESTORE_TIMEOUT_MS armed; every state has a
 *   │ timeout exit — OPEN-4). The hook applies previousState: rate, volume,
 *   │ mute, pitch, clamped seek (OPEN-9), play-if-wasPlaying. A refused seek
 *   │ retries on the next readiness event until the deadline.
 *   ▼
 *   IDLE (onSwapComplete(ctx) emitted sync; deferred refreshes drain)
 *
 * Deadline exits emit onSwapError(ctx, err) — sync, no URL rollback (the new
 * URL is valid; the swap failed to complete). A failed FETCH never emits
 * onSwapError (fetch failure ≠ swap failure) and keeps P0's retry behavior.
 *
 * P0 hygiene preserved as internals: W4 (fetch→fetch coalescing), W5 (stale
 * response discard across asset change), W6 (retry timer re-arm), W8
 * (refresh ⇄ initial classified by asset identity), W10 (a failed fetch
 * captures nothing — capture happens at the swap moment or not at all).
 *
 * Short-TTL clamp: refreshDelay = max(3s, (ttl − 60) · 1s). Production
 * 540s → 480s; a mocked ttl of 8 (e2e) → 3s.
 */

const REFRESH_MARGIN_SECONDS = 60;
const MIN_REFRESH_DELAY_MS = 3_000;
const RETRY_DELAY_MS = 15_000;
const MAX_REFRESH_ATTEMPTS = 3;

/** A swap that never receives ackSwap() within this window terminal-fails.
 * Default; overridable per hook via swapAckTimeoutMs (clamped to the floor). */
export const SWAP_ACK_TIMEOUT_MS = 5_000;
export const MIN_SWAP_ACK_TIMEOUT_MS = 500;
/** After a valid ack the hook must be able to apply previousState to the
 * element within this window (readiness retries included) — otherwise
 * onSwapError. Every state machine state has a timeout exit (OPEN-4). */
export const RESTORE_TIMEOUT_MS = 3_000;
/** The restore seek target is pulled inside the seekable/duration bound. */
const SEEK_CLAMP_EPSILON_SECONDS = 0.25;
/** |el.currentTime − target| within this tolerance counts as "seek took". */
const SEEK_TOOK_TOLERANCE_SECONDS = 0.5;

type MediaElementWithPitch = HTMLMediaElement & { webkitPreservesPitch?: boolean };

/** Element state snapshot captured SYNCHRONOUSLY at the swap moment (the
 *  fetch-resolution turn) — never at fetch entry. */
export interface SwapPreviousState {
  readonly currentTime: number;
  readonly paused: boolean;
  /** Ended media restarts from the top on the fresh URL (P0 semantics). */
  readonly ended: boolean;
  readonly playbackRate: number;
  readonly volume: number;
  readonly muted: boolean;
  /** null when the element supports neither preservesPitch nor
   *  webkitPreservesPitch (feature-detected read; symmetric write). */
  readonly preservesPitch: boolean | null;
  readonly duration: number;
  // buffered is deliberately omitted: browser-managed, read-only, cannot be
  // restored (PART X-a C7a).
}

/** One frozen context per swap — delivered BY REFERENCE to onSwapStart,
 *  onSwapComplete and onSwapError; consumers correlate by identity (DF-7). */
export interface SwapContext {
  readonly swapId: number;
  readonly assetType: string;
  readonly assetId: string;
  readonly newUrl: string;
  readonly previousState: Readonly<SwapPreviousState>;
  /** Ack deadline: capturedAt + effective swapAckTimeoutMs (OPEN-17). */
  readonly deadlineAt: number;
}

/** PlaybackUrlInfo as delivered by this hook, annotated with the swap that
 *  carried it. null ⇔ delivered WITHOUT a swap lifecycle (the initial load
 *  or an asset-change load); a number ⇔ the swap currently being restored. */
export interface LeaseInfo extends PlaybackUrlInfo {
  swapId: number | null;
}

export interface UseMediaLeaseOptions {
  assetType: MediaAssetType;
  assetId: string;
  /** The media element whose state must survive every swap. */
  mediaRef: React.RefObject<HTMLMediaElement | null>;
  /** REQUIRED (X-b.1/OPEN-1): the consumer performs the element swap inside
   *  this callback (assign src, or hls.loadSource(ctx.newUrl) — URL identity
   *  is never a valid skip condition) and acks via ackSwap(ctx.swapId) once
   *  the element is swap-ready (see isElementSwapReady). Held in a ref —
   *  inline arrows are safe. MUST be ctx-driven: the state updates in this
   *  same turn commit AFTER the handler returns. */
  onSwapStart: (ctx: SwapContext) => void;
  /** Optional (no-op default). */
  onSwapComplete?: (ctx: SwapContext) => void;
  /** REQUIRED (X-b.1/OPEN-1): a swap failed to complete (ack/restore
   *  timeout). No URL rollback — the consumer surfaces retry UI and MUST
   *  detach its readiness listeners for ctx.swapId (DF-6). A late ackSwap
   *  afterwards is a warn-no-op on the hook side. */
  onSwapError: (ctx: SwapContext, err: Error) => void;
  /** Ack deadline override (default SWAP_ACK_TIMEOUT_MS, floor 500ms). */
  swapAckTimeoutMs?: number;
}

export interface UseMediaLeaseResult {
  info: LeaseInfo | null;
  /** Initial fetch only (DF-5). */
  loading: boolean;
  /** refresh-classified fetch in flight OR SWAPPING OR RESTORING (DF-5). */
  refreshing: boolean;
  error: Error | null;
  /** Monotonic per hook instance; 0 = no swap yet. */
  swapId: number;
  /** Render-state mirror of the swap lifecycle (overlay/disable UI only —
   *  NEVER for hot-path gating; use isSwapActive() for that, DF-3). */
  isSwapInFlight: boolean;
  /** Idempotent; validates swapId === current AND a swap awaiting ack. */
  ackSwap: (swapId: number) => void;
  /** Ref-backed, stable-identity hot-path signal: true from the capture
   *  turn until every terminal (complete / error / asset change / unmount). */
  isSwapActive: () => boolean;
  /** Imperative entry point (DF-1). preserveTime is GONE — subsumed by
   *  capture-at-swap. Coalesces during a swap (never rejects) and executes
   *  at the terminal (depth 1, latest-wins — OPEN-6). */
  refresh: (reason?: 'manual' | 'error') => void;
}

/** The consumer's ack condition (PART X-a §5, element-level readiness):
 *  an HLS ack on MANIFEST_PARSED fires too early; the element is swap-ready
 *  when a seek is actually possible. Shared by both engines. */
export function isElementSwapReady(el: HTMLMediaElement): boolean {
  return el.seekable.length > 0 && el.readyState >= HTMLMediaElement.HAVE_METADATA;
}

function readPreservesPitch(el: HTMLMediaElement | null): boolean | null {
  if (!el) return null;
  const e = el as MediaElementWithPitch;
  if (typeof e.preservesPitch === 'boolean') return e.preservesPitch;
  if (typeof e.webkitPreservesPitch === 'boolean') return e.webkitPreservesPitch;
  return null;
}

function writePreservesPitch(el: HTMLMediaElement, value: boolean | null): void {
  if (value === null) return;
  const e = el as MediaElementWithPitch;
  try {
    if (typeof e.preservesPitch === 'boolean') e.preservesPitch = value;
    if (typeof e.webkitPreservesPitch === 'boolean') e.webkitPreservesPitch = value;
  } catch { /* best-effort */ }
}

interface LeaseState {
  info: LeaseInfo | null;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  swapId: number;
  isSwapInFlight: boolean;
}

type InternalReason = 'initial' | 'timer' | 'manual' | 'error';
type SwapPhase = 'idle' | 'swapping' | 'restoring';

const INITIAL_LEASE_ERROR_MESSAGE =
  'تعذّر تجهيز الملف للتشغيل. تحقق من اتصالك ثم أعد المحاولة.';

export function useMediaLease(options: UseMediaLeaseOptions): UseMediaLeaseResult {
  const { assetType, assetId, mediaRef, onSwapStart, onSwapComplete, onSwapError } = options;

  const [state, setState] = useState<LeaseState>({
    info: null,
    loading: true,
    refreshing: false,
    error: null,
    swapId: 0,
    isSwapInFlight: false,
  });
  // W6 — internal failure tick (not part of the public state): a failed
  // silent refresh must re-arm the retry timer.
  const [retryTick, setRetryTick] = useState(0);

  // Latest-ref pattern for the lifecycle callbacks (held in refs — consumers
  // may pass inline arrows without re-subscription hazards; the sync
  // onSwapStart emission always sees the latest closures).
  const callbacksRef = useRef({ onSwapStart, onSwapComplete, onSwapError });
  callbacksRef.current = { onSwapStart, onSwapComplete, onSwapError };

  const effectiveAckTimeoutMs = Math.max(
    MIN_SWAP_ACK_TIMEOUT_MS,
    options.swapAckTimeoutMs ?? SWAP_ACK_TIMEOUT_MS,
  );
  const ackTimeoutMsRef = useRef(effectiveAckTimeoutMs);
  ackTimeoutMsRef.current = effectiveAckTimeoutMs;

  // ---- swap lifecycle internals ----
  const phaseRef = useRef<SwapPhase>('idle');
  const activeCtxRef = useRef<SwapContext | null>(null);
  const swapActiveRef = useRef(false);
  const swapIdRef = useRef(0);
  const ackTimerRef = useRef<number | null>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const retryCleanupRef = useRef<(() => void) | null>(null);
  // OPEN-6: deferred refresh while a swap is in flight (depth 1, latest-wins).
  const pendingRefreshRef = useRef<{ reason: Exclude<InternalReason, 'initial'> } | null>(null);

  // ---- lease schedule / fetch hygiene (P0 internals preserved) ----
  const inFlightRef = useRef<{ key: string; promise: Promise<void> | null } | null>(null);
  const assetKeyRef = useRef(`${assetType}:${assetId}`);
  const infoKeyRef = useRef<string | null>(null);
  const infoRef = useRef<LeaseInfo | null>(null);
  const attemptRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const clearAckDeadline = useCallback(() => {
    if (ackTimerRef.current !== null) {
      window.clearTimeout(ackTimerRef.current);
      ackTimerRef.current = null;
    }
  }, []);
  const clearRestoreDeadline = useCallback(() => {
    if (restoreTimerRef.current !== null) {
      window.clearTimeout(restoreTimerRef.current);
      restoreTimerRef.current = null;
    }
  }, []);
  const clearRetryListeners = useCallback(() => {
    retryCleanupRef.current?.();
    retryCleanupRef.current = null;
  }, []);
  const clearScheduleTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Terminal with an error: deadlines cleared, ctx nulled, NO URL rollback
   *  (the new lease is valid; the swap failed to complete). */
  const terminalSwap = useCallback((ctx: SwapContext, err: Error) => {
    clearAckDeadline();
    clearRestoreDeadline();
    clearRetryListeners();
    phaseRef.current = 'idle';
    activeCtxRef.current = null;
    swapActiveRef.current = false;
    setState((s) => ({ ...s, isSwapInFlight: false, refreshing: false }));
    callbacksRef.current.onSwapError(ctx, err);
    // OPEN-6: a refresh that arrived during the swap executes now.
    const pending = pendingRefreshRef.current;
    pendingRefreshRef.current = null;
    if (pending) startFetchRef.current(pending.reason);
  }, [clearAckDeadline, clearRestoreDeadline, clearRetryListeners]);

  const completeSwap = useCallback((ctx: SwapContext) => {
    clearAckDeadline();
    clearRestoreDeadline();
    clearRetryListeners();
    phaseRef.current = 'idle';
    activeCtxRef.current = null;
    swapActiveRef.current = false;
    setState((s) => ({ ...s, isSwapInFlight: false, refreshing: false }));
    callbacksRef.current.onSwapComplete?.(ctx);
    // OPEN-6: a refresh that arrived during the swap executes now — it
    // re-classifies against the CURRENT asset (W5/W8) and its completion
    // re-arms the schedule timer, so no lease generation is skipped.
    const pending = pendingRefreshRef.current;
    pendingRefreshRef.current = null;
    if (pending) startFetchRef.current(pending.reason);
  }, [clearAckDeadline, clearRestoreDeadline, clearRetryListeners]);

  /** Applies previousState; returns true when the seek landed (or nothing
   *  needed seeking). A refused seek arms the readiness retry. */
  const applyRestore = useCallback((ctx: SwapContext) => {
    const el = mediaRef.current;
    const ps = ctx.previousState;
    if (el) {
      try {
        if (Number.isFinite(ps.playbackRate) && ps.playbackRate > 0) el.playbackRate = ps.playbackRate;
      } catch { /* best-effort */ }
      try { el.volume = ps.volume; } catch { /* best-effort */ }
      try { el.muted = ps.muted; } catch { /* best-effort */ }
      writePreservesPitch(el, ps.preservesPitch);
    }

    let seekTook = true;
    if (el) {
      // OPEN-9: ended media restarts from the top; the target is clamped
      // inside the seekable range (or duration) so a shorter re-upload /
      // variant cannot silently no-op the seek.
      let target = ps.ended ? 0 : Math.max(0, ps.currentTime);
      try {
        if (el.seekable && el.seekable.length > 0) {
          const seekableEnd = el.seekable.end(el.seekable.length - 1);
          target = Math.min(target, Math.max(0, seekableEnd - SEEK_CLAMP_EPSILON_SECONDS));
        } else if (Number.isFinite(el.duration) && el.duration > 0) {
          target = Math.min(target, Math.max(0, el.duration - SEEK_CLAMP_EPSILON_SECONDS));
        }
      } catch { /* keep the unclamped target */ }
      try { el.currentTime = target; } catch { /* engine refused — retry path */ }
      seekTook =
        Math.abs(el.currentTime - target) <= SEEK_TOOK_TOLERANCE_SECONDS ||
        el.seeking === true;
    }

    if (el && !ps.paused) {
      // DF-8: a play() rejection (autoplay policy, a superseding swap's load
      // aborting this one) is swallowed — a superseding swap is not a failure.
      try {
        const maybe = el.play();
        if (maybe && typeof maybe.catch === 'function') maybe.catch(() => { /* swallowed by contract */ });
      } catch { /* ignore */ }
    }

    if (seekTook) {
      completeSwap(ctx);
      return;
    }
    // OPEN-4: the element is not seek-ready despite the consumer's ack —
    // re-apply on the next readiness event; the restore deadline bounds the
    // total wait.
    const target1 = el;
    if (!target1) { completeSwap(ctx); return; }
    const readinessEvents = ['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough'] as const;
    const handler = () => {
      cleanup();
      if (activeCtxRef.current === ctx && phaseRef.current === 'restoring') applyRestore(ctx);
    };
    const cleanup = () => {
      for (const ev of readinessEvents) target1.removeEventListener(ev, handler);
      if (retryCleanupRef.current === cleanup) retryCleanupRef.current = null;
    };
    for (const ev of readinessEvents) target1.addEventListener(ev, handler);
    retryCleanupRef.current = cleanup;
  }, [mediaRef, completeSwap]);

  const armAckDeadline = useCallback((ctx: SwapContext) => {
    clearAckDeadline();
    ackTimerRef.current = window.setTimeout(() => {
      ackTimerRef.current = null;
      // Superseded (asset change) or already terminal — nothing to do.
      if (activeCtxRef.current !== ctx || phaseRef.current !== 'swapping') return;
      terminalSwap(ctx, new Error(
        `swap ${ctx.swapId}: consumer did not ackSwap within the ack deadline (ack timeout)`,
      ));
    }, Math.max(0, ctx.deadlineAt - Date.now()));
  }, [clearAckDeadline, terminalSwap]);

  const armRestoreDeadline = useCallback((ctx: SwapContext) => {
    clearRestoreDeadline();
    restoreTimerRef.current = window.setTimeout(() => {
      restoreTimerRef.current = null;
      if (activeCtxRef.current !== ctx || phaseRef.current !== 'restoring') return;
      terminalSwap(ctx, new Error(
        `swap ${ctx.swapId}: element did not accept the restored state within ${RESTORE_TIMEOUT_MS}ms (restore timeout)`,
      ));
    }, RESTORE_TIMEOUT_MS);
  }, [clearRestoreDeadline, terminalSwap]);

  /** SWAPPING entry: capture-at-swap + frozen ctx + sync onSwapStart. Runs
   *  in the fetch-resolution turn — no await/timer may separate the capture
   *  from the emission (OPEN-7/16: the entire W3 fix rests on this). */
  const beginSwap = useCallback((info: PlaybackUrlInfo) => {
    const el = mediaRef.current;
    const previousState = Object.freeze({
      currentTime: el ? el.currentTime : 0,
      paused: el ? el.paused : true,
      ended: el ? el.ended : false,
      playbackRate: el && Number.isFinite(el.playbackRate) && el.playbackRate > 0 ? el.playbackRate : 1,
      volume: el && Number.isFinite(el.volume) ? el.volume : 1,
      muted: el ? el.muted : false,
      preservesPitch: readPreservesPitch(el),
      duration: el && Number.isFinite(el.duration) ? el.duration : 0,
    });
    swapIdRef.current += 1;
    const ctx: SwapContext = Object.freeze({
      swapId: swapIdRef.current,
      assetType,
      assetId,
      newUrl: info.url,
      previousState,
      deadlineAt: Date.now() + ackTimeoutMsRef.current,
    });
    const lease: LeaseInfo = { ...info, swapId: ctx.swapId };
    infoRef.current = lease;
    activeCtxRef.current = ctx;
    phaseRef.current = 'swapping';
    swapActiveRef.current = true;
    setState((s) => ({
      ...s,
      info: lease,
      loading: false,
      error: null,
      refreshing: true, // DF-5: through SWAPPING + RESTORING
      swapId: ctx.swapId,
      isSwapInFlight: true,
    }));
    armAckDeadline(ctx);
    // Synchronous emission — the consumer swaps the element NOW.
    callbacksRef.current.onSwapStart(ctx);
  }, [mediaRef, assetType, assetId, armAckDeadline]);

  // terminalSwap/completeSwap drain the pending refresh through this ref
  // (mutual-recursion via refs keeps the useCallback graph acyclic).
  const startFetchRef = useRef<(reason: InternalReason) => void>(() => {});

  const startFetch = useCallback((reason: InternalReason) => {
    const requestKey = `${assetType}:${assetId}`;

    // OPEN-6: a swap is in flight — COALESCE (never reject). Depth 1,
    // latest-wins; executes when the swap reaches ANY terminal.
    if (phaseRef.current !== 'idle') {
      pendingRefreshRef.current = { reason: reason === 'initial' ? 'manual' : reason };
      return;
    }

    // W4 (fetch → fetch scope): coalesce concurrent fetches for the same
    // asset onto the in-flight one — ONE mint, ONE swap per URL.
    const existing = inFlightRef.current;
    if (existing && existing.key === requestKey && existing.promise) return;

    const flight: { key: string; promise: Promise<void> | null } = { key: requestKey, promise: null };
    inFlightRef.current = flight;

    const promise = (async () => {
      // W8: refresh ⇄ initial is decided by which asset the URL in state
      // belongs to — NOT by a (possibly stale) closure's view of info.
      const isRefresh = infoRef.current !== null && infoKeyRef.current === requestKey;
      if (isRefresh) setState((s) => ({ ...s, refreshing: true }));
      else setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const info = await mediaApi.getPlaybackUrl(assetType, assetId);
        // OPEN-16 order: mounted → assetKey → capture/emit. A discarded
        // chain NEVER captures.
        if (!mountedRef.current) return;
        if (assetKeyRef.current !== requestKey) return; // W5: stale response
        attemptRef.current = 0;
        infoKeyRef.current = requestKey;
        if (isRefresh) {
          beginSwap(info); // capture-at-swap + sync onSwapStart
        } else {
          // C4: initial load — NO lifecycle events, NO ack expected.
          const lease: LeaseInfo = { ...info, swapId: null };
          infoRef.current = lease;
          setState((s) => ({ ...s, info: lease, loading: false, error: null, refreshing: false }));
        }
      } catch {
        if (!mountedRef.current) return;
        if (assetKeyRef.current !== requestKey) return; // W5: stale failure
        attemptRef.current += 1;
        if (isRefresh) {
          // Silent-refresh failure: keep the current URL playing (it may
          // simply outlive its nominal TTL); retry on the backoff.
          setState((s) => ({ ...s, refreshing: false }));
          setRetryTick((t) => t + 1); // W6: re-arm the retry timer
          if (attemptRef.current < MAX_REFRESH_ATTEMPTS) {
            toast.info('يجري تجديد رابط التشغيل تلقائياً…', { duration: 2000 });
          }
        } else {
          setState((s) => ({
            ...s,
            loading: false,
            refreshing: false,
            error: new Error(INITIAL_LEASE_ERROR_MESSAGE),
          }));
        }
        // W10 (new-contract form): the swap never started, so nothing was
        // ever captured — the NEXT successful swap captures fresh state.
      } finally {
        // W4: release the slot only if it is still OURS.
        if (inFlightRef.current === flight) inFlightRef.current = null;
      }
    })();

    flight.promise = promise;
  }, [assetType, assetId, beginSwap]);

  startFetchRef.current = startFetch;

  /** Initial fetch + full reset when the asset changes (W5/W8 + DF-4). */
  useEffect(() => {
    mountedRef.current = true;
    assetKeyRef.current = `${assetType}:${assetId}`;
    // W8: no URL in state belongs to the new asset yet.
    infoKeyRef.current = null;
    // W4/W5: fresh in-flight slot per asset (the old asset's flight, if any,
    // self-discards via the key check).
    inFlightRef.current = null;
    // DF-4 ASSET_CHANGE edge: the in-flight swap is terminal-cleared WITHOUT
    // emission (superseded, like unmount), deadlines dropped, deferred
    // refresh dropped. swapId stays monotonic per instance — a late ackSwap
    // from the old asset can never ghost-match the new asset's swaps.
    clearAckDeadline();
    clearRestoreDeadline();
    clearRetryListeners();
    phaseRef.current = 'idle';
    activeCtxRef.current = null;
    swapActiveRef.current = false;
    pendingRefreshRef.current = null;
    attemptRef.current = 0;
    infoRef.current = null;
    setState({
      info: null,
      loading: true,
      refreshing: false,
      error: null,
      swapId: swapIdRef.current,
      isSwapInFlight: false,
    });
    startFetch('initial');
    return () => {
      mountedRef.current = false;
      clearAckDeadline();
      clearRestoreDeadline();
      clearRetryListeners();
      clearScheduleTimer();
    };
  }, [assetType, assetId, startFetch, clearAckDeadline, clearRestoreDeadline, clearRetryListeners, clearScheduleTimer]);

  /** The schedule: refresh at ttl − 60s (clamped), or retry 15s after a
   *  failed attempt (W6: retryTick re-arms the RETRY_DELAY branch; arming
   *  stops after MAX_REFRESH_ATTEMPTS consecutive failures — the consumer's
   *  error-driven refresh() is NOT capped). A refresh firing mid-swap
   *  coalesces into the deferred queue and its completion re-arms here. */
  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    const info = infoRef.current;
    if (!info || state.loading) return;
    if (attemptRef.current >= MAX_REFRESH_ATTEMPTS) return;
    const delay =
      attemptRef.current > 0
        ? RETRY_DELAY_MS
        : Math.max(MIN_REFRESH_DELAY_MS, (info.ttlSeconds - REFRESH_MARGIN_SECONDS) * 1000);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      startFetch('timer');
    }, delay);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
    // NOTE: no isSwapInFlight dep — re-arming on a swap's terminal would
    // RESTART the countdown and slip the schedule; the timer armed when the
    // info landed stays valid across the swap (a refresh firing mid-swap
    // coalesces and its deferred completion re-arms via the new info).
  }, [state.info, state.loading, retryTick, startFetch]);

  const ackSwap = useCallback((ackId: number) => {
    const ctx = activeCtxRef.current;
    if (!ctx || phaseRef.current !== 'swapping') {
      console.warn(`useMediaLease.ackSwap(${ackId}): no swap is awaiting an ack — ignored.`);
      return;
    }
    if (ackId !== ctx.swapId) {
      console.warn(`useMediaLease.ackSwap(${ackId}): stale/mismatched swapId (current: ${ctx.swapId}) — ignored.`);
      return;
    }
    clearAckDeadline();
    phaseRef.current = 'restoring';
    armRestoreDeadline(ctx);
    applyRestore(ctx);
  }, [clearAckDeadline, armRestoreDeadline, applyRestore]);

  const isSwapActive = useCallback(() => swapActiveRef.current, []);

  const refresh = useCallback((reason: 'manual' | 'error' = 'manual') => {
    startFetch(reason);
  }, [startFetch]);

  return {
    ...state,
    ackSwap,
    isSwapActive,
    refresh,
  };
}
