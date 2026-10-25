import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LoaderCircle, MonitorPlay, Play, RotateCcw } from 'lucide-react';
import { cn } from '@/utils';
import { useMediaLease } from '../hooks/useMediaLease';
import { mediaApi, type MediaAssetType } from '../services/media-api';
import { usePlayerShell } from '../shell-context';
import { BookmarkDialog } from './BookmarkDialog';
import { ControlsBar } from './ControlsBar';

/**
 * Push 10.2 — the production VideoPlayer (native <video>, MP4/Range — the
 * presigned URLs point at direct object-storage files, never HLS; no media
 * library needed).
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
      {/* Media element — native controls hidden (custom bar below). */}
      <video
        ref={videoRef}
        src={info?.url}
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
        }}
        onDurationChange={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) {
            setDuration(e.currentTarget.duration);
            lastDurationRef.current = e.currentTarget.duration;
          }
        }}
        onProgress={(e) => {
          const video = e.currentTarget;
          const buffered = video.buffered;
          for (let i = 0; i < buffered.length; i++) {
            if (buffered.start(i) <= video.currentTime && video.currentTime <= buffered.end(i)) {
              setBufferedSeconds(buffered.end(i));
              return;
            }
          }
        }}
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
