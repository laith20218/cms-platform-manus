/**
 * Wave 11.8 / F2 — Hotfix R18 E2E (Arabic double-render + highlighter blend).
 *
 * Proves the two R18 production fixes against the REAL pdf.js engine and the
 * production route, with evidence screenshots:
 *
 *   R18.1 — the broken-Arabic screenshot ("W ebS o ck et", isolated glyphs) is
 *           a DOUBLE RENDER: the DOM text layer painting over the canvas.
 *           Evidence chain, one scenario per layer:
 *             S1 (?pdfDebugText=hide)    canvas-only → display:none on the
 *                                         text layer, canvas intact (diagnosis
 *                                         screenshot: the layer is removable
 *                                         without touching the page).
 *             S2 (default)               spans are HARD-transparent
 *                                         (color/text-shadow/background), z
 *                                         order 0/10/11/20, cmaps+fonts served
 *                                         as binary 200s (never the Vercel
 *                                         HTML fallback).
 *             S3 (?pdfDebugText=visible) leak reproduction — what production
 *                                         looked like when transparency lost.
 *   R18.2 — the highlighter is a DEDICATED blend layer (z 10) whose ROOT SVG
 *           carries mix-blend-mode: multiply + opacity 0.4, so the wash
 *           composites onto the CANVAS below and glyphs stay readable (the
 *           old <g> inside the isolated ink SVG could never reach the canvas
 *           and painted as an opaque block). Ink (z 11) still draws.
 *
 * RAM contract (hard rule §4): ONE Chromium instance, --headless=new
 * --disable-gpu --disable-dev-shm-usage, scenarios in browser.newContext()s,
 * browser closed immediately, RSS sampled at 400ms.
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/player-pdf-r18.e2e.mjs
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
const pdfjsAssetRequests = []; // { url, status, contentType } — R18.1 network proof

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
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/pdfjs-dist/')) {
        pdfjsAssetRequests.push({ url, status: response.status(), contentType: response.headers()['content-type'] ?? '' });
      }
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

/** Opens the player. `query` rides the INITIAL navigation — DocumentViewer is
 *  state-driven (no route change), so ?pdfDebugText/?pdfFonts survive into the
 *  PdfPlayer chunk's module evaluation. `waitForTextSpans=false` for the
 *  canvas-only scenario (display:none spans are not "visible"). */
