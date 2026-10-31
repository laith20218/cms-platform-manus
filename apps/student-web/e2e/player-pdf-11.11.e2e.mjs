/**
 * Wave 11.11 / F2 Phase 3 E2E — Smart Eraser, Text Search, Scanned PDFs.
 *
 * Phase A (this commit) — the smart eraser (commit-on-up):
 *   S1 rect shape: draw → erase via an edge swipe → gone from DOM + store,
 *      and the persisted batch carries the deleted id (wire contract).
 *   S2 ink stroke: same lifecycle for a freehand pen stroke.
 *   S3 sticky note: tap-place → text commit → erase over the icon (the note
 *      layer is passive in eraser mode, so the gesture reaches the geometry).
 *   S4 no-op gesture: an eraser swipe over empty space must not mutate the
 *      store or fire a delete batch (the store only shrinks on real contact).
 *
 * Harness contract mirrors player-pdf-r19.e2e.mjs: ONE Chromium instance
 * (--headless=new --disable-gpu --disable-dev-shm-usage), mocked /api/v1
 * routes with an in-memory annotation store, deterministic fixture PDF.
 *
 * Fixture: 3 pages — 1-2 Arabic/English text, page 3 SVG-only (vector shapes,
 * zero text items) reserved for the Wave 11.11-C scanned-page scenarios.
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/player-pdf-11.11.e2e.mjs
 */
import { chromium } from '@playwright/test';
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

/* ============ deterministic 3-page fixture (Chromium print) ============ */

const FIXTURE_PATH = fileURLToPath(new URL('../public/e2e-test-doc-1111.pdf', import.meta.url));

