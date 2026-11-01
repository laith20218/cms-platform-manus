/**
 * Wave 13.1 (F3) — §13 evidence pack: axe-core scan of the HTML player.
 *
 * Harness contract mirrors w12.3-matrix.e2e.mjs (same AxeBuilder tags + widths).
 * Run (dev server on 127.0.0.1:5173):  node e2e/w13.1-axe.mjs
 *
 * Scans (tags: wcag2a, wcag2aa, wcag21aa, wcag22aa):
 *  - the interactive lesson player (PlayerShell kind="html" + srcdoc iframe)
 *    at 375 / 414 / 768 / 1024 / 1440;
 *  - the error state (G-5) at 375 — the retry surface must stay accessible;
 *  - the static lesson (sandbox="") at 375.
 *
 * Blocking = critical | serious violations. Output: console summary (for the
 * WIP_STATUS report) + machine-readable JSON at e2e/screenshots/w13.1-axe.json.
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

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const runs = [];

const LESSON_BODY = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><title>${LESSON_TITLE}</title></head><body>
<h1>درس القلب التفاعلي</h1><p>محتوى تجريبي للفحص الآلي.</p>
</body></html>`;

async function newContext(browser, viewport, { broken = false } = {}) {
  const context = await browser.newContext({ viewport, locale: 'ar' });
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
      sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
    } catch { /* sandboxed frames */ }
  });
  await context.route('**/api/v1/**', (route) => route.abort());
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));

  const summary = {
    id: FILE_ID, type: 'Html', title: LESSON_TITLE, description: 'درس HTML تجريبي',
    fileSize: 2048, durationSeconds: null, pagesCount: null, thumbnailUrl: null,
    viewsCount: 0, isFavorite: false, category: 'Lecture', createdAt: '2026-11-15T12:00:00Z',
  };
  await context.route(`**/api/v1/subjects/${SUBJECT_SLUG}`, (route) => route.fulfill({
    json: {
      id: SUBJECT_ID, slug: SUBJECT_SLUG, nameAr: 'مادة HTML التجريبية', color: null,
      totalQuestions: 0, totalLectures: 0, totalFiles: 1, totalExams: 0,
      lastContentUpdatedAt: null, userProgress: null, contentScopes: ['LecturesText'], description: null,
    },
  }));
  await context.route(`**/api/v1/library/subject/${SUBJECT_ID}**`, (route) => route.fulfill({
    json: { items: [summary], total: 1, page: 1, pageSize: 20, totalPages: 1 },
  }));
  await context.route(`**/api/v1/library/${FILE_ID}/access`, (route) => route.fulfill({
    json: {
      accessUrl: `${BASE_URL}/api/v1/library/${FILE_ID}/content`,
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
      watermark: { studentName: 'طالب الاختبار HTML', studentPhone: '+962790000003', timestamp: new Date().toISOString(), siteName: 'CMS' },
    },
  }));
  await context.route(`**/api/v1/library/${FILE_ID}`, (route) => route.fulfill({
    json: { ...summary, subjectId: SUBJECT_ID, lectureId: null, fileFormat: 'text/html', youtubeVideoId: null, tags: [], favoritesCount: 0, enableScripts: true, contentProcessingStatus: 'Ready' },
  }));
  await context.route(`**/api/v1/library/${FILE_ID}/content`, (route) => route.fulfill(
    broken
      ? { status: 500, body: 'storage outage' }
      : { body: LESSON_BODY, contentType: 'text/html; charset=utf-8' },
  ));
  await context.route(`**/api/v1/library/${FILE_ID}/view`, (route) => route.fulfill({ status: 204, body: '' }));
  return context;
}

