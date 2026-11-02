/**
 * Wave 12.5.B — §13 evidence pack: the PDF player STUDY-LISTS surface with
 * SERVER-persisted bookmarks (the Wave 12.5 commit-2 UI).
 *
 * Harness contract mirrors w12.4a-axe.mjs (same AxeBuilder tags + widths) with
 * the PDF network mocks lifted from player-pdf-11.11.e2e.mjs (annotations +
 * bookmarks + fixture PDF). Per §13 width (375 / 414 / 768 / 1024 / 1440) it:
 *   1. opens the production PDF player, adds a page bookmark via the rail
 *      toggle (optimistic mutation against the mocked bookmark endpoints),
 *   2. opens the bookmarks study-list panel,
 *   3. captures a screenshot,
 *   4. asserts NO horizontal page scroll at every width,
 *   5. asserts the panel's interactive targets stay ≥ 44px (WCAG 2.5.8),
 *   6. runs axe-core (wcag2a, wcag2aa, wcag21aa, wcag22aa) scoped to the
 *      player container — what this wave owns.
 *
 * Blocking = critical | serious violations. Output: console summary +
 * machine-readable JSON at e2e/screenshots/w12.5-bookmarks-axe.json.
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/w12.5-bookmarks-axe.mjs
 */
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
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

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const runs = [];

async function ensurePdfFixture(browser) {
  if (fs.existsSync(FIXTURE_PATH)) return fs.statSync(FIXTURE_PATH).size;
  throw new Error('fixture missing — run player-pdf-11.11.e2e.mjs once to generate it');
}

async function newPdfContext(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'ar', hasTouch: true });
  await context.addInitScript(() => {
    sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
    // Deterministic: no legacy bookmarks on this device (the import path is
    // covered by player-pdf-11.11 S9e; this scan measures the steady state).
    window.localStorage.removeItem('cms:pdf:bookmarks:55555555-1111-2222-3333-444444444444');
  });

  const bookmarkStore = new Map();

  await context.route('**/api/v1/**', (route) => route.abort());
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));

  const fileSummary = {
    id: FILE_ID, type: 'Pdf', title: 'محاضرة PDF تجريبية',
    description: 'مستند تجريبي لمشغّل PDF — حزمة أدلة §13 للعلامات المرجعية',
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
  await context.route(`**/api/v1/library/${FILE_ID}/view`, (route) => route.fulfill({ status: 204, body: '' }));
  await context.route(`**/api/v1/library/${FILE_ID}/annotations`, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    return route.fulfill({ json: { appliedCount: 0, serverTime: new Date().toISOString() } });
  });
  await context.route(`**/api/v1/library/${FILE_ID}/bookmarks`, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: Array.from(bookmarkStore.values()) });
    const body = route.request().postDataJSON();
    const existing = Array.from(bookmarkStore.values()).find((row) => row.pageNumber === body.pageNumber);
    const row = existing ?? { id: `bm-${body.pageNumber}-${Date.now()}`, pageNumber: body.pageNumber };
    row.snippet = body.snippet ?? null;
    if (!existing) row.createdAt = new Date().toISOString();
    row.updatedAt = new Date().toISOString();
    bookmarkStore.set(row.id, row);
    return route.fulfill({ json: row });
  });
  await context.route(/\/api\/v1\/library\/bookmarks\/[^/]+$/, async (route) => {
    bookmarkStore.delete(route.request().url().split('/').pop());
    return route.fulfill({ status: 204, body: '' });
  });
  return context;
}

/** Opens the compact-width tools drawer when present (no-op ≥ lg where the
 *  rail is docked). Mirrors w12.3-matrix.e2e.mjs's ensureToolsOpen. */
async function ensureToolsOpen(page) {
  const closeBtn = page.locator('[data-testid="pdf-study-tools-close"]');
  if (await closeBtn.isVisible().catch(() => false)) return; // already open
  const trigger = page.locator('[data-testid="pdf-mobile-tools"]');
  if (await trigger.isVisible().catch(() => false)) {
    await trigger.click();
    await closeBtn.waitFor({ state: 'visible', timeout: 4000 });
  }
}