async function ensurePdfFixture(browser) {
  if (fs.existsSync(FIXTURE_PATH)) return fs.statSync(FIXTURE_PATH).size;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent(`
    <html><head><meta charset="utf-8"><style>
      @page { size: A4; margin: 18mm; }
      body { font-family: 'Noto Naskh Arabic', 'DejaVu Sans', sans-serif; font-size: 14px; line-height: 2; }
      .page2, .page3 { page-break-before: always; }
      .page3 svg { width: 100%; height: 950px; }
    </style></head><body>
      <h1>التشخيص الطبي التفريقي</h1>
      <p>يعتمد التشخيص التفريقي على جمع التاريخ المرضي بدقة ثم الفحص السريري المتكامل قبل الطلبات المخبرية.</p>
      <p>Differential Diagnosis — Page One (English anchor line).</p>
      <div class="page2">
        <h1>علاج الوحدة القلبية</h1>
        <p>إعطاء الأسبرين والنترات تحت اللسان ومراقبة تخطيط القلب المتواصل قبل أي قرار قسطرة.</p>
      </div>
      <div class="page3">
        <svg viewBox="0 0 800 1000" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <rect x="60" y="80" width="680" height="840" fill="#eef2f7" stroke="#94a3b8" stroke-width="3"/>
          <circle cx="260" cy="380" r="140" fill="#dbeafe" stroke="#64748b" stroke-width="3"/>
          <ellipse cx="560" cy="420" rx="150" ry="100" fill="#fef3c7" stroke="#64748b" stroke-width="3"/>
          <line x1="120" y1="760" x2="680" y2="760" stroke="#475569" stroke-width="5"/>
          <polygon points="400,600 340,700 460,700" fill="#dcfce7" stroke="#475569" stroke-width="3"/>
        </svg>
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

/** Appears-and-settles wait built on Playwright's own retry machinery. */
async function waitVisible(locator, { timeoutMs = 8000 } = {}) {
  await locator.first().waitFor({ state: 'visible', timeout: timeoutMs });
  return locator.count();
}

/** DOM-presence wait — zero-area SVG geometry (a straight ink line) has an
 *  empty bounding box, so 'visible' would never resolve for it. */
async function waitAttached(locator, { timeoutMs = 8000 } = {}) {
  await locator.first().waitFor({ state: 'attached', timeout: timeoutMs });
  return locator.count();
}

/** Gone wait: every matched node must detach (Playwright retried). */
async function waitDetached(locator, { timeoutMs = 8000 } = {}) {
  await locator.first().waitFor({ state: 'detached', timeout: timeoutMs }).catch(async (error) => {
    // first() with zero matches resolves immediately as detached — verify.
    if ((await locator.count()) === 0) return;
    throw error;
  });
  if ((await locator.count()) !== 0) throw new Error('waitDetached timeout');
}

const consoleErrors = [];
const pageErrors = [];

const annotationStore = new Map();
/** Every POST batch carrying deletedIds — the eraser wire contract probe. */
const deletedBatches = [];

async function newPdfContext(browser, viewport) {
  annotationStore.clear();
  deletedBatches.length = 0;
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
    description: 'مستند تجريبي لمشغّل PDF — ممحاة وبحث وصفحات ممسوحة',
    fileSize: fs.existsSync(FIXTURE_PATH) ? fs.statSync(FIXTURE_PATH).size : 50_000,
    durationSeconds: null, pagesCount: 3,
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
        accessUrl: `${BASE_URL}/e2e-test-doc-1111.pdf`,
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
    if ((body.deletedIds ?? []).length > 0) {
      deletedBatches.push({ ids: [...body.deletedIds], at: Date.now() });
    }
    return route.fulfill({ json: { appliedCount: applied, serverTime: new Date().toISOString() } });
  });

  context.on('page', (page) => {
    page.on('crash', () => {
      console.log('>>> RENDERER CRASHED <<<');
      pageErrors.push('renderer crash');
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
  await page.locator('[data-pdf-text-layer] > span').first().waitFor({ state: 'attached', timeout: 30_000 });
  await page.waitForTimeout(800);
}

/** Canvas-box-relative drag on page 1 (fractions of the live overlay box). */
async function dragOnPage(page, [fx0, fy0], [fx1, fy1], steps = 16) {
  const box = await page.locator('[data-testid="pdf-page-1"] canvas').boundingBox();
  if (!box) throw new Error('page-1 canvas box not found');
  await page.mouse.move(box.x + box.width * fx0, box.y + box.height * fy0);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * fx1, box.y + box.height * fy1, { steps });
  await page.mouse.up();
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
    check('F0 deterministic 3-page fixture available', fixtureBytes > 1000, `${fixtureBytes} bytes`);

    /* ===== S1 — erase a committed rect shape via an edge swipe ===== */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      await page.locator('[data-testid="pdf-tool-shape"]').click();
      await dragOnPage(page, [0.20, 0.20], [0.45, 0.35]);
      const rectCount = await waitVisible(page.locator('[data-testid="pdf-page-1"] rect.pdf-shape'));
      check('11.11-A S1: rect commits onto the ink SVG', rectCount >= 1, `dom=${rectCount}`);

      await page.locator('[data-testid="pdf-tool-eraser"]').click();
      // Swipe along the rect's TOP edge, past both corners.
      await dragOnPage(page, [0.17, 0.20], [0.48, 0.20], 20);
      await waitDetached(page.locator('[data-testid="pdf-page-1"] rect.pdf-shape'));
      // The flush is debounced (800ms) — give the batch POST time to land.
      await page.waitForTimeout(1300);

      const rectAfter = await page.locator('[data-testid="pdf-page-1"] rect.pdf-shape').count();
      const storeShapes = Array.from(annotationStore.values()).filter((a) => a.annotationType === 'Shape').length;
      const deletedTotal = deletedBatches.reduce((sum, b) => sum + b.ids.length, 0);
      check(
        '11.11-A S1: eraser edge swipe removes the whole shape (DOM + store + wire)',
        rectAfter === 0 && storeShapes === 0 && deletedTotal >= 1,
        `dom=${rectAfter} store=${storeShapes} deletedIds=${deletedTotal}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/w11.11-s1-erase-shape.png` });
      await context.close();
    }

    /* ===== S2 — erase an ink stroke ===== */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      await page.locator('[data-testid="pdf-tool-pen"]').click();
      await dragOnPage(page, [0.20, 0.40], [0.50, 0.40], 16);
      const inkCommitted = await waitAttached(page.locator('[data-testid="pdf-page-1"] path.pdf-ink'));
      check('11.11-A S2: ink stroke commits onto the ink SVG', inkCommitted >= 1, `dom=${inkCommitted}`);

      await page.locator('[data-testid="pdf-tool-eraser"]').click();
      await dragOnPage(page, [0.17, 0.40], [0.53, 0.40], 20);
      await waitDetached(page.locator('[data-testid="pdf-page-1"] path.pdf-ink'));
      // The flush is debounced (800ms) — give the batch POST time to land.
      await page.waitForTimeout(1300);

      const inkAfter = await page.locator('[data-testid="pdf-page-1"] path.pdf-ink').count();
      const storeInk = Array.from(annotationStore.values()).filter((a) => a.annotationType === 'Ink').length;
      const deletedTotal = deletedBatches.reduce((sum, b) => sum + b.ids.length, 0);
      check(
        '11.11-A S2: eraser removes the whole stroke (DOM + store + wire)',
        inkAfter === 0 && storeInk === 0 && deletedTotal >= 1,
        `dom=${inkAfter} store=${storeInk} deletedIds=${deletedTotal}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/w11.11-s2-erase-ink.png` });
      await context.close();
    }

    /* ===== S3 — erase a sticky note over its (passive) icon ===== */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      await page.locator('[data-testid="pdf-tool-note"]').click();
      await dragOnPage(page, [0.70, 0.15], [0.70, 0.15], 1); // a tap (≤8px guard)
      const editor = page.locator('[data-testid="pdf-note-textarea"]');
      await editor.waitFor({ state: 'visible', timeout: 6000 });
      await editor.fill('ملاحظة المحو');
      await editor.press('Escape'); // commit + close (non-empty text persists)
      await waitVisible(page.locator('[data-testid="pdf-page-1"] [data-testid="pdf-note-icon"]'));
      check('11.11-A S3: note commits and its icon shows', true);

      await page.locator('[data-testid="pdf-tool-eraser"]').click();
      // The icon is fixed-px DOM at the anchor — the layer is passive in
      // eraser mode, so this drag must reach the geometry hit test.
      await dragOnPage(page, [0.685, 0.15], [0.715, 0.15], 6);
      await waitDetached(page.locator('[data-testid="pdf-page-1"] [data-testid="pdf-note-icon"]'));
      // The flush is debounced (800ms) — give the batch POST time to land.
      await page.waitForTimeout(1300);

      const iconAfter = await page.locator('[data-testid="pdf-page-1"] [data-testid="pdf-note-icon"]').count();
      const storeNotes = Array.from(annotationStore.values()).filter((a) => a.annotationType === 'Note').length;
      const deletedTotal = deletedBatches.reduce((sum, b) => sum + b.ids.length, 0);
      check(
        '11.11-A S3: eraser over the passive icon removes the whole note',
        iconAfter === 0 && storeNotes === 0 && deletedTotal >= 1,
        `dom=${iconAfter} store=${storeNotes} deletedIds=${deletedTotal}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/w11.11-s3-erase-note.png` });
      await context.close();
    }

    /* ===== S4 — a no-op gesture must erase nothing ===== */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      await page.locator('[data-testid="pdf-tool-shape"]').click();
      await dragOnPage(page, [0.20, 0.20], [0.45, 0.35]);
      await waitVisible(page.locator('[data-testid="pdf-page-1"] rect.pdf-shape'));

      await page.locator('[data-testid="pdf-tool-eraser"]').click();
      // Far from the rect (below it, empty page space).
      await dragOnPage(page, [0.20, 0.44], [0.60, 0.44], 20);
      // Two flush windows: prove no delete batch ever fires.
      await page.waitForTimeout(1300);

      const rectCount = await page.locator('[data-testid="pdf-page-1"] rect.pdf-shape').count();
      const storeSize = annotationStore.size;
      check(
        '11.11-A S4: eraser over empty space mutates nothing',
        rectCount === 1 && storeSize === 1 && deletedBatches.length === 0,
        `dom=${rectCount} store=${storeSize} deleteBatches=${deletedBatches.length}`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }

  /* ============ summary ============ */
  const failed = results.filter((r) => !r.ok).length;
  console.log('─'.repeat(64));
  console.log(`Scenarios: ${results.length - failed} passed / ${failed} failed (of ${results.length})`);
  console.log(`Console errors: ${consoleErrors.length}${consoleErrors.length ? ` — ${consoleErrors.slice(0, 5).join(' | ')}` : ''}`);
  console.log(`Page errors: ${pageErrors.length}${pageErrors.length ? ` — ${pageErrors.slice(0, 5).join(' | ')}` : ''}`);
  process.exit(failed === 0 && pageErrors.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('SPEC CRASHED:', error);
  console.error(`Console errors (${consoleErrors.length}):`, consoleErrors.slice(0, 10).join('\n  '));
  console.error(`Page errors (${pageErrors.length}):`, pageErrors.slice(0, 10).join('\n  '));
  process.exit(2);
});
