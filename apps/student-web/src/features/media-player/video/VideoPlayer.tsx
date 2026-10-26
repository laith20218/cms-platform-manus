import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Hls, { type ErrorData } from 'hls.js';
import { LoaderCircle, MonitorPlay, Play, RotateCcw } from 'lucide-react';
import { cn, getOrCreateInstallationId } from '@/utils';
import { useMediaLease } from '../hooks/useMediaLease';
import { mediaApi, type MediaAssetType } from '../services/media-api';
import { usePlayerShell } from '../shell-context';
import { BookmarkDialog } from './BookmarkDialog';
import { ControlsBar } from './ControlsBar';

/**
 * Push 10.2 — the production VideoPlayer. Push 10.4 — dual-engine:
 *
 *  - MP4/object-storage URLs → native <video src> (Range-capable files,
 *    exactly as 10.2 shipped).
 *  - `.m3u8` URLs (the Push 10.3 transcoding ladder's master playlist) →
 *    hls.js + MSE. Safari/iOS builds without MSE fall back to the element's
 *    native HLS support via the same `src` path.
 *
 * The silent lease refresh works for BOTH engines: the native path swaps the
 * `src` prop, the HLS path calls `hls.loadSource(newUrl)` — each with the
 * captured timestamp + play state restored in onLoadedMetadata (hls.js also
 * gets `startPosition` so the fresh manifest buffers straight at the playhead
 * instead of re-downloading from zero).
 *
 * Lifecycle:
 *  - useMediaLease fetches the playback URL and silently refreshes it at
 *    ttl−60s (seamless: time + play state survive every swap).
 *  - Progress: GET on mount → seek to lastPositionSeconds; POST every 10s
 *    while playing, on pause, and a keepalive final save on unmount/unload.
 *  - Bookmarks: the bottom-bar button opens the dark "save clip" dialog.
 *  - Fullscreen: routes through the PlayerShell context (the STAGE goes
 *    fullscreen so controls stay visible); iPhone Safari falls back to the
 *    video element's native fullscreen.
 *
 * Controls contract: the seek timeline reads left→right (physical) like
 * every major Arabic-market player; text/menu content is RTL.
 */

const DOUBLE_TAP_MS = 280;
const SKIP_SECONDS = 10;
const KEYBOARD_SKIP_SECONDS = 5;
const CONTROLS_AUTO_HIDE_MS = 2600;
const PROGRESS_SAVE_INTERVAL_MS = 10_000;

/**
 * True when the playback URL points at an HLS master/variant playlist.
 * Presigned URLs carry signature query strings, so the check runs on the
 * URL's *pathname* — `endsWith('.m3u8')` on the raw string would break the
 * moment a `?X-Signature=…` is appended.
 */
function isHlsUrl(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.m3u8');
  } catch {
    // Not an absolute URL (blob:/relative) — best-effort substring probe.
    return url.toLowerCase().includes('.m3u8');
  }
}

/**
 * Push 11.1 — true when a request URL targets the API origin. The API base mirrors
 * api-client.ts (`VITE_API_URL`, defaulting to the same-origin `/api/v1`).
 */
function isApiOriginUrl(url: string): boolean {
  try {
    const apiBase = new URL(import.meta.env.VITE_API_URL || '/api/v1', window.location.origin);
    return new URL(url, window.location.origin).origin === apiBase.origin;
  } catch {
    return false;
  }
}

/**
 * Push 11.1 — hls.js xhrSetup: attach the session's auth headers (the exact set the
 * axios interceptors + entitlementRequestConfig send on every media API call) to each
 * manifest/fragment request that targets the API origin.
 *
 * HLS playback URLs now come from the API's proxy route
 * (/api/v1/media/hls/{assetType}/{assetId}/master.m3u8): the relative URIs inside the
 * playlists resolve back into that route, so EVERY hls.js request — master, variant
 * playlists, .ts segments — hits the API and must carry Bearer + X-Entitlement +
 * X-Installation-Id to pass the student gate (the 401 incident was exactly the
 * ladder's children arriving at storage with no authorization at all).
 *
 * Headers are read per-request (not captured once): the lease refresh renews the
 * access/entitlement tokens on its cadence, and later requests must see the fresh
 * values. Non-API URLs (legacy presigned storage hosts) get NO headers — an
 * Authorization header would void an S3 presign signature ("only one auth
 * mechanism allowed").
 */
