import { AlertTriangle, LoaderCircle, RotateCcw } from 'lucide-react';
import { useHtmlDocument } from './useHtmlDocument';
import type { HtmlPlayerProps } from './html-player-types';

/**
 * Wave 13 (F3) — HtmlPlayer: the secure, shell-hosted viewer for interactive
 * HTML lessons. Replaces the legacy DocumentViewer iframe (which lived in the
 * old document Dialog) with the same PlayerShell treatment as audio/pdf.
 *
 * Security model (R51 revision — server-rendered policy):
 *  - G-1: offline single-file lessons only — the per-file CSP header emitted
 *    by GET /library/{id}/html-view allows no external source whatsoever
 *    (default-src 'none' + connect-src 'none').
 *  - G-3 + R51: the STORED bytes are served UNMODIFIED and the CSP arrives as
 *    a RESPONSE HEADER on the lesson document itself. A header policy is
 *    enforced by the browser on the framed document and can never be
 *    inherited from, or overridden by, the embedding app shell — the
 *    definitive fix for the R42 srcDoc and R47 blob: inheritance chains.
 *    The client performs ZERO document surgery (html-csp.ts is retired).
 *  - ZERO-DOWNLOAD (R42): no download, no open-external affordance exists on
 *    this surface or the shell around it; right-click is blocked at the stage.
 *  - G-4: fullscreen stays PlayerShell's exclusive job — the iframe carries
 *    NEITHER `allow="fullscreen"` NOR `allowfullscreen`, so page-injected
 *    fullscreen requests are dead; the shell's stage button keeps working.
 *  - G-5: loading / error / retry states cloned from PdfPlayer.tsx:959-982.
 *  - Q1: sandbox is `allow-scripts` (trusted lessons) or "" (static) — driven
 *    by the row's persisted EnableScripts flag; `allow-same-origin` is never
 *    granted (Q4), so the frame runs on an opaque origin: no parent DOM, no
 *    cookies, no storage access. The single-use token in the URL dies after
 *    one load (or 5 minutes) and Cache-Control: no-store keeps it uncached.
 *  - Q5: the invisible watermark overlay rides on top of the white canvas,
 *    mirroring the PDF player's deterrent layer.
 */
export function HtmlPlayer({ assetType, assetId, title, enableScripts, watermark, testId }: HtmlPlayerProps) {
  const enabled = assetType === 'library-file' && Boolean(assetId);
  const { status, url, retry } = useHtmlDocument(enabled ? assetId : undefined, enabled);

  // R51 — the grant URL is absolute-path (/api/v1/...). Join the API origin
  // from the configured base so production frames the API host directly
  // (cross-origin: its CSP header applies cleanly); in dev/e2e (no
  // VITE_API_URL) the join is a no-op and the request stays same-origin.
  const apiOrigin = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/api\/v1\/?$/, '') ?? '';
  const frameSrc = url ? `${apiOrigin}${url}` : null;

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

  if (status === 'loading' || !frameSrc) {
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
        R51 render path: src={frameSrc} — the API's html-view response carries
        the lesson's CSP (script-src 'unsafe-inline' when EnableScripts, 'none'
        otherwise), charset=utf-8 and Cache-Control: no-store as HEADERS. No
        client meta injection exists; stored bytes reach the frame verbatim.
        Sandbox policy (Q1) is UNCHANGED: allow-scripts ONLY for trusted
        lessons, never combined with allow-same-origin — the document still
        runs on an opaque origin (no parent DOM, cookies, storage).
        NO allow, NO allowFullScreen, NO allow-downloads — fullscreen is
        shell-owned and downloads are platform-forbidden (R42 iframe contract).
      */}
      <iframe
        src={frameSrc}
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
