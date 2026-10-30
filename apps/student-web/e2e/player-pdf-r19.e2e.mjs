/**
 * Wave 11.8 / F2 — Hotfix R19 E2E (path rendering is the DEFAULT).
 *
 * R19.1 — getDocument now ships disableFontFace: true unconditionally (glyph
 * outlines drawn as paths straight from the embedded font programs; the
 * browser @font-face pipeline mis-maps the synthetic cmap of subset fonts:
 * dropped 'i's, 'a'→'ã', inter-cluster gaps — the "W ebS o ck et" signature).
 * cMapUrl/cMapPacked stay active for character mapping. The ONLY way back to
 * the old pipeline is the field-diagnostic flag ?pdfFonts=embedded.
 *
 * The assertion is a canvas INK-GAP metric over three text bands of the
 * deterministic fixture (canvas-relative bands, fixed 1280×800 viewport):
 * measured signatures on this renderer —
 *
 *   band (default paths | embedded override)
 *   title  gaps=5  longest=15 | gaps=9  longest=29 (merged/clipped holes)
 *   body   gaps=21 longest=8  | gaps=40 longest=13
 *   latin  gaps=12 longest=8  | gaps=22 longest=13
 *
 * Default assertions carry ≥30% margin below the broken signatures; the
 * contrast scenario re-measures under ?pdfFonts=embedded and asserts the
 * broken signature, proving the metric actually discriminates.
 *
 * RAM contract (hard rule §4): ONE Chromium instance, --headless=new
 * --disable-gpu --disable-dev-shm-usage, scenarios in browser.newContext()s,
 * browser closed immediately, RSS sampled at 400ms.
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/player-pdf-r19.e2e.mjs
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

async function openPdfPlayer(page, { query = '' } = {}) {
  await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library${query}`, { timeout: 60_000 });
  await page.locator('text=محاضرة PDF تجريبية').first().click();
  await page.locator('[data-testid="pdf-player-shell"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-testid="pdf-controls-bar"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-testid="pdf-page-1"] canvas').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[data-pdf-text-layer] > span').first().waitFor({ state: 'attached', timeout: 30_000 });
  await page.waitForTimeout(1000);
}

/** In-page: canvas ink-gap metrics for the three fixture text bands. */
async function measureBands(page) {
  return page.evaluate(() => {
    const gapMetrics = (canvas, band) => {
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width;
      const x0 = Math.max(0, Math.floor((band.x - rect.x) * sx) - 2);
      const y0 = Math.max(0, Math.floor((band.y - rect.y) * sx) - 2);
      const w = Math.min(canvas.width - x0, Math.ceil(band.width * sx) + 4);
      const h = Math.min(canvas.height - y0, Math.ceil(band.height * sx) + 4);
      const img = ctx.getImageData(x0, y0, w, h);
      const cols = new Array(w).fill(0);
      for (let x = 0; x < w; x++) {
        let dark = 0;
        for (let y = 0; y < h; y++) {
          const i = (y * w + x) * 4;
          const lum = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
          if (lum < 170) dark++;
        }
        cols[x] = dark;
      }
      let first = 0, last = cols.length - 1;
      while (first < cols.length && cols[first] === 0) first++;
      while (last >= 0 && cols[last] === 0) last--;
      let gaps = 0, bigGaps = 0, longest = 0, run = 0;
      for (let x = first; x <= last; x++) {
        if (cols[x] === 0) { run++; continue; }
        if (run >= 3) { gaps++; if (run >= 8) bigGaps++; }
        if (run > longest) longest = run;
        run = 0;
      }
      return { gaps, bigGaps, longest, inkWidth: last - first + 1 };
    };
    const canvas = document.querySelector('[data-testid="pdf-page-1"] canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    // Deterministic fixture + fixed viewport → fixed canvas-relative bands
    // (title ≈ 7.0-12.0%, body line 1 ≈ 12.8-17.0%, Latin anchor ≈ 20.5-24.2%).
    const band = (y0f, y1f) => ({
      x: rect.x + rect.width * 0.08, y: rect.y + rect.height * y0f,
      width: rect.width * 0.84, height: rect.height * (y1f - y0f),
    });
    return {
      title: gapMetrics(canvas, band(0.070, 0.120)),
      body: gapMetrics(canvas, band(0.128, 0.170)),
      latin: gapMetrics(canvas, band(0.205, 0.242)),
    };
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
    check('F0 deterministic Arabic PDF fixture available', fixtureBytes > 1000, `${fixtureBytes} bytes`);

    /* ===== S1 — R19.1 default (NO query params): canvas glyphs are clean ===== */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);
      const m = await measureBands(page);

      // Latin anchor line: word-level gaps only (no dropped 'i's, no cluster gaps).
      const latinOk = !!m && m.latin.inkWidth > 100 && m.latin.gaps <= 16 && m.latin.longest <= 10;
      check(
        'R19.1 DEFAULT: Latin anchor line renders with word-level spacing only',
        latinOk,
        m ? `gaps=${m.latin.gaps}(≤16) longest=${m.latin.longest}(≤10) inkWidth=${m.latin.inkWidth}` : 'no canvas',
      );

      // Arabic title: connected script — no isolated-glyph holes (longest gap is
      // a word space; only ~2 gaps ≥8px). Broken mode measured longest=29,
      // bigGaps=7.
      const titleOk = !!m && m.title.inkWidth > 100 && m.title.longest <= 20 && m.title.bigGaps <= 3;
      check(
        'R19.1 DEFAULT: Arabic title renders CONNECTED (no merged/clipped glyph holes)',
        titleOk,
        m ? `gaps=${m.title.gaps} bigGaps=${m.title.bigGaps}(≤3) longest=${m.title.longest}(≤20) inkWidth=${m.title.inkWidth}` : 'no canvas',
      );

      // Arabic body line: the @font-face pipeline measured 40 gaps / longest 13.
      const bodyOk = !!m && m.body.inkWidth > 100 && m.body.gaps <= 28 && m.body.longest <= 9;
      check(
        'R19.1 DEFAULT: Arabic body line renders connected (no per-cluster gaps)',
        bodyOk,
        m ? `gaps=${m.body.gaps}(≤28) longest=${m.body.longest}(≤9) inkWidth=${m.body.inkWidth}` : 'no canvas',
      );
      await page.screenshot({ path: `${SHOT_DIR}/r19-s1-default-connected.png` });
      await context.close();
    }

    /* ===== S2 — R19.1 contrast: ?pdfFonts=embedded reproduces the broken mode =====
       Proves the S1 metric discriminates: the field override must land far
       above every default threshold. */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page, { query: '?pdfFonts=embedded' });
      const m = await measureBands(page);

      const brokenOk = !!m
        && m.latin.gaps >= 19 && m.latin.longest >= 12
        && m.body.gaps >= 34
        && m.title.longest >= 25 && m.title.bigGaps >= 5;
      check(
        'R19.1 CONTRAST: ?pdfFonts=embedded reproduces the broken @font-face signature',
        brokenOk,
        m ? `latin=${m.latin.gaps}/L${m.latin.longest} body=${m.body.gaps} title bigGaps=${m.title.bigGaps}/L${m.title.longest}` : 'no canvas',
      );
      await page.screenshot({ path: `${SHOT_DIR}/r19-s2-embedded-contrast.png` });
      await context.close();
    }

    /* ===== S3 — R19 regression guard: text layer + highlight surface intact ===== */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      const guard = await page.evaluate(() => {
        const pageEl = document.querySelector('[data-testid="pdf-page-1"]');
        const span = pageEl?.querySelector('[data-pdf-text-layer] span');
        const layer = pageEl?.querySelector('[data-pdf-text-layer]');
        const highlight = pageEl?.querySelector('.pdf-highlight-layer');
        const ink = pageEl?.querySelector('.pdf-annotation-layer');
        const cs = (el) => (el ? getComputedStyle(el) : null);
        const spanCs = cs(span);
        return {
          spanColor: spanCs?.color ?? null,
          z: {
            canvas: cs(pageEl?.querySelector('canvas'))?.zIndex ?? null,
            highlight: cs(highlight)?.zIndex ?? null,
            ink: cs(ink)?.zIndex ?? null,
            text: cs(layer)?.zIndex ?? null,
          },
          blend: cs(highlight)?.mixBlendMode ?? null,
          opacity: cs(highlight)?.opacity ?? null,
        };
      });
      check(
        'R19 guard: hard-transparent spans + z 0/10/11/20 + multiply highlight unchanged by the font flip',
        guard.spanColor === 'rgba(0, 0, 0, 0)'
          && guard.z.canvas === '0' && guard.z.highlight === '10' && guard.z.ink === '11' && guard.z.text === '20'
          && guard.blend === 'multiply' && Number(guard.opacity) === 0.4,
        JSON.stringify(guard),
      );

      // One live highlight round-trip: select → commit → wash on the span.
      await page.locator('[data-testid="pdf-tool-highlighter"]').click();
      const spans = await page.locator('[data-testid="pdf-page-1"] [data-pdf-text-layer] > span').all();
      const wide = await page.evaluate(() => {
        const list = Array.from(document.querySelectorAll('[data-testid="pdf-page-1"] [data-pdf-text-layer] > span'));
        const target = list.find((s) => {
          const r = s.getBoundingClientRect();
          return r.width > 60 && r.height > 8 && r.y > 0;
        });
        if (!target) return null;
        const r = target.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      if (!wide) throw new Error('no wide span found');
      await page.mouse.move(wide.x + 2, wide.y + wide.height / 2);
      await page.mouse.down();
      await page.mouse.move(wide.x + wide.width - 2, wide.y + wide.height / 2, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(400);
      await waitFor(() => Array.from(annotationStore.values()).some((a) => a.annotationType === 'Highlight'));
      const rectCount = await page.locator('[data-testid="pdf-highlight-layer-1"] rect').count();
      check(
        'R19 guard: highlighter still commits onto the dedicated blend layer',
        rectCount >= 1,
        `rects=${rectCount}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/r19-s3-guard-highlight.png` });
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
