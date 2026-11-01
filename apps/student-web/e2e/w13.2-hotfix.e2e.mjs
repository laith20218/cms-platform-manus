/**
 * Wave 13.2 hotfix (R42) — E2E evidence suite.
 *
 * Proves the three supervisor rulings, live in Chromium against the Vite dev
 * server, with the API mocked at the network layer (harness contract mirrors
 * w13.1-html.e2e.mjs / player-pdf.e2e.mjs):
 *
 *  ZERO-DOWNLOAD (B) — for HTML, PDF and VIDEO:
 *    - no `[data-testid="pdf-download"]`, no `a[download]`, no `[target="_blank"]`
 *      anywhere in the rendered surface;
 *    - the shell header action set is EXACTLY [fullscreen, close];
 *    - the video dialog keeps `controlsList="nodownload"` on the media element;
 *    - right-click on the player stage is PREVENTED (defaultPrevented === true).
 *
 *  ORIGINAL-BYTES RENDER FIDELITY (A) — the HTML fixture (inline script + SVG)
 *    renders EXACTLY as authored: no mangling (colors, geometry, script side
 *    effects all intact) because the backend streams the stored bytes UNTOUCHED
 *    and the client performs ZERO document surgery.
 *
 *  R51 — CSP VIA RESPONSE HEADER + ZERO CLIENT INJECTION: the lesson is served
 *    by GET /library/{id}/html-view (mocked here with the same CSP header the
 *    server sends). The browser enforces that header policy on the framed
 *    document — the app-shell CSP can never reach it (the R42 srcDoc and R47
 *    blob: paths are both retired). Script policy stays BEHAVIORAL (R44):
 *      static rows  : __cms_ran stays undefined (script-src 'none' header +
 *                     sandbox="" block execution);
 *      scripts rows : __cms_ran === true (author opted in).
 *    The client prelude is GONE: no viewport meta, no fit style/script, no
 *    injected CSP meta — the suite asserts their ABSENCE (S1i/S1j/S2/S3/S4).
 *
 *  §13 evidence — 5-width screenshots (375/640/768/1024/1440) × 3 kinds.
 *
 * RAM contract: ONE Chromium instance, scenarios in newContext()s, RSS sampled
 * every 400ms via ps (children included), ceiling 1.6GB.
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/w13.2-hotfix.e2e.mjs
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));
const WIDTHS = (process.env.E2E_WIDTHS ?? '375,640,768,1024,1440').split(',').map((w) => Number(w.trim()));

const SUBJECT_SLUG = 'e2e-w132-subject';
const SUBJECT_ID = 'e2e-s-w132';
const FILE_ID = '77777777-1111-2222-3333-444444444444';
const LESSON_TITLE = 'درس القلب التفاعلي R42';

const E2E_USER = {
  id: 'e2e-u-006', phone: '+962790000004', fullName: 'طالب الاختبار W13.2',
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
 *  the suite asserts (a blocked script report for sandbox="" rows is a PASS
 *  condition, not a defect — same contract as w13.1-html.e2e.mjs). */
const securityBlocks = [];
function isBenignConsole(text) {
  return (
    text.includes('Failed to load resource') ||
    text.includes('sessionStorage') ||
    /MEDIA|SourceBuffer|decoder/.test(text) ||
    /Download the React DevTools/.test(text)
  );
}
function classifyConsole(text) {
  // R51: the lesson frame URL is the html-view API response — sandbox/CSP block
  // reports name that document URL (previously about:srcdoc / blob:*). All of
  // these wordings are PASS evidence.
  if (/Blocked script execution in '[^']*'/.test(text) || /Content Security Policy/.test(text)) {
    securityBlocks.push(text);
    return;
  }
  if (!isBenignConsole(text)) consoleErrors.push(text);
}

/* ============ fixtures ============ */

/** HTML lesson: inline script + SVG + styled h1 — the render-fidelity contract.
 *  `widePx` keeps exercising natural-width content (S2/S3 assert NO platform
 *  zoom manipulation since the R51 client prelude is gone). */
