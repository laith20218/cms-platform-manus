import { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import {
  AlertTriangle, Download, ExternalLink, FileCode, FileQuestion, FileText,
  Image as ImageIcon, Loader2, Minus, Monitor, Music, Plus, RotateCcw, Video, X,
} from 'lucide-react';
import { libraryApi, type LibraryFile, type FileAccess } from './services/library-api';

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
 *  - Video/Audio → the premium media frames.
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

/** Extracts a sensible download extension from the declared type. */
function downloadExtension(file: LibraryFile): string {
  const map: Record<string, string> = {
    pdf: '.pdf', txt: '.txt', html: '.html', image: '.jpg', video: '.mp4', audio: '.mp3',
  };
  return map[file.type] ?? '.bin';
}

export function DocumentViewer({ file, onClose }: { file: LibraryFile; onClose: () => void }) {
  const [access, setAccess] = useState<FileAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [textFailed, setTextFailed] = useState(false);
  const [viewStartMs] = useState(Date.now());
  const recordedRef = useRef(false);

  const meta = VIEWER_TYPE_META[file.type] ?? { icon: FileQuestion, label: file.type?.toUpperCase() || 'ملف', color: 'var(--c-text-muted)', bg: 'var(--c-bg-hover)' };
  const zoom = ZOOM_STEPS[zoomIndex] ?? 1;

  // Resolve the signed access URL.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    setTextBody(null);
    setTextFailed(false);
    setZoomIndex(0);
    libraryApi.getAccess(file.id)
      .then((data) => { if (!cancelled) setAccess(data); })
      .catch(() => { if (!cancelled) { setLoadFailed(true); toast.error('تعذّر الوصول للملف'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [file.id]);

  // TXT: fetch the body once the access URL exists.
  useEffect(() => {
    if (!access || file.type !== 'txt') return;
    let cancelled = false;
    fetch(access.accessUrl)
      .then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.text(); })
      .then((body) => { if (!cancelled) setTextBody(body); })
      .catch(() => { if (!cancelled) setTextFailed(true); });
    return () => { cancelled = true; };
  }, [access, file.type]);

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
      const response = await fetch(access.accessUrl);
      if (!response.ok) throw new Error(String(response.status));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${file.title}${downloadExtension(file)}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success('تم تنزيل الملف');
    } catch {
      // Presigned hosts without CORS headers — fall back to a new tab.
      window.open(access.accessUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  }, [access, file]);

  const clampZoom = (next: number) => setZoomIndex(Math.max(0, Math.min(ZOOM_STEPS.length - 1, next)));

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
            {loading ? (
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

                {file.type === 'pdf' && (
                  <PdfFrame url={access.accessUrl} zoom={zoom} onZoom={clampZoom} zoomIndex={zoomIndex} title={file.title} />
                )}
                {file.type === 'txt' && (
                  <TextReader body={textBody} failed={textFailed} url={access.accessUrl} />
                )}
                {file.type === 'html' && (
                  <iframe
                    src={access.accessUrl}
                    className="h-full w-full"
                    style={{ border: 'none', background: '#ffffff' }}
                    title={file.title}
                    sandbox="allow-scripts"
                  />
                )}
                {file.type === 'image' && (
                  <ImageFrame url={access.accessUrl} title={file.title} zoom={zoom} onZoom={clampZoom} zoomIndex={zoomIndex} />
                )}
                {file.type === 'video' && (
                  <div className="mx-auto flex h-full max-w-4xl items-center p-3 sm:p-6">
                    {access.accessUrl.includes('youtube.com/embed')
                      ? <iframe src={access.accessUrl} className="aspect-video w-full rounded-2xl" style={{ border: 'none' }} title={file.title} allowFullScreen />
                      : <video src={access.accessUrl} className="max-h-full w-full rounded-2xl" controls controlsList="nodownload" />}
                  </div>
                )}
                {file.type === 'audio' && (
                  <div className="mx-auto flex h-full max-w-3xl items-center justify-center p-6">
                    <audio src={access.accessUrl} className="w-full" controls controlsList="nodownload" />
                  </div>
                )}
                {!['pdf', 'txt', 'html', 'image', 'video', 'audio'].includes(file.type) && (
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

/** PDF: clean native embed + universal zoom controls. */
function PdfFrame({ url, zoom, onZoom, zoomIndex, title }: { url: string; zoom: number; onZoom: (next: number) => void; zoomIndex: number; title: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto bg-[var(--c-bg)]" style={{ touchAction: 'pinch-zoom' }}>
        <div
          className="mx-auto h-full origin-top transition-transform duration-200"
          style={{ width: `${zoom * 100}%` }}
        >
          <iframe
            src={`${url}#toolbar=0&navpanes=0&view=FitH`}
            className="h-full w-full bg-white"
            style={{ border: 'none' }}
            title={title}
            data-testid="viewer-pdf"
          />
        </div>
      </div>
      <ZoomBar zoom={zoom} zoomIndex={zoomIndex} onZoom={onZoom} />
    </div>
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