function attachApiAuthHeaders(xhr: XMLHttpRequest, url: string): void {
  if (!isApiOriginUrl(url)) return;
  const token = sessionStorage.getItem('cms-access-token');
  const entitlement = sessionStorage.getItem('cms-signed-entitlement');
  const installationId = getOrCreateInstallationId();
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  if (entitlement) xhr.setRequestHeader('X-Entitlement', entitlement);
  if (installationId) {
    xhr.setRequestHeader('X-Installation-Id', installationId);
    xhr.setRequestHeader('X-Device-Fingerprint', installationId);
  }
}

interface RippleFeedback {
  key: number;
  side: 'left' | 'right';
  x: number;
  y: number;
}

export interface VideoPlayerProps {
  assetType: MediaAssetType;
  assetId: string;
  title?: string;
  /** Poster placeholder while the first URL loads. */
  posterUrl?: string;
  className?: string;
  testId?: string;
}

export default function VideoPlayer({
  assetType,
  assetId,
  title,
  posterUrl,
  className,
  testId,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const shell = usePlayerShell();

  const {
    info,
    loading,
    error: leaseError,
    refreshing,
    generation,
    fetchUrl,
    pendingTimeRef,
    wasPlayingRef,
    resetPending,
  } = useMediaLease({ assetType, assetId, mediaRef: videoRef });

  /* ============ engine selection (native MP4 vs hls.js MSE) ============ */

  const playbackUrl = info?.url ?? null;
  const urlIsHls = playbackUrl !== null && isHlsUrl(playbackUrl);
  // Safari/iOS (no MSE) plays .m3u8 natively through the element's src —
  // every other browser gets hls.js attached to the same <video>.
  const useHlsEngine = urlIsHls && Hls.isSupported();
  const hlsRef = useRef<Hls | null>(null);

  // ---- media state ----
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedSeconds, setBufferedSeconds] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [bookmarkOpen, setBookmarkOpen] = useState(false);
  const [ripple, setRipple] = useState<RippleFeedback | null>(null);

  // ---- refs the async paths read (avoid stale closures) ----
  const resumeRef = useRef<number | null>(null);
  const lastPositionRef = useRef(0);
  const lastDurationRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const singleTapTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ side: 'left' | 'right'; x: number; y: number; t: number } | null>(null);
  const rippleClearTimerRef = useRef<number | null>(null);
  const lastMediaErrorAtRef = useRef(0);
  const rateRef = useRef(1);
  const savedGenerationRef = useRef(0);

  /* ============ progress: save pipeline ============ */

  const saveProgress = useCallback((mode: 'interval' | 'pause' | 'final') => {
    const position = mode === 'final' ? lastPositionRef.current : videoRef.current?.currentTime ?? lastPositionRef.current;
    const dur = mode === 'final' ? lastDurationRef.current : (videoRef.current?.duration ?? lastDurationRef.current);
    if (!Number.isFinite(position) || position <= 0) return;
    if (mode === 'final') {
      mediaApi.upsertProgressKeepalive(assetType, assetId, position, dur && Number.isFinite(dur) ? Math.round(dur) : null);
    } else {
      mediaApi.upsertProgress(assetType, assetId, position, dur && Number.isFinite(dur) ? Math.round(dur) : null).catch(() => {});
    }
  }, [assetType, assetId]);

  // Every 10s while playing.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => saveProgress('interval'), PROGRESS_SAVE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing, saveProgress]);

  // Tab close / hide + unmount → keepalive final save.
  useEffect(() => {
    const onHide = () => saveProgress('final');
    const onVisibility = () => { if (document.visibilityState === 'hidden') onHide(); };
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      onHide(); // unmount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveProgress]);

  // Also checkpoint right before a lease swap steals the element's state.
  useEffect(() => {
    if (generation > savedGenerationRef.current) {
      savedGenerationRef.current = generation;
      saveProgress('pause');
    }
  }, [generation, saveProgress]);

  // Initial progress fetch → resume position (applied at loadedmetadata, or
  // immediately if metadata had already loaded before the response landed).
  useEffect(() => {
    let cancelled = false;
    mediaApi.getProgress(assetType, assetId)
      .then((progress) => {
        if (cancelled || !progress || progress.lastPositionSeconds <= 0) return;
        resumeRef.current = progress.lastPositionSeconds;
        const video = videoRef.current;
        if (video && video.readyState >= 1) {
          try { video.currentTime = progress.lastPositionSeconds; } catch { /* seek before ready — metadata path applies it */ }
          resumeRef.current = null;
        }
      })
      .catch(() => { /* resume is best-effort */ });
    return () => { cancelled = true; };
  }, [assetType, assetId]);

  /* ============ seamless swap + metadata restore ============ */

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (Number.isFinite(video.duration)) {
      setDuration(video.duration);
      lastDurationRef.current = video.duration;
    }
    // playbackRate resets on every src swap — re-apply before restoring play.
    video.playbackRate = rateRef.current;
    video.volume = volume;
    video.muted = muted;

    if (pendingTimeRef.current != null) {
      // Lease swap: restore timestamp + play state — the student never notices.
      try { video.currentTime = pendingTimeRef.current; } catch { /* engine refused the seek */ }
      if (wasPlayingRef.current) safePlay(video);
      resetPending();
    } else if (resumeRef.current != null) {
      try { video.currentTime = resumeRef.current; } catch { /* ignore */ }
      resumeRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTimeRef, wasPlayingRef, resetPending, volume, muted]);

  const handleMediaError = useCallback(() => {
    // An expired/403 URL usually surfaces as a media error just after the
    // lease lapses — refresh with preserved time. Two errors in quick
    // succession = genuinely broken source → stop hammering and show UI.
    const now = Date.now();
    if (now - lastMediaErrorAtRef.current < 5000) {
      setFatalError('تعذّر تشغيل الملف. حاول إعادة التحميل.');
      return;
    }
    lastMediaErrorAtRef.current = now;
    void fetchUrl({ preserveTime: true, reason: 'error' });
  }, [fetchUrl]);

  // The hls.js error listener attaches once (instance creation) but must
  // always see the *latest* refresh handler — fetchUrl's identity changes
  // with every lease generation.
  const handleMediaErrorRef = useRef(handleMediaError);
  useEffect(() => {
    handleMediaErrorRef.current = handleMediaError;
  }, [handleMediaError]);

  /* ============ hls.js engine (`.m3u8` playback URLs only) ============ */

  // attach/load — runs on every playback URL change (initial + every silent
  // refresh). Native mode keeps the plain `src` prop path and never spins up
  // an instance; an engine flip (never expected for one asset) destroys it.
  useEffect(() => {
    if (!useHlsEngine) {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      return;
    }
    const video = videoRef.current;
    if (!video || !playbackUrl) return;

    let hls = hlsRef.current;
    if (!hls) {
      // autoStartLoad stays off: every load (initial + silent swaps) starts
      // explicitly from the captured playhead via startLoad(position), so a
      // lease refresh never re-buffers from zero.
      // Push 11.1 — xhrSetup: proxy-route requests carry the session auth
      // headers (see attachApiAuthHeaders); presigned storage URLs stay bare.
      hls = new Hls({
        enableWorker: true,
        maxBufferLength: 30,
        autoStartLoad: false,
        xhrSetup: attachApiAuthHeaders,
      });
      hlsRef.current = hls;
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data: ErrorData) => {
        if (!data.fatal) return; // hls.js already retried/absorbed it.
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hlsRef.current?.recoverMediaError();
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          // Expired presigned manifest/fragment — the same throttled
          // preserve-time refresh the native path uses for 403'd files.
          handleMediaErrorRef.current();
          return;
        }
        hlsRef.current?.destroy();
        hlsRef.current = null;
        setFatalError('تعذّر تشغيل البث. حاول إعادة التحميل.');
      });
    }

    // Silent-refresh swap: buffer the fresh manifest straight at the captured
    // playhead (loadedmetadata restores it again — the safety net for engines
    // that ignore the start position).
    const resumeAt = pendingTimeRef.current != null && pendingTimeRef.current > 0 ? pendingTimeRef.current : -1;
    hls.once(Hls.Events.MANIFEST_PARSED, () => {
      hlsRef.current?.startLoad(resumeAt);
    });
    hls.loadSource(playbackUrl);
    // refs-only contract: pendingTimeRef/videoRef are stable; handleMediaError
    // is read through its ref — re-running on identity churn would double-load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackUrl, useHlsEngine]);

  // Unmount → release the MSE instance (and its SourceBuffers).
  useEffect(() => () => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
  }, []);

  /* ============ volume / mute wiring (state → element) ============ */

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.volume = volume;
  }, [volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, [muted]);

  /* ============ buffered ranges ============ */

  const updateBuffered = useCallback(() => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const buffered = video.buffered;
    let end = 0;
    // Range containing the playhead wins; otherwise the newest range
    // trailing behind it (just-seeked case) still shows honest progress.
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= video.currentTime && video.currentTime <= buffered.end(i)) {
        end = buffered.end(i);
        break;
      }
      if (buffered.end(i) <= video.currentTime && buffered.end(i) > end) end = buffered.end(i);
    }
    setBufferedSeconds(Math.min(end, video.duration));
  }, []);

  /* ============ helpers ============ */

  function safePlay(video: HTMLVideoElement) {
    try {
      const maybe = video.play();
      if (maybe && typeof maybe.catch === 'function') maybe.catch(() => { /* autoplay policy — user presses play */ });
    } catch { /* ignore */ }
  }

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) safePlay(video);
    else video.pause();
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    const target = Math.min(Math.max(0, seconds), video.duration);
    try { video.currentTime = target; } catch { return; }
    setCurrentTime(target);
    lastPositionRef.current = target;
  }, []);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    seekTo(video.currentTime + delta);
  }, [seekTo]);

  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused && !video.ended) setControlsVisible(false);
    }, CONTROLS_AUTO_HIDE_MS);
  }, []);

  const showRipple = useCallback((side: 'left' | 'right', x: number, y: number) => {
    if (rippleClearTimerRef.current !== null) window.clearTimeout(rippleClearTimerRef.current);
    setRipple({ key: Date.now(), side, x, y });
    rippleClearTimerRef.current = window.setTimeout(() => setRipple(null), 700);
  }, []);

  /* ============ fullscreen (shell-first, video fallback) ============ */

  const [localFullscreen, setLocalFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setLocalFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const isFullscreen = shell?.isFullscreen ?? localFullscreen;

  const toggleFullscreen = useCallback(async () => {
    if (shell) {
      const handled = await shell.toggleFullscreen();
      if (handled) return;
    }
    // Inline hosting (no shell) — fullscreen our own container; iPhone Safari
    // supports neither → the video element's native fullscreen is the only way.
    const container = containerRef.current;
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      if (container?.requestFullscreen) { await container.requestFullscreen(); return; }
    } catch { /* fall through to native video fullscreen */ }
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    video?.webkitEnterFullscreen?.();
  }, [shell]);

  /* ============ keyboard ============ */

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
    // Radix slider thumbs own their arrow-key semantics (seek/volume steps).
    if (target.closest('[role="slider"]')) return;
    switch (event.key) {
      case ' ':
      case 'k':
      case 'K':
        event.preventDefault();
        togglePlay();
        break;
      case 'ArrowRight':
        event.preventDefault();
        seekBy(KEYBOARD_SKIP_SECONDS);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        seekBy(-KEYBOARD_SKIP_SECONDS);
        break;
      case 'j':
      case 'J':
        seekBy(-SKIP_SECONDS);
        break;
      case 'l':
      case 'L':
        seekBy(SKIP_SECONDS);
        break;
      case 'm':
      case 'M':
        setMuted((m) => !m);
        break;
      case 'f':
      case 'F':
        void toggleFullscreen();
        break;
      default:
        break;
    }
    bumpControls();
  }, [togglePlay, seekBy, toggleFullscreen, bumpControls]);

  /* ============ double-tap zones ============ */

  const handleZonePointerUp = useCallback((side: 'left' | 'right', event: React.PointerEvent<HTMLDivElement>) => {
    const now = Date.now();
    const prev = lastTapRef.current;
    lastTapRef.current = { side, x: event.clientX, y: event.clientY, t: now };
    bumpControls();

    if (prev && prev.side === side && now - prev.t < DOUBLE_TAP_MS) {
      // Double tap → seek ±10s with ripple feedback.
      if (singleTapTimerRef.current !== null) { window.clearTimeout(singleTapTimerRef.current); singleTapTimerRef.current = null; }
      lastTapRef.current = null;
      seekBy(side === 'left' ? -SKIP_SECONDS : SKIP_SECONDS);
      const rect = containerRef.current?.getBoundingClientRect();
      const x = rect ? event.clientX - rect.left : event.clientX;
      const y = rect ? event.clientY - rect.top : event.clientY;
      showRipple(side, x, y);
      return;
    }

    // Single tap (fires after the double-tap window closes).
    if (singleTapTimerRef.current !== null) window.clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = window.setTimeout(() => {
      singleTapTimerRef.current = null;
      if (event.pointerType === 'mouse') togglePlay();
      // Touch: tap toggles the controls' visibility only.
      else setControlsVisible((visible) => !visible);
    }, DOUBLE_TAP_MS);
  }, [bumpControls, seekBy, showRipple, togglePlay]);

  /* ============ render ============ */

  const showInitialSpinner = loading && !info;
  const showError = leaseError && !info;

  return (
    <div
      ref={containerRef}
      dir="rtl"
      data-testid={testId ?? 'video-player'}
      data-engine={playbackUrl ? (useHlsEngine ? 'hls' : 'native') : undefined}
      tabIndex={0}
      role="region"
      aria-label={title ? `مشغّل فيديو: ${title}` : 'مشغّل فيديو'}
      onKeyDown={handleKeyDown}
      onPointerMove={bumpControls}
      className={cn(
        'group relative aspect-video w-full select-none overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl outline-none',
        !controlsVisible && playing && 'cursor-none',
        className,
      )}
      style={{ boxShadow: '0 24px 64px rgba(2, 6, 23, 0.5)' }}
    >
      {/* Media element — native controls hidden (custom bar below). In HLS
          mode the element carries no `src`; hls.js feeds it through MSE. */}
      <video
        ref={videoRef}
        src={useHlsEngine ? undefined : info?.url}
        poster={posterUrl}
        preload="auto"
        playsInline
        // controls intentionally omitted — custom bar owns every interaction.
        aria-label={title ?? 'محتوى الفيديو'}
        data-testid="video-element"
        className="h-full w-full bg-black"
        onPlay={() => { setPlaying(true); bumpControls(); }}
        onPause={() => { setPlaying(false); setControlsVisible(true); saveProgress('pause'); }}
        onEnded={() => { setPlaying(false); setControlsVisible(true); saveProgress('pause'); }}
        onTimeUpdate={(e) => {
          const video = e.currentTarget;
          setCurrentTime(video.currentTime);
          lastPositionRef.current = video.currentTime;
          updateBuffered();
        }}
        onDurationChange={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) {
            setDuration(e.currentTarget.duration);
            lastDurationRef.current = e.currentTarget.duration;
          }
        }}
        onProgress={updateBuffered}
        onSeeked={updateBuffered}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleMediaError}
      />

      {/* Double-tap seek zones (physical sides: left = back, right = forward). */}
      <div
        aria-hidden="true"
        data-testid="video-tap-zone-left"
        className="absolute inset-y-0 left-0 z-10 w-1/2"
        onPointerUp={(e) => handleZonePointerUp('left', e)}
      />
      <div
        aria-hidden="true"
        data-testid="video-tap-zone-right"
        className="absolute inset-y-0 right-0 z-10 w-1/2"
        onPointerUp={(e) => handleZonePointerUp('right', e)}
      />

      {/* Center layer: big play / buffering / fatal-error surfaces. */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        {showInitialSpinner && (
          <div data-testid="video-loading" className="flex flex-col items-center gap-3 text-white/80">
            <LoaderCircle className="h-12 w-12 animate-spin" strokeWidth={1.5} />
            <p className="text-sm font-medium">جارٍ تجهيز الفيديو…</p>
          </div>
        )}
        {showError && (
          <div className="pointer-events-auto flex flex-col items-center gap-4 px-6 text-center text-white/85">
            <MonitorPlay className="h-10 w-10" strokeWidth={1.5} />
            <p className="text-sm">{leaseError}</p>
            <button
              type="button"
              onClick={() => void fetchUrl({ preserveTime: false, reason: 'manual' })}
              data-testid="video-retry"
              className="press inline-flex min-h-11 items-center gap-2 rounded-2xl bg-teal-500 px-5 py-2 text-sm font-bold text-[#0b1120] transition-colors hover:bg-teal-400"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2} /> إعادة المحاولة
            </button>
          </div>
        )}
        {fatalError && (
          <div className="pointer-events-auto flex flex-col items-center gap-3 px-6 text-center text-white/85" data-testid="video-fatal-error">
            <MonitorPlay className="h-10 w-10" strokeWidth={1.5} />
            <p className="text-sm">{fatalError}</p>
            <button
              type="button"
              onClick={() => { setFatalError(null); void fetchUrl({ preserveTime: true, reason: 'manual' }); }}
              className="press inline-flex min-h-11 items-center gap-2 rounded-2xl bg-teal-500 px-5 py-2 text-sm font-bold text-[#0b1120] transition-colors hover:bg-teal-400"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2} /> إعادة المحاولة
            </button>
          </div>
        )}
        {buffering && !showInitialSpinner && (
          <LoaderCircle data-testid="video-buffering" className="h-10 w-10 animate-spin text-white/80" strokeWidth={1.5} />
        )}
        {/* Big center play/pause — pointer-events enabled only when paused. */}
        <AnimatePresence>
          {!playing && !showInitialSpinner && !showError && !fatalError && (
            <motion.button
              key="center-play"
              type="button"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.18 }}
              onClick={togglePlay}
              aria-label="تشغيل"
              data-testid="video-center-play"
              className="pointer-events-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white shadow-2xl backdrop-blur-md transition-transform hover:scale-105 sm:h-24 sm:w-24"
            >
              <Play className="h-9 w-9 -translate-x-0.5 sm:h-11 sm:w-11" strokeWidth={1.75} />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Double-tap ripple feedback ("-10s" / "+10s" badges). */}
      <AnimatePresence>
        {ripple && (
          <motion.div
            key={ripple.key}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.15 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            data-testid={`video-ripple-${ripple.side}`}
            className="pointer-events-none absolute z-20 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full bg-black/55 backdrop-blur-sm sm:h-32 sm:w-32"
            style={{ left: ripple.side === 'left' ? Math.max(88, Math.min(ripple.x, 176)) : undefined, right: ripple.side === 'right' ? Math.max(88, Math.min(containerRef.current ? containerRef.current.clientWidth - ripple.x : 88, 176)) : undefined, top: ripple.y }}
          >
            <span className="font-mono text-lg font-bold text-white" dir="ltr">
              {ripple.side === 'left' ? `−${SKIP_SECONDS}s` : `+${SKIP_SECONDS}s`}
            </span>
            <span className="text-[11px] text-white/70">{ripple.side === 'left' ? 'للخلف' : 'للأمام'}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Silent refresh indicator — a whisper, never a blocker. */}
      <AnimatePresence>
        {refreshing && (
          <motion.div
            key="refreshing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-testid="video-refreshing"
            className="pointer-events-none absolute top-3 z-20 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur-sm"
          >
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            تجديد الرابط…
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom controls (auto-hide while playing). */}
      {info && (
        <ControlsBar
          playing={playing}
          currentTime={currentTime}
          duration={duration}
          bufferedSeconds={bufferedSeconds}
          volume={volume}
          muted={muted}
          rate={rate}
          isFullscreen={isFullscreen}
          controlsVisible={controlsVisible}
          onTogglePlay={togglePlay}
          onSeek={seekTo}
          onVolumeChange={(value) => { setVolumeState(value); setMuted(value === 0); }}
          onToggleMute={() => setMuted((m) => !m)}
          onRateChange={(value) => { setRate(value); rateRef.current = value; if (videoRef.current) videoRef.current.playbackRate = value; }}
          onToggleFullscreen={() => void toggleFullscreen()}
          onOpenBookmark={() => setBookmarkOpen(true)}
        />
      )}

      {/* Bookmark (save clip) dialog. */}
      <BookmarkDialog
        open={bookmarkOpen}
        onOpenChange={setBookmarkOpen}
        assetType={assetType}
        assetId={assetId}
        currentTime={currentTime}
        duration={Number.isFinite(duration) && duration > 0 ? duration : null}
      />
    </div>
  );
}