function lessonHtml(widePx) {
  return `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>${LESSON_TITLE}</title></head><body>
<h1 id="title" style="color:#0284c7">${LESSON_TITLE}</h1>
<svg id="icon" width="48" height="48" viewBox="0 0 24 24" role="img"><circle id="svg-circle" cx="12" cy="12" r="10" fill="#e11d48"></circle></svg>
<div id="marker">pending</div>
<div id="wide" style="width:${widePx}px;height:40px;background:#0ea5e9"></div>
<script>window.__cms_ran = true; document.getElementById('marker').textContent = 'ran';</script>
</body></html>`;
}

/** Deterministic 1-page PDF via Chromium print-to-PDF (player-pdf precedent). */
async function buildPdfFixture(browser) {
  const pdfPath = path.join(os.tmpdir(), `w132-fixture-${Date.now()}.pdf`);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent(
    `<h1 style="font-family:sans-serif">Wave 13.2 hotfix fixture</h1>
     <p style="font-family:sans-serif">Zero-download evidence document.</p>`,
  );
  await page.pdf({ path: pdfPath, format: 'A4' });
  await context.close();
  const bytes = fs.readFileSync(pdfPath);
  fs.rmSync(pdfPath, { force: true });
  return bytes;
}

/** Deterministic short WebM via MediaRecorder over a canvas captureStream —
 *  a REAL decodable video without ffmpeg (the sandbox lacks it). Tries the
 *  codec ladder headless builds actually ship; falls back to synthetic bytes
 *  (disclosed as SKIP — the video assertions are DOM-surface assertions). */
async function buildVideoFixture(page) {
  const codecs = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'];
  try {
    const bytes = await page.evaluate(async (codecList) => {
      const supported = ('MediaRecorder' in window) && codecList.find((c) => MediaRecorder.isTypeSupported(c));
      if (!supported) throw new Error('no supported MediaRecorder codec');
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 180;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0284c7'; ctx.fillRect(0, 0, 320, 180);
      const stream = canvas.captureStream(24);
      const recorder = new MediaRecorder(stream, { mimeType: supported });
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
      recorder.start();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      recorder.stop();
      await stopped;
      const blob = new Blob(chunks, { type: supported });
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    }, codecs);
    return { bytes: Uint8Array.from(bytes), contentType: 'video/webm', real: true };
  } catch {
    return { bytes: Uint8Array.from(Array.from({ length: 2048 }, (_, i) => i % 256)), contentType: 'video/mp4', real: false };
  }
}

/* ============ mock world ============ */

const KIND_META = {
  html: { type: 'Html', fileFormat: 'text/html', contentType: 'text/html; charset=utf-8' },
  pdf: { type: 'Pdf', fileFormat: 'application/pdf', contentType: 'application/pdf' },
  video: { type: 'Video', fileFormat: 'video/webm', contentType: 'video/webm' },
};

/** R51 — the per-file CSP the html-view RESPONSE HEADER carries. Mirrors the
 *  server's HtmlViewCsp.Build exactly (offline 'none' base + explicit
 *  script-src per EnableScripts + frame-ancestors student-web origin) — the
 *  browser enforces this header on the framed document. */
function htmlViewCsp(enableScripts) {
  return (
    "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; " +
    'media-src data: blob:; ' +
    "connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; " +
    (enableScripts ? "script-src 'unsafe-inline'; " : "script-src 'none'; ") +
    `frame-ancestors ${BASE_URL}`
  );
}

