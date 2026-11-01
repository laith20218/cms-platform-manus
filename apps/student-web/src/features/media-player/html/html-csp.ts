/**
 * Wave 13 (F3) — client-side CSP injector (defense-in-depth layer #2).
 *
 * A 1:1 TypeScript mirror of the backend `HtmlCspInjectorService` (C#): the
 * upload pipeline already injected the meta at UPLOAD time, so re-running this
 * on the fetched body is IDEMPOTENT and harmless — it only rebuilds the tag if
 * the backend layer is missing (legacy rows) or was somehow stripped. Belt and
 * suspenders, per the supervisor's ruling.
 *
 * The strict offline profile (G-1/G-3):
 *  - default-src 'none'            → nothing loads unless explicitly allowed;
 *  - style-src 'unsafe-inline'     → self-contained single-file lessons;
 *  - img-src data: blob:, font-src data: → embedded assets only;
 *  - connect-src 'none', frame-src 'none', object-src 'none',
 *    base-uri 'none', form-action 'none' → zero external connections,
 *    zero nesting, zero navigation;
 *  - script-src 'unsafe-inline' rides ONLY when enableScripts=true (Q1) —
 *    inline scripts of team-built lessons run; every external URL stays dead.
 */

export const HTML_CSP_STATIC =
  "default-src 'none'; " +
  "style-src 'unsafe-inline'; " +
  'img-src data: blob:; ' +
  'font-src data:; ' +
  "connect-src 'none'; " +
  "frame-src 'none'; " +
  "object-src 'none'; " +
  "base-uri 'none'; " +
  "form-action 'none'";

export const HTML_CSP_SCRIPTS = `${HTML_CSP_STATIC}; script-src 'unsafe-inline'`;

const META_TAG_REGEX = /<meta\b[^>]*>/gi;
const HEAD_OPEN_REGEX = /<head\b[^>]*>/i;
const HTML_OPEN_REGEX = /<html\b[^>]*>/i;
const INJECTED_SIGNATURE = 'data-cms-injected="true"';

/** True when the fetched body already carries a CSP meta (ours or foreign). */
export function hasCspMeta(html: string): boolean {
  const metas = html.match(META_TAG_REGEX) ?? [];
  return metas.some((tag) => {
    const lowered = tag.toLowerCase();
    return (
      (lowered.includes('http-equiv') && lowered.includes('content-security-policy')) ||
      lowered.includes('data-cms-injected')
    );
  });
}

/**
 * Returns `html` with the strict CSP meta injected as the FIRST element of
 * <head> (the tag is created when missing; fragments get a prepended meta —
 * the HTML parser hoists it into the auto-created head). Any existing CSP
 * meta is REPLACED, never duplicated — the idempotency contract the E2E
 * suite asserts (single tag + signature attribute after a re-upload).
 */
export function injectCspMeta(html: string, enableScripts: boolean): string {
  if (!html) return html;

  // BOM: strip before matching (UTF-8 no-BOM is the storage contract; the
  // /content proxy declares charset=utf-8 at the HTTP level anyway).
  const body = html.charCodeAt(0) === 0xfeff ? html.slice(1) : html;

  const policy = enableScripts ? HTML_CSP_SCRIPTS : HTML_CSP_STATIC;
  const metaTag = `<meta http-equiv="Content-Security-Policy" ${INJECTED_SIGNATURE} content="${policy}">`;

  // Idempotency: strip EVERY existing CSP meta (ours from the upload-time layer
  // or a foreign one), attribute-order agnostic.
  const stripped = body.replace(META_TAG_REGEX, (tag) => {
    const lowered = tag.toLowerCase();
    const isCspMeta =
      (lowered.includes('http-equiv') && lowered.includes('content-security-policy')) ||
      lowered.includes('data-cms-injected');
    return isCspMeta ? '' : tag;
  });

  // Injection point 1: right after an existing <head ...>.
  const head = HEAD_OPEN_REGEX.exec(stripped);
  if (head) {
    const at = head.index + head[0].length;
    return `${stripped.slice(0, at)}${metaTag}${stripped.slice(at)}`;
  }

  // Injection point 2: <html ...> without <head> — create the head.
  const htmlOpen = HTML_OPEN_REGEX.exec(stripped);
  if (htmlOpen) {
    const at = htmlOpen.index + htmlOpen[0].length;
    return `${stripped.slice(0, at)}<head>${metaTag}</head>${stripped.slice(at)}`;
  }

  // Injection point 3: fragment / malformed markup — prepend.
  return `${metaTag}\n${stripped}`;
}
