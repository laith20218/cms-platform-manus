/**
 * Wave 11.8 / F2 (Phase 1) — PdfPlayer E2E (real PDF engine, mocked API at the
 * network layer).
 *
 * Drives the PRODUCTION library route (/subjects/:slug/library → LibraryPage →
 * DocumentViewer → PlayerShell kind="pdf" → code-split PdfPlayer) with a PDF
 * file: pdf.js canvas + selectable text layer + annotation toolbar (pointer /
 * highlighter / pen), page navigation, zoom, and server-persisted annotations.
 *
 * RAM contract (hard rule §4): ONE Chromium instance, --headless=new
 * --disable-gpu --disable-dev-shm-usage, scenarios in browser.newContext()s,
 * browser closed immediately. Ceiling 1.6GB — sampled at 400ms via ps.
 *
 * The fixture is a REAL 2-page PDF with ARABIC + English body text, generated
 * deterministically at spec start by Chromium's print-to-PDF (page.pdf()) —
 * no ffmpeg, git-ignored, and it carries genuine embedded Arabic glyphs, so
 * the "pdfjs renders Arabic correctly" stop gate is exercised, not assumed:
 * S2 asserts non-blank canvas pixels, S3 asserts the text layer extracts
 * Arabic strings from the same pages.
 *
 * The API is mocked at the network layer. The annotation store lives in the
 * Node process and SHARED across contexts, so the S9 refresh scenario proves
 * end-to-end persistence (save → reopen → hydrate → render), exactly what the
 * FileAnnotations table contract promises.
 *
 * Protection contract (supervisor D2) is asserted where it matters: text
 * selection inside the layer works (it powers the highlighter), while copy
 * (S6) and contextmenu (S6b) stay blocked.
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/player-pdf.e2e.mjs
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));

const SUBJECT_SLUG = 'e2e-pdf-subject';
const SUBJECT_ID = 'e2e-s-pdf';
const FILE_ID = '55555555-1111-2222-3333-444444444444';

const E2E_USER = {
  id: 'e2e-u-004', phone: '+962790000002', fullName: 'طالب الاختبار PDF',
  role: 'student', avatarUrl: null,
  university: { id: 'u-1', nameAr: 'جامعة الاختبار' }, college: { id: 'c-1', nameAr: 'كلية الطب' },
};

/** JWT-shaped token their parser accepts (segment 0 = base64url JSON payload). */
const ENTITLEMENT_TOKEN = [
  Buffer.from(JSON.stringify({ expiresAt: new Date(Date.now() + 3600_000).toISOString() })).toString('base64url'),
  'e2e', 'sig',
].join('.');

/* ============ deterministic Arabic PDF fixture (Chromium print) ============ */

const FIXTURE_PATH = fileURLToPath(new URL('../public/e2e-test-doc.pdf', import.meta.url));

async function ensurePdfFixture(browser) {
  if (fs.existsSync(FIXTURE_PATH)) return fs.statSync(FIXTURE_PATH).size;
  const context = await browser.newContext();
  const page = await context.newPage();
  // Two A4 pages; page 1 = Arabic anatomy notes + an English line, page 2 =
  // a marker heading. Print-to-PDF embeds real shaped Arabic glyphs AND a
  // text layer — exactly the production document profile.
  await page.setContent(`
    <html><head><meta charset="utf-8"><style>
      @page { size: A4; margin: 18mm; }
      body { font-family: 'Noto Naskh Arabic', 'DejaVu Sans', sans-serif; font-size: 14px; line-height: 2; }
      .page2 { page-break-before: always; }
    </style></head><body>
      <h1>التشخيص الطبي التفريقي</h1>
      <p>يعتمد التشخيص التفريقي على جمع التاريخ المرضي بدقة ثم الفحص السريري المتكامل قبل الطلبات المخبرية.</p>
      <p>أعراض hallmark للأERC: ألم صدري ضاغط مع تعرق بارد وضيق نفس مستمر أكثر من عشرين دقيقة.</p>
      <p>Differential Diagnosis — Page One (English anchor line).</p>
      <div class="page2">
        <h1>الصفحة الثانية</h1>
        <p>علاج الوحدة القلبية: إعطاء الأسبرين والنترات تحت اللسان ومراقبة تخطيط القلب المتواصل.</p>
      </div>
    </body></html>`, { waitUntil: 'networkidle' });
  await page.pdf({ path: FIXTURE_PATH, format: 'A4', printBackground: true });
  await context.close();
  return fs.statSync(FIXTURE_PATH).size;
}

