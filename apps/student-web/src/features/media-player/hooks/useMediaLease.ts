import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { mediaApi, type MediaAssetType, type PlaybackUrlInfo } from '../services/media-api';

/**
 * Push 10.2 — The media lease engine (generalized Lease Trap).
 *
 * Presigned playback URLs live ~ttlSeconds (540 in production). The hook
 * schedules a SILENT refresh at ttlSeconds − 60s: before fetching, it
 * captures the element's currentTime + play state; the new URL lands as a
 * plain `src` prop change; the host restores both in its onLoadedMetadata —
 * the student never notices the swap.
 *
 * Failure handling: a failed refresh retries on a 15s backoff (3 attempts),
 * and a fatal media error (e.g. a URL that 403'd early) triggers an
 * immediate preserve-time refresh.
 *
 * Short-TTL clamp: refreshDelay = max(3s, (ttl − 60) · 1s). Production
 * 540s → 480s. A mocked ttl of 8s (e2e) → 3s — the swap path stays
 * testable without any production branching.
 */

const REFRESH_MARGIN_SECONDS = 60;
const MIN_REFRESH_DELAY_MS = 3_000;
const RETRY_DELAY_MS = 15_000;
const MAX_REFRESH_ATTEMPTS = 3;

export interface MediaLeaseState {
  info: PlaybackUrlInfo | null;
  loading: boolean;
  error: string | null;
  /** True while a silent refresh is in flight (never blocks the video). */
  refreshing: boolean;
  /** Bumps on every successful URL swap — hosts key side-effects on it. */
  generation: number;
}

export interface UseMediaLeaseResult extends MediaLeaseState {
  fetchUrl: (options: { preserveTime: boolean; reason?: 'timer' | 'error' | 'manual' }) => Promise<void>;
  /** Swap-restore refs — read inside the host's onLoadedMetadata (NOT render
   * values: the swap lands between renders). */
  pendingTimeRef: React.MutableRefObject<number | null>;
  wasPlayingRef: React.MutableRefObject<boolean>;
  /** Clears the pending swap-restore (host calls after applying it). */
  resetPending: () => void;
}

