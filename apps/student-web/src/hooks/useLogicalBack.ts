import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Wave C (legacy nav cleanup) — logical back for deep pages.
 *
 * Recon finding (docs/student-web-navigation-recon.md §4.3): five deep pages
 * used raw `navigate(-1)` for their «عودة» controls. On a DIRECT URL entry
 * (bookmark, shared link, notification deep link) the history stack holds
 * nothing in-app, so `navigate(-1)` either exits to the browser/WebView's
 * previous page or, worse, leaves the app entirely (Android shell back-out).
 *
 * This hook mirrors the PathTrail policy («Back goes to the PARENT segment of
 * the path model»): when in-app history exists, going back keeps the user's
 * place (question progress, exam attempts); when it does not, the caller's
 * explicit fallback route guarantees the student lands on the page's logical
 * parent — never outside the app.
 *
 * Heuristic: react-router's history index starts at 0 for a fresh entry.
 * `navigation.state.index > 0` means this entry was reached by in-app
 * navigation. When the index is unavailable (router v6 static rendering /
 * tests), treat any `window.history.state?.idx > 0` the same way — the field
 * is set by the history library itself.
 */
export function useLogicalBack(fallback: string): () => void {
  const navigate = useNavigate();

  return useCallback(() => {
    // Both routers used by the app (BrowserRouter in App.tsx, MemoryRouter in
    // tests) track the history index in window.history.state.idx (history v5).
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === 'number' && idx > 0) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  }, [navigate, fallback]);
}
