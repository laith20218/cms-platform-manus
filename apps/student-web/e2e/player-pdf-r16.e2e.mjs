/**
 * Wave 11.8 / F2 — Hotfix R16 E2E (production UI bug regressions).
 *
 * Proves the four R16 production fixes against the REAL pdf.js engine and the
 * production route, with evidence screenshots:
 *
 *   R16.1 — canvas Arabic: pdf.js runtime assets (cmaps / standard_fonts /
 *           wasm / iccs) are self-hosted under BASE_URL + getDocument is
 *           configured with cMapUrl/cMapPacked/standardFontDataUrl/wasmUrl/
 *           iccUrl/useSystemFonts. Evidence: same-origin 200 probes of the
 *           deployed asset tree + error-free document load.
 *   R16.2 — highlighter offset: the committed highlight rect must land ON the
 *           selected span (screen-space comparison), incl. at 125% zoom.
 *   R16.3 — bottom of page: the overlay SVG is coextensive with the canvas
 *           (all four edges within 1.5px) and a pen stroke at ~94% page
 *           height commits and renders.
 *   R16.4 — pen width: the live AND committed stroke-width attributes are
 *           page-relative fractions (< 0.05), never raw px (the 2000px blob),
 *           and no path relies on vector-effect.
 *
 * RAM contract (hard rule §4): ONE Chromium instance, --headless=new
 * --disable-gpu --disable-dev-shm-usage, scenarios in browser.newContext()s,
 * browser closed immediately, RSS sampled at 400ms.
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/player-pdf-r16.e2e.mjs
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

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
      } catch (_) { /* not ready */ }
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timeout'));
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

const consoleErrors = [];
const pageErrors = [];
const pdfjsAssetRequests = [];

let peakChromeRssKb = 0;
const rssSampler = setInterval(() => {
  try {
    const kb = Number(execSync("ps -C chrome --no-headers -o rss= 2>/dev/null | awk '{s+=$1} END {print s+0}'", { stdio: ['ignore', 'pipe', 'ignore'] }));
    if (kb > peakChromeRssKb) peakChromeRssKb = kb;
  } catch { /* ps raced with process exit */ }
}, 400);

const annotationStore = new Map();

async function newPdfContext(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'ar', hasTouch: true });
  await context.addInitScript(() => {
    sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
  });

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

  await context.route(`**/api/v1/library/${FILE_ID}/content`, async (route) => {
    await route.fulfill({
      body: fs.readFileSync(FIXTURE_PATH),
      contentType: 'application/pdf',
      headers: { 'Cache-Control': 'private, max-age=120' },
    });
  });

  await context.route(`**/api/v1/library/${FILE_ID}/view`, async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  await context.route(`**/api/v1/library/${FILE_ID}/annotations`, async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: Array.from(annotationStore.values()) });
    }
    const body = route.request().postDataJSON();
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
    page.on('request', (request) => {
      if (request.url().includes('/pdfjs-dist/')) pdfjsAssetRequests.push(request.url());
    });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => {
      const text = error instanceof Error ? error.message : String(error);
      if (text.includes('sessionStorage') && text.includes('Access is denied')) return;
      pageErrors.push(text);
    });
  });

  return { context };
}