export function useMediaLease(params: {
  assetType: MediaAssetType;
  assetId: string;
  /** The media element whose time/play state must survive the swap. */
  mediaRef: React.RefObject<HTMLVideoElement | HTMLAudioElement | null>;
}): UseMediaLeaseResult {
  const { assetType, assetId, mediaRef } = params;

  const [state, setState] = useState<MediaLeaseState>({
    info: null,
    loading: true,
    error: null,
    refreshing: false,
    generation: 0,
  });
  // W6 — internal failure tick, deliberately NOT part of MediaLeaseState (the
  // public returned shape is unchanged in P0). A failed silent refresh changes
  // nothing in `state` that the timer effect depends on, so pre-P0 the retry
  // timer was never re-armed and RETRY_DELAY_MS was unreachable. This tick
  // changes on every failed refresh, re-running the timer effect.
  const [retryTick, setRetryTick] = useState(0);

  // Timestamp/play-state captured right before a preserve-time fetch; the
  // host restores them from onLoadedMetadata and clears via resetPending().
  const pendingTimeRef = useRef<number | null>(null);
  const wasPlayingRef = useRef(false);
  const attemptRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  // W4 — the in-flight presign fetch, keyed by `${assetType}:${assetId}`.
  // Scope in P0: fetch → fetch (concurrent fetchUrl calls for the same asset
  // coalesce onto the in-flight one). P1 will extend the guard to span
  // fetch → consumer ack.
  const inFlightRef = useRef<{ key: string; promise: Promise<void> } | null>(null);
  // W5 — identity of the asset this hook instance CURRENTLY serves
  // (`${assetType}:${assetId}`). A fetch whose request key no longer matches
  // this ref resolves for a previous asset and must be discarded — the
  // mountedRef check cannot catch it because the ref flips false → true
  // within one commit on an in-place asset change.
  const assetKeyRef = useRef(`${assetType}:${assetId}`);

  /** Host calls inside onLoadedMetadata after applying pendingTime. */
  const resetPending = useCallback(() => {
    pendingTimeRef.current = null;
  }, []);

  const fetchUrl = useCallback((options: { preserveTime: boolean; reason?: 'timer' | 'error' | 'manual' }): Promise<void> => {
    const requestKey = `${assetType}:${assetId}`;

    // W4 (fetch → fetch scope): coalesce concurrent fetches for the same asset
    // onto the in-flight one. A second caller wants the very URL the first is
    // already minting — abort-and-restart would discard the in-flight presign
    // and ADD latency; coalescing keeps ONE mint, ONE generation bump and ONE
    // consumer swap per URL (the pre-P0 double swap made the second restore
    // land on an already-reset element → position 0).
    if (inFlightRef.current && inFlightRef.current.key === requestKey) {
      return inFlightRef.current.promise;
    }

    const promise = (async () => {
      const media = mediaRef.current;
      if (options.preserveTime && media && !media.ended) {
        pendingTimeRef.current = media.currentTime;
        wasPlayingRef.current = !media.paused;
      } else if (options.preserveTime && media) {
        // Ended media restarts from the top on the fresh URL.
        pendingTimeRef.current = 0;
        wasPlayingRef.current = false;
      }
      const isRefresh = Boolean(state.info);
      if (isRefresh) setState((s) => ({ ...s, refreshing: true }));
      else setState((s) => ({ ...s, loading: true, error: null }));

      try {
        const info = await mediaApi.getPlaybackUrl(assetType, assetId);
        if (!mountedRef.current) return;
        // W5: the asset changed while this fetch was in flight — a stale
        // presigned URL must never land in the new asset's state.
        if (assetKeyRef.current !== requestKey) return;
        attemptRef.current = 0;
        setState((s) => ({ ...s, info, loading: false, error: null, refreshing: false, generation: s.generation + 1 }));
      } catch {
        if (!mountedRef.current) return;
        // W5: a stale failure belongs to the previous asset too — the new
        // asset's initial fetch owns the loading/error state now.
        if (assetKeyRef.current !== requestKey) return;
        attemptRef.current += 1;
        if (isRefresh) {
          // Silent-refresh failure: retry on a backoff, keep the current URL
          // playing (it may simply outlive its nominal TTL).
          setState((s) => ({ ...s, refreshing: false }));
          // W6: change the failure tick so the timer effect re-arms the retry.
          setRetryTick((t) => t + 1);
          if (attemptRef.current < MAX_REFRESH_ATTEMPTS) {
            toast.info('يجري تجديد رابط التشغيل تلقائياً…', { duration: 2000 });
          }
        } else {
          setState((s) => ({
            ...s,
            loading: false,
            refreshing: false,
            error: 'تعذّر تجهيز الملف للتشغيل. تحقق من اتصالك ثم أعد المحاولة.',
          }));
        }
      } finally {
        // W4: release the in-flight slot only if it is still OURS (a newer
        // fetch for a different key may have replaced it).
        if (inFlightRef.current?.promise === promise) {
          inFlightRef.current = null;
        }
      }
    })();

    inFlightRef.current = { key: requestKey, promise };
    return promise;
  }, [assetType, assetId, mediaRef, state.info]);

  // Initial fetch + reset when the asset changes.
  useEffect(() => {
    mountedRef.current = true;
    // W5: mark which asset this hook serves BEFORE its initial fetch starts,
    // so any still-pending fetch for the previous asset discards on arrival.
    assetKeyRef.current = `${assetType}:${assetId}`;
    // W4/W5: fresh in-flight slot per asset (the old asset's flight, if any,
    // self-discards via the key check above).
    inFlightRef.current = null;
    pendingTimeRef.current = null;
    wasPlayingRef.current = false;
    attemptRef.current = 0;
    setState({ info: null, loading: true, error: null, refreshing: false, generation: 0 });
    void fetchUrl({ preserveTime: false });
    return () => {
      mountedRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
    // fetchUrl identity depends on state.info (isRefresh flag) — deliberate
    // exclusion: the initial fetch must run exactly once per asset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetType, assetId]);

  // The timer: refresh at ttl − 60s, or retry 15s after a failed attempt.
  // W6: `retryTick` is in the deps so a failed silent refresh re-arms the
  // RETRY_DELAY_MS branch (pre-P0 no dep changed on failure → the branch was
  // unreachable and the lease rode an expiring URL). Arming stops after
  // MAX_REFRESH_ATTEMPTS consecutive failures — the consumer's error-driven
  // fetchUrl({ reason: 'error' }) call is NOT capped and stays available as
  // the escape hatch (a success resets attemptRef to 0).
  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (!state.info || state.loading) return;
    if (attemptRef.current >= MAX_REFRESH_ATTEMPTS) return;

    const delay =
      attemptRef.current > 0
        ? RETRY_DELAY_MS
        : Math.max(MIN_REFRESH_DELAY_MS, (state.info.ttlSeconds - REFRESH_MARGIN_SECONDS) * 1000);

    timerRef.current = window.setTimeout(() => {
      void fetchUrl({ preserveTime: true, reason: 'timer' });
    }, delay);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [state.info, state.loading, fetchUrl, retryTick]);

  return {
    ...state,
    fetchUrl,
    pendingTimeRef,
    wasPlayingRef,
    resetPending,
  };
}
