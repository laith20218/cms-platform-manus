import { forwardRef, useMemo, useState } from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Bookmark, Check, ChevronUp, Maximize, Minimize, Pause, Play, Star, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/utils';
import { formatMediaDuration, formatRate, PLAYBACK_RATES, seekValueText } from './time';

/**
 *
 * Physical layout is LTR by design (YouTube-Arabic convention): the seek
 * timeline ALWAYS reads left→right — start on the left, end on the right —
 * and Play stays bottom-left / Volume+Fullscreen bottom-right, exactly the
 * positions thumbs expect on every platform. Text bits (time, menus) render
 * Arabic/RTL naturally inside. This mirrors the task-book example
 * ("Volume on the right, Play on the left").
 */

export interface ControlsBarProps {
  playing: boolean;
  currentTime: number;
  duration: number;
  bufferedSeconds: number;
  volume: number;
  muted: boolean;
  rate: number;
  isFullscreen: boolean;
  controlsVisible: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onRateChange: (rate: number) => void;
  onToggleFullscreen: () => void;
  onOpenBookmark: () => void;
  /** Push 11.3 — whole-episode favorite (star). False for library-file assets. */
  showFavoriteButton?: boolean;
  isFavorite?: boolean;
  favoritePending?: boolean;
  onToggleFavorite: () => void;
}

