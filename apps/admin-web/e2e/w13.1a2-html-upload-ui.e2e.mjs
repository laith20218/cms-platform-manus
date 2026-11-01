/**
 * Wave 13.A.2 — §13 EVIDENCE: the premium HTML upload experience (Admin).
 *
 * Supervisor's amendment binding: the HTML upload drawer must be elegant,
 * responsive, RTL-compliant, with hover/focus states — verified at 375 / 768 /
 * 1024 / 1440. This script drives the REAL LibraryCenter upload drawer against
 * the dev server with a mocked API (admin-upload.e2e.mjs pattern) and emits:
 *   • screenshots — drawer experience at the 4 locked widths (+ oversize red
 *     state at 375, settled «جاهز» timeline at 1440)
 *   • axe-core scans at every width (0 critical/serious gate)
 *   • behavioral assertions — sandbox attr mirrors the switch, size meter math,
 *     submit-disabled on oversize, 4-step timeline ladder to the Ready badge
 *
 * RAM contract (hard rule): ONE Chromium, scenarios in browser.newContext()s,
 * browser closed immediately; RSS ceiling 1.6GB sampled at 400ms.
 *
 * Run (admin dev server bound to localhost:5174):
 *   E2E_ADMIN_URL=http://localhost:5174 node e2e/w13.1a2-html-upload-ui.e2e.mjs
 */
