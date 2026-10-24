import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, BookOpenCheck, ChevronLeft, Clock, Eye, ListVideo,
  LoaderCircle, MonitorPlay, Music2, Pause, Play, PlayCircle, Volume2, Youtube,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/app/providers/useAuth';
import { SecurityWrapper } from '@/features/security/SecurityWrapper';
import { cn } from '@/utils';
import { coursesApi } from '../services/courses-api';
import type { CourseDetail, CourseEpisode, EpisodeAccess } from '../services/courses-api';
import '../watermark.css';

/**
 * Course player (Push 4 Phase 5, polished in Push 5).
 *
 * The Lease Trap: presigned playback URLs live on a short S3 credential lease
 * (≈10 minutes). A refresh interval fires at the 8-minute mark and swaps the
 * media source seamlessly — the current playback timestamp and play/pause
 * state survive the swap. DEV builds allow ?refreshMs= to shorten the cycle
 * for testing; production always uses the 8-minute default.
 */
const DEFAULT_REFRESH_MS = 8 * 60 * 1000;

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
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center py-24" data-testid="player-loading">
        <LoaderCircle className="w-8 h-8 animate-spin text-[var(--c-text-muted)]" />
      </div>
    );
  }

  if (courseError || !course) {
    return (
      <div className="max-w-5xl mx-auto text-center py-20" data-testid="player-error">
        <MonitorPlay className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
        <p className="text-[var(--c-text-muted)] mb-4">{courseError ?? 'الكورس غير متاح'}</p>
        <Link to="/my-studies?tab=courses" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--c-primary-700)] hover:underline">
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
        <Link to="/my-studies?tab=courses" className="inline-flex items-center gap-1 hover:text-[var(--c-primary-700)] transition-colors">
          <ChevronLeft className="w-4 h-4" /> دراستي
        </Link>
        <span>/</span>
        <span className="text-[var(--c-text)] font-medium truncate">{course.title}</span>
      </div>

      <div className="flex items-start gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--c-primary-50)', color: 'var(--c-primary-700)' }}>
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
        <div className="text-center py-16" data-testid="player-no-episodes">
          <MonitorPlay className="w-12 h-12 mx-auto mb-3 text-[var(--c-text-faint)]" />
          <p className="text-[var(--c-text-muted)]">لا توجد حلقات جاهزة للتشغيل بعد</p>
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
    return (selected.contentType ?? '').startsWith('audio/');
  }, [selected, isYouTube]);

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

  if (!selected) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
      {/* Player column */}
      <div>
        <div className="relative rounded-2xl overflow-hidden border border-[var(--c-border)] bg-black shadow-lg" data-testid="episode-stage">
          {accessLoading && !access && (
            <div className="aspect-video flex items-center justify-center">
              <LoaderCircle className="w-8 h-8 animate-spin text-white/70" />
            </div>
          )}
          {accessError && !access && (
            <div className="aspect-video flex flex-col items-center justify-center gap-3 text-white/80">
              <MonitorPlay className="w-10 h-10" />
              <p className="text-sm">{accessError}</p>
              <button
                type="button"
                onClick={() => void fetchAccess(activeEpisodeId, { preserveTime: false })}
                className="px-4 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--c-primary-700)' }}
              >
                إعادة المحاولة
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
      <aside className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] overflow-hidden" data-testid="episode-list">
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
                    'w-full flex items-start gap-3 px-4 py-3 text-start border-b border-[var(--c-border)] last:border-0 transition-colors',
                    active ? 'bg-[var(--c-primary-50)]' : 'hover:bg-[var(--c-bg-hover)]'
                  )}
                >
                  <span
                    className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
                      active ? 'text-white' : 'text-[var(--c-text-muted)] bg-[var(--c-bg-hover)]'
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

// ===== Premium video stage =====

/**
 * Native <video> in a premium frame: rounded, dynamically proportioned to the
 * actual media (portrait videos keep their aspect ratio), subtle elevation,
 * download disabled. The lease-refresh watermark rides on top at ~4% opacity.
 */