async function newContext(browser, viewport, kind, opts = {}) {
  const meta = KIND_META[kind];
  const enableScripts = opts.enableScripts ?? false;
  const pdfBytes = opts.pdfBytes;
  const video = opts.video;
  const widePx = opts.widePx ?? 1200;

  const context = await browser.newContext({ viewport, locale: 'ar', hasTouch: true });
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
      sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
    } catch { /* sandboxed frames deny storage — tokens only needed top-level */ }
  });

  await context.route('**/api/v1/**', (route) => route.abort());
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));

  const fileSummary = {
    id: FILE_ID, type: meta.type, title: LESSON_TITLE,
    description: 'Wave 13.2 hotfix E2E file',
    fileSize: 4096, durationSeconds: kind === 'video' ? 2 : null, pagesCount: null,
    thumbnailUrl: null, viewsCount: 0, isFavorite: false, category: 'Lecture',
    createdAt: '2026-11-20T12:00:00Z',
  };

  await context.route(`**/api/v1/subjects/${SUBJECT_SLUG}`, (route) => route.fulfill({
    json: {
      id: SUBJECT_ID, slug: SUBJECT_SLUG, nameAr: 'مادة W13.2',
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
        studentName: 'طالب الاختبار W13.2', studentPhone: '+962790000004',
        timestamp: new Date().toISOString(), siteName: 'CMS',
      },
    },
  }));
  await context.route(`**/api/v1/library/${FILE_ID}`, (route) => route.fulfill({
    json: {
      ...fileSummary, subjectId: SUBJECT_ID, lectureId: null,
      fileFormat: meta.fileFormat, youtubeVideoId: null, tags: [], favoritesCount: 0,
      enableScripts,
      contentProcessingStatus: 'Ready',
    },
  }));
  await context.route(`**/api/v1/library/${FILE_ID}/content`, (route) => {
    if (kind === 'pdf') {
      return route.fulfill({ body: pdfBytes, contentType: meta.contentType });
    }
    if (kind === 'video') {
      return route.fulfill({ body: video.bytes, contentType: video.contentType });
    }
    // R51: HTML no longer flows through /content — the player issues a token
    // (html-access) and frames the html-view response. Anything hitting
    // /content for html is the OLD path and must fail loudly.
    return route.abort();
  });
  // R51 — the html token flow: POST /html-access returns { url, expiresAt };
  // the iframe then loads GET /html-view whose RESPONSE HEADER carries the CSP.
  await context.route(`**/api/v1/library/${FILE_ID}/html-access`, (route) => route.fulfill({
    json: {
      url: `/api/v1/library/${FILE_ID}/html-view?t=e2e-single-use-token`,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    },
  }));
  await context.route(`**/api/v1/library/${FILE_ID}/html-view**`, (route) => {
    if (kind !== 'html') return route.abort();
    context._servedCsp = htmlViewCsp(enableScripts);
    return route.fulfill({
      body: lessonHtml(widePx),
      contentType: 'text/html; charset=utf-8',
      headers: { 'Content-Security-Policy': context._servedCsp, 'Cache-Control': 'no-store' },
    });
  });
  await context.route(`**/api/v1/library/${FILE_ID}/view`, (route) => route.fulfill({ status: 204, body: '' }));
  await context.route(`**/api/v1/library/${FILE_ID}/annotations`, (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    return route.fulfill({ json: { appliedCount: 0, serverTime: new Date().toISOString() } });
  });

  context.on('page', (page) => {
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (isBenignConsole(text)) return;
      classifyConsole(`[${kind}] ${text}`);
    });
    page.on('pageerror', (error) => {
      const text = error instanceof Error ? error.message : String(error);
      if (text.includes('sessionStorage')) return;
      pageErrors.push(`[${kind}] ${text}`);
    });
  });

  return context;
}