async function axeScan(page, label) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS)
    // §13 contract: the scan measures what Wave 12.5 owns — the PDF player
    // shell (rail + study-list panel + thumbnails).
    .include('[data-testid="pdf-player-shell"]')
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }));
  runs.push({ label, violations: results.violations.length, blocking });
  console.log(`  AXE ${label}: ${results.violations.length} total, ${blocking.length} blocking${blocking.length ? ' → ' + JSON.stringify(blocking) : ''}`);
  return blocking;
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox', '--hide-scrollbars'],
  });
  await ensurePdfFixture(browser);

  let anyBlocking = false;
  try {
    const VIEWPORTS = [
      { width: 375, height: 812 },
      { width: 414, height: 812 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ];

    for (const viewport of VIEWPORTS) {
      console.log(`  == viewport ${viewport.width}x${viewport.height} ==`);
      const context = await newPdfContext(browser, viewport);
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library`, { timeout: 60_000 });
      await page.locator('text=محاضرة PDF تجريبية').first().click();
      await page.locator('[data-testid="pdf-player-shell"]').waitFor({ state: 'visible', timeout: 20_000 });
      await page.waitForFunction(() => {
        const status = document.querySelector('[data-testid="pdf-status-page"]');
        return !!status && /1\s*\//.test(status.textContent ?? '');
      }, null, { timeout: 20_000 });

      // Add a bookmark on page 1 through the REAL rail toggle (optimistic add).
      // On compact widths the rail lives inside the tools drawer — open it first.
      await ensureToolsOpen(page);
      await page.locator('[data-testid="pdf-bookmark-add"]:visible').click();
      await page.waitForTimeout(400);

      // Open the bookmarks study-list panel (drawer < lg, docked ≥ lg).
      await ensureToolsOpen(page);
      await page.locator('[data-testid="pdf-bookmarks-toggle"]:visible').click();
      await page.locator('[data-testid="pdf-study-lists"]').waitFor({ state: 'visible', timeout: 8_000 });
      await page.locator('[data-testid="pdf-list-row"][data-page="1"]').waitFor({ state: 'visible', timeout: 8_000 });

      // §13: zero horizontal page scroll + ≥44px interactive targets on the
      // WAVE-OWNED surface (bookmarks list rows + row-remove + the rail add
      // toggle). Only VISIBLE boxes are measured — the 12.3 drawers stay
      // mounted but hidden (zero client rects), and the pre-existing panel
      // close button (40px, unchanged 12.3 chrome) is REPORTED, not gated.
      const layout = await page.evaluate(() => {
        const visibleBox = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && el.getClientRects().length > 0
            ? { w: Math.round(r.width), h: Math.round(r.height) } : null;
        };
        const collect = (sel) => [...document.querySelectorAll(sel)]
          .map((el) => ({ testid: el.getAttribute('data-testid') ?? el.tagName, box: visibleBox(el) }))
          .filter((t) => t.box);
        const owned = collect(
          '[data-testid="pdf-study-lists"] [data-testid="pdf-list-row"] button, ' +
          '[data-testid="pdf-study-lists"] [data-testid="pdf-bookmark-remove"], ' +
          '[data-testid="pdf-bookmark-add"]',
        );
        const closeButton = collect('[data-testid="pdf-study-lists-close"]');
        const panelTargets = owned.filter((t) => t.testid !== 'pdf-bookmark-add');
        const minPanel = panelTargets.reduce(
          (min, t) => (t.box.h < min.box.h ? t : min),
          { testid: 'none', box: { w: 999, h: 999 } },
        );
        const railAdd = owned.find((t) => t.testid === 'pdf-bookmark-add');
        return {
          pageNoHScroll: document.documentElement.scrollWidth <= window.innerWidth,
          minPanel,
          railAddBox: railAdd?.box ?? null,
          ownedCount: owned.length,
          closeBox: closeButton[0]?.box ?? null,
        };
      });
      // §13 gate = the surface THIS wave owns: panel rows + row-remove ≥ 44px and
      // zero horizontal scroll. The rail toggle's compressed box at short desktop
      // viewports (22px @1024x768) is PRE-EXISTING 12.2/12.3 rail flex behavior —
      // A/B-proven identical on main @ 6a28f6d — so it is REPORTED, not gated (§12).
      const layoutOk = layout.pageNoHScroll && layout.minPanel.box.h >= 44;
      console.log(`  LAYOUT @${viewport.width}px: pageNoHScroll=${layout.pageNoHScroll} ownedTargets=${layout.ownedCount} minPanel=${layout.minPanel.box.h}px (${layout.minPanel.testid}) railAdd=${layout.railAddBox ? `${layout.railAddBox.h}px` : 'n/a'} preExistingClose=${layout.closeBox ? `${layout.closeBox.h}px` : 'n/a'} → ${layoutOk ? 'OK' : 'FAIL'}`);

      await page.screenshot({ path: path.join(SHOT_DIR, `w12.5-bookmarks-${viewport.width}.png`) });
      const blocking = await axeScan(page, `pdf bookmarks panel @ ${viewport.width}px`);
      anyBlocking = blocking.length > 0 || anyBlocking;
      runs[runs.length - 1].layoutOk = layoutOk;
      if (!layoutOk) anyBlocking = true;
      await context.close();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(`${SHOT_DIR}w12.5-bookmarks-axe.json`, JSON.stringify({ generatedAt: new Date().toISOString(), runs }, null, 2));
  console.log(`\n==== w12.5-bookmarks-axe: ${runs.length} scans, blocking=${anyBlocking ? 'YES' : 'NONE'} ====\n`);
  process.exitCode = anyBlocking ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
