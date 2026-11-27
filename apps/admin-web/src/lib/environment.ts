/**
 * Phase 2 (deployment alignment) — honest environment labeling.
 *
 * The Admin Web must never claim «بيئة الإنتاج / Production environment» when
 * it is actually talking to the preview API. The environment is DERIVED from
 * the configured API origin (VITE_API_BASE_URL) instead of being hardcoded,
 * so production and preview deployments label themselves correctly without
 * any secret or private URL ever reaching the UI — only the public origin
 * host is displayed.
 */

export type AdminEnvironment = 'production' | 'preview' | 'local' | 'unknown';

/**
 * Derive the environment label from the API base URL.
 *
 * Classification rules (documented in apps/admin-web/README.md):
 *   - localhost / 127.0.0.1 / *.local          → local
 *   - hosts containing a `preview` segment     → preview
 *     (e.g. cms-api-preview.onrender.com, preview-api.example.com)
 *   - everything else with a parsable origin   → production
 *   - unparsable configuration                 → unknown (labels honestly as
 *     «بيئة غير محددة» instead of guessing)
 */
export function resolveAdminEnvironment(apiBaseUrl: string): AdminEnvironment {
  let url: URL;
  try {
    url = new URL(apiBaseUrl);
  } catch {
    return 'unknown';
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local')) {
    return 'local';
  }
  // A `preview` host segment — dash-, dot- or subdomain-delimited.
  if (/(^|[.-])preview([.-]|$)/.test(host)) {
    return 'preview';
  }
  return 'production';
}

/**
 * The public API origin host (e.g. `cms-api-preview.onrender.com`) — safe to
 * display to administrators. Never a path, query, credential or token.
 */
export function apiOriginHost(apiBaseUrl: string): string {
  try {
    return new URL(apiBaseUrl).host;
  } catch {
    return '';
  }
}

/** Dictionary key for the environment label (ar/en both exist in core.ts). */
export function environmentDictKey(environment: AdminEnvironment): `environment.${AdminEnvironment}` {
  return `environment.${environment}`;
}
