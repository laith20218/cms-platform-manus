/**
 * Wave 12.2.D — §13 compliance matrix E2E (4-width × 5-state) + axe-core.
 *
 * D.1 SCREENSHOT MATRIX (supervisor §13/D.1 — HARD FAIL on horizontal scroll):
 *   viewports {375×812, 768×1024, 1024×768, 1440×900}; states {default,
 *   focus, thumbnails-open, study-tools-open, search-open}; per state:
 *     - document.scrollWidth <= innerWidth (no PAGE horizontal scroll)
 *     - pdf-scroll.scrollWidth === pdf-scroll.clientWidth (no column overflow)
 *     - screenshot e2e/screenshots/w12.2-{width}-{state}.png
 *
 * D.2 A11Y (@axe-core/playwright, E6): scan the PDF lecture (default / focus /
 *   search-open / note-open), LoginPage, RegisterPage, DashboardPage,
 *   LibraryPage — at 375 and 1440. FAIL on any critical/serious violation.
 *   Aggregated results → e2e/screenshots/axe-results.json.
 *
 * Harness contract mirrors player-pdf-11.11.e2e.mjs (same fixture + mocks).
 * Run (dev server on 127.0.0.1:5173):  node e2e/w12.2-matrix.e2e.mjs
 */
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
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

const FIXTURE_PATH = fileURLToPath(new URL('../public/e2e-test-doc-1111.pdf', import.meta.url));

/* ============ shared harness (mirrors player-pdf-11.11) ============ */

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? '  PASS' : '! FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

const consoleErrors = [];
const pageErrors = [];

async function ensurePdfFixture(browser) {
  if (fs.existsSync(FIXTURE_PATH)) return fs.statSync(FIXTURE_PATH).size;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent('<html><body><p>fixture</p></body></html>');
  await context.close();
  throw new Error('fixture missing — run player-pdf-11.11.e2e.mjs once to generate it');
}