let chromium;
const PLAYWRIGHT_CANDIDATES = [
  process.env.E2E_PLAYWRIGHT_MODULE,
  'file:///home/z/cms-platform-manus/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs',
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
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:5174';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));
const AXE_JS = '/home/z/cms-platform-manus/node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.js';

const E2E_ADMIN_USER = {
  id: 'e2e-admin-001',
  phone: '+962790000001',
  fullName: 'مدير الاختبار',
  role: 'super_admin',
  avatarUrl: null,
  university: { id: 'u1', nameAr: 'جامعة الاختبار' },
  college: { id: 'c1', nameAr: 'كلية الطب' },
};

/** The interactive lesson fixture — onclick handlers + head style + script, the exact shape 13.A.1 protects. */
const LESSON_HTML = Buffer.from(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<style>body{font-family:sans-serif;background:#f0fdfa;color:#0f172a;padding:16px;margin:0}
.q{border:1px solid #99f6e4;border-radius:12px;padding:12px;margin:8px 0;background:#fff}
button{background:#0d9488;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-size:16px;cursor:pointer}
h2{color:#0f766e;margin-top:0}</style></head><body>
<h2>اختبار سريع: الدورة الدموية</h2>
<div class="q"><p>أي غرفة تستقبل الدم المؤكسج من الرئتين؟</p>
<button onclick="answer(this,false)">البطين الأيمن</button>
<button onclick="answer(this,true)">الأذين الأيسر</button></div>
<p id="feedback"></p>
<script>function answer(btn, ok){ document.getElementById('feedback').textContent = ok ? 'إجابة صحيحة ✓' : 'حاول مرة أخرى'; }</script>
</body></html>`, 'utf-8');

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? '  PASS' : '! FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

const consoleErrors = [];

let peakChromeRssKb = 0;
const sampler = setInterval(() => {
  try {
    const out = execSync("ps -C chrome --no-headers -o rss= 2>/dev/null | awk '{s+=$1} END {print s+0}'", { stdio: ['ignore', 'pipe', 'ignore'] });
    const kb = Number(out.toString().trim());
    if (kb > peakChromeRssKb) peakChromeRssKb = kb;
  } catch { /* ps raced with process exit */ }
}, 400);

function makeWorld() {
  return {
    completeUploads: 0,
    fileGetsAfterComplete: 0,
  };
}

/** The library files list — empty until complete-upload, then the HTML row climbs the 4-step ladder. */
function filesPayload(world) {
  if (world.completeUploads === 0) {
    return { items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };
  }
  world.fileGetsAfterComplete += 1;
  const ladder = ['Pending', 'Sanitized', 'CSPApplied', 'Ready'];
  // Two GETs per rung (React paint pacing — the PDF e2e precedent).
  const rung = Math.min(Math.floor((world.fileGetsAfterComplete - 1) / 2), ladder.length - 1);
  return {
    items: [{
      id: 'F1',
      title: 'درس تفاعلي — الدورة الدموية',
      type: 'Html',
      subjectNameAr: 'الفيزياء الطبية',
      fileSize: LESSON_HTML.length,
      status: 'Draft',
      virusScanStatus: 'Clean',
      category: 'Lecture',
      createdAt: new Date().toISOString(),
      contentProcessingStatus: ladder[rung],
      enableScripts: true,
    }],
    total: 1, page: 1, pageSize: 25, totalPages: 1,
  };
}

async function newAdminContext(browser, viewport, world) {
  const context = await browser.newContext({ viewport, locale: 'ar' });
  await context.addInitScript((user) => {
    sessionStorage.setItem('cms-admin-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-admin-refresh', 'e2e-dummy-refresh');
    sessionStorage.setItem('cms-admin-user', JSON.stringify(user));
  }, E2E_ADMIN_USER);

  await context.route('**/api/v1/**', (route) => { if (process.env.E2E_DEBUG) console.log('ABORT:', route.request().url()); route.abort(); });

  await context.route('**/health', (route) => route.fulfill({ json: { status: 'Healthy' } }));
  await context.route('**/api/v1/auth/refresh', (route) => route.fulfill({ json: { accessToken: 'e2e-access-2' } }));
  await context.route('**/api/v1/admin/dashboard', (route) =>
    route.fulfill({
      json: {
        totalStudents: 1250, activeStudentsToday: 310, totalQuestions: 4800,
        totalActiveCodes: 96, totalActiveSubscriptions: 640, totalLibraryFiles: 220,
        totalExams: 48, pendingReports: 3, monthlyRevenue: 4200, revenueChangePercent: 4.2,
      },
    }));
  await context.route('**/api/v1/notifications/unread-count', (route) => route.fulfill({ json: { count: 0 } }));
  await context.route('**/api/v1/admin/roles', (route) => route.fulfill({ json: [] }));
  await context.route('**/api/v1/admin/admins?*', (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 } }));
  await context.route('**/api/v1/admin/content/files?*', (route) =>
    route.fulfill({ json: filesPayload(world) }));
  await context.route('**/api/v1/admin/content/academic/subjects/*/lectures', (route) =>
    route.fulfill({ json: [] }));
  await context.route('**/api/v1/universities?*', (route) =>
    route.fulfill({ json: { items: [{ id: 'u1', nameAr: 'جامعة الاختبار' }], total: 1, page: 1, pageSize: 100, totalPages: 1 } }));
  await context.route('**/api/v1/universities/u1/colleges', (route) =>
    route.fulfill({ json: [{ id: 'c1', nameAr: 'كلية الطب' }] }));
  await context.route('**/api/v1/colleges/c1/years', (route) =>
    route.fulfill({ json: [{ id: 'y1', nameAr: 'السنة الأولى' }] }));
  await context.route('**/api/v1/years/y1/semesters', (route) =>
    route.fulfill({ json: [{ id: 's1', nameAr: 'الفصل الأول' }] }));
  await context.route('**/api/v1/semesters/s1/subjects', (route) =>
    route.fulfill({ json: [{ id: 'sub1', nameAr: 'الفيزياء الطبية' }] }));

  await context.route('**/api/v1/library/upload-url', (route) =>
    route.fulfill({
      json: {
        fileId: 'F1',
        fileKey: 'library/html/e2e/lesson.html',
        uploadUrl: `${BASE_URL}/__e2e__/put`,
      },
    }));
  await context.route('**/__e2e__/put', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    route.fulfill({ status: 200, body: '' });
  });
  await context.route('**/api/v1/library/complete-upload', (route) => {
    world.completeUploads += 1;
    world.fileGetsAfterComplete = 0;
    route.fulfill({ json: { ok: true } });
  });

  return context;
}

/** Library → hierarchy → upload drawer → HTML file picked → experience live. */
async function openHtmlUploadExperience(page) {
  await page.goto(`${BASE_URL}/`);
  const menuToggle = page.getByRole('button', { name: 'فتح القائمة', exact: true });
  if (await menuToggle.isVisible().catch(() => false)) {
    await menuToggle.click();
  }
  await page.getByRole('button', { name: 'المكتبة والملفات' }).first().click();

  const selects = page.getByRole('combobox');
  await selects.nth(0).selectOption('u1');
  await page.waitForTimeout(200);
  await selects.nth(1).selectOption('c1');
  await page.waitForTimeout(200);
  await selects.nth(2).selectOption('y1');
  await page.waitForTimeout(200);
  await selects.nth(3).selectOption('s1');
  await page.waitForTimeout(200);
  await selects.nth(4).selectOption('sub1');

  await page.getByRole('button', { name: 'رفع ملف', exact: true }).click();
  await page.locator('aside input[type="text"]').fill('درس تفاعلي — الدورة الدموية');
  await page.locator('aside select').nth(1).selectOption('sub1');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'lesson.html', mimeType: 'text/html', buffer: LESSON_HTML,
  });
  await page.getByTestId('html-upload-experience').waitFor({ state: 'visible', timeout: 10_000 });
  // The FileReader preview read resolves on a microtask — give it a beat.
  await page.waitForTimeout(400);
}

/** Pre-existing (grandfathered) shell violations — OUTSIDE 13.A.2's scope: the
 * admin shell topbar (super_admin small, breadcrumb, ⌘K span contrast) and the
 * two shell quick-action buttons (بحث سريع / تبديل المظهر — .lang-btn). This
 * commit owns LibraryCenter only; the drawer + toolbar surfaces are gated HARD. */
const isShellTarget = (selector) => {
  const s = String(selector);
  return s.includes('lang-btn') || s.includes('crumb') || s === 'small'
    || s.includes('بحث سريع') || s.includes('تبديل المظهر');
};
const GRANDFATHERED_MATCHERS = [
  (id, target) => id === 'color-contrast' && target.some(isShellTarget),
  (id, target) => id === 'label-content-name-mismatch' && target.some(isShellTarget),
];

function classifyViolations(violations) {
  const grandfathered = [];
  const owned = [];
  for (const v of violations) {
    for (const node of v.nodes) {
      const isOld = GRANDFATHERED_MATCHERS.some((match) => match(v.id, node.target));
      (isOld ? grandfathered : owned).push(`${v.id}:${JSON.stringify(node.target)}`);
    }
  }
  return { grandfathered, owned };
}

async function runAxe(page, label, { wholePage = true } = {}) {
  await page.addScriptTag({ path: AXE_JS });
  const opts = { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] };

  // HARD GATE 1 — the drawer itself (this commit's surface): 0 critical/serious.
  const drawerResults = await page.evaluate((o) => window.axe.run({ include: [['aside']] }, o), opts);
  const drawerBlocking = drawerResults.violations
    .flatMap((v) => v.nodes.map((n) => `${v.id}:${JSON.stringify(n.target)}`));
  check(`axe ${label}: drawer 0 critical/serious`, drawerBlocking.length === 0,
    drawerBlocking.join(',') || 'clean');

  // HARD GATE 2 (1440 only — keeps the single-browser RAM ceiling) — whole page:
  // nothing NEW beyond the disclosed grandfathered shell set.
  if (!wholePage) return;
  const pageResults = await page.evaluate((o) => window.axe.run(document, o), opts);
  const { grandfathered, owned } = classifyViolations(pageResults.violations.filter(
    (v) => ['critical', 'serious'].includes(v.impact),
  ));
  check(`axe ${label}: page has no NEW violations (this commit's surfaces)`, owned.length === 0,
    owned.join(',') || 'clean');
  check(`axe ${label}: page violations match the disclosed grandfathered set`,
    grandfathered.length > 0 && owned.length === 0,
    `grandfathered: ${grandfathered.join(',') || 'none'}`);
}

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  headless: true,
  args: [
    '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox',
    '--disable-extensions', '--mute-audio', '--hide-scrollbars',
    // axe's two passes per width are renderer-heap hungry — cap V8's old space so
    // the single-browser RSS stays under the 1.6GB RAM ceiling (10.4 hard rule).
    '--js-flags=--max-old-space-size=384',
  ],
});

try {
  /* ============ A. The experience at the 4 locked widths (+ axe) ============ */
  for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [375, 812]]) {
    const world = makeWorld();
    const context = await newAdminContext(browser, { width, height }, world);
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });

    await openHtmlUploadExperience(page);

    // (A) preview panel + frame sandbox mirrors the switch default (ON)
    await page.getByTestId('html-preview-panel').waitFor();
    const sandboxOn = await page.getByTestId('html-preview-frame').getAttribute('sandbox');
    check(`[${width}] preview iframe sandbox = allow-scripts (switch ON default)`, sandboxOn === 'allow-scripts', String(sandboxOn));

    // lesson markup actually renders inside the LOCAL srcDoc frame
    const frameText = await page.getByTestId('html-preview-frame').contentFrame().locator('body').innerText();
    check(`[${width}] local preview renders the lesson (RTL quiz)`, frameText.includes('اختبار سريع'), frameText.slice(0, 40));

    // (B) switch semantics
    const switchLoc = page.getByTestId('upload-enable-scripts');
    check(`[${width}] switch role/aria-checked=true`, (await switchLoc.getAttribute('role')) === 'switch' && (await switchLoc.getAttribute('aria-checked')) === 'true');

    // (C) size meter shows the readout, no error for the small fixture
    const readout = (await page.getByTestId('html-size-readout').innerText()).replace(/\s+/g, ' ').trim();
    check(`[${width}] size meter readout`, /\/ 20 MB$/.test(readout), readout);
    check(`[${width}] no oversize error on small file`, !(await page.getByTestId('html-size-error').isVisible().catch(() => false)));

    await page.screenshot({ path: `${SHOT_DIR}w13.1a2-html-upload-${width}.png`, fullPage: false });

    // toggle OFF → sandbox drops to the full cage; toggle ON → back
    await switchLoc.click();
    const sandboxOff = await page.getByTestId('html-preview-frame').getAttribute('sandbox');
    check(`[${width}] toggling OFF flips sandbox to the full cage`, sandboxOff === '', String(sandboxOff));
    await switchLoc.click();

    await runAxe(page, `upload drawer @ ${width}`, { wholePage: width === 1440 });

    await context.close();
  }

  /* ============ B. Oversize red state (375, mobile-first) ============ */
  {
    const world = makeWorld();
    const context = await newAdminContext(browser, { width: 375, height: 812 }, world);
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });

    await openHtmlUploadExperience(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: 'huge-lesson.html', mimeType: 'text/html', buffer: Buffer.alloc(21 * 1024 * 1024, 7),
    });
    await page.getByTestId('html-size-error').waitFor({ state: 'visible', timeout: 10_000 });
    check('[375] oversize red error visible + role=alert', (await page.getByTestId('html-size-error').getAttribute('role')) === 'alert');
    const readout = (await page.getByTestId('html-size-readout').innerText()).replace(/\s+/g, ' ').trim();
    check('[375] oversize readout 21 MB / 20 MB', readout.includes('21 MB / 20 MB'), readout);
    check('[375] submit disabled on oversize', await page.locator('aside button[type="submit"]').isDisabled());
    // Evidence quality: bring the red meter card into frame before the shot.
    await page.getByTestId('html-size-meter').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOT_DIR}w13.1a2-html-oversize-375.png`, fullPage: false });
    await context.close();
  }

  /* ============ C. The 4-step timeline → Ready badge (1440) ============ */
  {
    const world = makeWorld();
    const context = await newAdminContext(browser, { width: 1440, height: 900 }, world);
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });

    await openHtmlUploadExperience(page);
    await page.locator('aside button[type="submit"]').click();

    await page.getByTestId('html-processing-timeline').waitFor({ state: 'visible', timeout: 15_000 });
    check('[1440] timeline appears from the first submit', true);
    // 13.A.2 regression guard — the Ghostscript timeline must NOT follow HTML rows
    // (the old `trackingFileId != null` disjunct spun it forever; caught by this
    // very screenshot during the §13 pass).
    check('[1440] PDF timeline stays hidden for HTML uploads',
      !(await page.getByTestId('pdf-processing-timeline').isVisible().catch(() => false)));
    await page.locator('[data-testid="html-phase-upload"][data-phase-state="done"]').waitFor({ timeout: 15_000 });
    await page.locator('[data-testid="html-phase-sanitize"][data-phase-state="done"]').waitFor({ timeout: 20_000 });
    check('[1440] ladder climbs: upload → sanitize done', true);
    await page.locator('[data-testid="html-phase-csp"][data-phase-state="done"]').waitFor({ timeout: 20_000 });
    await page.getByTestId('html-ready-badge').waitFor({ timeout: 20_000 });
    const readyLabel = await page.getByTestId('html-ready-badge').innerText();
    check('[1440] settled «جاهز» badge (green check)', readyLabel.includes('جاهز'), readyLabel.slice(0, 50));
    // Evidence quality: the drawer body scrolls — bring the settled timeline + badge into frame.
    await page.getByTestId('html-processing-timeline').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOT_DIR}w13.1a2-html-timeline-1440.png`, fullPage: false });
    await context.close();
  }
} finally {
  await browser.close();
  clearInterval(sampler);
}

const failed = results.filter((r) => !r.ok);
console.log('\n===== 13.A.2 §13 evidence summary =====');
console.log(`checks: ${results.length - failed.length}/${results.length} passed`);
console.log(`console errors: ${consoleErrors.length}${consoleErrors.length ? ' — ' + consoleErrors.slice(0, 3).join(' | ') : ' (clean)'}`);
console.log(`peak chrome RSS: ${(peakChromeRssKb / 1024).toFixed(0)} MB (ceiling 1638 MB)`);
if (failed.length || consoleErrors.length || peakChromeRssKb > 1.6 * 1024 * 1024) {
  process.exit(1);
}
console.log('EVIDENCE GREEN');