async function openPdfPlayer(page, { query = '', waitForTextSpans = true } = {}) {
  await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library${query}`, { timeout: 60_000 });
  await page.locator('text=محاضرة PDF تجريبية').first().click();
  await page.locator('[data-testid="pdf-player-shell"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-testid="pdf-controls-bar"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-testid="pdf-page-1"] canvas').waitFor({ state: 'visible', timeout: 30_000 });
  if (waitForTextSpans) {
    await page.locator('[data-pdf-text-layer] > span').first().waitFor({ state: 'visible', timeout: 30_000 });
  }
  await page.waitForTimeout(400);
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

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'],
  });

  try {
    const fixtureBytes = await ensurePdfFixture(browser);
    check('F0 deterministic Arabic PDF fixture available', fixtureBytes > 1000, `${fixtureBytes} bytes`);

    /* ===== S1 — R18.1 canvas-only diagnosis (?pdfDebugText=hide) ===== */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page, { query: '?pdfDebugText=hide', waitForTextSpans: false });

      const probe = await page.evaluate(() => {
        const layer = document.querySelector('[data-testid="pdf-page-1"] [data-pdf-text-layer]');
        const canvas = document.querySelector('[data-testid="pdf-page-1"] canvas');
        if (!layer || !canvas) return null;
        const s = getComputedStyle(layer);
        const c = canvas.getBoundingClientRect();
        return {
          display: s.display,
          spans: layer.querySelectorAll('span').length,
          canvasBox: { w: c.width, h: c.height },
        };
      });
      const ok = !!probe && probe.display === 'none' && probe.spans > 0 && probe.canvasBox.w > 200 && probe.canvasBox.h > 200;
      check(
        'R18.1 ?pdfDebugText=hide removes the text layer (display:none) — canvas-only view',
        ok,
        `display=${probe?.display} spans=${probe?.spans} canvas=${probe?.canvasBox.w}×${probe?.canvasBox.h}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/r18-s1-canvas-only.png` });
      await context.close();
    }

    /* ===== S2 — R18.1 default: hard-transparent spans + z order + cmap/font 200s ===== */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      const styles = await page.evaluate(() => {
        const pageEl = document.querySelector('[data-testid="pdf-page-1"]');
        const span = pageEl?.querySelector('[data-pdf-text-layer] span');
        const canvas = pageEl?.querySelector('canvas');
        const highlight = pageEl?.querySelector('.pdf-highlight-layer');
        const ink = pageEl?.querySelector('.pdf-annotation-layer');
        const layer = pageEl?.querySelector('[data-pdf-text-layer]');
        const cs = (el) => (el ? getComputedStyle(el) : null);
        const spanCs = cs(span);
        return {
          span: spanCs ? { color: spanCs.color, textShadow: spanCs.textShadow, backgroundColor: spanCs.backgroundColor } : null,
          z: {
            canvas: cs(canvas)?.zIndex ?? null,
            highlight: cs(highlight)?.zIndex ?? null,
            ink: cs(ink)?.zIndex ?? null,
            text: cs(layer)?.zIndex ?? null,
          },
          spanCount: pageEl?.querySelectorAll('[data-pdf-text-layer] span').length ?? 0,
        };
      });
      const transparentOk = !!styles.span
        && styles.span.color === 'rgba(0, 0, 0, 0)'
        && (styles.span.textShadow === 'none' || styles.span.textShadow === '')
        && (styles.span.backgroundColor === 'rgba(0, 0, 0, 0)' || styles.span.backgroundColor === 'transparent');
      check(
        'R18.1 text spans are HARD-transparent (color rgba(0,0,0,0), no shadow, no background)',
        transparentOk && styles.spanCount > 0,
        `spans=${styles.spanCount} ${JSON.stringify(styles.span)}`,
      );
      check(
        'R18.2 z-order is 0 canvas < 10 highlight < 11 ink < 20 text',
        styles.z.canvas === '0' && styles.z.highlight === '10' && styles.z.ink === '11' && styles.z.text === '20',
        JSON.stringify(styles.z),
      );

      // Network proof: explicit probes must be binary 200s, never the Vercel
      // HTML SPA-fallback that makes pdf.js fail silently.
      const probes = await page.evaluate(async () => {
        // REAL shipped fallback fonts of pdfjs-dist 6.4.299 (FoxitSans.pfb does
        // not exist in this version — probing it would 200-as-HTML on every
        // SPA fallback server and "prove" nothing).
        const targets = [
          '/pdfjs-dist/cmaps/78-H.bcmap',
          '/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf',
          '/pdfjs-dist/standard_fonts/FoxitSerif.pfb',
        ];
        const out = [];
        for (const t of targets) {
          try {
            const res = await fetch(t);
            const head = String.fromCharCode(...new Uint8Array((await res.arrayBuffer()).slice(0, 8)));
            out.push({ t, status: res.status, contentType: res.headers.get('content-type') ?? '', head });
          } catch (e) {
            out.push({ t, status: 0, error: String(e) });
          }
        }
        return out;
      });
      const probesOk = probes.length === 3 && probes.every((p) => p.status === 200
        && !(p.contentType ?? '').includes('text/html')
        && !p.head.startsWith('<'));
      check(
        'R18.1 /pdfjs-dist/ cmaps + standard_fonts serve as binary 200 (never HTML fallback)',
        probesOk,
        probes.map((p) => `${p.t.split('/').slice(-2).join('/')}:${p.status} ct=${p.contentType} head="${p.head?.slice(0, 4)}"`).join(' '),
      );
      const observed = pdfjsAssetRequests.filter((r) => r.url.includes('/cmaps/'));
      check(
        'R18.1 every runtime cmap request intercepted during load is 200 non-HTML',
        observed.every((r) => r.status === 200 && !r.contentType.includes('text/html')),
        observed.length === 0
          ? 'fixture encoding did not require cmaps (probes above are authoritative)'
          : observed.map((r) => `${r.url.split('/').pop()}:${r.status}`).join(' '),
      );
      await page.screenshot({ path: `${SHOT_DIR}/r18-s2-with-text-layer.png` });
      await context.close();
    }

    /* ===== S3 — R18.1 leak reproduction (?pdfDebugText=visible) ===== */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page, { query: '?pdfDebugText=visible' });

      const probe = await page.evaluate(() => {
        const span = document.querySelector('[data-testid="pdf-page-1"] [data-pdf-text-layer] span');
        if (!span) return null;
        const s = getComputedStyle(span);
        return { color: s.color, background: s.backgroundColor };
      });
      const ok = !!probe && probe.color.startsWith('rgba(190, 18, 60') && probe.background.startsWith('rgba(13, 148, 136');
      check(
        'R18.1 ?pdfDebugText=visible reproduces the production double-render leak',
        ok,
        JSON.stringify(probe),
      );
      await page.screenshot({ path: `${SHOT_DIR}/r18-s3-text-layer-visible-leak.png` });
      await context.close();
    }

    /* ===== S4 — R18.2 highlight blends UNDER the text (readable glyphs) ===== */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      await page.locator('[data-testid="pdf-tool-highlighter"]').click();
      const spanBox = await selectWideSpan(page);
      await waitFor(() => Array.from(annotationStore.values()).some((a) => a.annotationType === 'Highlight'));

      const proof = await page.evaluate(() => {
        const pageEl = document.querySelector('[data-testid="pdf-page-1"]');
        const highlightSvg = pageEl?.querySelector('.pdf-highlight-layer');
        const rect = highlightSvg?.querySelector('rect');
        if (!highlightSvg || !rect) return null;
        const s = getComputedStyle(highlightSvg);
        const rb = rect.getBoundingClientRect();
        // Hit-test the wash center: the text layer (z 20) must own the point —
        // the highlight surface never intercepts the pointer.
        const hit = document.elementFromPoint(rb.x + rb.width / 2, rb.y + rb.height / 2);
        return {
          blend: s.mixBlendMode,
          opacity: s.opacity,
          zIndex: s.zIndex,
          pointerEvents: s.pointerEvents,
          rectBox: { x: rb.x, y: rb.y, width: rb.width, height: rb.height },
          hitTag: hit?.tagName ?? null,
          hitLayer: hit?.closest('[data-pdf-text-layer]') ? 'text-layer' : (hit?.closest('svg')?.getAttribute('class') ?? hit?.tagName),
        };
      });

      const blendOk = !!proof
        && proof.blend === 'multiply'
        && Number(proof.opacity) === 0.4
        && proof.zIndex === '10'
        && proof.pointerEvents === 'none';
      check(
        'R18.2 highlight layer root: mix-blend-mode:multiply, opacity 0.4, z 10, pointer-events none',
        blendOk,
        JSON.stringify(proof ? { blend: proof.blend, opacity: proof.opacity, zIndex: proof.zIndex, pointerEvents: proof.pointerEvents } : proof),
      );

      const offset = proof && spanBox
        ? Math.hypot((proof.rectBox.x + proof.rectBox.width / 2) - (spanBox.x + spanBox.width / 2),
                     (proof.rectBox.y + proof.rectBox.height / 2) - (spanBox.y + spanBox.height / 2))
        : Number.POSITIVE_INFINITY;
      const hitOk = proof?.hitLayer === 'text-layer';
      check(
        'R18.2 highlight sits ON the selected span and the text layer owns the hit point (text readable, selectable)',
        offset <= 10 && hitOk,
        `centerOffset=${offset.toFixed(1)}px hit=${proof?.hitTag}/${proof?.hitLayer}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/r18-s4-highlight-blend.png` });
      await context.close();
    }

    /* ===== S6 — R18.1 font A/B: disableFontFace (path-rendered glyphs) =====
       The S1 canvas-only view already exposed glyph-mapping artifacts on the
       CANVAS itself (dropped 'i's, 'a'→'ã', inter-cluster gaps) — the signature
       of pdf.js's embedded-font→@font-face pipeline mis-mapping the synthetic
       cmap of Chromium-printed subset fonts. disableFontFace: true bypasses
       that pipeline (glyph outlines drawn as paths straight from the embedded
       program). If the canvas is clean here, the embedded-font face-loading is
       the production "W ebS o ck et" culprit — flip the default next round. */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page, { query: '?pdfFonts=system&pdfDebugText=hide', waitForTextSpans: false });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOT_DIR}/r18-s6-canvas-system-fonts.png` });
      check('R18.1 ?pdfFonts=system (disableFontFace) canvas A/B captured', true, `${SHOT_DIR}/r18-s6-canvas-system-fonts.png`);
      await context.close();
    }

    /* ===== S5 — R18.2 regression: ink surface (z 11) still draws ===== */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      await page.locator('[data-testid="pdf-tool-pen"]').click();
      const pageBox = await page.locator('[data-testid="pdf-page-1"]').boundingBox();
      const x0 = pageBox.x + pageBox.width * 0.25;
      const y0 = pageBox.y + pageBox.height * 0.4;
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      for (let i = 1; i <= 12; i += 1) {
        await page.mouse.move(x0 + i * 10, y0 + i * 4, { steps: 2 });
      }
      await page.mouse.up();
      await page.waitForTimeout(400);

      await waitFor(() => Array.from(annotationStore.values()).some((a) => a.annotationType === 'Ink'));
      const domPaths = await page.locator('[data-annotation-page="1"] path.pdf-ink').count();
      const live = await page.evaluate(() => {
        const inkSvg = document.querySelector('[data-testid="pdf-page-1"] svg.pdf-annotation-layer');
        return inkSvg ? { z: getComputedStyle(inkSvg).zIndex, paths: inkSvg.querySelectorAll('path').length } : null;
      });
      check(
        'R18.2 ink SVG (z 11) unchanged by the layer split — stroke commits and renders',
        domPaths >= 1 && live?.z === '11' && live?.paths >= 1,
        `domPaths=${domPaths} inkSvg=${JSON.stringify(live)}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/r18-s5-ink.png` });
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
  console.log(`pdf.js asset responses observed: ${pdfjsAssetRequests.length}`);
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