async function newContext(browser, viewport, { authenticated = true } = {}) {
  const context = await browser.newContext({ viewport, locale: 'ar', hasTouch: true });
  if (authenticated) {
    await context.addInitScript(() => {
      sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
      sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
    });
  }

  await context.route('**/api/v1/**', (route) => route.abort());
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));

  const fileSummary = {
    id: FILE_ID, type: 'Pdf', title: 'محاضرة PDF تجريبية',
    description: 'مستند تجريبي لمشغّل PDF — مصفوفة العروض الأربع',
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
  await context.route(`**/api/v1/library/${FILE_ID}/view`, async (route) => route.fulfill({ status: 204, body: '' }));
  await context.route(`**/api/v1/library/${FILE_ID}/annotations`, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    return route.fulfill({ json: { appliedCount: 0, serverTime: new Date().toISOString() } });
  });

  context.on('page', (page) => {
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text();
        // The harness deliberately aborts unmapped /api/v1/** routes (e.g. the
        // dashboard's data probes); Chromium logs each as a resource-load
        // failure. That is harness noise, not an app error.
        if (text.includes('Failed to load resource')) return;
        consoleErrors.push(text);
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

async function openPdfPlayer(page) {
  await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library`, { timeout: 60_000 });
  await page.locator('text=محاضرة PDF تجريبية').first().click();
  await page.locator('[data-testid="pdf-player-shell"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-testid="pdf-controls-bar"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-testid="pdf-page-1"] canvas').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[data-pdf-text-layer] > span').first().waitFor({ state: 'attached', timeout: 30_000 });
  await page.waitForTimeout(600);
}

/** The §13 horizontal-scroll gate — HARD FAIL semantics live in the caller. */
async function horizontalScrollProbe(page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('[data-testid="pdf-scroll"]');
    return {
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      scrollerDefined: !!scroller,
      scrollerScrollWidth: scroller ? scroller.scrollWidth : -1,
      scrollerClientWidth: scroller ? scroller.clientWidth : -1,
    };
  });
}

/** Opens one matrix state; returns a cleanup that restores the default. */
async function enterState(page, state) {
  switch (state) {
    case 'default':
      return async () => {};
    case 'focus': {
      await page.locator('[data-testid="pdf-focus-toggle"]').click();
      await page.locator('[data-testid="pdf-focus-exit"]').waitFor({ state: 'visible', timeout: 4000 });
      return async () => {
        await page.locator('[data-testid="pdf-focus-exit"]').click();
        await page.locator('[data-testid="pdf-controls-bar"]').waitFor({ state: 'visible', timeout: 4000 });
      };
    }
    case 'thumbnails-open': {
      const trigger = page.locator('[data-testid="pdf-thumbs-open"]');
      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click();
        await page.locator('[data-testid="pdf-thumbs-close"]').waitFor({ state: 'visible', timeout: 4000 });
        return async () => {
          await page.locator('[data-testid="pdf-thumbs-close"]').click();
          await page.waitForTimeout(250);
        };
      }
      // ≥ lg: the rail is permanently docked — capture it as-is.
      return async () => {};
    }
    case 'study-tools-open': {
      const trigger = page.locator('[data-testid="pdf-study-tools-open"]');
      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click();
        await page.locator('[data-testid="pdf-study-tools-close"]').waitFor({ state: 'visible', timeout: 4000 });
        return async () => {
          await page.locator('[data-testid="pdf-study-tools-close"]').click();
          await page.waitForTimeout(250);
        };
      }
      return async () => {};
    }
    case 'search-open': {
      await page.locator('[data-testid="pdf-search-open"]').click();
      await page.locator('[data-testid="pdf-search-input"]').fill('Differential');
      await page.locator('[data-testid="pdf-search-panel"]').waitFor({ state: 'visible', timeout: 4000 });
      return async () => {
        await page.locator('[data-testid="pdf-search-close"]').click();
        await page.waitForTimeout(200);
      };
    }
    default:
      throw new Error(`unknown state ${state}`);
  }
}

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const axeRuns = [];

/** One axe pass; records + returns the critical/serious violations. */
async function axeScan(page, label) {
  const builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
  const results = await builder.analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }));
  axeRuns.push({ label, url: results.url, violations: results.violations.length, blocking });
  console.log(`  AXE ${label}: ${results.violations.length} total, ${blocking.length} blocking`);
  return blocking;
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'],
  });

  const VIEWPORTS = [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];
  const STATES = ['default', 'focus', 'thumbnails-open', 'study-tools-open', 'search-open'];
  const scrollFailures = [];

  try {
    await ensurePdfFixture(browser);
    check('D.0 fixture available', true);

    /* ===== D.1 — 4-width × 5-state matrix ===== */
    for (const viewport of VIEWPORTS) {
      const width = viewport.width;
      const context = await newContext(browser, viewport);
      const page = await context.newPage();
      await openPdfPlayer(page);

      for (const state of STATES) {
        const cleanup = await enterState(page, state);
        await page.waitForTimeout(400); // settle animations (200ms) + lazy thumbs

        const probe = await horizontalScrollProbe(page);
        const docOk = probe.docScrollWidth <= probe.innerWidth;
        const columnOk = !probe.scrollerDefined || probe.scrollerScrollWidth === probe.scrollerClientWidth;
        if (!docOk || !columnOk) {
          scrollFailures.push({ width, state, probe });
        }
        check(
          `D.1 §13 ${width}px / ${state}: zero horizontal scroll`,
          docOk && columnOk,
          `doc=${probe.docScrollWidth}/${probe.innerWidth} column=${probe.scrollerScrollWidth}/${probe.scrollerClientWidth}`,
        );
        await page.screenshot({ path: `${SHOT_DIR}/w12.2-${width}-${state}.png`, fullPage: false });
        await cleanup();
      }
      await context.close();
    }

    /* ===== D.2 — axe-core: PDF lecture states + app pages, 375 & 1440 ===== */
    for (const width of [375, 1440]) {
      // (a) PDF lecture — default / focus / search-open / note-open.
      {
        const context = await newContext(browser, { width, height: width === 375 ? 812 : 900 });
        const page = await context.newPage();
        await openPdfPlayer(page);

        let blocking = await axeScan(page, `pdf-default@${width}`);
        if (blocking.length > 0) check(`D.2 axe pdf-default@${width} clean`, false, JSON.stringify(blocking));

        await page.locator('[data-testid="pdf-focus-toggle"]').click();
        await page.locator('[data-testid="pdf-focus-exit"]').waitFor({ state: 'visible' });
        blocking = await axeScan(page, `pdf-focus@${width}`);
        if (blocking.length > 0) check(`D.2 axe pdf-focus@${width} clean`, false, JSON.stringify(blocking));
        await page.locator('[data-testid="pdf-focus-exit"]').click();

        await page.locator('[data-testid="pdf-search-open"]').click();
        await page.locator('[data-testid="pdf-search-input"]').fill('Differential');
        blocking = await axeScan(page, `pdf-search-open@${width}`);
        if (blocking.length > 0) check(`D.2 axe pdf-search-open@${width} clean`, false, JSON.stringify(blocking));
        await page.locator('[data-testid="pdf-search-close"]').click();

        // note-open: place a note (drawer path below lg), the editor auto-opens.
        const studyTrigger = page.locator('[data-testid="pdf-study-tools-open"]');
        if (await studyTrigger.isVisible().catch(() => false)) {
          await studyTrigger.click();
          await page.locator('[data-testid="pdf-study-tools-close"]').waitFor({ state: 'visible' });
        }
        // The drawer is open below lg — scope to the VISIBLE copy (the hidden
        // desktop rail also carries the testid in the DOM).
        await page.locator('[data-testid="pdf-tool-note"]:visible').click();
        const canvas = page.locator('[data-testid="pdf-page-1"] canvas');
        const box = await canvas.boundingBox();
        await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.15);
        await page.locator('[data-testid="pdf-note-textarea"]').waitFor({ state: 'visible', timeout: 6000 });
        blocking = await axeScan(page, `pdf-note-open@${width}`);
        if (blocking.length > 0) check(`D.2 axe pdf-note-open@${width} clean`, false, JSON.stringify(blocking));

        await context.close();
      }

      // (b) Library page (authenticated).
      {
        const context = await newContext(browser, { width, height: width === 375 ? 812 : 900 });
        const page = await context.newPage();
        await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library`, { timeout: 60_000 });
        await page.waitForTimeout(1200);
        const blocking = await axeScan(page, `library@${width}`);
        if (blocking.length > 0) check(`D.2 axe library@${width} clean`, false, JSON.stringify(blocking));
        await context.close();
      }

      // (c) Dashboard page (authenticated; unmocked data endpoints abort →
      //     the page renders its error/empty state — scanned as rendered).
      {
        const context = await newContext(browser, { width, height: width === 375 ? 812 : 900 });
        const page = await context.newPage();
        await page.goto(`${BASE_URL}/dashboard`, { timeout: 60_000 });
        await page.waitForTimeout(1200);
        const blocking = await axeScan(page, `dashboard@${width}`);
        if (blocking.length > 0) check(`D.2 axe dashboard@${width} clean`, false, JSON.stringify(blocking));
        await context.close();
      }

      // (d) Login + Register (unauthenticated surfaces).
      for (const route of ['login', 'register']) {
        const context = await newContext(browser, { width, height: width === 375 ? 812 : 900 }, { authenticated: false });
        const page = await context.newPage();
        await page.goto(`${BASE_URL}/${route}`, { timeout: 60_000 });
        await page.waitForTimeout(900);
        const blocking = await axeScan(page, `${route}@${width}`);
        if (blocking.length > 0) check(`D.2 axe ${route}@${width} clean`, false, JSON.stringify(blocking));
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(
    fileURLToPath(new URL('./screenshots/axe-results.json', import.meta.url)),
    JSON.stringify({ tags: AXE_TAGS, runs: axeRuns }, null, 2),
  );

  /* ============ summary ============ */
  const failed = results.filter((r) => !r.ok).length;
  console.log('─'.repeat(64));
  console.log(`Matrix: ${results.length - failed} passed / ${failed} failed (of ${results.length})`);
  console.log(`Horizontal-scroll failures: ${scrollFailures.length}`);
  console.log(`Axe runs: ${axeRuns.length}, runs with blocking violations: ${axeRuns.filter((r) => r.blocking.length > 0).length}`);
  console.log(`Console errors: ${consoleErrors.length}${consoleErrors.length ? ` — ${consoleErrors.slice(0, 5).join(' | ')}` : ''}`);
  console.log(`Page errors: ${pageErrors.length}${pageErrors.length ? ` — ${pageErrors.slice(0, 5).join(' | ')}` : ''}`);
  const axeBlocking = axeRuns.some((r) => r.blocking.length > 0);
  process.exit(failed === 0 && scrollFailures.length === 0 && !axeBlocking && pageErrors.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('SPEC CRASHED:', error);
  console.error(`Console errors (${consoleErrors.length}):`, consoleErrors.slice(0, 10).join('\n  '));
  console.error(`Page errors (${pageErrors.length}):`, pageErrors.slice(0, 10).join('\n  '));
  process.exit(2);
});
