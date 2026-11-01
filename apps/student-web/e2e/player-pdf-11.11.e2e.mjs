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
        <p>Cardiology unit — page two anchor line.</p>
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

/** Canvas-box-relative drag on page 1 (fractions of the VISIBLE overlay band).
 *  Wave 12.2 — with the full-width column (E7) and the status bar (C.5) a
 *  page can extend far below the fold; pointer events only land inside
 *  pdf-scroll, so fractions map onto the canvas ∩ pdf-scroll band. */
async function dragOnPage(page, [fx0, fy0], [fx1, fy1], steps = 16) {
  const box = await page.locator('[data-testid="pdf-page-1"] canvas').boundingBox();
  if (!box) throw new Error('page-1 canvas box not found');
  const scrollBox = await page.locator('[data-testid="pdf-scroll"]').boundingBox();
  if (!scrollBox) throw new Error('pdf-scroll box not found');
  const top = Math.max(box.y, scrollBox.y);
  const bottom = Math.min(box.y + box.height, scrollBox.y + scrollBox.height);
  const left = Math.max(box.x, scrollBox.x);
  const right = Math.min(box.x + box.width, scrollBox.x + scrollBox.width);
  const band = { x: left, y: top, width: right - left, height: bottom - top };
  if (!(band.width > 0) || !(band.height > 0)) throw new Error('page-1 canvas has no visible band');
  await page.mouse.move(band.x + band.width * fx0, band.y + band.height * fy0);
  await page.mouse.down();
  await page.mouse.move(band.x + band.width * fx1, band.y + band.height * fy1, { steps });
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

    /* ===== S1b — R30.2: undo restores an erased shape, redo re-erases =====
       The exact production ask: eraser strokes must be reversible. Undo runs
       through the KEYBOARD chord (Ctrl+Z), redo through the TOOLBAR button —
       both paths covered in one scenario. */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      // Fresh session: both history controls disabled (never hidden).
      const undoDisabled = await page.locator('[data-testid="pdf-undo"]').isDisabled();
      const redoDisabled = await page.locator('[data-testid="pdf-redo"]').isDisabled();
      check(
        '11.11-A S1b: undo/redo disabled (not hidden) on a fresh session',
        undoDisabled && redoDisabled,
        `undoDisabled=${undoDisabled} redoDisabled=${redoDisabled}`,
      );

      // Draw a rect, let the upsert flush, then erase it like S1.
      await page.locator('[data-testid="pdf-tool-shape"]').click();
      await dragOnPage(page, [0.20, 0.20], [0.45, 0.35]);
      await waitVisible(page.locator('[data-testid="pdf-page-1"] rect.pdf-shape'));
      await page.waitForTimeout(1300);
      await page.locator('[data-testid="pdf-tool-eraser"]').click();
      await dragOnPage(page, [0.17, 0.20], [0.48, 0.20], 20);
      await waitDetached(page.locator('[data-testid="pdf-page-1"] rect.pdf-shape'));
      await page.waitForTimeout(1300);

      // Ctrl+Z → the pre-erase snapshot returns (original id, DOM + store).
      await page.keyboard.press('Control+z');
      await waitVisible(page.locator('[data-testid="pdf-page-1"] rect.pdf-shape'));
      await page.waitForTimeout(1300);
      const rectUndone = await page.locator('[data-testid="pdf-page-1"] rect.pdf-shape').count();
      const shapesUndone = Array.from(annotationStore.values()).filter((a) => a.annotationType === 'Shape').length;
      // After ONE undo the past stack still holds the initial empty-state
      // snapshot — undo stays armed for it; redo is armed by the future entry.
      const undoStillEnabled = !(await page.locator('[data-testid="pdf-undo"]').isDisabled());
      const redoNowEnabled = !(await page.locator('[data-testid="pdf-redo"]').isDisabled());
      check(
        '11.11-A S1b: Ctrl+Z restores the erased shape (DOM + store), redo armed',
        rectUndone === 1 && shapesUndone === 1 && undoStillEnabled && redoNowEnabled,
        `dom=${rectUndone} store=${shapesUndone} undoEnabled=${undoStillEnabled} redoEnabled=${redoNowEnabled}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/w11.11-s1b-undo-shape.png` });

      // Toolbar redo → back to the erased state.
      await page.locator('[data-testid="pdf-redo"]').click();
      await waitDetached(page.locator('[data-testid="pdf-page-1"] rect.pdf-shape'));
      await page.waitForTimeout(1300);
      const rectRedone = await page.locator('[data-testid="pdf-page-1"] rect.pdf-shape').count();
      const shapesRedone = Array.from(annotationStore.values()).filter((a) => a.annotationType === 'Shape').length;
      const redoExhausted = await page.locator('[data-testid="pdf-redo"]').isDisabled();
      check(
        '11.11-A S1b: toolbar redo re-erases the shape (DOM + store + wire), redo exhausted',
        rectRedone === 0 && shapesRedone === 0 && redoExhausted,
        `dom=${rectRedone} store=${shapesRedone} redoDisabled=${redoExhausted}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/w11.11-s1b-redo-shape.png` });
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

    /* ===== S5 — search: Latin query, hits render on the z-15 layer ===== */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      await page.locator('[data-testid="pdf-search-open"]').click();
      await page.locator('[data-testid="pdf-search-input"]').fill('Differential');
      await waitVisible(page.locator('[data-testid="pdf-search-panel"]'));
      await waitVisible(page.locator('[data-testid="pdf-search-layer-1"] .pdf-search-hit'));

      const hitInfo = await page.evaluate(() => {
        const layer = document.querySelector('[data-testid="pdf-search-layer-1"]');
        const cs = layer ? getComputedStyle(layer) : null;
        const hits = document.querySelectorAll('[data-testid="pdf-search-layer-1"] .pdf-search-hit');
        const active = document.querySelectorAll('[data-testid="pdf-search-layer-1"] .pdf-search-hit.is-active');
        return {
          z: cs?.zIndex ?? null,
          pointerEvents: cs?.pointerEvents ?? null,
          hits: hits.length,
          active: active.length,
          count: document.querySelector('[data-testid="pdf-search-count"]')?.textContent ?? '',
        };
      });
      check(
        '11.11-B S5: Latin query hits the z-15 layer (unchanged stack elsewhere)',
        hitInfo.hits >= 1 && hitInfo.z === '15' && hitInfo.pointerEvents === 'none' && hitInfo.active >= 1,
        JSON.stringify(hitInfo),
      );

      // R30.1 — GEOMETRY gate: every hit box must land ON the text-layer
      // spans. The pre-R30.1 math (raw transform[4]/[5], user space y-up)
      // painted near the page BOTTOM while the text sits at the top — this
      // ratio was ≈ 0 there. Alignment ≥ 50% proves the viewport mapping.
      const align = await page.evaluate(() => {
        const pageEl = document.querySelector('[data-testid="pdf-page-1"]');
        const hits = Array.from(pageEl.querySelectorAll('.pdf-search-hit')).map((el) => el.getBoundingClientRect());
        const spans = Array.from(pageEl.querySelectorAll('.pdf-text-layer span'))
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 1 && r.height > 1);
        if (hits.length === 0 || spans.length === 0) return { ratio: 0, hits: hits.length, spans: spans.length };
        const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
          * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        let hitArea = 0;
        let covered = 0;
        for (const h of hits) {
          hitArea += h.width * h.height;
          for (const s of spans) covered += inter(h, s);
        }
        return { ratio: covered / hitArea, hits: hits.length, spans: spans.length };
      });
      check(
        '11.11-B S5: R30.1 hit boxes land ON the text-layer spans (alignment ≥ 50%)',
        align.ratio >= 0.5,
        JSON.stringify(align),
      );

      // Wave 12.1 — CHAR-PRECISION gate: the highlight must cover the query
      // run itself ('Differential' ≈ 12 of ~57 line chars), not the whole
      // line. The DOM resolver rewrites the boxes right after the layer
      // build, so the gate polls until the geometry is char-precise (the
      // pre-12.1 whole-item boxes fail the widthRatio ≤ 1.35 arm by ≈ 4×).
      let preciseInfo = { ok: false, note: 'precision gate did not resolve' };
      try {
        const preciseHandle = await page.waitForFunction(() => {
          const pageEl = document.querySelector('[data-testid="pdf-page-1"]');
          const hits = Array.from(pageEl?.querySelectorAll('.pdf-search-hit') ?? [])
            .map((el) => el.getBoundingClientRect());
          if (hits.length === 0) return false;
          // The query run, measured from the SAME text-layer DOM the
          // resolver used: a DOM Range over the chars 'Differential'.
          const layer = pageEl?.querySelector('.pdf-text-layer');
          if (!layer) return false;
          const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
          const query = 'Differential';
          let joined = '';
          const nodes = [];
          let node = walker.nextNode();
          while (node) {
            nodes.push({ node, start: joined.length });
            joined += node.nodeValue ?? '';
            node = walker.nextNode();
          }
          const at = joined.indexOf(query);
          if (at === -1) return false;
          let startEntry = null;
          let endEntry = null;
          for (const entry of nodes) {
            const end = entry.start + (entry.node.nodeValue?.length ?? 0);
            if (!startEntry && at < end) startEntry = entry;
            if (!endEntry && at + query.length <= end) endEntry = entry;
          }
          if (!startEntry || !endEntry) return false;
          const runRange = document.createRange();
          runRange.setStart(startEntry.node, at - startEntry.start);
          runRange.setEnd(endEntry.node, at + query.length - endEntry.start);
          const runRects = Array.from(runRange.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
          if (runRects.length === 0) return false;
          const runWidth = Math.max(...runRects.map((r) => r.right)) - Math.min(...runRects.map((r) => r.left));
          const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
            * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          let hitArea = 0;
          let covered = 0;
          let maxRight = -Infinity;
          let minLeft = Infinity;
          for (const h of hits) {
            hitArea += h.width * h.height;
            minLeft = Math.min(minLeft, h.left);
            maxRight = Math.max(maxRight, h.right);
            for (const r of runRects) covered += inter(h, r);
          }
          const widthRatio = (maxRight - minLeft) / Math.max(1, runWidth);
          const runCoverage = covered / Math.max(1, hitArea);
          return widthRatio <= 1.35 && runCoverage >= 0.6
            ? { ok: true, hits: hits.length, widthRatio: Number(widthRatio.toFixed(3)), runCoverage: Number(runCoverage.toFixed(3)) }
            : false;
        }, null, { timeout: 8000 });
        preciseInfo = await preciseHandle.jsonValue();
      } catch {
        preciseInfo = { ok: false, note: 'boxes never became char-precise within 8s' };
      }
      check(
        '12.1 S5: hit boxes are char-precise (cover the query run, not the whole line)',
        preciseInfo?.ok === true,
        JSON.stringify(preciseInfo),
      );
      await page.screenshot({ path: `${SHOT_DIR}/w11.11-s5-search-latin.png` });

      // Close clears every transient layer.
      await page.locator('[data-testid="pdf-search-close"]').click();
      await page.waitForTimeout(200);
      const layersAfterClose = await page.locator('[data-testid^="pdf-search-layer-"]').count();
      const panelAfterClose = await page.locator('[data-testid="pdf-search-panel"]').count();
      check(
        '11.11-B S5: close clears the panel and all hit layers',
        layersAfterClose === 0 && panelAfterClose === 0,
        `layers=${layersAfterClose} panel=${panelAfterClose}`,
      );
      await context.close();
    }

    /* ===== S6 — search: Next/Prev navigates to a match on page 2 =====
       The query uses page 2's LATIN anchor line: the Arabic text this
       Chromium-printed fixture carries is ToUnicode-mangled (glyphs map to
       wrong/visual-order base letters — the documented R15.1 damage class),
       so no search can match it faithfully; Arabic matching correctness is
       falsified by the unit suite (visual-order fallback, presentation forms,
       item bridging). Latin survives the print pipeline intact. */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      await page.locator('[data-testid="pdf-search-open"]').click();
      // 'Cardiology' appears ONLY on page 2 — Next must pull the view there
      // (the whole-document sweep is current-page-first/lazy).
      await page.locator('[data-testid="pdf-search-input"]').fill('Cardiology');
      await waitVisible(page.locator('[data-testid="pdf-search-panel"]'));
      // Wait until the sweep reports real matches (count leaves '0 / 0').
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="pdf-search-count"]');
        const text = el?.textContent ?? '';
        return /^\d+ \/ \d+$/.test(text) && !text.startsWith('0 / 0');
      }, { timeout: 12000 });

      const firstCount = await page.locator('[data-testid="pdf-search-count"]').textContent();
      await page.locator('[data-testid="pdf-search-next"]').click();
      await page.waitForTimeout(1200); // smooth scroll + current-page update

      const pageInputValue = await page.locator('[data-testid="pdf-page-input"]').inputValue();
      const layer2Hits = await page.locator('[data-testid="pdf-search-layer-2"] .pdf-search-hit').count();
      const activeHit = await page.locator('[data-testid="pdf-search-layer-2"] .pdf-search-hit.is-active').count();
      check(
        '11.11-B S6: Arabic Next navigates to page 2 with an active hit',
        /^2$/.test(pageInputValue) && layer2Hits >= 1 && activeHit >= 1,
        `count="${firstCount}" pageInput=${pageInputValue} hits=${layer2Hits} active=${activeHit}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/w11.11-s6-search-arabic.png` });

      // Escape closes the panel, never the shell (Radix guard contract).
      await page.locator('[data-testid="pdf-search-input"]').press('Escape');
      await page.waitForTimeout(300);
      const panelGone = await page.locator('[data-testid="pdf-search-panel"]').count();
      const shellGone = await page.locator('[data-testid="pdf-player-shell"]').count();
      check(
        '11.11-B S6: Escape closes the panel but keeps the player open',
        panelGone === 0 && shellGone === 1,
        `panel=${panelGone} shell=${shellGone}`,
      );
      await context.close();
    }

    /* ===== S7 — scanned page (zero text items): text tools disable, others live ===== */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      // Contrast on page 1 (a text page): both text-dependent controls on.
      const hlOnText = page.locator('[data-testid="pdf-tool-highlighter"]');
      const seOnText = page.locator('[data-testid="pdf-search-open"]');
      await hlOnText.waitFor({ state: 'visible', timeout: 8000 });
      const textPageOk = !(await hlOnText.isDisabled()) && !(await seOnText.isDisabled());
      check(
        '11.11-C S7: text page keeps highlighter + search enabled',
        textPageOk,
        `hl=${!(await hlOnText.isDisabled())} search=${!(await seOnText.isDisabled())}`,
      );

      // Navigate to page 3 — the fixture's SVG-only page (zero text items).
      const pageInput = page.locator('[data-testid="pdf-page-input"]');
      await pageInput.fill('3');
      await pageInput.press('Enter');
      await page.locator('[data-testid="pdf-page-3"] canvas').waitFor({ state: 'visible', timeout: 20000 });
      await page.waitForFunction(() => {
        const hl = document.querySelector('[data-testid="pdf-tool-highlighter"]');
        const se = document.querySelector('[data-testid="pdf-search-open"]');
        return (hl instanceof HTMLButtonElement && hl.disabled === true)
          && (se instanceof HTMLButtonElement && se.disabled === true);
      }, null, { timeout: 8000 });

      const tooltips = await page.evaluate(() => ({
        hl: document.querySelector('[data-testid="pdf-tool-highlighter"]')?.getAttribute('title') ?? '',
        se: document.querySelector('[data-testid="pdf-search-open"]')?.getAttribute('title') ?? '',
        visible: {
          hl: !!(document.querySelector('[data-testid="pdf-tool-highlighter"]')),
          se: !!(document.querySelector('[data-testid="pdf-search-open"]')),
        },
      }));
      check(
        '11.11-C S7: scanned page DISABLES (not hides) with the Arabic tooltip',
        tooltips.hl.includes('ممسوحة') && tooltips.se.includes('ممسوحة')
          && tooltips.visible.hl && tooltips.visible.se,
        JSON.stringify(tooltips),
      );
      await page.screenshot({ path: `${SHOT_DIR}/w11.11-s7-scanned.png` });
      await context.close();
    }
    /* ===== S8 — Wave 12.3.C: notes list → click → page jump + flash ===== */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      // A note on page 1 (drawer-less desktop rail path).
      await page.locator('[data-testid="pdf-tool-note"]').click();
      await dragOnPage(page, [0.70, 0.15], [0.70, 0.15], 1);
      const editor = page.locator('[data-testid="pdf-note-textarea"]');
      await editor.waitFor({ state: 'visible', timeout: 6000 });
      await editor.fill('قائمة الملاحظات — محاضرة القلب');
      await editor.press('Escape'); // commit + close
      await waitVisible(page.locator('[data-testid="pdf-page-1"] [data-testid="pdf-note-icon"]'));

      // Walk to page 3 so the click must NAVIGATE back.
      const pageInput = page.locator('[data-testid="pdf-page-input"]');
      await pageInput.fill('3');
      await pageInput.press('Enter');
      await page.locator('[data-testid="pdf-page-3"] canvas').waitFor({ state: 'visible', timeout: 20000 });

      // Open the notes list from the study-tools rail.
      await page.locator('[data-testid="pdf-notes-list-toggle"]').click();
      const panel = page.locator('[data-testid="pdf-study-lists"]');
      await panel.waitFor({ state: 'visible', timeout: 4000 });
      const rowCount = await waitVisible(page.locator('[data-testid="pdf-list-row"]'));
      check('12.3-C S8a: notes list shows the committed note (docked panel)', rowCount >= 1, `rows=${rowCount}`);

      // Click the row → navigates to page 1 + flashes the note icon.
      await page.locator('[data-testid="pdf-list-row"]').first().click();
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="pdf-study-lists"]'),
        null, { timeout: 4000 },
      );
      // The status bar page counter flips to 1 when the scroll lands.
      await page.waitForFunction(() => {
        const el = document.querySelector('[data-testid="pdf-status-page"]');
        return el && el.textContent?.trim().startsWith('1 /');
      }, null, { timeout: 8000 });
      const flash = await page.evaluate(() => {
        const icon = document.querySelector('[data-testid="pdf-page-1"] [data-testid="pdf-note-icon"]');
        return icon ? icon.className.includes('pdf-annotation-flash') : false;
      });
      check('12.3-C S8b: row click navigates to the note page and flashes the note', flash, `flash=${flash}`);
      await page.screenshot({ path: `${SHOT_DIR}/w12.3-s8-notes-list.png` });
      await context.close();
    }

    /* ===== S9 — Wave 12.3.C: bookmark v1 → reload → persists ===== */
    {
      const { context } = await newPdfContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      // Bookmark page 2 (navigate first — page-level bookmarking).
      const pageInput = page.locator('[data-testid="pdf-page-input"]');
      await pageInput.fill('2');
      await pageInput.press('Enter');
      await page.locator('[data-testid="pdf-page-2"] canvas').waitFor({ state: 'visible', timeout: 20000 });
      await page.locator('[data-testid="pdf-bookmark-add"]').click();
      const toastText = await page.locator('[data-sonner-toast]').first().innerText().catch(() => '');
      check(
        '12.3-C S9a: add-bookmark toast fires for the current page',
        toastText.includes('علامة مرجعية') && toastText.includes('2'),
        toastText.slice(0, 60),
      );
      const storedBefore = await page.evaluate(() => {
        const keys = Object.keys(window.localStorage).filter((k) => k.startsWith('cms:pdf:bookmarks:'));
        return keys.map((k) => ({ key: k, value: JSON.parse(window.localStorage.getItem(k) ?? '[]') }));
      });
      check(
        '12.3-C S9b: bookmark persisted to localStorage keyed by fileId',
        storedBefore.length === 1 && storedBefore[0].value.some((b) => b.page === 2),
        JSON.stringify(storedBefore),
      );

      // RELOAD → reopen → the bookmarks list still shows page 2.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openPdfPlayer(page);
      await page.locator('[data-testid="pdf-bookmarks-toggle"]').click();
      await page.locator('[data-testid="pdf-study-lists"]').waitFor({ state: 'visible', timeout: 4000 });
      const row = page.locator('[data-testid="pdf-list-row"][data-page="2"]');
      await row.waitFor({ state: 'visible', timeout: 4000 });
      check('12.3-C S9c: bookmark survives a full page reload', true, 'row data-page=2 visible');
      await page.screenshot({ path: `${SHOT_DIR}/w12.3-s9-bookmarks.png` });
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
