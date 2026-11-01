import { useCallback, useEffect, useState } from 'react';
import { libraryApi } from '@/features/library/services/library-api';

/** Document lifecycle for the HTML player (G-5 states + retry via token). */
export type HtmlDocStatus = 'loading' | 'ready' | 'error';

/**
 * R51 — resolves the single-use view URL for the HTML lesson iframe.
 *
 * The client NO LONGER transforms the document. The backend streams the
 * ORIGINAL stored bytes and attaches the per-file CSP (and charset) response
 * headers — the browser enforces that policy on the framed document directly,
 * which is the only layer that can never be inherited from the embedding app
 * shell (the R42 srcDoc and R47 blob: paths were both fallbacks toward this
 * end state; both inherit from, or interact with, the app-shell CSP).
 *
 * Pipeline per attempt:
 *  1. `libraryApi.issueHtmlAccess` — POST /library/{id}/html-access with the
 *     entitlement headers; the server validates the file gates (HTML, published,
 *     virus-clean) and the entitlement, then issues a single-use, 5-minute token.
 *  2. The grant's absolute-path `url` becomes the iframe src (the player joins
 *     the API origin). Nothing is fetched, parsed or rewritten here.
 *
 * Retry (G-5): retry() bumps the reload token — a FRESH token is issued on the
 * next pass (the previous one may already be consumed), the state machine
 * resets, no shell remount (identical to the PdfPlayer pattern).
 */
export function useHtmlDocument(assetId: string | undefined, enabled: boolean) {
  const [reloadToken, setReloadToken] = useState(0);
  const [status, setStatus] = useState<HtmlDocStatus>('loading');
  const [url, setUrl] = useState<string | null>(null);

  const retry = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!enabled || !assetId) return;
    let cancelled = false;
    setStatus('loading');
    setUrl(null);

    libraryApi
      .issueHtmlAccess(assetId)
      .then((grant) => {
        if (cancelled) return;
        if (!grant?.url) throw new Error('empty html view grant');
        setUrl(grant.url);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, assetId, reloadToken]);

  return { status, url, retry };
}