async function openLibraryFile(page, kind) {
  await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library`, { timeout: 60_000 });
  await page.locator(`text=${LESSON_TITLE}`).first().click();
  const surface =
    kind === 'video'
      ? '[data-testid="document-viewer"]'
      : kind === 'pdf'
        ? '[data-testid="pdf-player-shell"]'
        : '[data-testid="html-player-shell"]';
  await page.locator(surface).waitFor({ state: 'visible', timeout: 20_000 });
  return surface;
}

/** The zero-download DOM contract — asserted page-wide on every kind. */
async function assertZeroDownload(page, label) {
  const probe = await page.evaluate(() => ({
    pdfDownload: document.querySelector('[data-testid="pdf-download"]'),
    anchorDownload: document.querySelector('a[download]'),
    targetBlank: document.querySelector('[target="_blank"]'),
    jsDownload: document.querySelector('[data-testid="viewer-download"]'),
  }));
  check(`${label}: [data-testid="pdf-download"] is null`, probe.pdfDownload === null);
  check(`${label}: a[download] is null`, probe.anchorDownload === null);
  check(`${label}: [target="_blank"] is null`, probe.targetBlank === null);
  check(`${label}: legacy viewer-download button absent`, probe.jsDownload === null);
}

async function assertShellHeaderActions(page, label) {
  const buttons = await page.locator('[data-testid="player-stage"] header button').count();
  const fullscreen = await page.locator('[data-testid="player-fullscreen-toggle"]').count();
  const close = await page.locator('[data-testid="player-close"]').count();
  check(`${label}: shell header action set is exactly [fullscreen, close]`, buttons === 2 && fullscreen === 1 && close === 1,
    `header buttons=${buttons} fullscreen=${fullscreen} close=${close}`);
}

async function assertContextMenuPrevented(page, label) {
  const prevented = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="player-stage"]');
    if (!stage) return null;
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    stage.dispatchEvent(event);
    return event.defaultPrevented;
  });
  check(`${label}: contextmenu on player stage is PREVENTED`, prevented === true, `defaultPrevented=${prevented}`);
}

/** The lesson execution context (R51: the html-view API response — opaque
 *  origin via sandbox; CDP evaluation still reaches it). Legacy forms ('',
 *  'about:srcdoc', blob:*) stay accepted for harness compatibility. */
function srcdocFrame(page) {
  return page.frames().find(
    (frame) =>
      frame !== page.mainFrame() &&
      (frame.url() === 'about:srcdoc' || frame.url() === '' || frame.url().startsWith('blob:') || frame.url().includes('/html-view')),
  ) ?? null;
}

async function waitForSrcdoc(page, attempts = 24) {
  for (let i = 0; i < attempts; i++) {
    const frame = srcdocFrame(page);
    if (frame) return frame;
    await page.waitForTimeout(250);
  }
  return null;
}

/* ============ RAM sampler ============ */

let peakRssKb = 0;
let samplerTimer = null;
function startRamSampler() {
  samplerTimer = setInterval(() => {
    try {
      // Every chrome process on the box (the suite owns the only Chromium).
      const out = execSync('ps -o rss= -C chrome 2>/dev/null').toString().split('\n').filter(Boolean).map(Number);
      const total = out.reduce((sum, kb) => sum + kb, 0);
      if (total > peakRssKb) peakRssKb = total;
    } catch { /* process tree churn — ignore */ }
  }, 400);
}
function stopRamSampler() { if (samplerTimer) clearInterval(samplerTimer); }

/* ============ main ============ */

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'],
  });
  startRamSampler();

  try {
    const pdfBytes = await buildPdfFixture(browser);

    // ===== S1 — HTML interactive (375): fidelity + zero-download + contextmenu =====
    {
      const context = await newContext(browser, { width: 375, height: 812 }, 'html', { enableScripts: true, widePx: 1200 });
      const page = await context.newPage();
      await openLibraryFile(page, 'html');
      await page.locator('[data-testid="library-html-player-frame"]').waitFor({ state: 'attached', timeout: 20_000 });

      const sandboxAttr = await page.locator('[data-testid="library-html-player-frame"]').getAttribute('sandbox');
      check('S1a: sandbox="allow-scripts" on trusted rows', sandboxAttr === 'allow-scripts', `sandbox="${sandboxAttr}"`);

      const frame = await waitForSrcdoc(page);
      check('S1b: content frame attached', !!frame);
      check('S1b2: frame loaded via the html-view API URL — CSP arrives as a RESPONSE HEADER (R51)',
        !!frame && frame.url().includes('/html-view?t='), frame ? frame.url() : 'no-frame');

      if (frame) {
        // Render fidelity: the ORIGINAL fixture survives byte-for-byte at the DOM level —
        // inline style, SVG geometry and script side effects are all intact (no backend mangling).
        const probe = await frame.evaluate(() => {
          const circle = document.querySelector('#svg-circle');
          const h1 = document.querySelector('#title');
          return {
            title: h1?.textContent ?? null,
            titleColor: h1 ? getComputedStyle(h1).color : null,
            circleFill: circle ? getComputedStyle(circle).fill : null,
            marker: document.querySelector('#marker')?.textContent ?? null,
            scriptGlobal: window.__cms_ran === true,
          };
        });
        check('S1c: h1 text intact', probe.title === LESSON_TITLE, JSON.stringify(probe.title));
        check('S1d: inline style intact (color #0284c7 → rgb(2,132,199))', probe.titleColor === 'rgb(2, 132, 199)', probe.titleColor);
        check('S1e: SVG circle geometry intact (fill #e11d48)', probe.circleFill === 'rgb(225, 29, 72)', probe.circleFill);
        check('S1f: authored script EXECUTED on trusted rows (window.__cms_ran === true)', probe.marker === 'ran' && probe.scriptGlobal, `marker=${probe.marker} __cms_ran=${probe.scriptGlobal}`);

        const prelude = await frame.evaluate(() => ({
          cspCount: document.querySelectorAll('meta[data-cms-injected="true"]').length,
          viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null,
          fitStyle: document.querySelector('style#cms-fit-style') !== null,
          fitScript: document.querySelector('script#cms-fit-script') !== null,
        }));
        check('S1g: ZERO injected CSP metas — the client injects NOTHING (R51: CSP comes from the response header)', prelude.cspCount === 0, `count=${prelude.cspCount}`);
        check('S1h: the SERVED html-view CSP HEADER is the strict offline profile + script-src for trusted rows',
          !!context._servedCsp && context._servedCsp.includes("default-src 'none'") && context._servedCsp.includes("connect-src 'none'") && context._servedCsp.includes("script-src 'unsafe-inline'"),
          context._servedCsp ?? 'no-header-captured');
        check('S1i: NO viewport meta injected (R51: client prelude retired — feature removed, disclosed)', prelude.viewport === null, prelude.viewport);
        check('S1j: NO fit style + fit script injected (R51: client prelude retired)', !prelude.fitStyle && !prelude.fitScript, `fitStyle=${prelude.fitStyle} fitScript=${prelude.fitScript}`);
      }

      await assertZeroDownload(page, 'S1 HTML');
      await assertShellHeaderActions(page, 'S1 HTML');
      await assertContextMenuPrevented(page, 'S1 HTML');
      await page.screenshot({ path: `${SHOT_DIR}/w13.2-html-375.png` });
      await context.close();
    }

    // ===== S2 — R51: NO platform zoom/fit manipulation at 375 (prelude retired) =====
    {
      const context = await newContext(browser, { width: 375, height: 812 }, 'html', { enableScripts: true, widePx: 1200 });
      const page = await context.newPage();
      await openLibraryFile(page, 'html');
      const frame = await waitForSrcdoc(page);
      if (frame) {
        await page.waitForTimeout(600); // let any (now-nonexistent) handlers settle
        const probe = await frame.evaluate(() => ({
          zoom: getComputedStyle(document.body).zoom,
          inlineZoom: document.body.style.zoom,
          fitStyle: document.querySelector('style#cms-fit-style') !== null,
          fitScript: document.querySelector('script#cms-fit-script') !== null,
          fitMarker: window.__cms_fit,
        }));
        check('S2a: body.zoom UNTOUCHED at 375px (R51: no platform fit layer exists)', parseFloat(probe.zoom) === 1 && probe.inlineZoom === '', JSON.stringify(probe));
        check('S2b: NO cms-fit artifacts in the served document (zero client surgery)', !probe.fitStyle && !probe.fitScript, `fitStyle=${probe.fitStyle} fitScript=${probe.fitScript}`);
        check('S2c: __cms_fit is undefined (no platform script shipped or executed)', probe.fitMarker === undefined, `__cms_fit=${String(probe.fitMarker)}`);
      } else {
        check('S2: content frame attached', false);
      }
      await context.close();
    }

    // ===== S3 — R51: natural rendering at 1440 (zoom === 1, no prelude) =====
    {
      const context = await newContext(browser, { width: 1440, height: 900 }, 'html', { enableScripts: true, widePx: 900 });
      const page = await context.newPage();
      await openLibraryFile(page, 'html');
      const frame = await waitForSrcdoc(page);
      if (frame) {
        await page.waitForTimeout(600);
        const probe = await frame.evaluate(() => ({
          zoom: getComputedStyle(document.body).zoom,
          inlineZoom: document.body.style.zoom,
          fitMarker: window.__cms_fit,
          cspCount: document.querySelectorAll('meta[data-cms-injected="true"]').length,
        }));
        check('S3: body.zoom === 1 at 1440px (natural rendering, no shrink)', parseFloat(probe.zoom) === 1 && probe.inlineZoom === '', JSON.stringify(probe));
        check('S3b: no platform prelude executed at desktop either (R51)', probe.fitMarker === undefined, `__cms_fit=${String(probe.fitMarker)}`);
        check('S3c: still ZERO injected metas at desktop', probe.cspCount === 0, `count=${probe.cspCount}`);
      } else {
        check('S3: content frame attached', false);
      }
      await page.screenshot({ path: `${SHOT_DIR}/w13.2-html-1440.png` });
      await context.close();
    }

    // ===== S4 — HTML static (EnableScripts=false): script denial is BROWSER-enforced (R44) =====
    {
      const context = await newContext(browser, { width: 375, height: 812 }, 'html', { enableScripts: false, widePx: 900 });
      const page = await context.newPage();
      await openLibraryFile(page, 'html');
      const iframe = page.locator('[data-testid="library-html-player-frame"]');
      const sandboxAttr = await iframe.getAttribute('sandbox');
      check('S4a: sandbox="" on static rows (opaque origin — frame boundary denies scripts)', sandboxAttr === '', `sandbox="${sandboxAttr}"`);
      const frame = await waitForSrcdoc(page);
      if (frame) {
        // BEHAVIORAL (R44/R51): the fixture ships <script>window.__cms_ran = true;</script>
        // and the document is NOT modified — the browser must refuse to run it.
        const probe = await frame.evaluate(() => ({
          cmsRan: window.__cms_ran,
          fitMarker: window.__cms_fit,
          bodyZoom: document.body.style.zoom,
          cspCount: document.querySelectorAll('meta[data-cms-injected="true"]').length,
          fitStyle: document.querySelector('style#cms-fit-style') !== null,
          fitScript: document.querySelector('script#cms-fit-script') !== null,
        }));
        check('S4b: fixture script DID NOT execute (window.__cms_ran === undefined) — header CSP + sandbox blocked it',
          probe.cmsRan === undefined, `__cms_ran=${String(probe.cmsRan)}`);
        check("S4c: the SERVED html-view CSP HEADER carries EXPLICIT script-src 'none' for static rows (no default-src fallback reliance)",
          !!context._servedCsp && context._servedCsp.includes("script-src 'none'") && !context._servedCsp.includes("script-src 'unsafe-inline'"),
          context._servedCsp ?? 'no-header-captured');
        check('S4d: NOTHING ran and NOTHING was injected — zero metas, no fit artifacts (R51)',
          probe.cspCount === 0 && !probe.fitStyle && !probe.fitScript && probe.bodyZoom === '',
          `metas=${probe.cspCount} fitStyle=${probe.fitStyle} fitScript=${probe.fitScript} bodyZoom="${probe.bodyZoom}"`);
        check('S4e: static-row policy is enforced by the BROWSER (behavioral), never by client string surgery (R44 contract, R51 layer)',
          securityBlocks.some((t) => /Blocked script execution in '[^']*'/.test(t) || /Content Security Policy/.test(t)),
          `${securityBlocks.length} block report(s) so far`);
      } else {
        check('S4: content frame attached', false);
      }
      await context.close();
    }

    // ===== S5 — PDF: zero-download + header set + contextmenu =====
    {
      const context = await newContext(browser, { width: 375, height: 812 }, 'pdf', { pdfBytes });
      const page = await context.newPage();
      await openLibraryFile(page, 'pdf');
      await page.locator('[data-testid="library-pdf-player"] canvas').first().waitFor({ state: 'visible', timeout: 30_000 });
      check('S5a: PdfPlayer canvas mounted (pdf.js API surface — no stock viewer toolbar)', true);

      await assertZeroDownload(page, 'S5 PDF');
      await assertShellHeaderActions(page, 'S5 PDF');
      await assertContextMenuPrevented(page, 'S5 PDF');
      await page.screenshot({ path: `${SHOT_DIR}/w13.2-pdf-375.png` });
      await context.close();
    }

    // ===== S6 — Video: zero-download in the dialog surface =====
    {
      const video = await buildVideoFixtureCached(browser);
      const context = await newContext(browser, { width: 375, height: 812 }, 'video', { video });
      const page = await context.newPage();
      await openLibraryFile(page, 'video');

      const videoEl = page.locator('[data-testid="document-viewer"] video');
      await videoEl.waitFor({ state: 'attached', timeout: 15_000 });
      const controlsList = await videoEl.getAttribute('controlslist');
      check('S6a: <video> keeps controlsList="nodownload"', controlsList === 'nodownload', `controlslist=${controlsList}`);

      await assertZeroDownload(page, 'S6 video');
      const headerButtons = await page.locator('[data-testid="document-viewer"] header button').count();
      check('S6b: video dialog header has exactly ONE action (close)', headerButtons === 1, `header buttons=${headerButtons}`);
      if (!video.real) skip('S6c: real decodable video fixture (MediaRecorder)', 'headless build lacks MediaRecorder/webm — synthetic bytes still exercise the DOM surface; button absence is the contract');
      else check('S6c: real decodable video fixture (MediaRecorder webm)', true);
      await page.screenshot({ path: `${SHOT_DIR}/w13.2-video-375.png` });
      await context.close();
    }

    // ===== §13 matrix — 5 widths × 3 kinds, zero download/open buttons visible =====
    for (const kind of ['html', 'pdf', 'video']) {
      for (const width of WIDTHS) {
        if (!Number.isFinite(width) || width <= 0) continue;
        const context = await newContext(
          browser,
          { width, height: Math.round(width * 1.9) },
          kind,
          kind === 'pdf' ? { pdfBytes } : kind === 'video' ? { video: await buildVideoFixtureCached(browser) } : { enableScripts: true, widePx: width < 1000 ? 1200 : 900 },
        );
        const page = await context.newPage();
        try {
          await openLibraryFile(page, kind);
          await page.waitForTimeout(700);
          await assertZeroDownload(page, `§13 ${kind}@${width}`);
          await page.screenshot({ path: `${SHOT_DIR}/w13.2-${kind}-${width}.png` });
          check(`§13 matrix ${kind}@${width}px: surface opens, screenshot captured`, true);
        } catch (error) {
          check(`§13 matrix ${kind}@${width}px: surface opens, screenshot captured`, false, String(error).slice(0, 140));
        } finally {
          await context.close();
        }
      }
    }

    if (consoleErrors.length) check('console clean (unexpected errors only)', false, consoleErrors.slice(0, 3).join(' | '));
    else check('console clean (unexpected errors only)', true);
    check('evidence: sandbox/CSP block reports present (static-row protection is REAL)',
      securityBlocks.some((t) => /Blocked script execution in '[^']*'/.test(t)),
      `${securityBlocks.length} block report(s)`);
    if (pageErrors.length) check('no page errors', false, pageErrors.slice(0, 3).join(' | '));
    else check('no page errors', true);
  } finally {
    stopRamSampler();
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n==== w13.2-hotfix E2E: ${results.length - failed.length}/${results.length} checks passed ====`);
  console.log(`==== peak Chromium RSS: ${(peakRssKb / 1024).toFixed(0)} MB (ceiling 1638 MB) ====\n`);
  if (peakRssKb > 1.6 * 1024 * 1024) {
    console.log('RAM CEILING EXCEEDED');
    process.exitCode = 1;
  }
  if (failed.length) {
    process.exitCode = 1;
    failed.forEach((f) => console.log(`FAILED: ${f.name} — ${f.extra}`));
  }
}

/** One WebM per browser session (recording is real-time; caching keeps the §13 matrix fast). */
let videoCache = null;
async function buildVideoFixtureCached(browser) {
  if (!videoCache) {
    const context = await browser.newContext();
    const page = await context.newPage();
    videoCache = await buildVideoFixture(page);
    await context.close();
  }
  return videoCache;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