function VideoStage({ access, videoRef, onLoadedMetadata, onError, fallbackName, fallbackPhone }: {
  access: EpisodeAccess;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onLoadedMetadata: () => void;
  onError: () => void;
  fallbackName: string;
  fallbackPhone: string;
}) {
  const [aspect, setAspect] = useState<number | null>(null);

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
            if (media.videoWidth > 0 && media.videoHeight > 0) {
              setAspect(media.videoWidth / media.videoHeight);
            }
            onLoadedMetadata();
          }}
          onError={onError}
          playsInline
          data-testid="course-video"
        >
          متصفحك لا يدعم تشغيل الفيديو.
        </video>
      </div>
    </div>
  );
}

// ===== Elegant custom audio stage =====

/**
 * Custom audio experience (Push 5): instead of a black video box, a designed
 * stage — gradient backdrop, a spinning disc that follows playback, animated
 * equalizer bars, and a full custom control bar (play/pause, seek, time,
 * volume). The native <audio> element stays as the engine (hidden) so the
 * lease-refresh + watermark machinery works unchanged.
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
    try { audio.currentTime = seconds; } catch { /* ignore */ }
    setCurrentSeconds(seconds);
  }, [audioRef]);

  return (
    <div className="relative" data-testid="audio-stage">
      <WatermarkLayer access={access} fallbackName={fallbackName} fallbackPhone={fallbackPhone} />
      <div className="flex flex-col items-center justify-center gap-6 py-10 px-6"
        style={{ background: 'linear-gradient(160deg, var(--c-primary-50) 0%, var(--c-surface) 55%, var(--c-bg) 100%)' }}
      >
        {/* Spinning disc + equalizer */}
        <div className="relative w-28 h-28" data-testid="audio-disc">
          <div
            className={cn(
              'absolute inset-0 rounded-full flex items-center justify-center shadow-xl border-4 border-white/60',
              playing && 'audio-disc-spin'
            )}
            style={{ background: 'var(--grad-primary)' }}
          >
            <Music2 className="w-10 h-10 text-white" />
          </div>
          <div className="absolute -bottom-1 -end-4 flex items-end gap-[3px] h-6" aria-hidden="true">
            {[0, 1, 2, 3].map((bar) => (
              <span
                key={bar}
                className={cn('w-[3px] rounded-full bg-[var(--c-primary-700)]', playing ? 'audio-eq-bar' : 'opacity-30')}
                style={{ animationDelay: `${bar * 0.15}s`, height: playing ? undefined : '8px' }}
              />
            ))}
          </div>
        </div>

        <div className="text-center max-w-md">
          <h2 className="text-lg font-bold text-[var(--c-text)] truncate">{title}</h2>
          <p className="text-xs text-[var(--c-text-muted)] mt-1">حلقة صوتية</p>
        </div>

        {/* Custom control bar */}
        <div className="w-full max-w-lg rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)]/90 backdrop-blur px-5 py-4 shadow-sm" data-testid="audio-controls">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
              className="w-12 h-12 rounded-full flex items-center justify-center text-white shrink-0 shadow-md transition-transform hover:scale-105 active:scale-95"
              style={{ background: 'var(--grad-primary)' }}
              data-testid="audio-play-button"
            >
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 -scale-x-100 ms-0.5" />}
            </button>

            <div className="flex-1 min-w-0">
              <input
                type="range"
                min={0}
                max={Math.max(duration, 0.1)}
                step={0.1}
                value={Math.min(currentSeconds, duration || 0)}
                onChange={(event) => seekTo(Number(event.target.value))}
                onPointerDown={() => setSeeking(true)}
                onPointerUp={() => setSeeking(false)}
                aria-label="شريط التقدم"
                className="audio-seek w-full"
                data-testid="audio-seek"
              />
              <div className="flex justify-between text-[11px] text-[var(--c-text-muted)] mt-1 tabular-nums" dir="ltr">
                <span>{formatClock(currentSeconds)}</span>
                <span>{formatClock(duration)}</span>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 shrink-0" data-testid="audio-volume">
              <Volume2 className="w-4 h-4 text-[var(--c-text-muted)]" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setVolume(next);
                  if (audioRef.current) audioRef.current.volume = next;
                }}
                aria-label="مستوى الصوت"
                className="audio-seek w-20"
              />
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
