import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, BookOpenCheck, ChevronLeft, Clock, Eye, ListVideo,
  LoaderCircle, MonitorPlay, Music2, Pause, Play, PlayCircle, RotateCcw,
  SkipBack, SkipForward, Volume2, VolumeX, Youtube,
} from 'lucide-react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { toast } from 'sonner';
import { useAuth } from '@/app/providers/useAuth';
import { SecurityWrapper } from '@/features/security/SecurityWrapper';
import { cn } from '@/utils';
import { coursesApi } from '../services/courses-api';
import type { CourseDetail, CourseEpisode, EpisodeAccess } from '../services/courses-api';
import '../watermark.css';

/**
 * Course player (Push 4 Phase 5 → Push 8 premium redesign).
 *
 * The Lease Trap: presigned playback URLs live on a short S3 credential lease
 * (≈10 minutes). A refresh interval fires at the 8-minute mark and swaps the
 * media source seamlessly — the current playback timestamp and play/pause
 * state survive the swap (the student never notices). DEV builds allow
 * ?refreshMs= to shorten the cycle for testing.
 *
 * Push 8: skeleton loaders instead of spinners, a cinema-grade video frame,
 * and a Radix-Slider audio stage with a spinning disc, waveform strip and
 * ±10s skip controls. All technical texts (lease expiry, piracy notices)
 * stay OUT of the UI — the moving watermark overlay is the protection.
 */
const DEFAULT_REFRESH_MS = 8 * 60 * 1000;

/** MediaError codes as LOCAL numeric consts (Push 7). The MediaError GLOBAL does
 *  not exist in jsdom — referencing it inside the handler threw a ReferenceError
 *  that killed error handling in tests — so we never touch the global here. */
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

function isYouTubeEpisode(episode: CourseEpisode): boolean {
  return episode.sourceType === 'YouTube' || Boolean(episode.youtubeVideoId);
}

export default function CoursePlayerPage() {
  return (
    <SecurityWrapper>
      <CoursePlayerContent />
    </SecurityWrapper>
  );
}

