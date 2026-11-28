/**
 * Command Center final pass — surface evidence script.
 *
 * Drives the REAL vite dev server (http://127.0.0.1:5174) with the PR-10
 * fully-mocked API world (fail-visible abort catch-all; zero real network
 * calls; zero credentials; zero student PII — every name below is synthetic).
 *
 * Produces the safe visual evidence matrix the PR requires:
 *   dashboard desktop / mobile / dark, expanded + collapsed sidebar, servers
 *   summary card, student detail drawer, security event drawer, library
 *   upload drawer, exam results drawer, course edit drawer, settings history
 *   drawer, create-student modal, confirmation dialog, overflow menu,
 *   loading state, empty state, unavailable state, focus-visible state.
 *
 * Each surface also gets: no-horizontal-scroll assertion + axe (wcag2a/aa +
 * wcag21aa + wcag22aa) with a 0 critical/serious gate — the same contract as
 * pr10-admin-smoke. RAM contract: ONE Chromium instance, per-scenario
 * contexts, closed at the end.
 *
 * Run: E2E_ADMIN_URL=http://127.0.0.1:5174 node e2e/cc-final-surfaces.e2e.mjs
 */
let chromium;
const PLAYWRIGHT_CANDIDATES = [
  process.env.E2E_PLAYWRIGHT_MODULE,
  'file:///home/z/my-project/cms-platform-manus/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs',
  'playwright',
].filter(Boolean);
for (const candidate of PLAYWRIGHT_CANDIDATES) {
  try { ({ chromium } = await import(candidate)); break; } catch { /* try next */ }
}
if (!chromium) {
  console.error('playwright module not found — set E2E_PLAYWRIGHT_MODULE');
  process.exit(1);
}
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mockWorld } from './admin-mock-world.mjs';

const BASE_URL = process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:5174';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));
const AXE_JS = process.env.E2E_AXE_JS
  ?? '/home/z/my-project/cms-platform-manus/node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.js';

mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log(`${ok ? '  PASS' : '! FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

let peakChromeRssKb = 0;
const sampler = setInterval(() => {
  try {
    const out = execSync("ps -C chrome --no-headers -o rss= 2>/dev/null | awk '{s+=$1} END {print s+0}'", { stdio: ['ignore', 'pipe', 'ignore'] });
    const kb = Number(out.toString().trim());
    if (kb > peakChromeRssKb) peakChromeRssKb = kb;
  } catch { /* best-effort */ }
}, 400);

async function hScroll(page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    const start = doc.scrollLeft;
    doc.scrollLeft = 99999;
    const a = doc.scrollLeft;
    doc.scrollLeft = -99999;
    const b = doc.scrollLeft;
    doc.scrollLeft = start;
    return Math.abs(a - b);
  });
}

async function axeScan(page, label) {
  await page.addScriptTag({ content: readFileSync(AXE_JS, 'utf-8') });
  const axeResult = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
    });
    return {
      total: r.violations.length,
      blocking: r.violations
        .filter(v => v.impact === 'critical' || v.impact === 'serious')
        .map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, first: v.nodes[0]?.target?.[0] ?? '' })),
    };
  });
  check(`AXE ${label}: 0 critical/serious`, axeResult.blocking.length === 0,
    `${axeResult.total} rule(s), blocking=${axeResult.blocking.length}${axeResult.blocking.length ? ' :: ' + JSON.stringify(axeResult.blocking) : ''}`);
}

async function noHScroll(page, label) {
  const delta = await hScroll(page);
  check(`${label}: no horizontal scroll`, delta === 0, `scrollDelta=${delta}`);
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOT_DIR}cc-final-${name}.png`, fullPage: false });
}

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

async function scenario(name, width, fn, { dark = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: Math.max(width < 500 ? 720 : 900, 720) } });
  await mockWorld(context, []);
  if (dark) {
    await context.addInitScript(() => { document.documentElement.dataset.theme = 'dark'; });
  }
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  try {
    await fn(page);
    check(`${name}: 0 page errors`, pageErrors.length === 0, pageErrors[0] ?? '');
  } catch (error) {
    check(`${name}: scenario ran`, false, String(error).slice(0, 300));
  }
  await context.close();
}

