/**
 * Wave 13.6 — HTML storage-shim E2E (R56).
 *
 * Harness contract mirrors w13.1-html.e2e.mjs (same fixture + route mocks).
 * Run (dev server on 127.0.0.1:5173):  node e2e/w13.6-html-storage-shim.e2e.mjs
 * Env: E2E_WEB_URL, PLAYWRIGHT_CHROMIUM_EXECUTABLE, E2E_WIDTHS (CSV; default 375,1440).
 *
 * Supervisor contract (R56):
 *  - S1  interactive lesson (EnableScripts=true) inside the opaque-origin frame
 *        (sandbox="allow-scripts", NO allow-same-origin): a fixture script that
 *        calls localStorage.setItem('x', 'y') must run to completion — NO
 *        SecurityError, #marker flips to 'ran', window.__shimProof === true,
 *        and the shim is provably ENGAGED (localStorage becomes an OWN window
 *        property — the defineProperty ran; native storage lives on
 *        Window.prototype and THROWS in an opaque origin).
 *  - S2  static lesson (EnableScripts=false): served bytes carry NO shim
 *        (script-src 'none' makes it dead bytes; R51 verbatim-bytes contract
 *        preserved) and the lesson script never runs — also no SecurityError
 *        surfaces (nothing executes at all).
 *
 * HARNESS FIDELITY DISCLOSURE (§11): this suite route-mocks GET /html-view,
 * exactly like w13.1 — the real server never runs here. The mock therefore
 * serves STORED + SHIM, where SHIM is copied VERBATIM from
 * apps/api/src/CMS.Infrastructure/Security/HtmlStorageShim.cs and the mock's
 * insertion mirrors HtmlStorageShim.Inject (first case-insensitive <head…>
 * open tag, else prepend). The REAL end-to-end transform (storage bytes →
 * served body) is proven server-side by CMS.Tests HtmlViewHttpIntegrationTests
 * (View_ValidToken_InjectsStorageShim_*, View_StaticRow_ServedVerbatim_NoShim,
 * View_HeadlessLesson_ShimPrepended). What THIS suite uniquely proves is the
 * shim's runtime behavior in a REAL Chromium opaque origin + real CSP header.
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));
const WIDTHS = (process.env.E2E_WIDTHS ?? '375,1440').split(',').map((w) => Number(w.trim()));

const SUBJECT_SLUG = 'e2e-html-shim-subject';
const SUBJECT_ID = 'e2e-shim-html';
const FILE_ID = '77777777-1111-2222-3333-444444444444';
const LESSON_TITLE = 'درس التخزين التفاعلي';

const E2E_USER = {
  id: 'e2e-u-006', phone: '+962790000004', fullName: 'طالب اختبار التخزين',
  role: 'student', avatarUrl: null,
  university: { id: 'u-1', nameAr: 'جامعة الاختبار' }, college: { id: 'c-1', nameAr: 'كلية الطب' },
};

const ENTITLEMENT_TOKEN = [
  Buffer.from(JSON.stringify({ expiresAt: new Date(Date.now() + 3600_000).toISOString() })).toString('base64url'),
  'e2e', 'sig',
].join('.');

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? '  PASS' : '! FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

/** KEEP IN SYNC: verbatim copy of HtmlStorageShim.ScriptTag (C# const). */
const SHIM = `<script id="cms-storage-shim">
(function() {
  try {
    window.localStorage.getItem('test');
    window.sessionStorage.getItem('test');
  } catch (e) {
    const createStorage = () => {
      const map = new Map();
      return {
        getItem: k => map.has(k) ? map.get(k) : null,
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: k => map.delete(k),
        clear: () => map.clear(),
        key: i => Array.from(map.keys())[i] || null,
        get length() { return map.size; }
      };
    };
    Object.defineProperty(window, 'localStorage', { value: createStorage(), writable: false });
    Object.defineProperty(window, 'sessionStorage', { value: createStorage(), writable: false });
  }
})();
</script>`;

/** The STORED lesson (what the admin uploaded). Uses localStorage/sessionStorage —
 *  in an opaque origin this throws SecurityError and every following line dies. */
