/**
 * Wave 13.1 (F3) — HTML player E2E.
 *
 * Harness contract mirrors w12.3-mobile.e2e.mjs (same fixture + route mocks).
 * Run (dev server on 127.0.0.1:5173):  node e2e/w13.1-html.e2e.mjs
 * Env: E2E_WEB_URL, PLAYWRIGHT_CHROMIUM_EXECUTABLE, E2E_WIDTHS (CSV of
 * screenshot widths; default 375,1440).
 *
 * Supervisor contract (COMMIT 3 / 13.C):
 *  - S1  static HTML → script does NOT run (sandbox="" — Q1 default);
 *  - S2  interactive HTML (EnableScripts=true) → inline script RUNS and the
 *        external fetch is BLOCKED (G-3 connect-src 'none' — proven in-page);
 *  - S3  broken HTML (content 500) → error state + retry button recovers (G-5);
 *  - S4  CSP meta present with data-cms-injected="true" on BOTH paths —
 *        client-only safety net on the static variant, single (non-duplicated)
 *        meta on the interactive variant that already carries the backend tag;
 *  - S5  backend processed URL ends with -ready — NOT assertable in this
 *        route-mocked harness (the student client talks to /content, never to
 *        the raw object key). Reported as SKIP with an explicit disclosure;
 *        verified by the 13.A unit tests (FileUrl ends with "-ready") + CI.
 *  - S6  re-run of the injector on an already-injected document → CSP not
 *        duplicated (idempotency, exercised in the live browser via Vite).
 *  - G-4  iframe carries NEITHER allow="fullscreen" NOR allowfullscreen; the
 *        shell's stage fullscreen button stays the single fullscreen owner.
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

const SUBJECT_SLUG = 'e2e-html-subject';
const SUBJECT_ID = 'e2e-s-html';
const FILE_ID = '66666666-1111-2222-3333-444444444444';
const LESSON_TITLE = 'درس القلب التفاعلي';

const E2E_USER = {
  id: 'e2e-u-005', phone: '+962790000003', fullName: 'طالب الاختبار HTML',
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
function skip(name, reason) {
  results.push({ name, ok: true, skipped: true });
  console.log(`  SKIP  ${name} — ${reason}`);
}

const consoleErrors = [];
const pageErrors = [];
/** Expected browser security reports — the sandbox/CSP BLOCKS are the evidence
 *  the suite asserts (a blocked script report for sandbox="" rows and a CSP
 *  violation report for the blocked external fetch are PASS conditions, not defects).
 *  R49: the lesson frame is a blob: URL now (R47) — block reports name the blob
 *  origin instead of 'about:srcdoc'; both wordings are expected evidence. */
const securityBlocks = [];
function classifyConsole(text) {
  // Any sandbox/CSP BLOCK report is expected evidence, in whatever wording the
  // Chromium build emits ("Blocked script execution…", "…violates the following
  // Content Security Policy directive…", "Fetch API cannot load … violates…").
  // R49: mirror w13.2-hotfix — the blocked-document name may be 'about:srcdoc'
  // (pre-R47) or 'blob:<origin>/<uuid>' (R47+).
  if (/Blocked script execution in '(about:srcdoc|blob:[^']*)'/.test(text) || /Content Security Policy/.test(text)) {
    securityBlocks.push(text);
    return;
  }
  consoleErrors.push(text);
}

/** Lesson body WITHOUT any CSP meta — the client safety net must add it (S4/S1). */
function lessonBody() {
  return `<!DOCTYPE html><html dir="rtl"><head><title>${LESSON_TITLE}</title></head><body>
<h1>درس القلب التفاعلي</h1>
<div id="marker">pending</div>
<div id="net">unknown</div>
<script>document.getElementById('marker').textContent = 'ran';</script>
<script>fetch('https://external.example.invalid/x').then(function(){document.getElementById('net').textContent='allowed';}).catch(function(){document.getElementById('net').textContent='blocked';});</script>
</body></html>`;
}

