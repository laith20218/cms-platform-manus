import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, Globe, Maximize, Minimize, MonitorPlay, Music2, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/utils';
import { usePlayerProtection } from './protection/usePlayerProtection';
import { PlayerShellContext, type PlayerShellApi } from './shell-context';
import { EpisodeMetadata, type EpisodeMetadataData } from './video/EpisodeMetadata';

/**
 * Push 10.1 — PlayerShell: the fullscreen-capable modal that will host every
 * future media player (video / audio / PDF / HTML readers).
 *
 * Shell only — NO player logic lives here (no Shaka, no Wavesurfer; those
 * arrive in later pushes as LazyPlayerMount children).
 *
 * Design contract:
 * - Radix Dialog via React Portal → overlays all app chrome, focus-trapped,
 *   ESC-dismissible, body-scroll locked.
 * - Fullscreen API targets the STAGE (the whole shell), never the media
 *   element — header, close and fullscreen controls stay visible in
 *   fullscreen mode.
 * - Enter/exit motion via Framer Motion (AnimatePresence + forceMount).
 * - RTL-native: logical properties only; the close button lands top-LEFT
 *   in the app's RTL direction.
 * - Player-scoped copy deterrents (usePlayerProtection) active while open;
 *   the rest of the page is untouched when the shell is closed.
 */

export type MediaKind = 'video' | 'audio' | 'pdf' | 'html';

const KIND_META: Record<MediaKind, { icon: typeof MonitorPlay; label: string }> = {
  video: { icon: MonitorPlay, label: 'فيديو' },
  audio: { icon: Music2, label: 'صوت' },
  pdf: { icon: FileText, label: 'ملف PDF' },
  html: { icon: Globe, label: 'صفحة تفاعلية' },
};

/** Easing curve shared with the app's premium transitions. */
const SHELL_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export interface PlayerShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Media title shown in the header (Radix Dialog.Title). */
  title: string;
  /** Optional secondary line (Radix Dialog.Description). */
  subtitle?: string;
  /** Kind badge — icon + label in the header. */
  kind?: MediaKind;
  /** Copy deterrents inside the shell. Default: true. */
  protection?: boolean;
  /** The player surface — rendered centered with desktop max-width caps. */
  children: ReactNode;
  /** Extra classes for the content column (e.g. max-w-5xl for readers). */
  contentClassName?: string;
  /** Wave 11.8 / F2: let the content column fill the stage height — readers
   *  that scroll internally (the PDF player). Default false: media players
   *  keep their aspect-driven sizing (zero behavior change for audio/video). */
  fill?: boolean;
  /** Push 10.4 — episode metadata card (title/description/difficulty/duration/
   * views) rendered under the player inside the shell. */
  metadata?: EpisodeMetadataData;
  testId?: string;
}