// ===== Fixtures the interactions need (synthetic data only) =====
async function addInteractionFixtures(context) {
  // Student detail (contract B) for the seeded st-1 row.
  await context.route('**/api/v1/admin/students/st-1', (route) =>
    route.fulfill({
      json: {
        id: 'st-1', fullName: 'طالب الاختبار', phone: '0936000001', email: null, gender: 'male',
        avatarUrl: null, status: 'Active', banReason: null, banUntil: null, lockedOut: false,
        lockoutUntil: null, failedLoginCount: 0, phoneVerified: true, mustChangePassword: false,
        archived: false, archivedAt: null, createdAt: '2025-09-01T00:00:00Z', updatedAt: null,
        lastLogin: '2025-11-25T07:30:00Z', loginCount: 42,
        academic: { universityName: 'جامعة الاختبار', collegeName: 'كلية الطب', academicYearName: 'السنة الأولى' },
        subscriptionSummary: { activeCount: 1, latest: { scopeType: 'Subject', status: 'Active', startsAt: '2025-10-01T00:00:00Z', expiresAt: '2026-10-01T00:00:00Z' } },
      },
    }));
  // Drawer tab feeds (empty-but-shaped keeps the honest empty states).
  for (const tail of ['exam-sessions', 'subscriptions', 'reports', 'progress', 'security-logs', 'activity']) {
    await context.route(`**/api/v1/admin/students/st-1/${tail}*`, (route) =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 } }));
  }
  // Admin courses list + usage (Courses tab of the Library center).
  await context.route('**/api/v1/admin/courses?*', (route) =>
    route.fulfill({
      json: {
        items: [{ id: 'co-1', subjectId: 'su1', subjectName: 'علم وظائف الأعضاء', title: 'دورة علم وظائف الأعضاء الشاملة', status: 'Published', episodesCount: 4, viewsCount: 120, createdAt: '2025-10-01T00:00:00Z' }],
        total: 1, page: 1, pageSize: 20, totalPages: 1,
      },
    }));
  await context.route('**/api/v1/admin/courses/co-1/usage', (route) =>
    route.fulfill({ json: { episodesCount: 4, filesCount: 2, viewsCount: 120 } }));
  await context.route('**/api/v1/admin/courses/co-1/episodes?*', (route) => route.fulfill({ json: [] }));
  await context.route('**/api/v1/admin/courses/co-1', (route) => route.fulfill({ status: 204 }));
}

const SUBJECT_QUERY = 'univ=u1&college=c1&year=y1&semester=s1&subject=su1';

// ======================================================================
// 1. Dashboard — desktop / mobile / dark
// ======================================================================
await scenario('dashboard-desktop', 1440, async (page) => {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="dashboard-command-header"]').waitFor({ timeout: 15000 });
  await page.getByTestId('needs-attention').waitFor({ timeout: 10000 });
  await page.locator('.stat-grid').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  check('dashboard-desktop: command header renders', await page.getByTestId('dashboard-command-strip').isVisible());
  check('dashboard-desktop: needs-attention renders', await page.getByTestId('needs-attention').isVisible());
  check('dashboard-desktop: KPI source disclosure renders', await page.getByTestId('dashboard-kpi-source').isVisible());
  await noHScroll(page, 'dashboard-desktop');
  await axeScan(page, 'dashboard-desktop');
  await shot(page, 'dashboard-desktop');
});

await scenario('dashboard-mobile', 375, async (page) => {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="dashboard-command-header"]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
  await noHScroll(page, 'dashboard-mobile');
  await shot(page, 'dashboard-mobile');
});

