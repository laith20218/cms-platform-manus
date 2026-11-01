import { useCallback, useEffect, useState } from 'react';
import { libraryApi } from '@/features/library/services/library-api';
import { injectLessonPrelude } from './html-csp';

/** Document lifecycle for the HTML player (G-5 states + retry via token). */
export type HtmlDocStatus = 'loading' | 'ready' | 'error';

/**
 * Wave 13 (F3) — fetches the stored HTML lesson and prepares it for the
 * sandboxed srcDoc render. R42 (Wave 13.2 hotfix) revision: the stored bytes
 * are now the ORIGINAL upload (the backend no longer mutates HTML), so this
 * hook is the ONLY place the document is transformed — and it stays
 * strictly IN-MEMORY: the string is never written back, never stored, never
 * leaves the component (C.1/C.2).
 *
 * Pipeline per attempt:
 *  1. `libraryApi.getContentText` — the same-origin proxy (the presigned
 *     storage URLs carry no CORS headers and no charset declaration).
 *  2. `ensureUtf8Document` — fragments are wrapped in a full document with a
 *     charset meta; complete documents pass through untouched.
 *  3. `injectLessonPrelude` — viewport meta + the STRICT CSP meta (the single
 *     remaining enforcement layer — idempotent, strips any previous-build
 *     tag) + the fit-to-width style/script. When enableScripts=false the CSP
 *     carries an explicit `script-src 'none'` — execution is blocked by the
 *     BROWSER (CSP + sandbox), never by string surgery (R44).
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
        setHtml(injectLessonPrelude(ensureUtf8Document(body), enableScripts));
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
 * Charset guard (mirrors the legacy DocumentViewer `forceUtf8Html`): sanitizer-
 * stripped legacy fragments are wrapped so the R42 prelude has a real <head>
 * to live in. Complete documents pass through untouched — never nest a
 * document inside itself.
 */
function ensureUtf8Document(raw: string): string {
  if (/<html[\s>]/i.test(raw)) return raw;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${raw}</body></html>`;
}
