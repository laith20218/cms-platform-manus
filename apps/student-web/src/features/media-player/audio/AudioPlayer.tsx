import { useCallback, useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import * as SliderPrimitive from '@radix-ui/react-slider';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Bookmark, Check, ChevronUp, LoaderCircle, MonitorPlay, Pause, Play, RotateCcw, Repeat, Volume2, VolumeX, X } from 'lucide-react';
import { cn } from '@/utils';
import { useMediaLease } from '../hooks/useMediaLease';
import { mediaApi, type MediaAssetType, type MediaBookmark } from '../services/media-api';
import { usePlayerShell } from '../shell-context';
import { BookmarkDialog } from '../video/BookmarkDialog';
import { formatMediaDuration, formatRate, PLAYBACK_RATES } from '../video/time';

/**
 * Push 11.7 (F1) — the production AudioPlayer (waveform family).
 *
 * Hosted inside PlayerShell (kind="audio") — the shell owns the fullscreen
 * modal, the header and the copy-deterrent layer; this component owns the
 * audio engine + transport.
 *
 * Engine contract (verified against the installed wavesurfer.js 7.12.12):
 *  - ONE hidden <audio> element is the media engine. WaveSurfer is created
 *    with `media` (external element) + `url` — it fetches the blob once for
 *    peak decoding (CORS-gated: production bucket CORS verified in PART B),
 *    then points the element at it.
 *  - useMediaLease rides the SAME element: the TTL−60s silent refresh
 *    captures time/play state, the new URL lands as a plain element src swap
 *    (loadedmetadata restores both) — the decoded waveform peaks persist, so
 *    a refresh never re-downloads or re-decodes the file.
 *  - Pitch preservation: every rate change goes through
 *    waveSurfer.setPlaybackRate(rate, true) AND re-asserts the element's
 *    preservesPitch — voices stay natural at 0.25×–2×.
 *
 * Progress + bookmarks reuse the Wave 10.0 backend contracts verbatim
 * (PlaybackProgress upsert every 10s + keepalive final; MediaBookmark
 * list/create through the shared BookmarkDialog).
 *
 * Layout is physical-LTR for the timeline (waveform + markers, the
 * YouTube-Arabic convention the video player already follows) while all
 * text/labels render RTL naturally.
 */

const UI_SKIP_SECONDS = 15;
const KEYBOARD_SKIP_SECONDS = 10;
const PROGRESS_SAVE_INTERVAL_MS = 10_000;
// rAF-independent playback tick — drives the A-B wrap + the position snapshot
// even when wavesurfer's requestAnimationFrame loop is stalled (headless CI,
// hidden tabs, low-power devices).
const PLAYBACK_TICK_MS = 250;

/** Colors resolve to the existing player-family Tailwind palette tokens
 *  (slate-400 / teal-400 / teal-300 — the same values ControlsBar and the
 *  shell accents already use). No new palette entries. */
const WAVE_COLOR = 'rgba(148, 163, 184, 0.35)';
const PROGRESS_COLOR = '#2dd4bf';
const CURSOR_COLOR = '#5eead4';

export type AudioPlayerProps = {
  assetType: MediaAssetType;
  assetId: string;
  title?: string;
  className?: string;
  testId?: string;
};