/** The upload-time (backend) CSP meta — the interactive variant ships with it. */
const BACKEND_META =
  '<meta http-equiv="Content-Security-Policy" data-cms-injected="true" content="' +
  "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; " +
  "connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; " +
  'form-action \'none\'; script-src \'unsafe-inline\'">';

async function newContext(browser, viewport, opts) {
  const { enableScripts, serveContent, metaMode } = opts;
  const context = await browser.newContext({ viewport, locale: 'ar', hasTouch: true });
  await context.addInitScript(() => {
    // Guarded: this init script also runs inside the sandboxed srcdoc frame,
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
    description: 'درس HTML تجريبي لمشغّل الموجة 13',
    fileSize: 2048, durationSeconds: null, pagesCount: null,
    thumbnailUrl: null, viewsCount: 0, isFavorite: false, category: 'Lecture',
    createdAt: '2026-11-15T12:00:00Z',
  };

  await context.route(`**/api/v1/subjects/${SUBJECT_SLUG}`, (route) => route.fulfill({
    json: {
      id: SUBJECT_ID, slug: SUBJECT_SLUG, nameAr: 'مادة HTML التجريبية',
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
        studentName: 'طالب الاختبار HTML', studentPhone: '+962790000003',
        timestamp: new Date().toISOString(), siteName: 'CMS',
      },
    },
  }));
  await context.route(`**/api/v1/library/${FILE_ID}`, (route) => route.fulfill({
    json: {
      ...fileSummary, subjectId: SUBJECT_ID, lectureId: null,
      fileFormat: 'text/html', youtubeVideoId: null, tags: [], favoritesCount: 0,
      enableScripts,
      contentProcessingStatus: enableScripts ? 'Ready' : 'Ready',
    },
  }));
  await context.route(`**/api/v1/library/${FILE_ID}/content`, async (route) => {
    const decision = await serveContent();
    if (decision !== 'ok') {
      return route.fulfill({ status: 500, body: 'storage outage' });
    }
    const body = metaMode === 'backend' ? lessonBody().replace('<head>', `<head>${BACKEND_META}`) : lessonBody();
    return route.fulfill({
      body,
      contentType: 'text/html; charset=utf-8',
      headers: { 'Cache-Control': 'private, max-age=120' },
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

async function openHtmlShell(page) {
  await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library`, { timeout: 60_000 });
  await page.locator(`text=${LESSON_TITLE}`).first().click();
  await page.locator('[data-testid="html-player-shell"]').waitFor({ state: 'visible', timeout: 20_000 });
}

async function openHtmlPlayer(page) {
  await openHtmlShell(page);
  await page.locator('[data-testid="library-html-player-frame"]').waitFor({ state: 'attached', timeout: 20_000 });
}

/** The lesson execution context (R47+: blob: URL — opaque origin via sandbox;
 *  CDP evaluation still reaches it). Chromium reported the pre-R47 srcdoc
 *  frame's URL as '' (or 'about:srcdoc' depending on version) — both legacy
 *  forms stay accepted for harness compatibility (R49). */
function srcdocFrame(page) {
  return page.frames().find(
    (frame) =>
      frame !== page.mainFrame() &&
      (frame.url() === 'about:srcdoc' || frame.url() === '' || frame.url().startsWith('blob:')),
  ) ?? null;
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'],
  });

  try {
    // ===== S1 — static HTML: sandbox="" and NO script execution =====
    {
      let serve = 'ok';
      const context = await newContext(browser, { width: 375, height: 812 }, {
        enableScripts: false,
        serveContent: async () => serve,
        metaMode: 'none', // no backend meta → the CLIENT safety net must inject (S4)
      });
      const page = await context.newPage();
      await openHtmlPlayer(page);

      const iframe = page.locator('[data-testid="library-html-player-frame"]');
      const sandboxAttr = await iframe.getAttribute('sandbox');
      check('S1a: sandbox="" on static rows (Q1 default)', sandboxAttr === '', `sandbox="${sandboxAttr}"`);

      const frame = await (async () => {
        for (let i = 0; i < 20; i++) {
          const found = srcdocFrame(page);
          if (found) return found;
          await page.waitForTimeout(250);
        }
        return null;
      })();
      check('S1b: srcdoc frame attached', !!frame);

      if (frame) {
        const probe = await frame.evaluate(() => ({
          text: document.querySelector('h1')?.textContent ?? null,
          marker: document.querySelector('#marker')?.textContent ?? null,
          net: document.querySelector('#net')?.textContent ?? null,
        }));
        check('S1c: static content renders (h1 visible)', !!probe.text && probe.text.includes('التفاعلي'), JSON.stringify(probe));
        check('S1d: script does NOT run (sandbox="")', probe.marker === 'pending', `marker=${probe.marker}`);
        check('S1e: external fetch never attempted', probe.net === 'unknown', `net=${probe.net}`);

        const csp = await frame.evaluate(() =>
          document.querySelector('meta[data-cms-injected="true"]')?.getAttribute('content') ?? null);
        // R49: R44 made script-src EXPLICIT in both modes — the static profile
        // carries script-src 'none' (no default-src fallback reliance), so the
        // pre-R44 assertion (!csp.includes('script-src')) is stale. Mirrors
        // w13.2-hotfix S4c ("static CSP carries EXPLICIT script-src 'none'").
        check('S4a: client safety net injected the CSP meta', !!csp && csp.includes("default-src 'none'") && csp.includes("script-src 'none'"),
          csp ? csp.slice(0, 48) + '…' : 'MISSING');
      }
      await page.screenshot({ path: `${SHOT_DIR}/w13.1-375-static.png` });
      await context.close();
    }

    // ===== S2 — interactive HTML: script runs, external fetch blocked, single meta =====
    {
      const context = await newContext(browser, { width: 375, height: 812 }, {
        enableScripts: true,
        serveContent: async () => 'ok',
        metaMode: 'backend', // backend already injected → client re-run must NOT duplicate (S4b/S6)
      });
      const page = await context.newPage();
      await openHtmlPlayer(page);

      const iframe = page.locator('[data-testid="library-html-player-frame"]');
      const sandboxAttr = await iframe.getAttribute('sandbox');
      check('S2a: sandbox="allow-scripts" on trusted rows', sandboxAttr === 'allow-scripts', `sandbox="${sandboxAttr}"`);

      const allowAttr = await iframe.getAttribute('allow');
      const allowFull = await iframe.getAttribute('allowfullscreen');
      check('G-4a: iframe has NO allow attribute (fullscreen stays shell-owned)', allowAttr === null, `allow=${allowAttr}`);
      check('G-4a: iframe has NO allowfullscreen attribute', allowFull === null, `allowfullscreen=${allowFull}`);
      const stageBtn = await page.locator('[data-testid="player-fullscreen-toggle"]').count();
      check('G-4b: shell stage fullscreen button present', stageBtn === 1);

      let frame = null;
      for (let i = 0; i < 20 && !frame; i++) {
        frame = srcdocFrame(page);
        if (!frame) await page.waitForTimeout(250);
      }
      if (frame) {
        let probe = { marker: 'pending', net: 'unknown' };
        for (let i = 0; i < 20; i++) {
          probe = await frame.evaluate(() => ({
            marker: document.querySelector('#marker')?.textContent ?? null,
            net: document.querySelector('#net')?.textContent ?? null,
          }));
          if (probe.marker === 'ran' && probe.net === 'blocked') break;
          await page.waitForTimeout(250);
        }
        check('S2b: inline script RUNS on trusted rows', probe.marker === 'ran', `marker=${probe.marker}`);
        check('S2c: external fetch BLOCKED by CSP (G-3)', probe.net === 'blocked', `net=${probe.net}`);

        const metaCount = await frame.evaluate(() =>
          document.querySelectorAll('meta[data-cms-injected="true"]').length);
        check('S4b: exactly ONE injected meta after backend+client (idempotent)', metaCount === 1, `count=${metaCount}`);
      }
      await page.screenshot({ path: `${SHOT_DIR}/w13.1-375-interactive.png` });
      await context.close();
    }

    // ===== S3 — broken HTML: error state + retry (G-5) =====
    {
      let serve = 'fail';
      const context = await newContext(browser, { width: 375, height: 812 }, {
        enableScripts: true,
        serveContent: async () => serve,
        metaMode: 'none',
      });
      const page = await context.newPage();
      // The broken flow NEVER reaches the frame — assert from the shell instead.
      await openHtmlShell(page);

      const errorBox = page.locator('[data-testid="library-html-player-error"]');
      await errorBox.waitFor({ state: 'visible', timeout: 15_000 });
      check('S3a: broken content → error state (G-5)', await errorBox.isVisible());

      const retryText = await errorBox.locator('button').first().textContent();
      check('S3b: retry button present (إعادة المحاولة)', (retryText ?? '').includes('إعادة المحاولة'));

      serve = 'ok'; // the retry must recover without a shell remount
      await errorBox.locator('button').first().click();
      await page.locator('[data-testid="library-html-player-frame"]').waitFor({ state: 'attached', timeout: 15_000 });
      check('S3c: retry recovers the player (reload token, no remount)', true);
      await page.screenshot({ path: `${SHOT_DIR}/w13.1-375-recovered.png` });
      await context.close();
    }

    // ===== S6 — injector idempotency, live in the browser via Vite =====
    {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
      const doubled = await page.evaluate(async () => {
        const mod = await import('/src/features/media-player/html/html-csp.ts');
        const doc = '<html><head><title>t</title></head><body></body></html>';
        const once = mod.injectCspMeta(doc, true);
        const twice = mod.injectCspMeta(once, true);
        return {
          onceCount: (once.match(/data-cms-injected/g) ?? []).length,
          twiceCount: (twice.match(/data-cms-injected/g) ?? []).length,
        };
      });
      check('S6a: single inject → 1 meta', doubled.onceCount === 1, JSON.stringify(doubled));
      check('S6b: re-inject (re-upload contract) → still 1 meta (no duplication)',
        doubled.twiceCount === 1, JSON.stringify(doubled));
      await context.close();
    }

    // ===== §13 matrix — one interactive-player screenshot per requested width =====
    for (const width of WIDTHS) {
      if (!Number.isFinite(width) || width <= 0) continue;
      const context = await newContext(browser, { width, height: Math.round(width * 2.1) }, {
        enableScripts: true,
        serveContent: async () => 'ok',
        metaMode: 'backend',
      });
      const page = await context.newPage();
      try {
        await openHtmlPlayer(page);
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${SHOT_DIR}/w13.1-${width}-matrix.png` });
        check(`§13 matrix ${width}px: player opens + screenshot`, true);
      } catch (error) {
        check(`§13 matrix ${width}px: player opens + screenshot`, false, String(error).slice(0, 120));
      } finally {
        await context.close();
      }
    }

    // ===== S5 — backend -ready contract =====
    skip('S5: backend FileUrl ends with -ready',
      'not assertable in a route-mocked harness (the client sees /content only) — covered by 13.A unit tests (FileUrl swap + Ready status) and CI');

    check('G-3/G-1 evidence: browser reported the sandbox + CSP blocks',
      securityBlocks.some((t) => t.includes("'allow-scripts' permission is not set"))
      && securityBlocks.some((t) => t.includes("connect-src 'none'")),
      `${securityBlocks.length} block report(s)`);

    if (consoleErrors.length) check('console clean (unexpected errors only)', false, consoleErrors.slice(0, 3).join(' | '));
    else check('console clean (unexpected errors only)', true);
    if (pageErrors.length) check('no page errors', false, pageErrors.slice(0, 3).join(' | '));
    else check('no page errors', true);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n==== w13.1-html E2E: ${results.length - failed.length}/${results.length} checks passed ====\n`);
  if (failed.length) {
    process.exitCode = 1;
    failed.forEach((f) => console.log(`FAILED: ${f.name} — ${f.extra}`));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
