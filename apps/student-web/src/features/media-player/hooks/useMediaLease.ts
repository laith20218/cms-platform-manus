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

  // Timestamp/play-state captured right before a preserve-time fetch; the
  // host restores them from onLoadedMetadata and clears via resetPending().
  const pendingTimeRef = useRef<number | null>(null);
  const wasPlayingRef = useRef(false);
  const attemptRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  /** Host calls inside onLoadedMetadata after applying pendingTime. */
  const resetPending = useCallback(() => {
    pendingTimeRef.current = null;
  }, []);

  const fetchUrl = useCallback(async (options: { preserveTime: boolean; reason?: 'timer' | 'error' | 'manual' }) => {
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
      attemptRef.current = 0;
      setState((s) => ({ ...s, info, loading: false, error: null, refreshing: false, generation: s.generation + 1 }));
    } catch {
      if (!mountedRef.current) return;
      attemptRef.current += 1;
      if (isRefresh) {
        // Silent-refresh failure: retry on a backoff, keep the current URL
        // playing (it may simply outlive its nominal TTL).
        setState((s) => ({ ...s, refreshing: false }));
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
    }
  }, [assetType, assetId, mediaRef, state.info]);

  // Initial fetch + reset when the asset changes.
  useEffect(() => {
    mountedRef.current = true;
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
  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (!state.info || state.loading) return;

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
  }, [state.info, state.loading, fetchUrl]);

  return {
    ...state,
    fetchUrl,
    pendingTimeRef,
    wasPlayingRef,
    resetPending,
  };
}