/* ============ harness ============ */

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? '  PASS' : '! FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

function waitFor(fn, { timeoutMs = 6000, intervalMs = 100 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      try {
        const v = fn();
        if (v) return resolve(v);
      } catch (_) { /* treat throw as not-ready */ }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('waitFor timeout'));
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

const consoleErrors = [];
const pageErrors = [];

// Peak Chromium RSS sampler (400ms cadence) — §4.
let peakChromeRssKb = 0;
const rssSampler = setInterval(() => {
  try {
    const kb = Number(execSync("ps -C chrome --no-headers -o rss= 2>/dev/null | awk '{s+=$1} END {print s+0}'", { stdio: ['ignore', 'pipe', 'ignore'] }));
    if (kb > peakChromeRssKb) peakChromeRssKb = kb;
  } catch { /* ps raced with process exit */ }
}, 400);

/** Annotation store — the "database" shared across contexts (persistence). */
const annotationStore = new Map();
const counters = {
  accessPosts: 0,
  contentGets: 0,
  annotationGets: 0,
  annotationBatches: [],
  viewPosts: 0,
};

async function newPdfContext(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'ar', hasTouch: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
  await context.addInitScript(() => {
    sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
  });

  // Catch-all FIRST (lowest priority): any unmocked /api/v1 call aborts cleanly.
  await context.route('**/api/v1/**', (route) => route.abort());
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));

  const fileSummary = {
    id: FILE_ID, type: 'Pdf', title: 'محاضرة PDF تجريبية',
    description: 'مستند تجريبي لمشغّل PDF — تظليل وحبر وتنقّل',
    fileSize: fs.existsSync(FIXTURE_PATH) ? fs.statSync(FIXTURE_PATH).size : 50_000,
    durationSeconds: null, pagesCount: 2,
    thumbnailUrl: null, viewsCount: 1, isFavorite: false, category: 'Curriculum',
    createdAt: '2026-10-30T12:00:00Z',
  };

  await context.route(`**/api/v1/subjects/${SUBJECT_SLUG}`, (route) => route.fulfill({
    json: {
      id: SUBJECT_ID, slug: SUBJECT_SLUG, nameAr: 'مادة PDF التجريبية',
      color: null, totalQuestions: 0, totalLectures: 0, totalFiles: 1,
      totalExams: 0, lastContentUpdatedAt: null, userProgress: null, contentScopes: ['LecturesText'],
      description: null,
    },
  }));

  await context.route(`**/api/v1/library/subject/${SUBJECT_ID}**`, (route) => route.fulfill({
    json: { items: [fileSummary], total: 1, page: 1, pageSize: 20, totalPages: 1 },
  }));

  await context.route(`**/api/v1/library/${FILE_ID}/access`, async (route) => {
    counters.accessPosts += 1;
    await route.fulfill({
      json: {
        accessUrl: `${BASE_URL}/e2e-test-doc.pdf`,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        watermark: {
          studentName: 'طالب الاختبار PDF', studentPhone: '+962790000002',
          timestamp: new Date().toISOString(), siteName: 'CMS',
        },
      },
    });
  });

  await context.route(`**/api/v1/library/${FILE_ID}`, (route) => route.fulfill({
    json: {
      ...fileSummary, subjectId: SUBJECT_ID, lectureId: null,
      fileFormat: 'application/pdf', youtubeVideoId: null, tags: [], favoritesCount: 0,
    },
  }));

  // The same-origin /content reader channel — serves the real fixture bytes.
  await context.route(`**/api/v1/library/${FILE_ID}/content`, async (route) => {
    counters.contentGets += 1;
    await route.fulfill({
      body: fs.readFileSync(FIXTURE_PATH),
      contentType: 'application/pdf',
      headers: { 'Cache-Control': 'private, max-age=120' },
    });
  });

  await context.route(`**/api/v1/library/${FILE_ID}/view`, async (route) => {
    counters.viewPosts += 1;
    await route.fulfill({ status: 204, body: '' });
  });

  // GET: the caller's own annotations (owner-scoped server-side; in the mock
  // there is exactly one student).
  await context.route(`**/api/v1/library/${FILE_ID}/annotations`, async (route) => {
    if (route.request().method() === 'GET') {
      counters.annotationGets += 1;
      return route.fulfill({ json: Array.from(annotationStore.values()) });
    }
    const body = route.request().postDataJSON();
    counters.annotationBatches.push(body);
    let applied = 0;
    for (const upsert of body.upserts ?? []) {
      annotationStore.set(upsert.id, { ...upsert, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      applied += 1;
    }
    for (const id of body.deletedIds ?? []) {
      if (annotationStore.delete(id)) applied += 1;
    }
    return route.fulfill({ json: { appliedCount: applied, serverTime: new Date().toISOString() } });
  });

  context.on('page', (page) => {
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => {
      const text = error instanceof Error ? error.message : String(error);
      // Benign: the auth init script fires once on the pre-navigation about:blank
      // document, where sessionStorage is denied by design. Same class of noise
      // the other player specs simply never observe.
      if (text.includes('sessionStorage') && text.includes('Access is denied')) return;
      pageErrors.push(text);
    });
  });

  return { context };
}