export const ControlsBar = forwardRef<HTMLDivElement, ControlsBarProps>(function ControlsBar(
  {
    playing,
    currentTime,
    duration,
    bufferedSeconds,
    volume,
    muted,
    rate,
    isFullscreen,
    controlsVisible,
    onTogglePlay,
    onSeek,
    onVolumeChange,
    onToggleMute,
    onRateChange,
    onToggleFullscreen,
    onOpenBookmark,
    showFavoriteButton = false,
    isFavorite = false,
    favoritePending = false,
    onToggleFavorite,
  },
  ref,
) {
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const durationKnown = Number.isFinite(duration) && duration > 0;
  const progress = durationKnown ? (currentTime / duration) * 100 : 0;
  const buffered = durationKnown ? Math.min(100, (bufferedSeconds / duration) * 100) : 0;

  const sliderValue = useMemo(() => [Math.min(currentTime, duration || currentTime)], [currentTime, duration]);

  return (
    <div
      ref={ref}
      dir="ltr"
      data-testid="video-controls-bar"
      data-visible={controlsVisible ? 'true' : 'false'}
      className={cn(
        // 12.4.A — @container: the controls adapt to the BAR's real width, not
        // the viewport. At ≥lg the course page puts the player in a ~302px
        // side-by-side column; viewport-based `sm:` kept all 7 buttons there,
        // the row wrapped to 2 lines and the bar covered the whole 16:9 box —
        // the center play button became unclickable (DIAG: row y=63..157 vs
        // button center y=85 of 170). Container queries fold on narrow boxes
        // at ANY viewport.
        '@container pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-2 pt-10 transition-opacity duration-300 @sm:px-4 @sm:pb-3',
        controlsVisible ? 'opacity-100' : 'opacity-0',
      )}
    >
      {/* Seek slider — Radix (keyboard: arrows) + buffer indicator underneath.
          The bar is pointer-transparent; ONLY the interactive rows opt back in
          (otherwise the gradient area swallows taps meant for the center play
          button / double-tap zones on short mobile players). */}
      <SliderPrimitive.Root
        className={cn('group relative flex h-6 w-full touch-none select-none items-center outline-none', controlsVisible && 'pointer-events-auto')}
        value={sliderValue}
        max={durationKnown ? duration : 100}
        step={1}
        aria-label="شريط التقدم"
        onValueChange={(values) => onSeek(values[0] ?? 0)}
        onFocus={() => setKeyboardFocus(true)}
        onBlur={() => setKeyboardFocus(false)}
        data-testid="video-seek-slider"
      >
        {/* Track with buffer fill */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
          <div className={cn('relative w-full rounded-full bg-white/20 transition-[height] duration-150', keyboardFocus ? 'h-2' : 'h-1.5 group-hover:h-2')}>
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/30" style={{ width: `${buffered}%` }} data-testid="video-buffer-fill" />
            <div className="absolute inset-y-0 left-0 rounded-full bg-teal-400" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <SliderPrimitive.Thumb
          data-testid="video-seek-thumb"
          className="block h-4 w-4 rounded-full bg-white shadow ring-2 ring-teal-400/60 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4"
          aria-label="شريط التقدم"
          aria-valuetext={seekValueText(currentTime, durationKnown ? duration : 0)}
        />
      </SliderPrimitive.Root>

      <div
        data-testid="video-controls-row"
        className={cn(
          // 12.4.A Bug C — flex-wrap + justify-center (mirrors PdfControlsBar):
          // 7×44px targets + the time display overflowed a 351px content box at
          // 375px and were silently clipped by overflow-hidden ancestors.
          'mt-1 flex flex-wrap items-center justify-center gap-1 sm:gap-1.5',
          controlsVisible && 'pointer-events-auto',
        )}
      >
        {/* Play / Pause — bottom-left (physical) */}
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
          data-testid="video-play-pause"
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
        >
          {playing ? <Pause className="h-6 w-6" strokeWidth={2} /> : <Play className="h-6 w-6 -translate-x-0.5" strokeWidth={2} />}
        </button>

        {/* Time: current / total */}
        <div dir="rtl" className="flex shrink-0 items-center gap-1 px-0.5 font-mono text-[10px] tabular-nums text-white/90 @sm:text-xs" data-testid="video-time-display">
          <span className="font-semibold text-white">{formatMediaDuration(currentTime)}</span>
          <span aria-hidden="true" className="text-white/50">/</span>
          <span className="text-white/60">{durationKnown ? formatMediaDuration(duration) : '--:--'}</span>
        </div>

        <div className="flex-1" />

        {/* Volume: mute always, slider on ≥sm (hover/focus reveal) */}
        <div className="group/vol flex shrink-0 items-center">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted || volume === 0 ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
            data-testid="video-mute"
            className="press flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
          >
            {muted || volume === 0 ? <VolumeX className="h-5 w-5" strokeWidth={2} /> : <Volume2 className="h-5 w-5" strokeWidth={2} />}
          </button>
          <div className="hidden w-0 overflow-hidden transition-[width] duration-200 group-focus-within/vol:w-24 group-hover/vol:w-24 @lg:block">
            <SliderPrimitive.Root
              className="flex h-11 w-24 touch-none select-none items-center px-2 outline-none"
              value={[muted ? 0 : volume]}
              max={1}
              step={0.05}
              aria-label="مستوى الصوت"
              onValueChange={(values) => onVolumeChange(values[0] ?? 1)}
              data-testid="video-volume-slider"
            >
              <div className="relative h-1.5 w-full rounded-full bg-white/25">
                <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${(muted ? 0 : volume) * 100}%` }} />
              </div>
              <SliderPrimitive.Thumb aria-label="مستوى الصوت" className="block h-3.5 w-3.5 rounded-full bg-white shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300" />
            </SliderPrimitive.Root>
          </div>
        </div>

        {/* Speed selector — Radix Select (portal above the modal, z-[100]) */}
        <SelectPrimitive.Root value={String(rate)} onValueChange={(value) => onRateChange(Number(value))}>
          <SelectPrimitive.Trigger
            aria-label="سرعة التشغيل"
            data-testid="video-rate-trigger"
            className="press flex h-11 min-w-11 items-center justify-center gap-0.5 rounded-full px-1.5 font-mono text-xs font-bold tabular-nums text-white transition-colors hover:bg-white/15"
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
              data-testid="video-rate-menu"
              className="z-[100] min-w-24 overflow-hidden rounded-2xl border border-white/10 bg-[#0b1120]/95 p-1 shadow-2xl backdrop-blur-xl"
            >
              <SelectPrimitive.Viewport className="outline-none">
                {PLAYBACK_RATES.map((option) => (
                  <SelectPrimitive.Item
                    key={option}
                    value={String(option)}
                    data-testid={`video-rate-option-${String(option).replace('.', '-')}`}
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

        {/* Favorite (whole episode — Push 11.3, product decision #1: the star and the
            timeline-bookmark coexist as SEPARATE concepts). */}
        {showFavoriteButton && (
          <button
            type="button"
            onClick={onToggleFavorite}
            disabled={favoritePending}
            aria-label={isFavorite ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
            aria-pressed={isFavorite}
            data-testid="video-favorite-button"
            className={cn(
              // 12.4.A Bug C — star/bookmark fold away on narrow CONTAINERS
              // (@sm = bar ≥ 384px): the row cannot fit seven 44px targets in
              // ~280px (375px phones AND the ≥lg side-by-side player column);
              // on such boxes both actions remain available from the episode
              // card / favorites page.
              'press hidden h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 disabled:opacity-60 @sm:flex',
              isFavorite && 'text-amber-400',
            )}
          >
            <Star className="h-5 w-5" strokeWidth={2} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        )}

        {/* Bookmark (clip save) */}
        <button
          type="button"
          onClick={onOpenBookmark}
          aria-label="حفظ مقطع (علامة مرجعية)"
          data-testid="video-bookmark-button"
          className="press hidden h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 @sm:flex"
        >
          <Bookmark className="h-5 w-5" strokeWidth={2} />
        </button>

        {/* Fullscreen — bottom-right (physical) */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
          aria-pressed={isFullscreen}
          data-testid="video-fullscreen"
          className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
        >
          {isFullscreen ? <Minimize className="h-5 w-5" strokeWidth={2} /> : <Maximize className="h-5 w-5" strokeWidth={2} />}
        </button>
      </div>
    </div>
  );
});