async function axeScan(page, label, { blocking: blockingRun = true } = {}) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS)
    // §13 contract: the scan measures what Wave 13 OWNS — the player stage
    // subtree (shell header + content + iframe). Page-level chrome outside the
    // stage is covered by the separate informational scan below.
    .include('[data-testid="player-stage"]')
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }));
  runs.push({ label, violations: results.violations.length, blocking });
  console.log(`  AXE ${label}: ${results.violations.length} total, ${blocking.length} blocking${blocking.length ? ' → ' + JSON.stringify(blocking) : ''}`);
  return blockingRun ? blocking : [];
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'],
  });

  let anyBlocking = false;
  try {
    const VIEWPORTS = [
      { width: 375, height: 812 },
      { width: 414, height: 812 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ];

    // Interactive lesson player at all five §13 widths.
    for (const viewport of VIEWPORTS) {
      const context = await newContext(browser, viewport);
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library`, { timeout: 60_000 });
      await page.locator(`text=${LESSON_TITLE}`).first().click();
      await page.locator('[data-testid="library-html-player-frame"]').waitFor({ state: 'attached', timeout: 20_000 });
      await page.waitForTimeout(500);
      anyBlocking = (await axeScan(page, `interactive @ ${viewport.width}px`)).length > 0 || anyBlocking;
      await context.close();
    }

    // Informational (NOT blocking) — the WHOLE page at 768×1024, the one
    // geometry where the modal overlay stops occluding the app's bottom nav.
    // KNOWN PRE-EXISTING FINDING (disclosed in WIP_STATUS, OUT OF SCOPE §12):
    // BottomNav.tsx:69 active label — #1e6feb on #eff6ff = 4.26:1 < 4.5:1.
    // Untouched by Wave 13; recorded here as evidence, fixed in a dedicated pass.
    {
      const context = await newContext(browser, { width: 768, height: 1024 });
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library`, { timeout: 60_000 });
      await page.locator(`text=${LESSON_TITLE}`).first().click();
      await page.locator('[data-testid="library-html-player-frame"]').waitFor({ state: 'attached', timeout: 20_000 });
      await page.waitForTimeout(2500);
      await axeScan(page, 'page-chrome @ 768px (informational, unscoped)', { blocking: false });
      await context.close();
    }

    // Error state (G-5) at 375.
    {
      const context = await newContext(browser, { width: 375, height: 812 }, { broken: true });
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library`, { timeout: 60_000 });
      await page.locator(`text=${LESSON_TITLE}`).first().click();
      await page.locator('[data-testid="library-html-player-error"]').waitFor({ state: 'visible', timeout: 20_000 });
      anyBlocking = (await axeScan(page, 'error-state @ 375px')).length > 0 || anyBlocking;
      await context.close();
    }

    // Static lesson (sandbox="") at 375.
    {
      const context = await newContext(browser, { width: 375, height: 812 });
      const page = await context.newPage();
      // Flip the mocked detail to enableScripts=false by intercepting once more.
      await context.route(`**/api/v1/library/${FILE_ID}`, (route) => route.fulfill({
        json: {
          id: FILE_ID, type: 'Html', title: LESSON_TITLE, description: 'درس HTML تجريبي',
          fileSize: 2048, durationSeconds: null, pagesCount: null, thumbnailUrl: null,
          viewsCount: 0, isFavorite: false, category: 'Lecture', createdAt: '2026-11-15T12:00:00Z',
          subjectId: SUBJECT_ID, lectureId: null, fileFormat: 'text/html', youtubeVideoId: null,
          tags: [], favoritesCount: 0, enableScripts: false, contentProcessingStatus: 'Ready',
        },
      }));
      await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library`, { timeout: 60_000 });
      await page.locator(`text=${LESSON_TITLE}`).first().click();
      await page.locator('[data-testid="library-html-player-frame"]').waitFor({ state: 'attached', timeout: 20_000 });
      await page.waitForTimeout(500);
      anyBlocking = (await axeScan(page, 'static @ 375px')).length > 0 || anyBlocking;
      await context.close();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(`${SHOT_DIR}w13.1-axe.json`, JSON.stringify({ generatedAt: new Date().toISOString(), runs }, null, 2));
  console.log(`\n==== w13.1-axe: ${runs.length} scans, blocking=${anyBlocking ? 'YES' : 'NONE'} ====\n`);
  process.exitCode = anyBlocking ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