function storedLessonBody() {
  return `<!DOCTYPE html><html dir="rtl"><head><title>${LESSON_TITLE}</title></head><body>
<h1>درس التخزين التفاعلي</h1>
<div id="marker">pending</div>
<script>
localStorage.setItem('x', 'y');
sessionStorage.setItem('s', 't');
window.__shimProof = (localStorage.getItem('x') === 'y');
document.getElementById('marker').textContent = 'ran';
</script>
</body></html>`;
}

/** Mirror of HtmlStorageShim.Inject — harness emulation of the R56 server transform. */
function injectShim(html) {
  const match = /<head\b[^>]*>/i.exec(html);
  if (!match) return SHIM + html;
  const end = match.index + match[0].length; // match[0].length = matched tag length (match.length is the ARRAY length)
  return html.slice(0, end) + SHIM + html.slice(end);
}

/** The per-file CSP the html-view RESPONSE HEADER carries (mirrors HtmlViewCsp.Build). */
function htmlViewCsp(enableScripts) {
  return (
    "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; " +
    'media-src data: blob:; ' +
    "connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; " +
    (enableScripts ? "script-src 'unsafe-inline'; " : "script-src 'none'; ") +
    `frame-ancestors ${BASE_URL}`
  );
}

const consoleErrors = [];
const pageErrors = [];
const securityBlocks = [];
function classifyConsole(text) {
  // Sandbox/CSP BLOCK reports are expected EVIDENCE (w13.1 precedent) — but only
  // in scenarios where a block is contractual (S2). S1 asserts none occur.
  if (/Blocked script execution in '[^']*'/.test(text) || /Content Security Policy/.test(text)) {
    securityBlocks.push(text);
    return;
  }
  consoleErrors.push(text);
}

async function newContext(browser, viewport, opts) {
  const { enableScripts } = opts;
  const context = await browser.newContext({ viewport, locale: 'ar', hasTouch: true });
  await context.addInitScript(() => {
    // Guarded: this init script also runs inside the sandboxed html-view frame,
    // where sessionStorage access throws SecurityError (no allow-same-origin).
    try {
      sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
      sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
    } catch {
      /* sandboxed frames — tokens are only needed on the main frame */
    }
  });

  await context.route('**/api/v1/**', (route) => route.abort());
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));

  const fileSummary = {
    id: FILE_ID, type: 'Html', title: LESSON_TITLE,
    description: 'درس HTML تجريبي لدفعة R56 (localStorage shim)',
    fileSize: 2048, durationSeconds: null, pagesCount: null,
    thumbnailUrl: null, viewsCount: 0, isFavorite: false, category: 'Lecture',
    createdAt: '2026-11-15T12:00:00Z',
  };

  await context.route(`**/api/v1/subjects/${SUBJECT_SLUG}`, (route) => route.fulfill({
    json: {
      id: SUBJECT_ID, slug: SUBJECT_SLUG, nameAr: 'مادة HTML التخزينية',
      color: null, totalQuestions: 0, totalLectures: 0, totalFiles: 1,
      totalExams: 0, lastContentUpdatedAt: null, userProgress: null, contentScopes: ['LecturesText'],
      description: null,
    },
  }));
  await context.route(`**/api/v1/library/subject/${SUBJECT_ID}**`, (route) => route.fulfill({
    json: { items: [fileSummary], total: 1, page: 1, pageSize: 20, totalPages: 1 },
  }));
  await context.route(`**/api/v1/library/${FILE_ID}/access`, (route) => route.fulfill({
    json: {
      accessUrl: `${BASE_URL}/api/v1/library/${FILE_ID}/content`,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      watermark: {
        studentName: 'طالب اختبار التخزين', studentPhone: '+962790000004',
        timestamp: new Date().toISOString(), siteName: 'CMS',
      },
    },
  }));
  await context.route(`**/api/v1/library/${FILE_ID}`, (route) => route.fulfill({
    json: {
      ...fileSummary, subjectId: SUBJECT_ID, lectureId: null,
      fileFormat: 'text/html', youtubeVideoId: null, tags: [], favoritesCount: 0,
      enableScripts,
      contentProcessingStatus: 'Ready',
    },
  }));
  await context.route(`**/api/v1/library/${FILE_ID}/content`, (route) => route.abort());
  await context.route(`**/api/v1/library/${FILE_ID}/html-access`, (route) => route.fulfill({
    json: {
      url: `/api/v1/library/${FILE_ID}/html-view?t=e2e-single-use-token`,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    },
  }));
  await context.route(`**/api/v1/library/${FILE_ID}/html-view**`, (route) => {
    // R56 server transform, emulated: stored bytes + shim after the first
    // <head…> open tag — ONLY on interactive rows (mirrors the controller).
    const stored = storedLessonBody();
    const body = enableScripts ? injectShim(stored) : stored;
    context._servedCsp = htmlViewCsp(enableScripts);
    context._servedBody = body;
    return route.fulfill({
      body,
      contentType: 'text/html; charset=utf-8',
      headers: { 'Content-Security-Policy': context._servedCsp, 'Cache-Control': 'no-store' },
    });
  });
  await context.route(`**/api/v1/library/${FILE_ID}/view`, (route) => route.fulfill({ status: 204, body: '' }));

  context.on('page', (page) => {
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text();
        if (text.includes('Failed to load resource')) return;
        classifyConsole(text);
      }
    });
    page.on('pageerror', (error) => {
      const text = error instanceof Error ? error.message : String(error);
      if (text.includes('sessionStorage') && text.includes('Access is denied')) return;
      pageErrors.push(text);
    });
  });

  return context;
}

