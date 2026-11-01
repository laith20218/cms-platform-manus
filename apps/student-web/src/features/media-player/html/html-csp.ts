/**
 * Wave 13 (F3) — client-side CSP injector + R42 lesson prelude.
 *
 * R42 (Wave 13.2 hotfix) SHIFT: the backend no longer mutates stored HTML
 * (html.sanitize.enabled=false — stored bytes equal uploaded bytes), so THIS
 * module is now the SINGLE enforcement layer that turns the original document
 * into a safe, self-contained, fit-to-width lesson — entirely in memory, on
 * every render. The stored object is never modified.
 *
 * The strict offline profile (G-1/G-3):
 *  - default-src 'none'            → nothing loads unless explicitly allowed;
 *  - style-src 'unsafe-inline'     → self-contained single-file lessons;
 *  - img-src data: blob:, font-src data:, media-src data: blob:
 *                                  → embedded assets only;
 *  - connect-src 'none', frame-src 'none', object-src 'none',
 *    base-uri 'none', form-action 'none' → zero external connections,
 *    zero nesting, zero navigation;
 *  - script-src 'unsafe-inline' rides ONLY when enableScripts=true (Q1) —
 *    inline scripts of team-built lessons run; every external URL stays dead.
 *
 * The R42 prelude (all string insertion — never DOM parsing, per contract):
 *  1. viewport meta (responsive baseline for legacy/fragment lessons);
 *  2. the CSP meta (idempotent — any existing CSP meta is STRIPPED first, so
 *     a previous-build tag can never accumulate);
 *  3. fit-to-width style (margin/padding reset + overflow-x guard);
 *  4. fit-to-width script (body zoom = viewport/scrollWidth when content is
 *     wider than the frame — no-op at desktop widths; inert when the row is
 *     static because sandbox="" blocks every script anyway).
 */

export const HTML_CSP_STATIC =
  "default-src 'none'; " +
  "style-src 'unsafe-inline'; " +
  'img-src data: blob:; ' +
  'font-src data:; ' +
  'media-src data: blob:; ' +
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

/** R42 prelude artifact markers — the idempotency keys for re-renders. */
const VIEWPORT_MARK = 'name="viewport"';
const FIT_STYLE_ID = 'id="cms-fit-style"';
const FIT_SCRIPT_ID = 'id="cms-fit-script"';

const FIT_STYLE = `<style ${FIT_STYLE_ID}> html, body { margin:0; padding:0; width:100%; } body { overflow-x: hidden; }</style>`;

const FIT_SCRIPT = `<script ${FIT_SCRIPT_ID}> (function(){ function fit(){ try { document.body.style.zoom=''; var sw=document.body.scrollWidth; var vw=window.innerWidth||document.documentElement.clientWidth; if(sw>vw && sw>0){ document.body.style.zoom=(vw/sw).toString(); } } catch(e){} } window.addEventListener('load',fit); window.addEventListener('resize',fit); document.addEventListener('DOMContentLoaded',fit); })(); </script>`;

const SCRIPT_BLOCK_REGEX = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;

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
  const body = stripBom(html);
  const metaTag = cspMetaTag(enableScripts);
  const stripped = stripCspMetas(body);
  return insertIntoHead(stripped, metaTag);
}

/**
 * R42 — the full in-memory lesson prelude. Composes, in order:
 *  1. CSP-meta strip (previous-build tags from the legacy upload pipeline
 *     cannot survive — idempotency, C.3);
 *  2. script-block strip when enableScripts=false (belt-and-suspenders under
 *     sandbox="" — the file reads cleanly with no JS noise, C.4);
 *  3. one insertion after <head> (created/prepended when missing):
 *     viewport meta → CSP meta → fit style → fit script (C.2).
 * Pure string transforms — the original bytes are NEVER persisted anywhere.
 */
export function injectLessonPrelude(html: string, enableScripts: boolean): string {
  if (!html) return html;

  let body = stripBom(html);
  body = stripCspMetas(body);

  if (!enableScripts) {
    // C.4: strip every <script>…</script> block (sandbox="" would block them
    // anyway; removing them keeps the DOM clean and the static lesson readable).
    body = body.replace(SCRIPT_BLOCK_REGEX, '');
  }

  const prelude =
    cspMetaTag(enableScripts) +
    `<meta ${VIEWPORT_MARK} content="width=device-width, initial-scale=1">` +
    FIT_STYLE +
    FIT_SCRIPT;

  return insertIntoHead(body, prelude);
}

/** BOM strip (UTF-8 no-BOM is the storage contract; the /content proxy declares
 * charset=utf-8 at the HTTP level anyway). */
function stripBom(html: string): string {
  return html.charCodeAt(0) === 0xfeff ? html.slice(1) : html;
}

function cspMetaTag(enableScripts: boolean): string {
  const policy = enableScripts ? HTML_CSP_SCRIPTS : HTML_CSP_STATIC;
  return `<meta http-equiv="Content-Security-Policy" ${INJECTED_SIGNATURE} content="${policy}">`;
}

/** Strips EVERY existing CSP meta (ours from the legacy upload-time pipeline or
 * a foreign one) plus any previous R42 prelude artifacts — attribute-order
 * agnostic, idempotent under re-render. */
function stripCspMetas(html: string): string {
  let out = html.replace(META_TAG_REGEX, (tag) => {
    const lowered = tag.toLowerCase();
    const isCspMeta =
      (lowered.includes('http-equiv') && lowered.includes('content-security-policy')) ||
      lowered.includes('data-cms-injected');
    return isCspMeta ? '' : tag;
  });
  // Previous prelude artifacts (defensive — legacy rows never carry them, but
  // re-processing an already-preluded document must not duplicate anything).
  out = out.replace(new RegExp(`<meta\\b[^>]*${VIEWPORT_MARK}[^>]*>`, 'gi'), '');
  out = out.replace(new RegExp(`<style\\b[^>]*${FIT_STYLE_ID}[^>]*>[\\s\\S]*?</style\\s*>`, 'gi'), '');
  out = out.replace(new RegExp(`<script\\b[^>]*${FIT_SCRIPT_ID}[^>]*>[\\s\\S]*?</script\\s*>`, 'gi'), '');
  return out;
}

/** Inserts `block` right after an existing <head …> — creates the head after
 * <html …> when missing, prepends to fragments. */
function insertIntoHead(html: string, block: string): string {
  const head = HEAD_OPEN_REGEX.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return `${html.slice(0, at)}${block}${html.slice(at)}`;
  }

  const htmlOpen = HTML_OPEN_REGEX.exec(html);
  if (htmlOpen) {
    const at = htmlOpen.index + htmlOpen[0].length;
    return `${html.slice(0, at)}<head>${block}</head>${html.slice(at)}`;
  }

  return `${block}\n${html}`;
}