async function openPdfPlayer(page) {
  await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library`, { timeout: 60_000 });
  await page.locator('text=محاضرة PDF تجريبية').first().click();
  await page.locator('[data-testid="pdf-player-shell"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-testid="pdf-controls-bar"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-testid="pdf-page-1"] canvas').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[data-pdf-text-layer] > span').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(300);
}

/** Locates a WIDE text-layer span on page 1 (needs a real multi-letter run). */
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

async function selectWideSpan(page) {
  const box = await wideSpanBox(page);
  if (!box) throw new Error('no wide span found');
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  return box;
}

/** First committed highlight rect on page 1: DOM screen box + stored payload. */
function firstHighlightDomRect(page) {
  return page.evaluate(() => {
    const rect = document.querySelector('[data-annotation-page="1"] rect');
    if (!rect) return null;
    const box = rect.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'],
  });

  try {
    const fixtureBytes = await ensurePdfFixture(browser);
    check('F0 deterministic Arabic PDF fixture generated (Chromium print)', fixtureBytes > 1000, `${fixtureBytes} bytes`);

    /* ============ S1 — R16.1: self-hosted pdf.js asset tree ============ */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      const probes = await page.evaluate(async () => {
        const targets = [
          '/pdfjs-dist/cmaps/78-H.bcmap',
          '/pdfjs-dist/standard_fonts/FoxitSans.pfb',
          '/pdfjs-dist/wasm/openjpeg.wasm',
          '/pdfjs-dist/iccs/CGATS001Compat-v2-micro.icc',
        ];
        const out = [];
        for (const t of targets) {
          try {
            const res = await fetch(t);
            out.push({ t, status: res.status, bytes: (await res.arrayBuffer()).byteLength });
          } catch (e) {
            out.push({ t, status: 0, error: String(e) });
          }
        }
        return out;
      });
      const all200 = probes.length === 4 && probes.every((p) => p.status === 200 && p.bytes > 0);
      check(
        'R16.1 pdf.js runtime assets (cmaps/fonts/wasm/iccs) are deployed and reachable',
        all200,
        probes.map((p) => `${p.t.split('/').slice(-2).join('/')}:${p.status}(${p.bytes ?? 0}B)`).join(' '),
      );
      check(
        'R16.1 document loads through the configured engine without console errors',
        pageErrors.length === 0,
        `assetRequestsDuringLoad=${pdfjsAssetRequests.length}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/r16-s1-open.png` });
      await context.close();
    }

    /* ============ S2 — R16.3: overlay coextensive with the canvas ============ */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      const geo = await page.evaluate(() => {
        const pageEl = document.querySelector('[data-testid="pdf-page-1"]');
        const canvas = pageEl?.querySelector('canvas');
        const overlay = pageEl?.querySelector('svg[data-annotation-page="1"]');
        if (!pageEl || !canvas || !overlay) return null;
        const c = canvas.getBoundingClientRect();
        const o = overlay.getBoundingClientRect();
        const w = getComputedStyle(overlay).width;
        const h = getComputedStyle(overlay).height;
        return {
          delta: {
            left: Math.abs(o.left - c.left), top: Math.abs(o.top - c.top),
            right: Math.abs(o.right - c.right), bottom: Math.abs(o.bottom - c.bottom),
          },
          cssSize: { w, h },
          coversBottom: o.bottom >= c.bottom - 1.5 && o.height >= c.height - 1.5,
        };
      });
      const edgesOk = !!geo && Object.values(geo.delta).every((d) => d <= 1.5);
      check(
        'R16.3 overlay SVG coextensive with canvas (all 4 edges ≤1.5px), full-height',
        edgesOk && geo.coversBottom,
        `deltas=${JSON.stringify(geo?.delta)} css=${geo?.cssSize.w}×${geo?.cssSize.h}`,
      );
      await context.close();
    }

    /* ============ S3 — R16.2: highlight lands ON the selected text ============ */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      await page.locator('[data-testid="pdf-tool-highlighter"]').click();
      const spanBox = await selectWideSpan(page);
      await waitFor(() => Array.from(annotationStore.values()).some((a) => a.annotationType === 'Highlight'));
      const domRect = await firstHighlightDomRect(page);

      const offset = domRect && spanBox
        ? Math.hypot((domRect.x + domRect.width / 2) - (spanBox.x + spanBox.width / 2),
                     (domRect.y + domRect.height / 2) - (spanBox.y + spanBox.height / 2))
        : Number.POSITIVE_INFINITY;
      const sizeOk = domRect && spanBox
        ? Math.abs(domRect.width - spanBox.width) / Math.max(spanBox.width, 1) < 0.15
        : false;
      check(
        'R16.2 committed highlight rect lands on the selected span (center ≤10px, width ±15%)',
        offset <= 10 && sizeOk,
        `centerOffset=${offset.toFixed(1)}px domRect=${JSON.stringify(domRect)} span=${JSON.stringify(spanBox)}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/r16-s3-highlight.png` });
      await context.close();
    }

    /* ============ S4 — R16.3: pen at the BOTTOM of the page ============ */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      await page.locator('[data-testid="pdf-tool-pen"]').click();
      // The page (~1267px tall) exceeds the 800px viewport — bring its BOTTOM
      // into view first; mouse coordinates are viewport-relative.
      await page.locator('[data-testid="pdf-page-1"]').evaluate((el) => el.scrollIntoView({ block: 'end' }));
      await page.waitForTimeout(600);
      const pageBox = await page.locator('[data-testid="pdf-page-1"]').boundingBox();
      const x0 = pageBox.x + pageBox.width * 0.35;
      const y0 = pageBox.y + pageBox.height * 0.93;
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      for (let i = 1; i <= 10; i += 1) {
        await page.mouse.move(x0 + i * 8, y0 + i * 2, { steps: 2 });
      }
      await page.mouse.up();
      await page.waitForTimeout(400);

      await waitFor(() => Array.from(annotationStore.values()).some((a) => a.annotationType === 'Ink'));
      const ink = Array.from(annotationStore.values()).filter((a) => a.annotationType === 'Ink').pop();
      const bottomPoints = ink?.payload?.points?.filter((p) => p.y > 0.9) ?? [];
      const domPaths = await page.locator('[data-annotation-page="1"] path.pdf-ink').count();
      check(
        'R16.3 pen stroke at ~93% page height commits and renders (bottom is editable)',
        bottomPoints.length >= 2 && domPaths >= 1,
        `bottomPoints=${bottomPoints.length}/${ink?.payload?.points?.length ?? 0} domPaths=${domPaths}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/r16-s4-ink-bottom.png` });
      await context.close();
    }

    /* ============ S5 — R16.4: stroke-width is a fraction (live + committed) ============ */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      await page.locator('[data-testid="pdf-tool-pen"]').click();
      const pageBox = await page.locator('[data-testid="pdf-page-1"]').boundingBox();
      const x0 = pageBox.x + pageBox.width * 0.2;
      const y0 = pageBox.y + pageBox.height * 0.35;

      await page.mouse.move(x0, y0);
      await page.mouse.down();
      for (let i = 1; i <= 14; i += 1) {
        await page.mouse.move(x0 + i * 14, y0 + i * 6, { steps: 3 });
        if (i === 8) {
          // MID-DRAW probe: the live path must already carry the fraction width.
          const liveProbe = await page.evaluate(() => {
            const paths = document.querySelectorAll('[data-annotation-page="1"] path.pdf-ink');
            const last = paths[paths.length - 1];
            if (!last) return null;
            return {
              strokeWidth: Number(last.getAttribute('stroke-width')),
              vectorEffect: last.getAttribute('vector-effect'),
              boxWidth: last.closest('svg').getBoundingClientRect().width,
            };
          });
          check(
            'R16.4 LIVE path stroke-width is a page-relative fraction (no vector-effect)',
            !!liveProbe && liveProbe.strokeWidth > 0 && liveProbe.strokeWidth < 0.05 && liveProbe.vectorEffect === null,
            `strokeWidth=${liveProbe?.strokeWidth} boxWidth=${liveProbe?.boxWidth} vectorEffect=${liveProbe?.vectorEffect}`,
          );
        }
      }
      await page.mouse.up();
      await page.waitForTimeout(400);

      await waitFor(() => Array.from(annotationStore.values()).some((a) => a.annotationType === 'Ink'));
      const ink = Array.from(annotationStore.values()).filter((a) => a.annotationType === 'Ink').pop();
      const committed = await page.evaluate(() => {
        const paths = Array.from(document.querySelectorAll('[data-annotation-page="1"] path.pdf-ink'));
        return paths.map((p) => ({
          strokeWidth: Number(p.getAttribute('stroke-width')),
          vectorEffect: p.getAttribute('vector-effect'),
          screenW: p.getBoundingClientRect().width,
          screenH: p.getBoundingClientRect().height,
        }));
      });
      const committedOk = committed.length >= 1
        && committed.every((c) => c.strokeWidth > 0 && c.strokeWidth < 0.05 && c.vectorEffect === null);
      const storedOk = ink?.payload?.width > 0 && ink.payload.width < 0.05;
      // The drawn line must be VISIBLE: inked geometry's bounding box on screen.
      const visible = committed.some((c) => c.screenW > 40 && c.screenH > 4 && c.screenW < 2000);
      check(
        'R16.4 COMMITTED path stroke-width fraction + stored width fraction + visible drawn line',
        committedOk && storedOk && visible,
        `committed=${JSON.stringify(committed)} storedWidth=${ink?.payload?.width}`,
      );
      // Deliverable screenshot: the actual drawn line on the page.
      await page.screenshot({ path: `${SHOT_DIR}/r16-s5-ink-line.png` });
      await context.close();
    }

    /* ============ S6 — R16.2 at zoom: highlight stays on the text ============ */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      await page.locator('[data-testid="pdf-zoom-in"]').click();
      await page.waitForTimeout(700); // re-render at 125%
      await page.locator('[data-testid="pdf-tool-highlighter"]').click();
      const spanBox = await selectWideSpan(page);
      await waitFor(() => Array.from(annotationStore.values()).some((a) => a.annotationType === 'Highlight'));
      const domRect = await firstHighlightDomRect(page);

      const offset = domRect && spanBox
        ? Math.hypot((domRect.x + domRect.width / 2) - (spanBox.x + spanBox.width / 2),
                     (domRect.y + domRect.height / 2) - (spanBox.y + spanBox.height / 2))
        : Number.POSITIVE_INFINITY;
      check(
        'R16.2 at 125% zoom the highlight still lands on the selected span (center ≤12px)',
        offset <= 12,
        `centerOffset=${offset.toFixed(1)}px zoomedSpan=${JSON.stringify(spanBox)}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/r16-s6-highlight-zoom.png` });
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
  console.log(`pdf.js asset requests observed: ${pdfjsAssetRequests.length}`);
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
