import { useCallback, useEffect, useState } from 'react';
import { libraryApi } from '@/features/library/services/library-api';
import { injectCspMeta } from './html-csp';

/** Document lifecycle for the HTML player (G-5 states + retry via token). */
export type HtmlDocStatus = 'loading' | 'ready' | 'error';

/**
 * Wave 13 (F3) — fetches the stored HTML lesson and prepares it for the
 * sandboxed srcDoc render.
 *
 * Pipeline per attempt:
 *  1. `libraryApi.getContentText` — the same-origin proxy (the presigned
 *     storage URLs carry no CORS headers and no charset declaration).
 *  2. `ensureUtf8Document` — legacy sanitizer-stripped fragments are wrapped
 *     in a full document with a charset meta; complete documents (our
 *     team-built lessons, already CSP-injected at upload) pass through.
 *  3. `injectCspMeta` — the SAFETY NET: a 1:1 mirror of the backend injector,
 *     idempotent by contract, so a double injection is impossible.
 *
 * Retry (G-5): `retry()` bumps the reload token — the effect re-runs, the
 * state machine resets, no shell remount (identical to the PdfPlayer pattern).
 */
export function useHtmlDocument(assetId: string | undefined, enabled: boolean, enableScripts: boolean) {
  const [reloadToken, setReloadToken] = useState(0);
  const [status, setStatus] = useState<HtmlDocStatus>('loading');
  const [html, setHtml] = useState<string | null>(null);

  const retry = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!enabled || !assetId) return;
    let cancelled = false;
    setStatus('loading');
    setHtml(null);

    libraryApi
      .getContentText(assetId)
      .then((body) => {
        if (cancelled) return;
        if (!body) throw new Error('empty html body');
        setHtml(injectCspMeta(ensureUtf8Document(body), enableScripts));
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, assetId, enableScripts, reloadToken]);

  return { status, html, retry };
}

/**
 * Charset guard (mirrors the legacy DocumentViewer `forceUtf8Html`): sanitizer
 * output is a body-only fragment — wrap it so the injected CSP meta has a real
 * <head> to live in. Documents that already contain <html> (the Wave 13
 * upload-time pipeline guarantees one for every new upload) pass through
 * untouched — never nest a document inside itself.
 */
function ensureUtf8Document(raw: string): string {
  if (/<html[\s>]/i.test(raw)) return raw;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${raw}</body></html>`;
}