function CoursePlayerContent() {
  const { courseId } = useParams<{ courseId: string }>();
  const { user } = useAuth();

  // ---- course detail ----
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [courseLoading, setCourseLoading] = useState(true);
  const [courseError, setCourseError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    setCourseLoading(true);
    setCourseError(null);
    coursesApi.getCourse(courseId)
      .then((detail) => { if (!cancelled) setCourse(detail); })
      .catch(() => { if (!cancelled) setCourseError('تعذّر تحميل الكورس. حاول مرة أخرى.'); })
      .finally(() => { if (!cancelled) setCourseLoading(false); });
    return () => { cancelled = true; };
  }, [courseId]);

  if (courseLoading) {
    // Never a blank screen: the player skeleton mirrors the final layout.
    return (
      <div className="max-w-5xl mx-auto" data-testid="player-loading">
        <div className="h-4 w-40 rounded mb-4 player-skeleton" />
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl player-skeleton" />
          <div className="space-y-2">
            <div className="h-6 w-56 rounded player-skeleton" />
            <div className="h-3 w-28 rounded player-skeleton" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
          <div className="aspect-video rounded-3xl player-skeleton" />
          <div className="rounded-3xl border border-[var(--c-border)] overflow-hidden">
            <div className="h-12 border-b border-[var(--c-border)] player-skeleton rounded-none" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--c-border)] last:border-0">
                <div className="w-7 h-7 rounded-lg player-skeleton" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-3/4 rounded player-skeleton" />
                  <div className="h-3 w-1/3 rounded player-skeleton" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (courseError || !course) {
    return (
      <div className="max-w-5xl mx-auto text-center py-20" data-testid="player-error">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--c-bg-hover)]">
          <MonitorPlay className="h-9 w-9 text-[var(--c-text-faint)]" />
        </div>
        <p className="mb-1 font-bold text-[var(--c-text)]">{courseError ?? 'الكورس غير متاح'}</p>
        <p className="mb-6 text-sm text-[var(--c-text-muted)]">قد يكون الرابط قديماً أو أن الجلسة انتهت</p>
        <Link
          to="/my-studies?tab=courses"
          className="press inline-flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--c-primary-200)] bg-[var(--c-primary-50)] px-5 py-2.5 text-sm font-bold text-[var(--c-primary-700)]"
        >
          <ArrowRight className="w-4 h-4" /> العودة إلى الكورسات
        </Link>
      </div>
    );
  }

  const playableEpisodes = course.episodes.filter((episode) => isYouTubeEpisode(episode) || episode.uploadCompleted);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Breadcrumb + header */}
      <div className="flex items-center gap-2 mb-4 text-sm text-[var(--c-text-muted)]">
        <Link to="/my-studies?tab=courses" className="press inline-flex items-center gap-1 rounded-lg px-1 py-1 transition-colors hover:text-[var(--c-primary-700)]">
          <ChevronLeft className="w-4 h-4" /> دراستي
        </Link>
        <span>/</span>
        <span className="text-[var(--c-text)] font-medium truncate">{course.title}</span>
      </div>

      <div className="flex items-start gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
          <BookOpenCheck className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--c-text)] truncate">{course.title}</h1>
          <div className="flex items-center gap-3 text-xs text-[var(--c-text-muted)] mt-1">
            <span className="inline-flex items-center gap-1"><ListVideo className="w-3.5 h-3.5" />{course.episodesCount} حلقة</span>
          </div>
          {course.description && <p className="text-sm text-[var(--c-text-muted)] mt-2">{course.description}</p>}
        </div>
      </div>

      {playableEpisodes.length === 0 ? (
        <div className="text-center py-16 rounded-3xl border border-dashed border-[var(--c-border)]" data-testid="player-no-episodes">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[var(--c-bg-hover)]">
            <MonitorPlay className="h-9 w-9 text-[var(--c-text-faint)]" />
          </div>
          <p className="font-bold text-[var(--c-text)]">لا توجد حلقات جاهزة للتشغيل بعد</p>
          <p className="text-xs text-[var(--c-text-faint)] mt-1">سيظهر المحتوى هنا فور جهوزيته</p>
        </div>
      ) : (
        <EpisodeStage
          episodes={playableEpisodes}
          fallbackName={user?.fullName || ''}
          fallbackPhone={user?.phone || ''}
        />
      )}
    </div>
  );
}

// ===== Episode stage: player + episode list =====

