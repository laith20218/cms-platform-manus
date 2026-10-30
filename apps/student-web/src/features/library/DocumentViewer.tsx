import { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import {
  AlertTriangle, Download, ExternalLink, FileCode, FileQuestion, FileText,
  Image as ImageIcon, Loader2, Minus, Monitor, Music, Plus, RotateCcw, Video, X,
} from 'lucide-react';
import { libraryApi, type LibraryFile, type FileAccess } from './services/library-api';
import { PlayerShell } from '@/features/media-player/PlayerShell';
import { LazyPlayerMount, PlayerLoading } from '@/features/media-player/LazyPlayerMount';
import type { AudioPlayerProps } from '@/features/media-player/audio/AudioPlayer';
import type { PdfPlayerProps } from '@/features/media-player/pdf/pdf-types';

/** Stable module-level loader — React.lazy is created exactly once per mount
 *  site, so the AudioPlayer (+ wavesurfer) ships as its own code-split chunk. */
const loadAudioPlayer = () => import('@/features/media-player/audio/AudioPlayer');

/** Wave 11.8 / F2 — same pattern for the PDF player (pdf.js + annotations). */
const loadPdfPlayer = () => import('@/features/media-player/pdf/PdfPlayer');

/**
 * Vercel-grade in-app document viewer (Push 9 Task 2).
 *
 * A full-screen, mobile-first Radix Dialog: on phones it owns the whole
 * viewport (with safe-area insets); on ≥sm it becomes a large reading surface.
 * Top bar carries the file identity + a real download button + close — zero
 * technical texts (no lease countdowns, no piracy warnings; the invisible
 * watermark overlay is the protection).
 *
 * Rendering matrix:
 *  - PDF    → native embed (`#toolbar=0&navpanes=0`) + zoom controls that work
 *             on every device (native pinch works where the engine supports it;
 *             the ± controls guarantee it everywhere — including desktop).
 *  - TXT    → fetched and rendered as a Medium-style reading column.
 *  - HTML   → sandboxed iframe (`allow-scripts`) on a forced white canvas.
 *  - Images → pinch-zoomable frame + the same zoom controls.
 *  - Video  → the premium media frames.
 *  - Audio  → Push 11.7 (F1): the fullscreen PlayerShell (kind="audio") hosting
 *             the code-split AudioPlayer (waveform, speed, A-B loop, bookmarks,
 *             resume). Audio leaves the document-dialog path entirely: the shell
 *             stacks at z-50 while this dialog's overlay/content sit at
 *             --z-modal: 60 — nesting the shell INSIDE the dialog would render
 *             the player UNDER the viewer chrome, so the shell replaces it.
 *  - Anything else (docx…) → a calm "preview not available" card with real
 *             download/open actions — never a dead end, never a raw error.
 */

const VIEWER_TYPE_META: Record<string, { icon: typeof FileText; label: string; color: string; bg: string }> = {
  pdf: { icon: FileText, label: 'PDF', color: 'var(--c-danger-500)', bg: 'var(--c-danger-50)' },
  txt: { icon: FileText, label: 'نص', color: 'var(--c-text-soft)', bg: 'var(--c-bg-hover)' },
  html: { icon: FileCode, label: 'HTML', color: 'var(--c-primary-700)', bg: 'var(--c-primary-50)' },
  image: { icon: ImageIcon, label: 'صورة', color: 'var(--c-info-500)', bg: 'var(--c-info-50)' },
  video: { icon: Video, label: 'فيديو', color: 'var(--c-warning-500)', bg: 'var(--c-warning-50)' },
  audio: { icon: Music, label: 'صوت', color: 'var(--c-info-500)', bg: 'var(--c-info-50)' },
};

const ZOOM_STEPS = [1, 1.25, 1.5, 2, 2.5, 3];

/** Rendering kinds the viewer knows how to present. */
export type ViewerKind = 'pdf' | 'txt' | 'html' | 'image' | 'video' | 'audio' | 'other';

const DIRECT_KINDS = new Set(['pdf', 'txt', 'html', 'image', 'video', 'audio']);

/** Arabic labels for the summary-family classes when the physical format is unknown. */
const CLASS_LABELS: Record<string, string> = {
  summary: 'ملخص', comprehensive: 'شامل', paragraph: 'فقرة',
};

/**
 * Resolves the rendering kind.
 *
 * The API reports the library file CLASS as a PascalCase enum name
 * ("Pdf"/"Html"/"Image"/"Video"/"Audio"/"Summary"/"Comprehensive"/"Paragraph").
 * Direct classes map 1:1 after lowercasing. The summary family can be
 * physically anything (a PDF, an HTML page, a DOCX…), so its kind must come
 * from the file detail's real MIME (fileFormat); without it we show the calm
 * download card rather than risk rendering binary bytes as prose.
 */
function resolveViewerKind(rawType: string | undefined, fileFormat: string | null | undefined): ViewerKind {
  const t = (rawType ?? '').trim().toLowerCase();
  if (DIRECT_KINDS.has(t)) return t as ViewerKind;
  const mime = (fileFormat ?? '').trim().toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/html' || mime === 'application/xhtml+xml') return 'html';
  if (mime === 'text/plain' || mime === 'text/markdown') return 'txt';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'other';
}

/** Extracts a sensible download extension from the resolved kind. */
function downloadExtension(kind: ViewerKind): string {
  const map: Record<ViewerKind, string> = {
    pdf: '.pdf', txt: '.txt', html: '.html', image: '.jpg', video: '.mp4', audio: '.mp3', other: '.bin',
  };
  return map[kind];
}

/**
 * Guarantees a UTF-8 charset declaration on an HTML document.
 *
 * Stored library HTML is sanitized server-side, which strips the <head>
 * (including any <meta charset>); the object is then served as text/html
 * WITHOUT a charset, so browsers fall back to a legacy encoding and Arabic
 * turns into mojibake. We fetch the bytes as text (UTF-8 per the Fetch spec)
 * and re-inject the declaration before rendering via srcDoc.
 */
function forceUtf8Html(raw: string): string {
  if (/<meta[^>]+charset/i.test(raw)) return raw;
  if (/<head[^>]*>/i.test(raw)) return raw.replace(/<head[^>]*>/i, (m) => `${m}<meta charset="utf-8">`);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${raw}</body></html>`;
}

export function DocumentViewer({ file, onClose }: { file: LibraryFile; onClose: () => void }) {
  const [access, setAccess] = useState<FileAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [textFailed, setTextFailed] = useState(false);
  const [htmlBody, setHtmlBody] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ fileFormat: string | null } | null>(null);
  const [viewStartMs] = useState(Date.now());
  const recordedRef = useRef(false);

  // Rendering kind: direct classes resolve instantly; the summary family waits
  // for the file detail (real MIME) so a Summary-PDF embeds as a PDF, etc.
  const rawType = (file.type ?? '').trim().toLowerCase();
  const kindPending = !DIRECT_KINDS.has(rawType) && detail === null;
  const kind = resolveViewerKind(file.type, detail?.fileFormat);

  const meta = VIEWER_TYPE_META[kind] ?? {
    icon: FileQuestion,
    label: CLASS_LABELS[rawType] ?? (file.type?.toUpperCase() || 'ملف'),
    color: 'var(--c-text-muted)', bg: 'var(--c-bg-hover)',
  };
  const zoom = ZOOM_STEPS[zoomIndex] ?? 1;

  // Resolve the signed access URL + the file detail (physical MIME) in parallel.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    setTextBody(null);
    setTextFailed(false);
    setHtmlBody(null);
    setDetail(null);
    setZoomIndex(0);
    libraryApi.getAccess(file.id)
      .then((data) => { if (!cancelled) setAccess(data); })
      .catch(() => { if (!cancelled) { setLoadFailed(true); toast.error('تعذّر الوصول للملف'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    libraryApi.getFile(file.id)
      .then((data) => { if (!cancelled) setDetail({ fileFormat: data?.fileFormat ?? null }); })
      .catch(() => { if (!cancelled) setDetail({ fileFormat: null }); });
    return () => { cancelled = true; };
  }, [file.id]);

  // TXT: fetch the body once the access URL exists. Prefers the same-origin
  // content stream (the presigned URL is not CORS-fetchable) with a graceful
  // fallback to the direct URL.
  useEffect(() => {
    if (!access || kind !== 'txt') return;
    let cancelled = false;
    libraryApi.getContentText(file.id)
      .catch(() => fetch(access.accessUrl).then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.text();
      }))
      .then((body) => { if (!cancelled && body) setTextBody(body); })
      .catch(() => { if (!cancelled) setTextFailed(true); });
    return () => { cancelled = true; };
  }, [access, kind, file.id]);

  // HTML: fetch as UTF-8 text and render via sandboxed srcDoc (charset-safe —
  // the stored object is served without a charset declaration).
  useEffect(() => {
    if (!access || kind !== 'html') return;
    let cancelled = false;
    libraryApi.getContentText(file.id)
      .catch(() => fetch(access.accessUrl).then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.text();
      }))
      .then((body) => { if (!cancelled && body) setHtmlBody(forceUtf8Html(body)); })
      .catch(() => { if (!cancelled) setHtmlBody(null); });
    return () => { cancelled = true; };
  }, [access, kind, file.id]);

  // Record the reading session when the viewer closes (or unmounts).
  useEffect(() => {
    const record = () => {
      if (recordedRef.current || !access) return;
      recordedRef.current = true;
      const duration = Math.round((Date.now() - viewStartMs) / 1000);
      libraryApi.recordView(file.id, duration).catch(() => { /* view telemetry is best-effort */ });
    };
    return record;
  }, [file.id, viewStartMs, access]);

  const handleDownload = useCallback(async () => {
    if (!access) return;
    setDownloading(true);
    try {
      // Same-origin content stream first (the presigned URL is not
      // CORS-fetchable from the app origin); presigned fetch as fallback.
      let blob: Blob;
      try {
        blob = await libraryApi.getContentBlob(file.id);
      } catch {
        const response = await fetch(access.accessUrl);
        if (!response.ok) throw new Error(String(response.status));
        blob = await response.blob();
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${file.title}${downloadExtension(kind)}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success('تم تنزيل الملف');
    } catch {
      // Last resort — open the presigned URL in a new tab.
      window.open(access.accessUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  }, [access, file, kind]);

  const clampZoom = (next: number) => setZoomIndex(Math.max(0, Math.min(ZOOM_STEPS.length - 1, next)));

  // ===== Push 11.7 (F1) — AUDIO: the fullscreen player shell replaces the
  // document dialog (see the rendering-matrix note above for the z-index
  // rationale). All hooks above (access/detail/view telemetry) keep running
  // exactly as before — only the surface changes.
  if (kind === 'audio') {
    return (
      <PlayerShell
        open
        onOpenChange={(next) => { if (!next) onClose(); }}
        kind="audio"
        title={file.title}
        subtitle={meta.label}
        contentClassName="max-w-3xl"
        testId="audio-player-shell"
      >
        {loading || kindPending ? (
          <PlayerLoading label="جارٍ تجهيز الملف الصوتي…" />
        ) : loadFailed || !access ? (
          <ViewerError onClose={onClose} />
        ) : (
          <LazyPlayerMount<AudioPlayerProps>
            active
            loader={loadAudioPlayer}
            playerProps={{ assetType: 'library-file', assetId: file.id, title: file.title, testId: 'library-audio-player' }}
            testId="audio-player-mount"
          />
        )}
      </PlayerShell>
    );
  }

  // ===== Wave 11.8 / F2 — PDF: the fullscreen PlayerShell (kind="pdf") hosts
  // the code-split PdfPlayer (pdf.js canvas + selectable text layer + SVG
  // annotations), mirroring the audio replace-not-nest z-index rationale.
  // The invisible watermark moves INTO the player — the dialog overlay that
  // used to carry it never mounts on this path.
  if (kind === 'pdf') {
    return (
      <PlayerShell
        open
        onOpenChange={(next) => { if (!next) onClose(); }}
        kind="pdf"
        title={file.title}
        subtitle={meta.label}
        contentClassName="max-w-none p-4 pb-4"
        fill
        testId="pdf-player-shell"
      >
        {loading ? (
          <PlayerLoading label="جارٍ تجهيز ملف PDF…" />
        ) : loadFailed || !access ? (
          <ViewerError onClose={onClose} />
        ) : (
          <LazyPlayerMount<PdfPlayerProps>
            active
            loader={loadPdfPlayer}
            className="h-full"
            playerProps={{
              assetType: 'library-file',
              assetId: file.id,
              title: file.title,
              pagesCount: file.pagesCount,
              watermark: access.watermark,
              testId: 'library-pdf-player',
            }}
            testId="pdf-player-mount"
          />
        )}
      </PlayerShell>
    );
  }

  return (
    <DialogPrimitive.Root open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay fixed inset-0 z-[var(--z-modal)]" style={{ background: 'rgba(8, 26, 38, 0.66)' }} />
        <DialogPrimitive.Content
          data-testid="document-viewer"
          aria-label={file.title}
          className="dialog-center fixed inset-0 z-[calc(var(--z-modal)+1)] flex flex-col bg-[var(--c-bg)] outline-none sm:inset-4 sm:rounded-3xl sm:shadow-2xl lg:inset-x-[max(2rem,calc(50%-38rem))] lg:inset-y-8"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* ===== Top bar: identity + download + close. No technical texts. ===== */}
          <header className="flex items-center justify-between gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: meta.bg, color: meta.color }}>
                <meta.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogPrimitive.Title className="truncate text-sm font-bold text-[var(--c-text)] sm:text-base">
                  {file.title}
                </DialogPrimitive.Title>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--c-text-muted)] sm:text-xs">
                  <span style={{ color: meta.color }}>{meta.label}</span>
                  {file.pagesCount ? <span lang="en">{file.pagesCount} صفحة</span> : null}
                  {file.fileSize ? <span lang="en">{formatSize(file.fileSize)}</span> : null}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {access && (
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  aria-label="تنزيل الملف"
                  title="تنزيل"
                  data-testid="viewer-download"
                  className="press inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--c-border)] text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-300)] hover:text-[var(--c-primary-700)] disabled:opacity-50"
                >
                  {downloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => access && window.open(access.accessUrl, '_blank', 'noopener,noreferrer')}
                disabled={!access}
                aria-label="فتح في نافذة جديدة"
                title="نافذة جديدة"
                className="press hidden h-11 w-11 items-center justify-center rounded-2xl border border-[var(--c-border)] text-[var(--c-text-soft)] transition-colors hover:border-[var(--c-primary-300)] hover:text-[var(--c-primary-700)] disabled:opacity-50 sm:inline-flex"
              >
                <ExternalLink className="h-5 w-5" />
              </button>
              <DialogPrimitive.Close
                aria-label="إغلاق"
                data-testid="viewer-close"
                className="press flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--c-text-muted)] transition-colors hover:bg-[var(--c-bg-hover)] hover:text-[var(--c-text)]"
              >
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            </div>
          </header>

          {/* ===== Body ===== */}
          <div className="relative flex-1 overflow-hidden">
            {loading || kindPending ? (
              <div className="flex h-full items-center justify-center" data-testid="viewer-loading">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-[var(--c-primary-700)]" />
                  <p className="text-sm text-[var(--c-text-muted)]">جارٍ تجهيز المعاينة…</p>
                </div>
              </div>
            ) : loadFailed || !access ? (
              <ViewerError onClose={onClose} />
            ) : (
              <>
                {/* Invisible watermark layer — silent protection. */}
                <div
                  className="pointer-events-none absolute inset-0 z-10"
                  style={{
                    backgroundImage: 'linear-gradient(45deg, transparent 40%, rgba(25,118,210,0.03) 50%, transparent 60%)',
                    backgroundSize: '300px 300px',
                  }}
                >
                  <div className="absolute -rotate-45 whitespace-nowrap text-2xl font-bold text-[var(--c-primary-700)] opacity-[0.05]" style={{ top: '18%', left: '8%' }}>
                    {access.watermark.studentName} - {access.watermark.studentPhone}
                  </div>
                  <div className="absolute -rotate-45 whitespace-nowrap text-2xl font-bold text-[var(--c-primary-700)] opacity-[0.05]" style={{ top: '58%', left: '28%' }}>
                    {access.watermark.siteName} - {access.watermark.timestamp}
                  </div>
                </div>

                {kind === 'txt' && (
                  <TextReader body={textBody} failed={textFailed} url={access.accessUrl} />
                )}
                {kind === 'html' && (htmlBody !== null ? (
                  <iframe
                    srcDoc={htmlBody}
                    className="h-full w-full"
                    style={{ border: 'none', background: '#ffffff' }}
                    title={file.title}
                    sandbox="allow-scripts"
                  />
                ) : (
                  /* Charset-unsafe fallback: only when the body fetch failed. */
                  <iframe
                    src={access.accessUrl}
                    className="h-full w-full"
                    style={{ border: 'none', background: '#ffffff' }}
                    title={file.title}
                    sandbox="allow-scripts"
                  />
                ))}
                {kind === 'image' && (
                  <ImageFrame url={access.accessUrl} title={file.title} zoom={zoom} onZoom={clampZoom} zoomIndex={zoomIndex} />
                )}
                {kind === 'video' && (
                  <div className="mx-auto flex h-full max-w-4xl items-center p-3 sm:p-6">
                    {access.accessUrl.includes('youtube.com/embed')
                      ? <iframe src={access.accessUrl} className="aspect-video w-full rounded-2xl" style={{ border: 'none' }} title={file.title} allowFullScreen />
                      : <video src={access.accessUrl} className="max-h-full w-full rounded-2xl" controls controlsList="nodownload" />}
                  </div>
                )}
                {kind === 'other' && (
                  <UnsupportedFrame title={file.title} onDownload={handleDownload} onOpen={() => window.open(access.accessUrl, '_blank', 'noopener,noreferrer')} downloading={downloading} />
                )}
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Zoom controls — 44px targets, works on every device (mouse + touch). */
function ZoomBar({ zoom, zoomIndex, onZoom }: { zoom: number; zoomIndex: number; onZoom: (next: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-1 border-t border-[var(--c-border)] bg-[var(--c-surface)] px-4 py-2" data-testid="viewer-zoom">
      <button
        type="button" onClick={() => onZoom(zoomIndex - 1)} disabled={zoomIndex === 0}
        aria-label="تصغير"
        className="press flex h-11 w-11 items-center justify-center rounded-xl text-[var(--c-text-soft)] transition-colors hover:bg-[var(--c-bg-hover)] disabled:opacity-40"
      >
        <Minus className="h-4.5 w-4.5" />
      </button>
      <span className="min-w-14 text-center text-xs font-bold tabular-nums text-[var(--c-text-muted)]" lang="en">
        {Math.round(zoom * 100)}%
      </span>
      <button
        type="button" onClick={() => onZoom(zoomIndex + 1)} disabled={zoomIndex >= ZOOM_STEPS.length - 1}
        aria-label="تكبير"
        className="press flex h-11 w-11 items-center justify-center rounded-xl text-[var(--c-text-soft)] transition-colors hover:bg-[var(--c-bg-hover)] disabled:opacity-40"
      >
        <Plus className="h-4.5 w-4.5" />
      </button>
      <button
        type="button" onClick={() => onZoom(0)} disabled={zoomIndex === 0}
        aria-label="إعادة الضبط"
        className="press flex h-11 w-11 items-center justify-center rounded-xl text-[var(--c-text-soft)] transition-colors hover:bg-[var(--c-bg-hover)] disabled:opacity-40"
      >
        <RotateCcw className="h-4 w-4" />
      </button>
    </div>
  );
}

/** TXT: Medium-style reading column. */
function TextReader({ body, failed, url }: { body: string | null; failed: boolean; url: string }) {
  if (failed) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <button
          type="button"
          onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
          className="press inline-flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--c-border)] px-6 py-2.5 text-sm font-bold text-[var(--c-text-soft)] hover:border-[var(--c-primary-300)]"
        >
          <ExternalLink className="h-4 w-4" /> فتح النص في نافذة جديدة
        </button>
      </div>
    );
  }
  if (body === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--c-primary-700)]" />
      </div>
    );
  }
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="h-full overflow-auto bg-[var(--c-bg)]" data-testid="viewer-text">
      <article dir="auto" className="mx-auto max-w-prose px-5 py-8 sm:px-8 sm:py-12">
        {paragraphs.map((paragraph, index) => (
          <p key={index} className="mb-5 text-[16px] leading-[2] text-[var(--c-text)] sm:text-[17px]">
            {paragraph}
          </p>
        ))}
        {paragraphs.length === 0 && (
          <p className="text-center text-sm text-[var(--c-text-muted)]">الملف فارغ</p>
        )}
      </article>
    </div>
  );
}

/** Image: pinch-zoomable pan frame + zoom bar. */
function ImageFrame({ url, title, zoom, onZoom, zoomIndex }: { url: string; title: string; zoom: number; onZoom: (next: number) => void; zoomIndex: number }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 items-center justify-center overflow-auto bg-[var(--c-bg)] p-4" style={{ touchAction: 'pinch-zoom' }}>
        <img
          src={url}
          alt={title}
          className="max-h-full rounded-2xl shadow-lg transition-transform duration-200"
          style={{ transform: `scale(${zoom})` }}
          data-testid="viewer-image"
        />
      </div>
      <ZoomBar zoom={zoom} zoomIndex={zoomIndex} onZoom={onZoom} />
    </div>
  );
}

/** DOCX & friends: calm honest card with real actions. */
function UnsupportedFrame({ title, onDownload, onOpen, downloading }: { title: string; onDownload: () => void; onOpen: () => void; downloading: boolean }) {
  return (
    <div className="flex h-full items-center justify-center p-6" data-testid="file-unknown-type">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--c-primary-50)]">
          <Monitor className="h-9 w-9 text-[var(--c-primary-700)]" />
        </div>
        <div>
          <p className="font-bold text-[var(--c-text)]">المعاينة داخل التطبيق غير متاحة لهذه الصيغة</p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--c-text-muted)]">
            يمكنك تنزيل «{title}» وفتحه بأي تطبيق ملفات — بنقرة واحدة أدناه.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onDownload}
            disabled={downloading}
            className="press inline-flex min-h-11 items-center gap-2 rounded-2xl px-6 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-50"
            style={{ background: 'var(--c-primary-700)' }}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            تنزيل الملف
          </button>
          <button
            type="button"
            onClick={onOpen}
            className="press inline-flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--c-border)] px-5 py-2.5 text-sm font-bold text-[var(--c-text-soft)] hover:border-[var(--c-primary-300)]"
          >
            <ExternalLink className="h-4 w-4" /> فتح مباشرة
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewerError({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--c-danger-50)]">
          <AlertTriangle className="h-9 w-9 text-[var(--c-danger-500)]" />
        </div>
        <p className="font-bold text-[var(--c-text)]">تعذّر تحميل الملف</p>
        <button
          type="button"
          onClick={onClose}
          className="press inline-flex min-h-11 items-center rounded-2xl border border-[var(--c-border)] px-5 py-2 text-sm font-bold text-[var(--c-text-soft)]"
        >
          إغلاق
        </button>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
