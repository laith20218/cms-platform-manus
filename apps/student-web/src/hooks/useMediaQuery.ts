import { useEffect, useState } from 'react';

/**
 * W15.1 (B.2) — tiny live media-query hook powering the cascade filter's
 * responsive layout (inline row ≥sm vs sticky bar + bottom sheet below).
 *
 * Mirrors the guarded matchMedia pattern of PdfPlayer.tsx: jsdom does not
 * implement window.matchMedia, so environments without it fall back to
 * `fallback` (desktop by default — URL-driven vitest suites keep exercising
 * the inline row; the sheet layout has dedicated tests that stub matchMedia).
 */
export function useMediaQuery(query: string, fallback = true): boolean {
  const readMatch = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : fallback;

  const [matches, setMatches] = useState<boolean>(readMatch);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
