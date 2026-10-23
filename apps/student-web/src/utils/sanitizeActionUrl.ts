/**
 * Strict sanitizer for notification actionUrl values.
 *
 * Threat model: `notif.actionUrl` is an untrusted string coming from the API.
 * If a compromised admin (or a DB-level attacker) sets it to `javascript:...`
 * or an external phishing URL, assigning it to `window.location.href` would
 * either execute arbitrary script (XSS) or redirect the student off-site.
 *
 * Defense: parse with `new URL(raw, origin)`, then enforce three rules:
 *   1. Protocol must be `http:` or `https:`  → rejects `javascript:`, `data:`,
 *      `vbscript:`, `file:`, `blob:`, etc.
 *   2. Origin must match the current page origin → rejects external
 *      `http(s)://` URLs, protocol-relative `//evil.com/...`, and userinfo
 *      tricks like `https://app.com@evil.com/...`.
 *   3. Path must be in the internal-route whitelist → defense in depth, so
 *      even a same-origin path the app does not route to is rejected.
 *
 * Returns the safe relative URL (`/path?query#hash`) on success, or `null`
 * on rejection. Callers MUST null-check before navigating.
 *
 * @param raw    The raw actionUrl from the API (untrusted).
 * @param origin The current page origin. Defaults to `window.location.origin`
 *               in browser contexts; exposed as a parameter so unit tests
 *               can run deterministically without mocking `window.location`.
 */

/**
 * Internal path prefixes that notification actionUrls may navigate to.
 * Mirrors the public+protected routes registered in `app/router.tsx`.
 * Root `/` is allowed because the router redirects it to `/dashboard`.
 */
const ALLOWED_ACTION_PATHS = [
  '/',
  '/dashboard',
  '/subjects',
  '/exams',
  '/library',
  '/favorites',
  '/search',
  '/profile',
  '/notifications',
  '/stats',
  '/leaderboard',
  '/activate-code',
  '/settings',
  '/terms',
  '/privacy',
] as const;

export function sanitizeActionUrl(
  raw: string | undefined | null,
  origin: string = typeof window !== 'undefined' ? window.location.origin : '',
): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Fast pre-check: reject the most dangerous schemes by name before URL
  // parsing. Belt-and-suspenders — the protocol check below is the real
  // authority, but this makes intent explicit and guards against any future
  // URL-parser quirks with whitespace/control chars inside the scheme.
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('file:')
  ) {
    return null;
  }

  let parsed: URL;
  try {
    // Per WHATWG URL spec, if `trimmed` is an absolute URL (has a scheme),
    // the `origin` base argument is ignored — which is exactly what we want:
    // an absolute `https://evil.com/x` will parse to its own origin and be
    // caught by the origin check below.
    parsed = new URL(trimmed, origin);
  } catch {
    // Malformed URL (e.g. contains illegal characters) → reject.
    return null;
  }

  // Rule 1: protocol must be http or https.
  // Catches `javascript:`, `data:`, `blob:`, `file:`, custom schemes, etc.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  // Rule 2: must be same-origin.
  // Catches external `https://evil.com/...`, protocol-relative `//evil.com/...`,
  // and userinfo tricks `https://app.com@evil.com/...`.
  if (parsed.origin !== origin) {
    return null;
  }

  // Rule 3: path must be in the whitelist.
  // Catches same-origin but unexpected paths (`/admin/...`, `/api/...`, etc.)
  // and path-traversal attempts that normalize to a non-whitelisted path.
  const path = parsed.pathname;
  const isAllowed =
    path === '/' ||
    ALLOWED_ACTION_PATHS.some(
      prefix => path === prefix || path.startsWith(prefix + '/'),
    );
  if (!isAllowed) return null;

  // Return a safe relative URL (path + search + hash) for same-origin
  // navigation. Stripping the origin avoids any chance of re-introducing an
  // absolute URL downstream.
  return parsed.pathname + parsed.search + parsed.hash;
}
