import { useEffect, useState } from 'react';
import { AlertTriangle, LoaderCircle, RotateCcw } from 'lucide-react';
import { useHtmlDocument } from './useHtmlDocument';
import type { HtmlPlayerProps } from './html-player-types';

/**
 * Wave 13 (F3) — HtmlPlayer: the secure, shell-hosted viewer for interactive
 * HTML lessons. Replaces the legacy DocumentViewer iframe (which lived in the
 * old document Dialog) with the same PlayerShell treatment as audio/pdf.
 *
 * Security model (R42 revision — Wave 13.2 hotfix):
 *  - G-1: offline single-file lessons only — the injected CSP allows no
 *    external source whatsoever (default-src 'none' + connect-src 'none').
 *  - G-3: since R42 the STORED bytes are the ORIGINAL upload (backend mutation
 *    disabled), so the client prelude (useHtmlDocument → injectLessonPrelude)
 *    is the SINGLE CSP enforcement layer — applied in memory on every render,
 *    idempotent, never persisted.
 *  - ZERO-DOWNLOAD (R42): no download, no open-external affordance exists on
 *    this surface or the shell around it; right-click is blocked at the stage.
 *  - G-4: fullscreen stays PlayerShell's exclusive job — the iframe carries
 *    NEITHER `allow="fullscreen"` NOR `allowfullscreen`, so page-injected
 *    fullscreen requests are dead; the shell's stage button keeps working.
 *  - G-5: loading / error / retry states cloned from PdfPlayer.tsx:959-982.
 *  - Q1: sandbox is `allow-scripts` (trusted lessons) or "" (static) — driven
 *    by the row's persisted EnableScripts flag; `allow-same-origin` is never
 *    granted (Q4), so the frame runs on an opaque origin: no parent DOM, no
 *    cookies, no storage access.
 *  - R47 (freeze fix): the document is served from a blob: URL, NOT srcDoc.
 *    about:srcdoc documents INHERIT the embedding app-shell CSP
 *    (script-src 'self'), and inherited policies intersect with our injected
 *    meta — authored inline scripts were being blocked at the browser level
 *    and trusted rows white-screened. A blob: URL document does NOT inherit
 *    the parent's policy: the injected <meta http-equiv="Content-Security-Policy">
 *    becomes the single authoritative layer (script-src 'unsafe-inline' when
 *    EnableScripts, 'none' otherwise). The sandbox attribute applies to blob
 *    loads exactly as to srcdoc, so the opaque-origin guarantee is unchanged.
 *  - Q5: the invisible watermark overlay rides on top of the white canvas,
 *    mirroring the PDF player's deterrent layer.
 */
export function HtmlPlayer({ assetType, assetId, title, enableScripts, watermark, testId }: HtmlPlayerProps) {
  const enabled = assetType === 'library-file' && Boolean(assetId);
  const { status, html, retry } = useHtmlDocument(enabled ? assetId : undefined, enabled, enableScripts);

  // R47 — blob URL lifecycle. `html` is the useHtmlDocument output: the
  // prelude (viewport meta + authoritative CSP meta + fit style/script) has
  // ALREADY been string-inserted by injectLessonPrelude, and everything else
  // is the ORIGINAL stored bytes. Blob creation never mutates those bytes and
  // never persists them. The URL is revoked on every document swap/unmount.
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!html) return;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    setBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [html]);

  if (status === 'error') {
    return (
      <div
        dir="rtl"
        className="flex h-full w-full flex-col items-center justify-center gap-4"
        data-testid={testId ? `${testId}-error` : 'html-player-error'}
      >
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10">
          <AlertTriangle className="h-9 w-9 text-red-300" />
        </div>
        <p className="font-bold text-white">تعذّر تحميل الدرس التفاعلي</p>
        <button
          type="button"
          onClick={retry}
          className="press inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-slate-200 hover:bg-white/10"
        >
          <RotateCcw className="h-4 w-4" /> إعادة المحاولة
        </button>
      </div>
    );
  }

  if (status === 'loading' || !html || !blobUrl) {
    return (
      <div
        dir="rtl"
        className="flex h-full w-full items-center justify-center"
        data-testid={testId ? `${testId}-loading` : 'html-player-loading'}
      >
        <div className="flex flex-col items-center gap-4">
          <LoaderCircle className="h-12 w-12 animate-spin text-teal-300/80" strokeWidth={1.5} />
          <p className="text-sm font-medium text-slate-300">جارٍ تجهيز الدرس التفاعلي…</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="relative h-full w-full bg-white" data-testid={testId ?? 'html-player'}>
      {/*
        R47 render path: src={blobUrl} instead of srcDoc={html}.
        about:srcdoc INHERITS the app-shell CSP (script-src 'self') and the
        inherited policy intersects with our injected meta — inline scripts
        died and authored lessons froze. A blob: URL document carries NO
        inherited policy, so the injected CSP meta is authoritative.
        Sandbox policy (Q1) is UNCHANGED: allow-scripts ONLY for trusted
        lessons, never combined with allow-same-origin — the blob document
        still runs on an opaque origin (no parent DOM, cookies, storage).
        NO allow, NO allowFullScreen, NO allow-downloads — fullscreen is
        shell-owned and downloads are platform-forbidden (R42 iframe contract).
      */}
      <iframe
        src={blobUrl}
        title={title}
        sandbox={enableScripts ? 'allow-scripts' : ''}
        className="h-full w-full"
        style={{ width: '100%', height: '100%', border: 0, background: '#ffffff' }}
        data-testid={testId ? `${testId}-frame` : 'html-player-frame'}
      />

      {/* Invisible watermark layer — silent protection (Q5, mirrors PdfPlayer). */}
      {watermark && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            backgroundImage:
              'linear-gradient(45deg, transparent 40%, rgba(7, 20, 38, 0.03) 50%, transparent 60%)',
            backgroundSize: '300px 300px',
          }}
        >
          <div
            className="absolute whitespace-nowrap text-2xl font-bold text-[#071426] opacity-[0.05]"
            style={{ top: '18%', left: '8%', transform: 'rotate(-45deg)' }}
          >
            {watermark.studentName} - {watermark.studentPhone}
          </div>
          <div
            className="absolute whitespace-nowrap text-2xl font-bold text-[#071426] opacity-[0.05]"
            style={{ top: '58%', left: '28%', transform: 'rotate(-45deg)' }}
          >
            {watermark.siteName} - {watermark.timestamp}
          </div>
        </div>
      )}
    </div>
  );
}

export default HtmlPlayer;