/** Navigate to the library page and open the PDF in the player shell.
 *  Resolves once page 1 is PAINTED (canvas) and its text layer extracted. */
async function openPdfPlayer(page) {
  // Generous navigation bound: CI runners and busy dev servers can stall the
  // initial document well past the 30s default (observed on 4GB sandboxes).
  await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library`, { timeout: 60_000 });
  await page.locator('text=محاضرة PDF تجريبية').first().click();
  await page.locator('[data-testid="pdf-player-shell"]').waitFor({ state: 'visible', timeout: 20_000 });
  try {
    await page.locator('[data-testid="pdf-controls-bar"]').waitFor({ state: 'visible', timeout: 20_000 });
    await page.locator('[data-testid="pdf-page-1"] canvas').waitFor({ state: 'visible', timeout: 30_000 });
    // Text layer extraction completes AFTER the paint — wait for real spans.
    await page.locator('[data-pdf-text-layer] > span').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(300);
  } catch (error) {
    // Failure forensics: screenshot FIRST (works even if the page JS is stuck).
    await page.screenshot({ path: `${SHOT_DIR}/debug-open-failure.png`, fullPage: false }).catch(() => {});
    const state = await Promise.race([
      page.evaluate(() => ({
        url: window.location.href,
        controls: !!document.querySelector('[data-testid="pdf-controls-bar"]'),
        playerError: document.body.innerHTML.includes('تعذّر تحميل ملف PDF'),
        canvases: document.querySelectorAll('canvas').length,
        contentSnippet: document.querySelector('[data-testid="player-content"]')?.textContent?.slice(0, 200) ?? 'NO player-content',
        sessionStorageOk: (() => { try { return !!window.sessionStorage.getItem('cms-access-token'); } catch (e) { return `DENIED: ${e.message}`; } })(),
      })),
      new Promise((resolve) => setTimeout(() => resolve({ evaluateHung: true }), 5000)),
    ]);
    console.error('OPEN FAILED — player state:', JSON.stringify(state, null, 2));
    throw error;
  }
}

/** Locates a WIDE text-layer span on page 1 — Arabic PDFs fragment text into
 *  per-glyph spans (4px wide); a drag needs a real multi-letter run. */
async function wideSpanBox(page) {
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('[data-testid="pdf-page-1"] [data-pdf-text-layer] > span'));
    const wide = spans.find((s) => {
      const r = s.getBoundingClientRect();
      return r.width > 60 && r.height > 8 && r.y > 0;
    });
    if (!wide) return null;
    const r = wide.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

function viewportFor(name) {
  return name === 'mobile'
    ? { width: 390, height: 844 }
    : { width: 1280, height: 800 };
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: [
      '--headless=new',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
  });

  try {
    const fixtureBytes = await ensurePdfFixture(browser);
    check('F0 deterministic Arabic PDF fixture generated (Chromium print)', fixtureBytes > 1000, `${fixtureBytes} bytes`);

    /* ============ S1 — shell, toolbar completeness (supervisor D4) ============ */
    {
      const { context } = await newPdfContext(browser, viewportFor('desktop'));
      const page = await context.newPage();
      await openPdfPlayer(page);

      const toolbar = {
        tools: await page.locator('[data-testid="pdf-tool-pointer"], [data-testid="pdf-tool-highlighter"], [data-testid="pdf-tool-pen"]').count(),
        pageInput: await page.locator('[data-testid="pdf-page-input"]').count(),
        pagePrev: await page.locator('[data-testid="pdf-page-prev"]').count(),
        pageNext: await page.locator('[data-testid="pdf-page-next"]').count(),
        zoomIn: await page.locator('[data-testid="pdf-zoom-in"]').count(),
        zoomOut: await page.locator('[data-testid="pdf-zoom-out"]').count(),
        zoomFit: await page.locator('[data-testid="pdf-zoom-fit"]').count(),
        colorTrigger: await page.locator('[data-testid="pdf-color-trigger"]').count(),
      };
      const pageCount = await page.locator('[data-page-number]').count();

      check(
        'S1 shell + FULL toolbar (tools, page nav, zoom, color picker, 2 pages)',
        toolbar.tools === 3 && toolbar.pageInput === 1 && toolbar.pagePrev === 1 && toolbar.pageNext === 1
          && toolbar.zoomIn === 1 && toolbar.zoomOut === 1 && toolbar.zoomFit === 1 && pageCount === 2,
        `tools=${toolbar.tools} nav=${toolbar.pageInput}/${toolbar.pagePrev}/${toolbar.pageNext} zoom=${toolbar.zoomIn}/${toolbar.zoomOut}/${toolbar.zoomFit} pages=${pageCount}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/pdf-s1-shell.png` });

      // Pen tool exposes the thickness slider + palette (D4).
      await page.locator('[data-testid="pdf-tool-pen"]').click();
      const penExtras = {
        thickness: await page.locator('[data-testid="pdf-pen-thickness"]').count(),
        color: await page.locator('[data-testid="pdf-color-trigger"]').count(),
      };
      check('S1b pen tool reveals thickness slider + color palette', penExtras.thickness === 1 && penExtras.color === 1,
        `thickness=${penExtras.thickness} color=${penExtras.color}`);

      await page.screenshot({ path: `${SHOT_DIR}/pdf-s1b-pen.png` });
      await context.close();
    }

    /* ============ S2/S3 — engine: Arabic render + text layer ============ */
    {
      const { context } = await newPdfContext(browser, viewportFor('desktop'));
      const page = await context.newPage();
      await openPdfPlayer(page);

      // S2: canvas pixels are non-uniform (real glyph rasterization).
      const pixelStats = await page.evaluate(() => {
        const canvas = document.querySelector('[data-testid="pdf-page-1"] canvas');
        if (!canvas) return null;
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;
        const data = ctx.getImageData(Math.floor(width * 0.1), Math.floor(height * 0.1), Math.floor(width * 0.6), Math.floor(height * 0.35)).data;
        let nonWhite = 0;
        const total = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) nonWhite += 1;
        }
        return { nonWhite, total };
      });
      check(
        'S2 canvas painted with real content (non-blank pixel sampling)',
        !!pixelStats && pixelStats.nonWhite > 200,
        `nonWhite=${pixelStats?.nonWhite}/${pixelStats?.total}`,
      );

      // S3 — ARABIC GATE: the text layer must carry extracted Arabic text.
      // pdf.js extracts Arabic as per-glyph PRESENTATION-FORM runs (U+FB50–FEFF,
      // visual order) — the logical word never appears contiguously, so the
      // honest assertion is Arabic-script presence (base block + presentation
      // forms) plus a healthy span population.
      const layerText = await page.evaluate(() => {
        const layer = document.querySelector('[data-pdf-text-layer]');
        return layer ? layer.textContent : '';
      });
      const hasArabicScript = /[\u0600-\u06FF\uFB50-\uFEFF]/.test(layerText);
      const spanCount = await page.locator('[data-pdf-text-layer] > span').count();
      check(
        'S3 ARABIC GATE — text layer extracts real Arabic (presentation forms + spans)',
        hasArabicScript && spanCount > 50,
        `hasArabicScript=${hasArabicScript} spans=${spanCount} sample=${JSON.stringify(layerText.slice(0, 24))}`,
      );

      await page.screenshot({ path: `${SHOT_DIR}/pdf-s2-render.png` });
      await context.close();
    }

    /* ============ S4 — highlighter: select → normalized rects → save ============ */
    {
      const { context } = await newPdfContext(browser, viewportFor('desktop'));
      const page = await context.newPage();
      await openPdfPlayer(page);

      await page.locator('[data-testid="pdf-tool-highlighter"]').click();
      const box = await wideSpanBox(page);
      check('S4-pre wide text-layer span located for the drag', !!box && box.width > 60, JSON.stringify(box));
      if (!box) throw new Error('no wide span found');

      await page.mouse.move(box.x + 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(400); // selection commit

      // Diagnostics: what did the drag actually select?
      const dragState = await page.evaluate(() => ({
        selection: window.getSelection()?.toString().slice(0, 40) ?? null,
        collapsed: window.getSelection()?.isCollapsed ?? null,
        rectCount: window.getSelection()?.rangeCount
          ? window.getSelection().getRangeAt(0).getClientRects().length
          : 0,
        overlays: document.querySelectorAll('[data-annotation-page="1"] rect').length,
      }));
      console.log('[S4 drag state]', JSON.stringify(dragState));

      await waitFor(() => Array.from(annotationStore.values()).some((a) => a.annotationType === 'Highlight'));
      const highlight = Array.from(annotationStore.values()).find((a) => a.annotationType === 'Highlight');
      const rects = highlight?.payload?.rects ?? [];
      const rectsValid = rects.length > 0 && rects.every((r) => r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= 1.001 && r.y + r.h <= 1.001);
      const overlayRects = await page.locator('[data-annotation-page="1"] rect.pdf-highlight, [data-annotation-page="1"] rect').count();

      check(
        'S4 highlighter commits normalized rects + renders the overlay',
        rects.length > 0 && rectsValid && overlayRects > 0,
        `rects=${rects.length} valid=${rectsValid} domRects=${overlayRects} snippet=${JSON.stringify(highlight?.payload?.textSnippet ?? '').slice(0, 30)}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/pdf-s4-highlight.png` });
      await context.close();
    }

    /* ============ S5 — pen: pointer stroke → normalized points → save ============ */
    {
      const before = Array.from(annotationStore.values()).filter((a) => a.annotationType === 'Ink').length;
      const { context } = await newPdfContext(browser, viewportFor('desktop'));
      const page = await context.newPage();
      await openPdfPlayer(page);

      await page.locator('[data-testid="pdf-tool-pen"]').click();
      const pageBox = await page.locator('[data-testid="pdf-page-1"]').boundingBox();
      const x0 = pageBox.x + pageBox.width * 0.25;
      const y0 = pageBox.y + pageBox.height * 0.3;
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      for (let i = 1; i <= 12; i += 1) {
        await page.mouse.move(x0 + i * 6, y0 + i * 4, { steps: 2 });
      }
      await page.mouse.up();
      await page.waitForTimeout(400);

      await waitFor(() => Array.from(annotationStore.values()).filter((a) => a.annotationType === 'Ink').length > before);
      const ink = Array.from(annotationStore.values()).filter((a) => a.annotationType === 'Ink').pop();
      const points = ink?.payload?.points ?? [];
      const pointsValid = points.length >= 2 && points.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
      const domPaths = await page.locator('[data-annotation-page="1"] path.pdf-ink').count();

      check(
        'S5 pen stroke persists normalized points + renders the path',
        points.length >= 2 && pointsValid && domPaths > 0 && ink.payload.width > 0,
        `points=${points.length} valid=${pointsValid} domPaths=${domPaths} width=${ink?.payload?.width}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/pdf-s5-ink.png` });
      await context.close();
    }

    /* ============ S6 — D2: selection works, copy + contextmenu blocked ============ */
    {
      const { context } = await newPdfContext(browser, viewportFor('desktop'));
      const page = await context.newPage();
      await openPdfPlayer(page);

      // Selection ALLOWED inside the layer (pointer tool).
      const box = await wideSpanBox(page);
      if (!box) throw new Error('no wide span found');
      await page.mouse.move(box.x + 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 6 });
      await page.mouse.up();
      const selected = await page.evaluate(() => window.getSelection().toString());
      check('S6a text selection ALLOWED inside the text layer (D2)', selected.trim().length > 3, `len=${selected.trim().length}`);

      // Write a sentinel; Ctrl+C must NOT overwrite it (copy handler blocks).
      const sentinel = 'sentinel-cms-e2e';
      await page.evaluate((value) => navigator.clipboard.writeText(value), sentinel);
      await page.keyboard.press('Control+c');
      await page.waitForTimeout(300);
      const clipboard = await page.evaluate(() => navigator.clipboard.readText());
      check(
        'S6b copy REMAINS BLOCKED — clipboard keeps the sentinel',
        clipboard === sentinel,
        `clipboard=${JSON.stringify(clipboard.slice(0, 30))}`,
      );

      // Contextmenu blocked inside the shell (evaluate → synthetic dispatch).
      const contextMenuPrevented = await page.evaluate(() => {
        const target = document.querySelector('[data-pdf-text-layer] span');
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      });
      check('S6c contextmenu REMAINS BLOCKED inside the text layer', contextMenuPrevented === true);
      await context.close();
    }

    /* ============ S7/S8 — navigation + zoom ============ */
    {
      const { context } = await newPdfContext(browser, viewportFor('desktop'));
      const page = await context.newPage();
      await openPdfPlayer(page);

      await page.locator('[data-testid="pdf-page-next"]').click();
      // Smooth scroll + midline tracking: poll until the input reflects page 2.
      let pageAfterNext = '1';
      try {
        await page.waitForFunction(
          () => document.querySelector('[data-testid="pdf-page-input"]')?.value === '2',
          { timeout: 5000 },
        );
        pageAfterNext = await page.locator('[data-testid="pdf-page-input"]').inputValue();
      } catch { /* falls through to the check below */ }
      check('S7a next-page button advances to page 2', pageAfterNext === '2', `input=${pageAfterNext}`);
      const page2Visible = await page.locator('[data-testid="pdf-page-2"] canvas').isVisible().catch(() => false);
      check('S7b page 2 rendered on navigation', page2Visible === true);

      // Jump via the input.
      await page.locator('[data-testid="pdf-page-input"]').fill('1');
      await page.locator('[data-testid="pdf-page-input"]').press('Enter');
      await page.waitForTimeout(600);
      const scrolledBack = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="pdf-page-1"]');
        const root = document.querySelector('[data-testid="pdf-scroll"]');
        return Math.abs(el.getBoundingClientRect().top - root.getBoundingClientRect().top) < 120;
      });
      check('S7c page input jumps back to page 1', scrolledBack === true);

      const zoomBefore = await page.locator('[data-testid="pdf-zoom-value"]').innerText();
      await page.locator('[data-testid="pdf-zoom-in"]').click();
      await page.waitForTimeout(400);
      const zoomAfter = await page.locator('[data-testid="pdf-zoom-value"]').innerText();
      check('S8a zoom-in raises the zoom value', Number.parseInt(zoomAfter, 10) > Number.parseInt(zoomBefore, 10), `${zoomBefore} → ${zoomAfter}`);
      await page.locator('[data-testid="pdf-zoom-fit"]').click();
      await page.waitForTimeout(400);
      const zoomFit = await page.locator('[data-testid="pdf-zoom-value"]').innerText();
      check('S8b fit-width restores 100%', zoomFit.trim() === '100%', zoomFit);
      await context.close();
    }

    /* ============ S9 — persistence: reopen → hydrate → render ============ */
    {
      const beforeCounts = {
        total: annotationStore.size,
        highlights: Array.from(annotationStore.values()).filter((a) => a.annotationType === 'Highlight').length,
      };
      const getsBefore = counters.annotationGets;
      const { context } = await newPdfContext(browser, viewportFor('desktop'));
      const page = await context.newPage();
      await openPdfPlayer(page);
      await page.waitForTimeout(600);

      const hydratedRects = await page.locator('[data-annotation-page="1"] rect').count();
      const hydratedPaths = await page.locator('[data-annotation-page="1"] path.pdf-ink').count();
      check(
        'S9 refresh → annotations re-hydrated from the store and rendered',
        counters.annotationGets > getsBefore && beforeCounts.highlights >= 1 && hydratedRects >= 1 && hydratedPaths >= 1,
        `gets=${counters.annotationGets} store=${beforeCounts.total} domRects=${hydratedRects} domPaths=${hydratedPaths}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/pdf-s9-persist.png` });
      await context.close();
    }

    /* ============ S10 — mobile: toolbar usable at 390px ============ */
    {
      const { context } = await newPdfContext(browser, viewportFor('mobile'));
      const page = await context.newPage();
      await openPdfPlayer(page);
      const bar = await page.locator('[data-testid="pdf-controls-bar"]').boundingBox();
      const inViewport = bar && bar.y >= 0 && bar.y + bar.height <= 900;
      const tapTargets = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('[data-testid^="pdf-tool-"], [data-testid^="pdf-page-"], [data-testid^="pdf-zoom-"]'));
        return buttons.filter((b) => b.getBoundingClientRect().height >= 44).length;
      });
      check(
        'S10 mobile 390px — toolbar visible + controls ≥44px',
        !!inViewport && tapTargets >= 6,
        `barY=${bar?.y} height=${bar?.height} bigTargets=${tapTargets}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/pdf-s10-mobile.png` });
      await context.close();
    }
  } finally {
    await browser.close();
    clearInterval(rssSampler);
  }

  /* ============ summary ============ */
  const failed = results.filter((r) => !r.ok).length;
  console.log('─'.repeat(64));
  console.log(`Scenarios: ${results.length - failed} passed / ${failed} failed (of ${results.length})`);
  console.log(`Peak Chromium RSS: ${(peakChromeRssKb / 1024).toFixed(0)} MB (ceiling 1600 MB per §4)`);
  console.log(`Annotation batches sent: ${counters.annotationBatches.length}`);
  console.log(`Console errors: ${consoleErrors.length}${consoleErrors.length ? ` — ${consoleErrors.slice(0, 5).join(' | ')}` : ''}`);
  console.log(`Page errors: ${pageErrors.length}${pageErrors.length ? ` — ${pageErrors.slice(0, 5).join(' | ')}` : ''}`);
  process.exit(failed === 0 && pageErrors.length === 0 ? 0 : 1);
}

main().catch((error) => {
  clearInterval(rssSampler);
  console.error('SPEC CRASHED:', error);
  console.error(`Console errors (${consoleErrors.length}):`, consoleErrors.slice(0, 10).join('\n  '));
  console.error(`Page errors (${pageErrors.length}):`, pageErrors.slice(0, 10).join('\n  '));
  process.exit(2);
});