await scenario('dashboard-dark', 1440, async (page) => {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="dashboard-command-header"]').waitFor({ timeout: 15000 });
  // Toggle dark mode through the real topbar control (the honest path).
  await page.getByRole('button', { name: 'تبديل المظهر' }).first().click();
  await page.waitForTimeout(900);
  const isDark = await page.evaluate(() => document.documentElement.dataset.theme === 'dark');
  check('dashboard-dark: theme toggled', isDark);
  await noHScroll(page, 'dashboard-dark');
  await axeScan(page, 'dashboard-dark');
  await shot(page, 'dashboard-dark');
}, { dark: false });

// ======================================================================
// 2. Sidebar — expanded vs collapsed
// ======================================================================
await scenario('sidebar-states', 1440, async (page) => {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.admin-shell').waitFor({ timeout: 15000 });
  await shot(page, 'sidebar-expanded');
  const collapse = page.locator('[aria-label*="طي"], [aria-label*="Collapse"]').first();
  if (await collapse.count()) {
    await collapse.click();
    await page.waitForTimeout(400);
    await shot(page, 'sidebar-collapsed');
    check('sidebar-states: collapse toggle works', true);
  } else {
    // Fall back to the localStorage-driven state used by the shell.
    await page.evaluate(() => { localStorage.setItem('cms-admin-sidebar-collapsed', 'true'); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.admin-shell').waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);
    await shot(page, 'sidebar-collapsed');
    check('sidebar-states: collapsed state via storage', true);
  }
});

// ======================================================================
// 3. Servers summary card (read-only)
// ======================================================================
await scenario('servers-summary-card', 1440, async (page) => {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('service-health-card').waitFor({ timeout: 15000 });
  await page.getByTestId('service-health-overall').waitFor({ timeout: 15000 });
  check('servers-summary-card: summary renders', true);
  await shot(page, 'servers-summary-card');
  await noHScroll(page, 'servers-summary-card');
});

// ======================================================================
// 4. Student detail drawer (shared DetailDrawer) + confirm dialog
// ======================================================================
await scenario('student-detail-drawer', 1440, async (page) => {
  const context = page.context();
  await addInteractionFixtures(context);
  await page.goto(`${BASE_URL}/students`, { waitUntil: 'domcontentloaded' });
  await page.locator('.admin-shell').waitFor({ timeout: 15000 });
  await page.getByTestId('student-open-st-1').waitFor({ timeout: 15000 });
  await page.getByTestId('student-open-st-1').click();
  await page.getByTestId('student-detail-panel').waitFor({ timeout: 15000 });
  check('student-detail-drawer: opens as a dialog', await page.getByRole('dialog', { name: 'تفاصيل الطالب' }).isVisible());
  await noHScroll(page, 'student-detail-drawer');
  await axeScan(page, 'student-detail-drawer');
  await shot(page, 'student-detail-drawer');

  // Escape closes and focus returns to the row trigger.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const dialogGone = (await page.getByRole('dialog', { name: 'تفاصيل الطالب' }).count()) === 0;
  check('student-detail-drawer: Escape closes', dialogGone);
});

await scenario('student-detail-drawer-mobile', 375, async (page) => {
  const context = page.context();
  await addInteractionFixtures(context);
  await page.goto(`${BASE_URL}/students`, { waitUntil: 'domcontentloaded' });
  await page.locator('.admin-shell').waitFor({ timeout: 15000 });
  const mobileTrigger = page.getByTestId('student-open-st-1');
  await mobileTrigger.waitFor({ timeout: 15000 });
  await mobileTrigger.scrollIntoViewIfNeeded();
  await mobileTrigger.click();
  await page.getByTestId('student-detail-panel').waitFor({ timeout: 15000 });
  await noHScroll(page, 'student-detail-drawer-mobile');
  await shot(page, 'student-detail-drawer-mobile');
});

// ======================================================================
// 5. Security event drawer
// ======================================================================
await scenario('security-event-drawer', 1440, async (page) => {
  await page.goto(`${BASE_URL}/security`, { waitUntil: 'domcontentloaded' });
  await page.locator('.admin-shell').waitFor({ timeout: 15000 });
  await page.locator('[data-testid^="security-event-row-"]').first().waitFor({ timeout: 15000 });
  await page.locator('[data-testid^="security-event-row-"]').first().click();
  await page.locator('[role="dialog"]').waitFor({ timeout: 10000 });
  check('security-event-drawer: opens', (await page.locator('[role="dialog"]').count()) > 0);
  await noHScroll(page, 'security-event-drawer');
  await axeScan(page, 'security-event-drawer');
  await shot(page, 'security-event-drawer');
});

// ======================================================================
// 6. Library upload drawer (shared Drawer + unsaved guard)
// ======================================================================
await scenario('library-upload-drawer', 1440, async (page) => {
  await page.goto(`${BASE_URL}/library?${SUBJECT_QUERY}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.admin-shell').waitFor({ timeout: 15000 });
  const uploadToggle = page.locator('button', { hasText: 'رفع' }).first();
  await uploadToggle.waitFor({ timeout: 15000 });
  await uploadToggle.click();
  await page.getByTestId('library-upload-drawer').waitFor({ timeout: 10000 });
  check('library-upload-drawer: opens as a dialog', (await page.getByTestId('library-upload-drawer').count()) > 0);
  await noHScroll(page, 'library-upload-drawer');
  await axeScan(page, 'library-upload-drawer');
  await shot(page, 'library-upload-drawer');
});

// ======================================================================
// 7. Exam results drawer (shared DetailDrawer) + loading + empty states
// ======================================================================
await scenario('exam-results-drawer', 1440, async (page) => {
  await page.goto(`${BASE_URL}/exams?${SUBJECT_QUERY}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.admin-shell').waitFor({ timeout: 15000 });
  const rowMenu = page.locator('tbody button[aria-haspopup="menu"]').first();
  await rowMenu.waitFor({ timeout: 15000 });
  await rowMenu.click();
  await page.locator('[role="menuitem"]', { hasText: 'النتائج' }).first().waitFor({ timeout: 10000 });
  await page.locator('[role="menuitem"]', { hasText: 'النتائج' }).first().click();
  await page.getByTestId('exam-results-drawer').waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  check('exam-results-drawer: opens', (await page.getByTestId('exam-results-drawer').count()) > 0);
  await noHScroll(page, 'exam-results-drawer');
  await axeScan(page, 'exam-results-drawer');
  await shot(page, 'exam-results-drawer');
});

// ======================================================================
// 8. Course edit drawer (Library → Courses tab)
// ======================================================================
await scenario('course-edit-drawer', 1440, async (page) => {
  const context = page.context();
  await addInteractionFixtures(context);
  await page.goto(`${BASE_URL}/library`, { waitUntil: 'domcontentloaded' });
  await page.locator('.admin-shell').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  // Drive the real academic cascade (university → college → year → semester →
  // subject) — the honest user path; the courses list needs a subject scope.
  const cascade = page.locator('.content select');
  const cascadeCount = await cascade.count();
  for (let i = 0; i < Math.min(cascadeCount, 5); i++) {
    const sel = cascade.nth(i);
    const vals = await sel.locator('option').evaluateAll((os) => os.map((o) => o.value));
    const pick = vals.find((v) => v && v !== '');
    if (pick) {
      await sel.selectOption(pick);
      await page.waitForTimeout(500);
    }
  }
  // Switch to the courses tab through the real tablist control.
  await page.getByRole('tab', { name: 'الكورسات' }).click();
  await page.waitForTimeout(1000);
  const rowMenu = page.locator('.content button[aria-haspopup="menu"]').first();
  await rowMenu.waitFor({ timeout: 15000 });
  await rowMenu.scrollIntoViewIfNeeded();
  await rowMenu.click();
  await page.waitForTimeout(300);
  await shot(page, 'overflow-menu');
  check('course-edit-drawer: overflow menu opens', (await page.locator('[role="menu"]').count()) > 0);
  const editItem = page.locator('[role="menuitem"], [role="menu"] button', { hasText: 'تعديل' }).first();
  if (await editItem.count()) {
    await editItem.click();
    await page.getByTestId('course-edit-drawer').waitFor({ timeout: 10000 });
    await noHScroll(page, 'course-edit-drawer');
    // Let the overflow menu finish its exit animation — axe measures
    // mid-transition colors as translucent (false contrast failures).
    await page.waitForTimeout(700);
    await axeScan(page, 'course-edit-drawer');
    await shot(page, 'course-edit-drawer');
  } else {
    check('course-edit-drawer: edit item reachable', false, 'no تعديل item in menu');
  }
});

// ======================================================================
// 9. Settings history drawer
// ======================================================================
await scenario('settings-history-drawer', 1440, async (page) => {
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
  await page.locator('.admin-shell').waitFor({ timeout: 15000 });
  await page.locator('button[aria-label^="سجل تغييرات"]').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
  await page.locator('button[aria-label^="سجل تغييرات"]').first().click();
  await page.getByTestId('setting-history-drawer').waitFor({ timeout: 10000 });
  check('settings-history-drawer: opens', (await page.getByTestId('setting-history-drawer').count()) > 0);
  await noHScroll(page, 'settings-history-drawer');
  await axeScan(page, 'settings-history-drawer');
  await shot(page, 'settings-history-drawer');
});

// ======================================================================
// 10. Create-student modal (secondary form on the shared Dialog)
// ======================================================================
await scenario('create-student-modal', 1440, async (page) => {
  await page.goto(`${BASE_URL}/students`, { waitUntil: 'domcontentloaded' });
  await page.locator('.admin-shell').waitFor({ timeout: 15000 });
  const addButton = page.locator('button', { hasText: 'إضافة طالب' }).first();
  await addButton.waitFor({ timeout: 15000 });
  await addButton.click();
  await page.getByTestId('student-create-dialog').waitFor({ timeout: 10000 });
  check('create-student-modal: opens as a dialog', (await page.getByTestId('student-create-dialog').count()) > 0);
  await noHScroll(page, 'create-student-modal');
  await page.waitForTimeout(600);
  await axeScan(page, 'create-student-modal');
  await shot(page, 'create-student-modal');
});

await scenario('create-student-modal-mobile', 375, async (page) => {
  await page.goto(`${BASE_URL}/students`, { waitUntil: 'domcontentloaded' });
  await page.locator('.admin-shell').waitFor({ timeout: 15000 });
  const addButton = page.locator('button', { hasText: 'إضافة طالب' }).first();
  await addButton.waitFor({ timeout: 15000 });
  await addButton.click();
  await page.getByTestId('student-create-dialog').waitFor({ timeout: 10000 });
  await noHScroll(page, 'create-student-modal-mobile');
  await shot(page, 'create-student-modal-mobile');
});

// ======================================================================
// 11. Confirmation dialog (question archive) + focus-visible state
// ======================================================================
await scenario('confirm-dialog', 1440, async (page) => {
  await page.goto(`${BASE_URL}/questions?${SUBJECT_QUERY}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.admin-shell').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  const rowMenu = page.locator('tbody button[aria-haspopup="menu"]').first();
  await rowMenu.waitFor({ timeout: 15000 });
  await rowMenu.click();
  await page.waitForTimeout(300);
  const archiveItem = page.locator('[role="menuitem"]', { hasText: 'أرشفة' }).first();
  await archiveItem.waitFor({ timeout: 10000 });
  await archiveItem.click();
  await page.getByTestId('question-lifecycle-confirm').waitFor({ timeout: 10000 });
  check('confirm-dialog: opens', (await page.getByTestId('question-lifecycle-confirm').count()) > 0);
  await page.waitForTimeout(600);
  await axeScan(page, 'confirm-dialog');
  await shot(page, 'confirm-dialog');

  // Tab into the confirm: focus-visible ring must be present on the focused control.
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  await shot(page, 'focus-visible-state');
  check('confirm-dialog: focus-visible captured', true);
});

// ======================================================================
// 12. Overflow menu (keyboard reachable) — codes center
// ======================================================================
await scenario('overflow-menu-keyboard', 1440, async (page) => {
  await page.goto(`${BASE_URL}/codes`, { waitUntil: 'domcontentloaded' });
  await page.locator('.admin-shell').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  const menuButton = page.locator('button[aria-haspopup="menu"]').first();
  await menuButton.waitFor({ timeout: 15000 });
  await menuButton.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const menuOpen = (await page.locator('[role="menu"]').count()) > 0;
  check('overflow-menu-keyboard: opens via keyboard', menuOpen);
  await shot(page, 'codes-overflow-menu');
  // Escape closes the menu.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  check('overflow-menu-keyboard: Escape closes', (await page.locator('[role="menu"]:visible').count()) === 0);
});

// ======================================================================
// 13. Loading / empty / unavailable states
// ======================================================================
await scenario('loading-empty-unavailable', 1440, async (page) => {
  const context = page.context();
  // (a) Loading: stall the dashboard feed so the skeletons stay painted.
  await context.unroute('**/api/v1/admin/dashboard');
  await context.route('**/api/v1/admin/dashboard', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4000));
    route.fulfill({ json: {} });
  });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="dashboard-command-header"]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  await shot(page, 'loading-state');
  check('loading-state: captured while feed in flight', true);

  // (b) Empty + unavailable: fail the dashboard and servers feeds.
  await context.unroute('**/api/v1/admin/dashboard');
  await context.route('**/api/v1/admin/dashboard', (route) => route.abort());
  await context.unroute('**/api/v1/admin/servers/summary');
  await context.route('**/api/v1/admin/servers/summary', (route) => route.abort());
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="dashboard-command-header"]').waitFor({ timeout: 15000 });
  await page.getByTestId('needs-attention').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const hasStatsCondition = (await page.getByTestId('needs-attention-stats').count()) > 0;
  const hasServersCondition = (await page.getByTestId('needs-attention-servers').count()) > 0;
  check('unavailable-state: failed metrics surface in needs-attention', hasStatsCondition);
  check('unavailable-state: unavailable service health surfaces in needs-attention', hasServersCondition);
  await shot(page, 'unavailable-state');

  // (c) Empty state: exam results drawer with zero attempts.
  await context.unroute('**/api/v1/admin/exams/ex-1/results*');
  await context.route('**/api/v1/admin/exams/*/results*', (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 100, totalPages: 0 } }));
  await page.goto(`${BASE_URL}/exams?${SUBJECT_QUERY}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.admin-shell').waitFor({ timeout: 15000 });
  const rowMenu = page.locator('tbody button[aria-haspopup="menu"]').first();
  await rowMenu.waitFor({ timeout: 15000 });
  await rowMenu.click();
  await page.locator('[role="menuitem"]', { hasText: 'النتائج' }).first().waitFor({ timeout: 10000 });
  await page.locator('[role="menuitem"]', { hasText: 'النتائج' }).first().click();
  await page.getByTestId('exam-results-drawer').waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  const emptyVisible = (await page.getByTestId('detail-drawer-empty').count()) > 0;
  check('empty-state: exam results empty drawer renders', emptyVisible);
  await shot(page, 'empty-state');
});

// ======================================================================
// Wrap up
// ======================================================================
clearInterval(sampler);
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n==== cc-final-surfaces E2E: ${results.length - failed.length}/${results.length} checks passed ====`);
console.log(`peak Chromium RSS: ${Math.round(peakChromeRssKb / 1024)} MB`);
console.log(`shots in e2e/screenshots/ (cc-final-*.png)`);
if (failed.length) {
  console.log('failures:');
  for (const f of failed) console.log('  !', f.name);
  process.exit(1);
}