export default function AudioPlayer({
  assetType,
  assetId,
  title,
  className,
  testId,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const shell = usePlayerShell();

  const {
    info,
    loading: leaseLoading,
    error: leaseError,
    refreshing,
    generation,
    fetchUrl,
    pendingTimeRef,
    wasPlayingRef,
    resetPending,
  } = useMediaLease({ assetType, assetId, mediaRef: audioRef });

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [bookmarks, setBookmarks] = useState<MediaBookmark[]>([]);
  const [bookmarkOpen, setBookmarkOpen] = useState(false);

  // Refs mirroring loop state for the high-frequency audioprocess handler —
  // reading state inside it would re-subscribe on every change.
  const loopARef = useRef<number | null>(null);
  const loopBRef = useRef<number | null>(null);
  const setLoopPoint = useCallback((point: 'a' | 'b', value: number | null) => {
    if (point === 'a') { loopARef.current = value; setLoopA(value); }
    else { loopBRef.current = value; setLoopB(value); }
  }, []);

  const rateRef = useRef(1);
  const resumeRef = useRef<number | null>(null);
  const lastPositionRef = useRef(0);
  const lastDurationRef = useRef<number | null>(null);
  const savedGenerationRef = useRef(0);
  const lastMediaErrorAtRef = useRef(0);

  const durationKnown = Number.isFinite(duration) && duration > 0;
  const loopActive = loopA != null && loopB != null && loopB > loopA;
  const loopInvalid = loopA != null && loopB != null && loopB <= loopA;

  /* ============ wavesurfer lifecycle (create once; swap src on refresh) ============ */

  useEffect(() => {
    const url = info?.url;
    if (!url) return;
    const audioEl = audioRef.current;
    const container = waveRef.current;
    if (!audioEl || !container) return;

    if (!wsRef.current) {
      const ws = WaveSurfer.create({
        container,
        media: audioEl,
        url,
        height: 96,
        waveColor: WAVE_COLOR,
        progressColor: PROGRESS_COLOR,
        cursorColor: CURSOR_COLOR,
        cursorWidth: 2,
        barWidth: 2,
        barGap: 2,
        barRadius: 3,
        normalize: true,
      });
      wsRef.current = ws;

      ws.on('ready', (decodedDuration: number) => {
        if (decodedDuration > 0 && Number.isFinite(decodedDuration)) {
          setDuration(decodedDuration);
          lastDurationRef.current = decodedDuration;
        }
        setReady(true);
        if (resumeRef.current != null) {
          try { ws.setTime(resumeRef.current); } catch { /* engine refused */ }
          resumeRef.current = null;
        }
      });
      ws.on('timeupdate', (t: number) => {
        setCurrentTime(t);
        lastPositionRef.current = t;
      });
      ws.on('audioprocess', (t: number) => {
        // A-B loop engine: wrap as soon as the playhead crosses B. Runs at
        // animation-frame cadence with ZERO setState (timeupdate repaints).
        const a = loopARef.current;
        const b = loopBRef.current;
        if (a != null && b != null && b > a && t >= b) {
          try { wsRef.current?.setTime(a); } catch { /* ignore */ }
        }
      });
      ws.on('play', () => setPlaying(true));
      ws.on('pause', () => setPlaying(false));
      ws.on('finish', () => setPlaying(false));
      ws.on('error', () => {
        // An expired/403 URL (or a failed peak fetch) — mirror the video
        // player: silent preserve-time refresh; two failures inside 5s = fatal.
        const now = Date.now();
        if (now - lastMediaErrorAtRef.current < 5000) {
          setFatalError('تعذّر تشغيل الملف الصوتي. حاول إعادة المحاولة.');
          return;
        }
        lastMediaErrorAtRef.current = now;
        void fetchUrl({ preserveTime: true, reason: 'error' });
      });
    } else {
      // Silent lease refresh: swap ONLY the media element's src — the decoded
      // peaks stay, so the student never sees a waveform redraw or a re-download.
      // loadedmetadata (below) restores the captured time + play state.
      audioEl.src = url;
      try { audioEl.load(); } catch { /* ignore */ }
    }
    // Keyed on generation: exactly one branch per URL swap. info is read
    // through its closure; re-running on identity churn would double-load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation]);

  /* ============ deterministic playback tick (rAF-independent) ============ */

  // wavesurfer's timeupdate/audioprocess ride a requestAnimationFrame loop
  // (its Timer class). When rAF stalls — headless CI runners, hidden tabs,
  // low-power devices — those events never fire, which used to freeze the
  // A-B loop wrap and the final progress snapshot (a product defect: audio
  // keeps playing while the loop and the saved position drift). This 250ms
  // interval reads the media element directly and is the AUTHORITATIVE
  // driver; the ws handlers above stay as supplementary (smoother clock and
  // cursor when rAF is healthy).
  // Declared BEFORE the destroy + final-save effects so the unmount cleanup
  // order is: clearInterval → ws.destroy() → saveProgress('final').
  useEffect(() => {
    const tickId = window.setInterval(() => {
      const audioEl = audioRef.current;
      if (!audioEl) return;
      const pos = audioEl.currentTime;
      lastPositionRef.current = pos;
      setCurrentTime(pos);
      const a = loopARef.current;
      const b = loopBRef.current;
      // Wrap only while PLAYING — mirrors the audioprocess semantics (it
      // fires during playback only), so a paused head at/after B (e.g. the
      // moment B is set, or a paused waveform seek past B) is never snapped.
      if (a != null && b != null && b > a && !audioEl.paused && pos >= b) {
        audioEl.currentTime = a;
      }
    }, PLAYBACK_TICK_MS);
    return () => window.clearInterval(tickId);
    // Mount-scoped: refs + stable setState only — no reactive deps.
  }, []);

  // Destroy the engine on unmount (external media: the element is ours, React
  // removes it with the tree; destroy() releases the renderer + subscriptions).
  useEffect(() => () => {
    wsRef.current?.destroy();
    wsRef.current = null;
  }, []);

  /* ============ progress: save pipeline (VideoPlayer pattern) ============ */

  const saveProgress = useCallback((mode: 'interval' | 'pause' | 'final') => {
    // Element-first for EVERY mode: visibilitychange and the unmount keepalive
    // must read audioEl.currentTime directly, not a possibly-stale ref. At
    // unmount React may have detached the element already — then the 250ms
    // tick's fresh snapshot (≤250ms old) is the fallback.
    const position = audioRef.current?.currentTime ?? lastPositionRef.current;
    const dur = mode === 'final' ? lastDurationRef.current : (audioRef.current?.duration ?? lastDurationRef.current);
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

  // Checkpoint right before a lease swap steals the element's state.
  useEffect(() => {
    if (generation > savedGenerationRef.current) {
      savedGenerationRef.current = generation;
      saveProgress('pause');
    }
  }, [generation, saveProgress]);

  // Initial progress fetch → resume position (applied at decode-ready, or
  // immediately if the decode had already finished when the response landed).
  useEffect(() => {
    let cancelled = false;
    mediaApi.getProgress(assetType, assetId)
      .then((progress) => {
        if (cancelled || !progress || progress.lastPositionSeconds <= 0) return;
        const ws = wsRef.current;
        if (ws && ready) {
          try { ws.setTime(progress.lastPositionSeconds); } catch { /* ignore */ }
        } else {
          resumeRef.current = progress.lastPositionSeconds;
        }
      })
      .catch(() => { /* resume is best-effort */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetType, assetId]);

  /* ============ bookmarks (list + create; PATCH/DELETE deferred) ============ */

  const loadBookmarks = useCallback(() => {
    mediaApi.listBookmarks(assetType, assetId)
      .then((list) => { if (wsRef.current) setBookmarks(list); })
      .catch(() => { /* markers are best-effort */ });
  }, [assetType, assetId]);

  // Load once the engine exists (markers need the duration anyway).
  useEffect(() => { if (wsRef.current) loadBookmarks(); }, [loadBookmarks]);

  // Refetch when the save-clip dialog closes (covers both cancel and success).
  const bookmarkWasOpenRef = useRef(false);
  useEffect(() => {
    if (bookmarkOpen) bookmarkWasOpenRef.current = true;
    else if (bookmarkWasOpenRef.current) {
      bookmarkWasOpenRef.current = false;
      loadBookmarks();
    }
  }, [bookmarkOpen, loadBookmarks]);

  /* ============ volume / mute wiring ============ */

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.volume = volume;
  }, [volume]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.muted = muted;
  }, [muted]);

  /* ============ transport ============ */

  function safePlay(el: HTMLAudioElement) {
    try {
      const maybe = el.play();
      if (maybe && typeof maybe.catch === 'function') maybe.catch(() => { /* autoplay policy */ });
    } catch { /* ignore */ }
  }

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) safePlay(el);
    else el.pause();
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const ws = wsRef.current;
    if (!ws || !durationKnown) return;
    const target = Math.min(Math.max(0, seconds), duration);
    try { ws.setTime(target); } catch { return; }
    setCurrentTime(target);
    lastPositionRef.current = target;
  }, [duration, durationKnown]);

  const seekBy = useCallback((delta: number) => {
    const el = audioRef.current;
    if (!el) return;
    seekTo(el.currentTime + delta);
  }, [seekTo]);

  const applyRate = useCallback((value: number) => {
    setRate(value);
    rateRef.current = value;
    // true = preserve pitch (the second setPlaybackRate argument; the element
    // property is re-asserted as belt-and-braces for engines that reset it).
    wsRef.current?.setPlaybackRate(value, true);
    const el = audioRef.current;
    if (el) el.preservesPitch = true;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (shell) {
      const handled = await shell.toggleFullscreen();
      if (handled) return;
    }
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    } catch { /* ignore */ }
  }, [shell]);

  /* ============ keyboard (container-scoped) ============ */

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
    // Radix slider thumbs own their arrow-key semantics (volume steps).
    if (target.closest('[role="slider"]')) return;
    switch (event.key) {
      case ' ':
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
      case 'm':
      case 'M':
        setMuted((m) => !m);
        break;
      default:
        break;
    }
  }, [togglePlay, seekBy]);

  /* ============ silent swap restore (lease refresh) ============ */

  const handleLoadedMetadata = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    // playbackRate resets on every src swap — re-apply before restoring play.
    el.playbackRate = rateRef.current;
    el.preservesPitch = true;
    el.volume = volume;
    el.muted = muted;
    if (Number.isFinite(el.duration) && el.duration > 0) {
      setDuration(el.duration);
      lastDurationRef.current = el.duration;
    }
    if (pendingTimeRef.current != null) {
      // Lease swap: restore timestamp + play state — the student never notices.
      try { el.currentTime = pendingTimeRef.current; } catch { /* engine refused the seek */ }
      if (wasPlayingRef.current) safePlay(el);
      resetPending();
    } else if (resumeRef.current != null) {
      try { el.currentTime = resumeRef.current; } catch { /* ignore */ }
      resumeRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTimeRef, wasPlayingRef, resetPending, volume, muted]);

  const handleMediaError = useCallback(() => {
    const now = Date.now();
    if (now - lastMediaErrorAtRef.current < 5000) {
      setFatalError('تعذّر تشغيل الملف الصوتي. حاول إعادة المحاولة.');
      return;
    }
    lastMediaErrorAtRef.current = now;
    void fetchUrl({ preserveTime: true, reason: 'error' });
  }, [fetchUrl]);

  /* ============ render ============ */

  const showInitialSpinner = leaseLoading && !info;
  const showError = leaseError && !info;
  const markersReady = durationKnown && bookmarks.length > 0;

  return (
    <div
      dir="rtl"
      data-testid={testId ?? 'audio-player'}
      tabIndex={0}
      role="region"
      aria-label={title ? `مشغّل صوت: ${title}` : 'مشغّل صوت'}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative flex w-full max-w-3xl flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 select-none outline-none sm:p-6 focus-visible:ring-2 focus-visible:ring-teal-400/50',
        className,
      )}
    >
      {/* The hidden media engine — wavesurfer drives it, useMediaLease reads it. */}
      <audio
        ref={audioRef}
        preload="auto"
        aria-label={title ?? 'المحتوى الصوتي'}
        data-testid="audio-element"
        className="hidden"
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleMediaError}
      />

      {/* ===== Waveform + bookmark markers (physical LTR timeline) ===== */}
      <div className="relative" data-testid="audio-waveform-wrap">
        <div ref={waveRef} data-testid="audio-waveform" className="w-full overflow-hidden rounded-2xl" />
        {markersReady && bookmarks.map((bookmarkItem) => (
          <button
            key={bookmarkItem.id}
            type="button"
            data-testid="audio-bookmark-marker"
            aria-label={`الانتقال إلى العلامة: ${bookmarkItem.label}`}
            title={`${bookmarkItem.label} · ${formatMediaDuration(bookmarkItem.startSeconds)}`}
            onClick={() => seekTo(bookmarkItem.startSeconds)}
            // Physical left % — the waveform canvas is LTR by convention.
            className="absolute inset-y-0 z-10 w-1.5 -translate-x-1/2 rounded-full bg-amber-400/90 transition-colors hover:bg-amber-300 focus-visible:bg-amber-300 focus-visible:outline focus-visible:outline-teal-300"
            style={{ left: `${Math.min(100, Math.max(0, (bookmarkItem.startSeconds / duration) * 100))}%` }}
          />
        ))}
        {loopA != null && durationKnown && (
          <span
            aria-hidden="true"
            data-testid="audio-loop-marker-a"
            className="pointer-events-none absolute inset-y-0 z-[5] w-0.5 bg-teal-300/80"
            style={{ left: `${Math.min(100, (loopA / duration) * 100)}%` }}
          />
        )}
        {loopB != null && durationKnown && (
          <span
            aria-hidden="true"
            data-testid="audio-loop-marker-b"
            className="pointer-events-none absolute inset-y-0 z-[5] w-0.5 bg-teal-300/80"
            style={{ left: `${Math.min(100, (loopB / duration) * 100)}%` }}
          />
        )}
        {/* Center layer: initial spinner while the peaks decode. */}
        {!ready && !showError && !fatalError && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl bg-[#0b1120]/40" data-testid="audio-decoding">
            <div className="flex flex-col items-center gap-3">
              <LoaderCircle className="h-10 w-10 animate-spin text-teal-300/90" strokeWidth={1.5} />
              <p className="text-xs font-medium text-slate-300">
                {showInitialSpinner ? 'جارٍ تجهيز الملف الصوتي…' : 'جارٍ رسم الموجة الصوتية…'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ===== Time row (current / total) ===== */}
      <div dir="ltr" className="flex items-center justify-center gap-1.5 font-mono text-xs tabular-nums text-slate-300 sm:text-sm" data-testid="audio-time-display">
        <span className="font-semibold text-white">{formatMediaDuration(currentTime)}</span>
        <span aria-hidden="true" className="text-slate-500">/</span>
        <span className="text-slate-400">{durationKnown ? formatMediaDuration(duration) : '--:--'}</span>
      </div>

      {/* ===== Transport: −15s / play / +15s (48px play target) ===== */}
      <div dir="ltr" className="flex items-center justify-center gap-2 sm:gap-3" data-testid="audio-transport">
        <button
          type="button"
          onClick={() => seekBy(-UI_SKIP_SECONDS)}
          aria-label="رجوع 15 ثانية"
          data-testid="audio-back-15"
          disabled={!ready}
          className="press flex h-11 w-11 items-center justify-center rounded-full text-slate-200 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          <RotateCcw className="h-5 w-5" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
          data-testid="audio-play"
          disabled={!ready}
          className="press flex h-12 w-12 items-center justify-center rounded-full bg-teal-500 text-[#0b1120] shadow-lg transition-all hover:bg-teal-400 hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 sm:h-14 sm:w-14"
        >
          {playing ? <Pause className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2} /> : <Play className="h-6 w-6 -translate-x-0.5 sm:h-7 sm:w-7" strokeWidth={2} />}
        </button>
        <button
          type="button"
          onClick={() => seekBy(UI_SKIP_SECONDS)}
          aria-label="تقديم 15 ثانية"
          data-testid="audio-fwd-15"
          disabled={!ready}
          className="press flex h-11 w-11 items-center justify-center rounded-full text-slate-200 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          <RotateCcw className="h-5 w-5 scale-x-[-1]" strokeWidth={2} />
        </button>
      </div>

      {/* ===== Volume + speed + A-B loop + bookmark row ===== */}
      <div dir="ltr" className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2" data-testid="audio-secondary-controls">
        {/* Volume */}
        <div className="group/vol flex items-center">
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted || volume === 0 ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
            data-testid="audio-mute"
            className="press flex h-11 w-11 items-center justify-center rounded-full text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            {muted || volume === 0 ? <VolumeX className="h-5 w-5" strokeWidth={2} /> : <Volume2 className="h-5 w-5" strokeWidth={2} />}
          </button>
          <div className="w-24 px-2 sm:w-28">
            <SliderPrimitive.Root
              className="flex h-11 w-full touch-none select-none items-center outline-none"
              value={[muted ? 0 : volume]}
              max={1}
              step={0.05}
              aria-label="مستوى الصوت"
              onValueChange={(values) => { setVolume(values[0] ?? 1); setMuted((values[0] ?? 1) === 0); }}
              data-testid="audio-volume-slider"
            >
              <div className="relative h-1.5 w-full rounded-full bg-white/25">
                <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${(muted ? 0 : volume) * 100}%` }} />
              </div>
              <SliderPrimitive.Thumb className="block h-3.5 w-3.5 rounded-full bg-white shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300" />
            </SliderPrimitive.Root>
          </div>
        </div>

        {/* Speed — Radix Select (portal above the modal) */}
        <SelectPrimitive.Root value={String(rate)} onValueChange={(value) => applyRate(Number(value))}>
          <SelectPrimitive.Trigger
            aria-label="سرعة التشغيل"
            data-testid="audio-rate-trigger"
            disabled={!ready}
            className="press flex h-11 min-w-14 items-center justify-center gap-0.5 rounded-full px-2 font-mono text-xs font-bold tabular-nums text-white transition-colors hover:bg-white/15 disabled:opacity-40"
          >
            <span>{formatRate(rate)}</span>
            <SelectPrimitive.Icon>
              <ChevronUp className="h-3.5 w-3.5 opacity-70" strokeWidth={2.5} />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>
          <SelectPrimitive.Portal>
            <SelectPrimitive.Content
              position="popper"
              side="top"
              sideOffset={8}
              data-testid="audio-rate-menu"
              className="z-[100] min-w-24 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1120]/95 p-1 shadow-2xl backdrop-blur-xl"
            >
              <SelectPrimitive.Viewport className="outline-none">
                {PLAYBACK_RATES.map((option) => (
                  <SelectPrimitive.Item
                    key={option}
                    value={String(option)}
                    data-testid={`audio-rate-option-${String(option).replace('.', '-')}`}
                    className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-xl px-3 py-2 font-mono text-xs font-bold tabular-nums text-white/80 outline-none transition-colors data-[highlighted]:bg-white/10 data-[highlighted]:text-white"
                  >
                    <SelectPrimitive.ItemText>{formatRate(option)}</SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator>
                      <Check className="h-3.5 w-3.5 text-teal-300" strokeWidth={2.5} />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Viewport>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>

        {/* A-B loop */}
        <div className="flex items-center gap-1" data-testid="audio-ab-controls">
          <button
            type="button"
            onClick={() => setLoopPoint('a', loopA != null ? null : Math.floor(currentTime))}
            aria-label={loopA != null ? 'مسح نقطة A' : 'تعيين نقطة A عند الموضع الحالي'}
            aria-pressed={loopA != null}
            data-testid="audio-set-a"
            disabled={!ready}
            className={cn(
              'press flex h-11 min-w-11 items-center justify-center rounded-full px-2 font-mono text-xs font-bold transition-colors disabled:opacity-40',
              loopA != null ? 'bg-teal-400/20 text-teal-300' : 'text-slate-200 hover:bg-white/10 hover:text-white',
            )}
          >
            A
          </button>
          <button
            type="button"
            onClick={() => setLoopPoint('b', loopB != null ? null : Math.floor(currentTime))}
            aria-label={loopB != null ? 'مسح نقطة B' : 'تعيين نقطة B عند الموضع الحالي'}
            aria-pressed={loopB != null}
            data-testid="audio-set-b"
            disabled={!ready}
            className={cn(
              'press flex h-11 min-w-11 items-center justify-center rounded-full px-2 font-mono text-xs font-bold transition-colors disabled:opacity-40',
              loopB != null ? 'bg-teal-400/20 text-teal-300' : 'text-slate-200 hover:bg-white/10 hover:text-white',
            )}
          >
            B
          </button>
          {(loopA != null || loopB != null) && (
            <button
              type="button"
              onClick={() => { setLoopPoint('a', null); setLoopPoint('b', null); }}
              aria-label="مسح تكرار المقطع"
              data-testid="audio-clear-ab"
              className="press flex h-11 w-11 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Bookmark (save clip) */}
        <button
          type="button"
          onClick={() => setBookmarkOpen(true)}
          aria-label="حفظ مقطع (علامة مرجعية)"
          data-testid="audio-bookmark-open"
          disabled={!ready}
          className="press flex h-11 w-11 items-center justify-center rounded-full text-slate-200 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          <Bookmark className="h-5 w-5" strokeWidth={2} />
        </button>

        {/* Fullscreen — routes through the shell context (stage fullscreen). */}
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          aria-label={shell?.isFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
          aria-pressed={shell?.isFullscreen ?? false}
          data-testid="audio-fullscreen"
          className="press hidden h-11 w-11 items-center justify-center rounded-full text-slate-200 transition-colors hover:bg-white/10 hover:text-white sm:flex"
        >
          <MonitorPlay className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>

      {/* ===== A-B loop status line ===== */}
      {(loopA != null || loopB != null) && (
        <div
          dir="rtl"
          data-testid="audio-ab-status"
          className={cn(
            'flex flex-wrap items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-xs font-medium',
            loopActive
              ? 'border-teal-400/25 bg-teal-400/10 text-teal-200'
              : 'border-white/10 bg-white/[0.04] text-slate-300',
          )}
        >
          <span className="flex items-center gap-1.5">
            <Repeat className="h-3.5 w-3.5" strokeWidth={2} />
            {loopActive ? 'التكرار مفعّل' : 'التكرار'}
          </span>
          <span dir="ltr" className="font-mono tabular-nums">
            {`A ${loopA != null ? formatMediaDuration(loopA) : '--:--'} / B ${loopB != null ? formatMediaDuration(loopB) : '--:--'}`}
          </span>
          {loopInvalid && (
            <span className="text-amber-300">يجب أن تكون B بعد A — التكرار متوقف</span>
          )}
        </div>
      )}

      {/* ===== Whisper: silent refresh indicator ===== */}
      {refreshing && (
        <div
          data-testid="audio-refreshing"
          className="pointer-events-none absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur-sm"
        >
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          جاري تجديد الرابط…
        </div>
      )}

      {/* ===== Error surfaces ===== */}
      {showError && !fatalError && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center" data-testid="audio-lease-error">
          <MonitorPlay className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
          <p className="max-w-sm text-sm leading-relaxed text-slate-300">{leaseError}</p>
          <button
            type="button"
            onClick={() => void fetchUrl({ preserveTime: false, reason: 'manual' })}
            className="press inline-flex min-h-11 items-center gap-2 rounded-2xl bg-teal-500 px-5 py-2 text-sm font-bold text-[#0b1120] transition-colors hover:bg-teal-400"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={2} /> إعادة المحاولة
          </button>
        </div>
      )}
      {fatalError && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center" data-testid="audio-fatal-error">
          <MonitorPlay className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
          <p className="max-w-sm text-sm leading-relaxed text-slate-300">{fatalError}</p>
          <button
            type="button"
            onClick={() => { setFatalError(null); void fetchUrl({ preserveTime: true, reason: 'manual' }); }}
            className="press inline-flex min-h-11 items-center gap-2 rounded-2xl bg-teal-500 px-5 py-2 text-sm font-bold text-[#0b1120] transition-colors hover:bg-teal-400"
          >
            <RotateCcw className="h-4 w-4" strokeWidth={2} /> إعادة المحاولة
          </button>
        </div>
      )}

      {/* Bookmark (save clip) dialog — reused verbatim from the video family. */}
      <BookmarkDialog
        open={bookmarkOpen}
        onOpenChange={setBookmarkOpen}
        assetType={assetType}
        assetId={assetId}
        currentTime={currentTime}
        duration={durationKnown ? duration : null}
      />
    </div>
  );
}