export function PlayerShell({
  open,
  onOpenChange,
  title,
  subtitle,
  kind = 'video',
  protection = true,
  children,
  contentClassName,
  fill = false,
  metadata,
  testId,
}: PlayerShellProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { setContainer } = usePlayerProtection({
    enabled: open && protection,
    interceptGlobalShortcuts: true,
    onBlock: (_action, label) => {
      toast.info(label, { duration: 2000 });
    },
  });

  /** One element carries BOTH the fullscreen target and the protection scope.
   * setContainer feeds the node into the hook's state so the capture-phase
   * deterrents attach even though the portal mounts after `open` flips. */
  const setStage = useCallback((node: HTMLDivElement | null) => {
    stageRef.current = node;
    setContainer(node);
  }, [setContainer]);

  /* ---- Fullscreen API (on the SHELL, not the media element) ---- */

  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', sync);
    // Older WebKit builds dispatch a differently-named event.
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);

  /** Leaving the modal must never leave a dangling fullscreen session. */
  useEffect(() => {
    if (!open && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, [open]);

  const toggleFullscreen = useCallback(async (): Promise<boolean> => {
    const stage = stageRef.current;
    if (!stage) return false;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return true;
      }
      if (typeof stage.requestFullscreen === 'function') {
        await stage.requestFullscreen();
        return true;
      }
      // Legacy WebKit fallback (older iPad Safari).
      const legacy = stage as HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> };
      if (legacy.webkitRequestFullscreen) {
        await legacy.webkitRequestFullscreen();
        return true;
      }
      return false; // API unavailable — caller may fall back (e.g. video native fs).
    } catch {
      // The UA refused (embedded iframe policy / transient gesture lock).
      // The button state self-heals via the fullscreenchange listener.
      return document.fullscreenElement === stage;
    }
  }, []);

  const KindIcon = KIND_META[kind].icon;

  const shellApi: PlayerShellApi = { toggleFullscreen, isFullscreen };

  return (
    <PlayerShellContext.Provider value={shellApi}>
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            {/* Overlay: deep base layer visible at the shell edges while it
                scales in — the glass surface itself lives on the Content. */}
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="fixed inset-0 z-50 bg-[#071426]/60"
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content
              asChild
              forceMount
              /* Wave 11.10 — the sticky-note editor lives INSIDE the shell and
                 uses Escape to commit+close. Wave 11.11 — the search panel
                 does the same (Escape closes the panel, not the player).
                 Radix's document-level Escape dismissal runs ahead of their
                 own keydown handlers (the layer unmounts the whole shell
                 mid-dispatch), so the dismissal is suppressed when the key
                 originates inside either surface — their handlers then close
                 themselves. Any other Escape target keeps the stock
                 shell-dismiss behavior. */
              onEscapeKeyDown={(event) => {
                const target = event.target as HTMLElement | null;
                if (target?.closest?.('[data-pdf-note-editor]') || target?.closest?.('[data-pdf-search-panel]')) {
                  event.preventDefault();
                  return;
                }
                /* Wave 12.2.C.5 — focus mode consumes Escape: it exits focus,
                   never the shell. The player root carries
                   [data-pdf-focus-mode="true"] while focus mode is active
                   (PdfPlayer), so the DOM query is authoritative even when the
                   focused element is the body. */
                if (document.querySelector('[data-pdf-focus-mode="true"]')) {
                  event.preventDefault();
                }
              }}
              {...(subtitle ? {} : { 'aria-describedby': undefined })}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.97, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 12 }}
                transition={{ duration: 0.32, ease: SHELL_EASE }}
                data-testid={testId}
                className="fixed inset-0 z-50 bg-[#071426]/95 outline-none backdrop-blur-2xl"
              >
                {/* STAGE — the fullscreen target. Opaque so the fullscreen
                    session never shows the transparent glass over black. */}
                <div
                  ref={setStage}
                  data-player-stage="true"
                  data-testid="player-stage"
                  className="flex h-full w-full select-none flex-col bg-[#071426]"
                >
                  {/* Header — stays visible in fullscreen (task contract). */}
                  <header className="flex shrink-0 items-start justify-between gap-3 px-4 pb-1 pt-4 sm:px-6 sm:pt-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-teal-300 sm:flex"
                      >
                        <KindIcon className="h-5 w-5" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0">
                        <DialogPrimitive.Title className="truncate text-base font-bold text-white sm:text-lg">
                          {title}
                        </DialogPrimitive.Title>
                        {subtitle && (
                          <DialogPrimitive.Description className="truncate text-xs text-slate-400 sm:text-sm">
                            {subtitle}
                          </DialogPrimitive.Description>
                        )}
                      </div>
                      {protection && (
                        <span
                          role="img"
                          title="الحماية من النسخ مفعّلة داخل المشغّل"
                          aria-label="الحماية من النسخ مفعّلة داخل المشغّل"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-teal-400/20 bg-teal-400/10 text-teal-300"
                        >
                          <ShieldCheck className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={toggleFullscreen}
                        aria-label={isFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
                        aria-pressed={isFullscreen}
                        data-testid="player-fullscreen-toggle"
                        className="press flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        {isFullscreen ? (
                          <Minimize className="h-5 w-5" strokeWidth={1.75} />
                        ) : (
                          <Maximize className="h-5 w-5" strokeWidth={1.75} />
                        )}
                      </button>
                      <DialogPrimitive.Close
                        aria-label="إغلاق المشغّل"
                        data-testid="player-close"
                        className="press flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition-colors hover:bg-red-500/20 hover:text-red-200"
                      >
                        <X className="h-5 w-5" strokeWidth={1.75} />
                      </DialogPrimitive.Close>
                    </div>
                  </header>

                  {/* Content column — the player mounts here, centered with
                      desktop max-width constraints. With metadata (10.4) the
                      column becomes scrollable and groups the player + the
                      metadata card; `m-auto` keeps the group centered when it
                      fits while staying fully scrollable when it doesn't
                      (auto margins collapse to zero on overflow). */}
                  <div
                    className={cn(
                      'relative flex min-h-0 flex-1 px-4 pb-4 sm:px-6 sm:pb-6',
                      metadata ? 'flex-col overflow-y-auto' : 'items-center justify-center overflow-hidden',
                    )}
                  >
                    {fill ? (
                      /* Wave 11.8 / F2: readers that scroll internally (PDF).
                      Absolute inset bypasses the nested auto-margin/percentage
                      chain — the player gets an exactly-sized box, deterministically. */
                      <div
                        data-testid="player-content"
                        className={cn('absolute inset-0 flex flex-col', contentClassName)}
                      >
                        {children}
                      </div>
                    ) : (
                      <div className="m-auto flex w-full max-w-6xl flex-col items-center gap-4">
                        <div
                          data-testid="player-content"
                          className={cn('flex w-full items-center justify-center', contentClassName)}
                        >
                          {children}
                        </div>
                        {metadata && <EpisodeMetadata metadata={metadata} testId="player-shell-metadata" />}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
    </PlayerShellContext.Provider>
  );
}