async function openHtmlPlayer(page) {
  await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library`, { timeout: 60_000 });
  await page.locator(`text=${LESSON_TITLE}`).first().click();
  await page.locator('[data-testid="html-player-shell"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-testid="library-html-player-frame"]').waitFor({ state: 'attached', timeout: 20_000 });
}

/** The lesson execution context (R51+: the html-view API response — opaque origin). */
function lessonFrame(page) {
  return page.frames().find(
    (frame) =>
      frame !== page.mainFrame() &&
      (frame.url() === 'about:srcdoc' || frame.url() === '' || frame.url().startsWith('blob:') || frame.url().includes('/html-view')),
  ) ?? null;
}

async function waitForFrame(page, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    const frame = lessonFrame(page);
    if (frame) return frame;
    await page.waitForTimeout(250);
  }
  return null;
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'],
  });

  try {
    // ===== S1 — interactive row: shim engages, script runs to completion, NO SecurityError =====
    {
      securityBlocks.length = 0;
      const context = await newContext(browser, { width: 375, height: 812 }, { enableScripts: true });
      const page = await context.newPage();
      await openHtmlPlayer(page);

      const iframe = page.locator('[data-testid="library-html-player-frame"]');
      const sandboxAttr = await iframe.getAttribute('sandbox');
      check('S1a: sandbox="allow-scripts" (opaque origin — real localStorage must throw)', sandboxAttr === 'allow-scripts', `sandbox="${sandboxAttr}"`);

      const frame = await waitForFrame(page);
      check('S1b: lesson frame attached (html-view API response)', !!frame);

      if (frame) {
        // #marker === 'ran' is ONLY reachable if localStorage.setItem did not throw —
        // without the shim the fixture script dies on its first line.
        let probe = { marker: 'pending' };
        for (let i = 0; i < 20; i++) {
          probe = await frame.evaluate(() => ({
            marker: document.querySelector('#marker')?.textContent ?? null,
          }));
          if (probe.marker === 'ran') break;
          await page.waitForTimeout(250);
        }
        check('S1c: fixture script runs to completion (marker=ran; localStorage.setItem did NOT throw)', probe.marker === 'ran', `marker=${probe.marker}`);

        const shimState = await frame.evaluate(() => ({
          proof: window.__shimProof === true,
          x: (() => { try { return localStorage.getItem('x'); } catch (e) { return `THROW:${e.name}`; } })(),
          s: (() => { try { return sessionStorage.getItem('s'); } catch (e) { return `THROW:${e.name}`; } })(),
          ownLocalStorage: Object.getOwnPropertyNames(window).includes('localStorage'),
          ownSessionStorage: Object.getOwnPropertyNames(window).includes('sessionStorage'),
          shimPresent: document.getElementById('cms-storage-shim') !== null,
          shimBeforeLesson: (() => {
            const shim = document.getElementById('cms-storage-shim');
            const lesson = document.querySelector('body > script');
            return !!shim && !!lesson && shim.compareDocumentPosition(lesson) & Node.DOCUMENT_POSITION_FOLLOWING;
          })(),
        }));
        check('S1d: window.__shimProof === true (setItem→getItem round-trip inside the fixture)', shimState.proof, JSON.stringify(shimState));
        check('S1e: localStorage.getItem(\'x\') === \'y\' via the in-memory shim', shimState.x === 'y', `x=${shimState.x}`);
        check('S1f: sessionStorage.getItem(\'s\') === \'t\' via the in-memory shim', shimState.s === 't', `s=${shimState.s}`);
        check('S1g: shim ENGAGED — localStorage/sessionStorage are OWN window properties (defineProperty ran; native accessors live on Window.prototype and THROW in opaque origins)', shimState.ownLocalStorage && shimState.ownSessionStorage, `own=${shimState.ownLocalStorage}/${shimState.ownSessionStorage}`);
        check('S1h: shim <script id="cms-storage-shim"> present in the served DOM', shimState.shimPresent);
        check('S1i: shim precedes the lesson script in the document', shimState.shimBeforeLesson);
      }

      check('S1j: served CSP header is the interactive profile (script-src \'unsafe-inline\' — the inline shim is executable)', !!context._servedCsp && context._servedCsp.includes("script-src 'unsafe-inline'"), context._servedCsp ?? 'no-header-captured');
      check('S1k: ZERO CSP/sandbox block reports in the interactive scenario (nothing should be blocked)', securityBlocks.length === 0, `${securityBlocks.length} report(s): ${securityBlocks[0] ?? ''}`);
      await page.screenshot({ path: `${SHOT_DIR}/w13.6-375-interactive.png` });
      await context.close();
    }

    // ===== S2 — static row: NO shim, verbatim bytes, script never runs, NO SecurityError =====
    {
      securityBlocks.length = 0;
      const context = await newContext(browser, { width: 375, height: 812 }, { enableScripts: false });
      const page = await context.newPage();
      await openHtmlPlayer(page);

      const iframe = page.locator('[data-testid="library-html-player-frame"]');
      const sandboxAttr = await iframe.getAttribute('sandbox');
      check('S2a: sandbox="" on static rows (Q1 default)', sandboxAttr === '', `sandbox="${sandboxAttr}"`);

      const frame = await waitForFrame(page);
      if (frame) {
        const probe = await frame.evaluate(() => ({
          marker: document.querySelector('#marker')?.textContent ?? null,
          shimPresent: document.getElementById('cms-storage-shim') !== null,
        }));
        check('S2b: static body carries NO shim (R51 verbatim-bytes contract preserved)', probe.shimPresent === false, `shim=${probe.shimPresent}`);
        check('S2c: script does NOT run (sandbox="" + script-src \'none\')', probe.marker === 'pending', `marker=${probe.marker}`);
      } else {
        check('S2-frame: lesson frame attached', false);
      }

      check('S2d: CSP header is the static profile (script-src \'none\')', !!context._servedCsp && context._servedCsp.includes("script-src 'none'") && !context._servedCsp.includes("script-src 'unsafe-inline'"), context._servedCsp ?? 'no-header-captured');
      await page.screenshot({ path: `${SHOT_DIR}/w13.6-375-static.png` });
      await context.close();
    }

    // ===== §13 matrix — one interactive screenshot per requested width =====
    for (const width of WIDTHS) {
      if (!Number.isFinite(width) || width <= 0) continue;
      const context = await newContext(browser, { width, height: Math.round(width * 2.1) }, { enableScripts: true });
      const page = await context.newPage();
      try {
        await openHtmlPlayer(page);
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${SHOT_DIR}/w13.6-${width}-matrix.png` });
        check(`§13 matrix ${width}px: player opens + screenshot`, true);
      } catch (error) {
        check(`§13 matrix ${width}px: player opens + screenshot`, false, String(error).slice(0, 120));
      } finally {
        await context.close();
      }
    }

    if (consoleErrors.length) check('console clean (unexpected errors only)', false, consoleErrors.slice(0, 3).join(' | '));
    else check('console clean (unexpected errors only)', true);
    if (pageErrors.length) check('no page errors (SecurityError would land here)', false, pageErrors.slice(0, 3).join(' | '));
    else check('no page errors (SecurityError would land here)', true);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n==== w13.6-html-storage-shim E2E: ${results.length - failed.length}/${results.length} checks passed ====\n`);
  if (failed.length) {
    process.exitCode = 1;
    failed.forEach((f) => console.log(`FAILED: ${f.name} — ${f.extra}`));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