function EpisodeStage({ episodes, fallbackName, fallbackPhone }: {
  episodes: CourseEpisode[];
  fallbackName: string;
  fallbackPhone: string;
}) {
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string>(episodes[0]?.id ?? '');
  const [access, setAccess] = useState<EpisodeAccess | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  // Push 7: an episode whose declared type is video but whose bytes carry no
  // video track (the mislabeled-MP3 case) flips this to true and re-renders in
  // the audio stage — gracefully, without erroring out on the student.
  const [forceAudioStage, setForceAudioStage] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Timestamp / play-state captured right before a lease refresh swaps the src,
  // restored in onLoadedMetadata so playback continues seamlessly.
  const pendingTimeRef = useRef<number | null>(null);
  const wasPlayingRef = useRef(false);

  const selected = useMemo(
    () => episodes.find((episode) => episode.id === selectedId) ?? episodes[0],
    [episodes, selectedId]
  );
  const activeEpisodeId = selected?.id ?? '';

  const isYouTube = selected ? isYouTubeEpisode(selected) : false;
  const isAudioOnly = useMemo(() => {
    if (!selected || isYouTube) return false;
    return forceAudioStage || (selected.contentType ?? '').startsWith('audio/');
  }, [selected, isYouTube, forceAudioStage]);

  // DEV/test-only refresh-cycle override (?refreshMs=). Production keeps the
  // 8-minute default — the param is ignored outside development builds.
  const refreshMs = useMemo(() => {
    if (!import.meta.env.DEV) return DEFAULT_REFRESH_MS;
    const parsed = Number(searchParams.get('refreshMs'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REFRESH_MS;
  }, [searchParams]);

  const fetchAccess = useCallback(async (episodeId: string, { preserveTime }: { preserveTime: boolean }) => {
    const media = videoRef.current ?? audioRef.current;
    if (preserveTime && media) {
      pendingTimeRef.current = media.currentTime;
      wasPlayingRef.current = !media.paused;
    }
    setAccessLoading(true);
    try {
      const data = await coursesApi.getEpisodeAccess(episodeId);
      setAccess(data);
      setAccessError(null);
    } catch {
      setAccessError('تعذّر تجهيز الحلقة للتشغيل. حاول مرة أخرى.');
      toast.error('تعذّر تحديث رابط التشغيل');
    } finally {
      setAccessLoading(false);
    }
  }, []);

  // Initial access for the selected episode (and on every episode switch).
  useEffect(() => {
    if (!activeEpisodeId) return;
    pendingTimeRef.current = null;
    wasPlayingRef.current = false;
    setForceAudioStage(false); // Push 7: the fallback decision is per-episode.
    setAccess(null);
    void fetchAccess(activeEpisodeId, { preserveTime: false });
  }, [activeEpisodeId, fetchAccess]);

  // ---- The Lease Trap: refresh the signed URL at the 8-minute mark. ----
  // The interval restarts on every new URL (fresh 8-min lease countdown).
  // YouTube embeds are stable — no lease, no refresh needed.
  useEffect(() => {
    if (!activeEpisodeId || isYouTube) return;
    const interval = window.setInterval(() => {
      void fetchAccess(activeEpisodeId, { preserveTime: true });
    }, refreshMs);
    return () => window.clearInterval(interval);
  }, [activeEpisodeId, isYouTube, access?.accessUrl, refreshMs, fetchAccess]);

  // Seamless src swap: restore timestamp + play state once metadata loads.
  const handleLoadedMetadata = useCallback(() => {
    const media = videoRef.current ?? audioRef.current;
    if (!media || pendingTimeRef.current == null) return;
    try {
      media.currentTime = pendingTimeRef.current;
    } catch { /* some engines refuse seeks before metadata is ready — ignore */ }
    if (wasPlayingRef.current) {
      try {
        const maybe = media.play();
        if (maybe && typeof maybe.catch === 'function') maybe.catch(() => { /* autoplay policy — user presses play */ });
      } catch { /* ignore */ }
    }
    pendingTimeRef.current = null;
  }, []);

  // Fatal media error (e.g. an expired lease 403s): retry access immediately.
  const handleMediaError = useCallback(() => {
    if (activeEpisodeId && !isYouTube) void fetchAccess(activeEpisodeId, { preserveTime: true });
  }, [activeEpisodeId, isYouTube, fetchAccess]);

  // Push 7: the <video> element proves there is no video track (metadata loaded
  // with videoWidth === 0 — e.g. an MP3 stored under a video/* content type) or
  // fails with a decode/src-not-supported error. Capture where playback was,
  // then swap to the custom audio stage; the shared handleLoadedMetadata restores
  // the timestamp + play state on the audio element, and the watermark stays.
  const handleNoVideoTrack = useCallback(() => {
    const media = videoRef.current;
    if (media) {
      pendingTimeRef.current = media.currentTime;
      wasPlayingRef.current = !media.paused;
    }
    setForceAudioStage(true);
  }, []);

  if (!selected) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
      {/* Player column */}
      <div>
        <div
          className="relative rounded-3xl overflow-hidden border border-[var(--c-border)] bg-black shadow-2xl ring-1 ring-black/5"
          data-testid="episode-stage"
          style={{ boxShadow: '0 24px 64px rgba(15, 23, 42, 0.22)' }}
        >
          {accessLoading && !access && (
            <div className="aspect-video flex items-center justify-center">
              <LoaderCircle className="w-8 h-8 animate-spin text-white/70" />
            </div>
          )}
          {accessError && !access && (
            <div className="aspect-video flex flex-col items-center justify-center gap-4 text-white/80">
              <MonitorPlay className="w-10 h-10" />
              <p className="text-sm">{accessError}</p>
              <button
                type="button"
                onClick={() => void fetchAccess(activeEpisodeId, { preserveTime: false })}
                className="press inline-flex min-h-11 items-center gap-2 rounded-2xl px-5 py-2 text-sm font-bold text-white shadow-lg"
                style={{ background: 'var(--c-primary-700)' }}
              >
                <RotateCcw className="w-4 h-4" /> إعادة المحاولة
              </button>
            </div>
          )}
          {access && isYouTube && (
            <div className="aspect-video">
              <iframe
                src={access.accessUrl}
                className="w-full h-full"
                style={{ border: 'none' }}
                title={selected.title}
                allowFullScreen
                data-testid="youtube-player"
              />
            </div>
          )}
          {access && !isYouTube && isAudioOnly && (
            <AudioStage
              access={access}
              audioRef={audioRef}
              title={selected.title}
              onLoadedMetadata={handleLoadedMetadata}
              onError={handleMediaError}
              fallbackName={fallbackName}
              fallbackPhone={fallbackPhone}
            />
          )}
          {access && !isYouTube && !isAudioOnly && (
            <VideoStage
              access={access}
              videoRef={videoRef}
              onLoadedMetadata={handleLoadedMetadata}
              onError={handleMediaError}
              onNoVideoTrack={handleNoVideoTrack}
              fallbackName={fallbackName}
              fallbackPhone={fallbackPhone}
            />
          )}
        </div>

        {/* Episode meta under the player */}
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-[var(--c-text-muted)]">
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--c-text)] text-sm">
            <PlayCircle className="w-4 h-4" /> الحلقة {selected.episodeNumber}: {selected.title}
          </span>
          {selected.durationSeconds ? (
            <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatDuration(selected.durationSeconds)}</span>
          ) : null}
          <span className="inline-flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{selected.viewsCount} مشاهدة</span>
        </div>
      </div>

      {/* Episode list column */}
      <aside className="rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)] overflow-hidden shadow-sm" data-testid="episode-list">
        <div className="px-4 py-3 border-b border-[var(--c-border)] font-semibold text-sm text-[var(--c-text)] flex items-center gap-2">
          <ListVideo className="w-4 h-4" /> الحلقات ({episodes.length})
        </div>
        <ol className="max-h-[420px] overflow-y-auto">
          {episodes.map((episode) => {
            const active = episode.id === selected.id;
            return (
              <li key={episode.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(episode.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'press w-full flex items-start gap-3 px-4 py-3.5 text-start border-b border-[var(--c-border)] last:border-0 transition-colors',
                    active ? 'bg-[var(--c-primary-50)]' : 'hover:bg-[var(--c-bg-hover)]'
                  )}
                >
                  <span
                    className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
                      active ? 'text-white shadow-sm' : 'text-[var(--c-text-muted)] bg-[var(--c-bg-hover)]'
                    )}
                    style={active ? { background: 'var(--c-primary-700)' } : undefined}
                  >
                    {episode.episodeNumber}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm truncate', active ? 'font-semibold text-[var(--c-primary-700)]' : 'text-[var(--c-text)]')}>
                      {episode.title}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-[var(--c-text-muted)] mt-0.5">
                      {isYouTubeEpisode(episode) ? <Youtube className="w-3.5 h-3.5" /> : null}
                      {!isYouTubeEpisode(episode) && (episode.contentType ?? '').startsWith('audio/') ? <Music2 className="w-3.5 h-3.5" /> : null}
                      {episode.durationSeconds ? formatDuration(episode.durationSeconds) : null}
                      {episode.fileSize ? formatSize(episode.fileSize) : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}

// ===== Cinema video stage =====

/**
 * Native <video> in a premium frame: rounded-3xl, deep elevation, dynamically
 * proportioned to the actual media (portrait videos keep their aspect ratio),
 * download disabled. The lease-refresh watermark rides on top at ~4% opacity.
 *
 * Push 7: this stage also DETECTS audio-only bytes served under a video/*
 * content type — metadata with videoWidth === 0, or decode / src-not-supported
 * errors, hand control back to the parent (onNoVideoTrack) which swaps in the
 * custom audio stage. Codes 1–2 (aborted / network) keep the lease-refetch path.
 */
function VideoStage({ access, videoRef, onLoadedMetadata, onError, onNoVideoTrack, fallbackName, fallbackPhone }: {
  access: EpisodeAccess;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onLoadedMetadata: () => void;
  onError: () => void;
  onNoVideoTrack: () => void;
  fallbackName: string;
  fallbackPhone: string;
}) {
  const [aspect, setAspect] = useState<number | null>(null);

  const handleError = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    const code = event.currentTarget.error?.code;
    if (code === MEDIA_ERR_DECODE || code === MEDIA_ERR_SRC_NOT_SUPPORTED) {
      onNoVideoTrack();
      return;
    }
    onError(); // aborted / network — likely an expired lease: refetch access
  };

  return (
    <div className="relative" data-testid="video-stage">
      <WatermarkLayer access={access} fallbackName={fallbackName} fallbackPhone={fallbackPhone} />
      <div
        className="flex items-center justify-center bg-black transition-[aspect-ratio] duration-300"
        style={{ aspectRatio: aspect ? `${aspect}` : '16 / 9', maxHeight: '72vh' }}
      >
        <video
          ref={videoRef}
          src={access.accessUrl}
          className="w-full h-full object-contain"
          style={{ maxHeight: '72vh' }}
          controls
          controlsList="nodownload"
          onLoadedMetadata={(event) => {
            const media = event.currentTarget;
            if (media.videoWidth === 0) {
              // Audio-only bytes in a video tag: the browser decodes the sound
              // track but shows nothing — swap to the designed audio stage.
              onNoVideoTrack();
              return;
            }
            if (media.videoHeight > 0) setAspect(media.videoWidth / media.videoHeight);
            onLoadedMetadata();
          }}
          onError={handleError}
          playsInline
          data-testid="course-video"
        >
          متصفحك لا يدعم تشغيل الفيديو.
        </video>
      </div>
    </div>
  );
}

// ===== Premium custom audio stage (Push 8) =====

/**
 * The designed audio experience: a large spinning vinyl disc with concentric
 * rings and a soft pulse, an animated waveform strip, and a full custom
 * control bar — Radix Slider seek + volume, ±10s skip, big accessible play
 * button (56px), tabular time display. The native <audio> element stays as
 * the hidden engine so the lease-refresh + watermark machinery works
 * unchanged, and every src swap preserves the exact playback position.
 */
function AudioStage({ access, audioRef, title, onLoadedMetadata, onError, fallbackName, fallbackPhone }: {
  access: EpisodeAccess;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  title: string;
  onLoadedMetadata: () => void;
  onError: () => void;
  fallbackName: string;
  fallbackPhone: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [seeking, setSeeking] = useState(false);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      const maybe = audio.play();
      if (maybe && typeof maybe.catch === 'function') maybe.catch(() => { /* autoplay policy */ });
    } else {
      audio.pause();
    }
  }, [audioRef]);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) return;
    const clamped = Math.max(0, Math.min(seconds, duration || seconds));
    try { audio.currentTime = clamped; } catch { /* ignore */ }
    setCurrentSeconds(clamped);
  }, [audioRef, duration]);

  const skip = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    seekTo(audio.currentTime + delta);
  }, [audioRef, seekTo]);

  const applyVolume = useCallback((next: number, nextMuted?: boolean) => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = next;
      audio.muted = nextMuted ?? muted;
    }
    setVolume(next);
  }, [audioRef, muted]);

  // Deterministic pseudo-waveform (stable per title) — decorative, animated
  // with playback progress so the strip fills as the episode advances.
  const waveform = useMemo(() => {
    let seed = 0;
    for (let i = 0; i < title.length; i += 1) seed = (seed * 31 + title.charCodeAt(i)) % 997;
    return Array.from({ length: 44 }, (_, i) => {
      const pseudo = Math.abs(Math.sin(seed + i * 0.7) * 0.6 + Math.sin(seed * 0.3 + i * 1.7) * 0.4);
      return 22 + Math.round(pseudo * 78); // 22–100%
    });
  }, [title]);

  const progressRatio = duration > 0 ? currentSeconds / duration : 0;
  const activeBars = Math.round(progressRatio * waveform.length);

  return (
    <div className="relative" data-testid="audio-stage">
      <WatermarkLayer access={access} fallbackName={fallbackName} fallbackPhone={fallbackPhone} />
      <div
        className="flex flex-col items-center justify-center gap-7 py-12 px-6"
        style={{ background: 'linear-gradient(160deg, var(--c-primary-50) 0%, var(--c-surface) 55%, var(--c-bg) 100%)' }}
      >
        {/* Spinning disc with concentric rings + soft pulse */}
        <div className="relative h-32 w-32" data-testid="audio-disc">
          <span className="disc-ring" aria-hidden="true" />
          <span className="disc-ring disc-ring-2" aria-hidden="true" />
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center rounded-full border-4 border-white/60 shadow-xl',
              playing && 'audio-disc-spin'
            )}
            style={{ background: 'var(--c-primary-700)' }}
          >
            <div className="absolute inset-3 rounded-full border border-white/25" aria-hidden="true" />
            <div className="absolute inset-6 rounded-full border border-white/15" aria-hidden="true" />
            <div className={cn('flex h-14 w-14 items-center justify-center rounded-full bg-white/15', playing && 'audio-disc-pulse')}>
              <Music2 className="h-7 w-7 text-white" />
            </div>
          </div>
          {/* Equalizer accent */}
          <div className="absolute -bottom-1 -end-5 flex h-7 items-end gap-[3px]" aria-hidden="true">
            {[0, 1, 2, 3].map((bar) => (
              <span
                key={bar}
                className={cn('w-[3px] rounded-full bg-[var(--c-primary-700)]', playing ? 'audio-eq-bar' : 'opacity-30')}
                style={{ animationDelay: `${bar * 0.15}s`, height: playing ? undefined : '8px' }}
              />
            ))}
          </div>
        </div>

        <div className="max-w-md text-center">
          <h2 className="truncate text-lg font-bold text-[var(--c-text)]">{title}</h2>
          <p className="mt-0.5 text-xs font-medium text-[var(--c-text-muted)]">حلقة صوتية</p>
        </div>

        {/* Waveform strip — fills with playback */}
        <div className="flex h-12 w-full max-w-xl items-center justify-between gap-[2px] px-1" aria-hidden="true" data-testid="audio-waveform">
          {waveform.map((height, i) => (
            <span
              key={i}
              className={cn('waveform-bar h-full', i < activeBars && 'is-active')}
              style={{ height: `${height}%`, opacity: i < activeBars ? undefined : 0.35 }}
            />
          ))}
        </div>

        {/* Control bar */}
        <div
          className="w-full max-w-xl rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)]/92 px-5 py-4 shadow-lg backdrop-blur"
          data-testid="audio-controls"
        >
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Skip back */}
            <button
              type="button"
              onClick={() => skip(-10)}
              aria-label="رجوع 10 ثوانٍ"
              className="press hidden h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--c-text-soft)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)] sm:flex"
            >
              <SkipForward className="h-5 w-5 -scale-x-100" />
            </button>

            {/* Big play/pause — the hero control, 56px */}
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
              className="press flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105"
              style={{ background: 'var(--c-primary-700)' }}
              data-testid="audio-play-button"
            >
              {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 -scale-x-100 ms-1" />}
            </button>

            {/* Skip forward */}
            <button
              type="button"
              onClick={() => skip(10)}
              aria-label="تقديم 10 ثوانٍ"
              className="press hidden h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--c-text-soft)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)] sm:flex"
            >
              <SkipBack className="h-5 w-5 -scale-x-100" />
            </button>

            {/* Seek (Radix Slider) + time */}
            <div className="min-w-0 flex-1">
              <SliderPrimitive.Root
                className="cms-slider-slider relative flex w-full touch-none select-none items-center"
                value={[Math.min(currentSeconds, duration || 0)]}
                min={0}
                max={Math.max(duration, 0.1)}
                step={0.5}
                onValueChange={([seconds]) => { setSeeking(true); setCurrentSeconds(seconds); }}
                onValueCommit={([seconds]) => { seekTo(seconds); setSeeking(false); }}
                aria-label="شريط التقدم"
                data-testid="audio-seek"
              >
                <SliderPrimitive.Track className="cms-slider-track relative h-1.5 w-full grow overflow-hidden rounded-full bg-[var(--c-bg-hover)]">
                  <SliderPrimitive.Range className="absolute h-full rounded-full" style={{ background: 'var(--c-primary-700)' }} />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb className="cms-slider-thumb block h-4 w-4 rounded-full border-[2.5px] border-[var(--c-primary-700)] bg-white shadow" aria-label="نقطة التقدم" />
              </SliderPrimitive.Root>
              <div className="mt-1 flex justify-between text-[11px] font-medium tabular-nums text-[var(--c-text-muted)]" dir="ltr">
                <span>{formatClock(currentSeconds)}</span>
                <span>{formatClock(duration)}</span>
              </div>
            </div>

            {/* Volume (Radix Slider) */}
            <div className="hidden shrink-0 items-center gap-2 md:flex" data-testid="audio-volume">
              <button
                type="button"
                onClick={() => { const next = !muted; setMuted(next); if (audioRef.current) audioRef.current.muted = next; }}
                aria-label={muted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
                className="press flex h-11 w-11 items-center justify-center rounded-full text-[var(--c-text-muted)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)]"
              >
                {muted || volume === 0 ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
              </button>
              <SliderPrimitive.Root
                className="cms-slider-slider relative flex w-24 touch-none select-none items-center"
                value={[muted ? 0 : volume]}
                min={0}
                max={1}
                step={0.05}
                onValueChange={([next]) => { applyVolume(next, false); if (next > 0) setMuted(false); }}
                aria-label="مستوى الصوت"
                data-testid="audio-volume-slider"
              >
                <SliderPrimitive.Track className="cms-slider-track relative h-1.5 w-full grow overflow-hidden rounded-full bg-[var(--c-bg-hover)]">
                  <SliderPrimitive.Range className="absolute h-full rounded-full" style={{ background: 'var(--c-primary-700)' }} />
                </SliderPrimitive.Track>
                <SliderPrimitive.Thumb className="cms-slider-thumb block h-4 w-4 rounded-full border-[2.5px] border-[var(--c-primary-700)] bg-white shadow" aria-label="مستوى الصوت" />
              </SliderPrimitive.Root>
            </div>
          </div>
        </div>

        {/* Hidden native engine — keeps the lease-refresh machinery intact */}
        <audio
          ref={audioRef}
          src={access.accessUrl}
          preload="metadata"
          controlsList="nodownload"
          onLoadedMetadata={(event) => {
            const media = event.currentTarget;
            if (Number.isFinite(media.duration)) setDuration(media.duration);
            onLoadedMetadata();
          }}
          onTimeUpdate={(event) => {
            if (seeking) return;
            setCurrentSeconds(event.currentTarget.currentTime);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={onError}
          data-testid="course-audio"
          className="hidden"
        >
          متصفحك لا يدعم تشغيل الصوت.
        </audio>
      </div>
    </div>
  );
}

/**
 * Anti-screen-recording watermark: a tiled name/phone layer that shifts
 * slightly every 30 seconds (see watermark.css — 4 positions × 30s = 120s).
 * Subtle by design (~4% opacity) and pointer-events-none so it never
 * intercepts the play controls.
 */
function WatermarkLayer({ access, fallbackName, fallbackPhone }: {
  access: EpisodeAccess;
  fallbackName: string;
  fallbackPhone: string;
}) {
  const line = `${access.watermark.studentName || fallbackName} — ${access.watermark.studentPhone || fallbackPhone}`;
  return (
    <div className="course-watermark-layer absolute inset-0 z-10 pointer-events-none" data-testid="course-watermark">
      <div className="absolute inset-0 flex flex-col items-center justify-around gap-6 rotate-[-24deg] scale-125">
        {Array.from({ length: 4 }).map((_, row) => (
          <div key={row} className="flex items-center justify-around w-full gap-10">
            {Array.from({ length: 2 }).map((_, col) => (
              <span key={col} className="text-white/[0.04] font-bold text-lg whitespace-nowrap select-none">
                {line}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
