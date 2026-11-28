/**
 * PR-10 — admin-web Playwright visual smoke/regression matrix.
 *
 * Drives the REAL vite dev server (http://127.0.0.1:5174) with a FULLY MOCKED
 * API via context.route interception (the w143-mock-world.mjs contract: a
 * seeded super_admin session in sessionStorage + a fail-visible catch-all that
 * ABORTS every unmocked /api/v1/** route, so a missing fixture is loud, not
 * silently green). No real network API call is ever made.
 *
 * What it does per the PR-10 binding:
 *   • visits EVERY admin route from App.tsx VIEW_PATHS (all 17, including the
 *     PR-6 /security and PR-9 /servers surfaces) plus the PR-2 route-level 404
 *     (NotFoundView on an unknown path),
 *   • screenshots each view at 375 / 768 / 1440 (clean deterministic names:
 *     pr10-<view>-<width>.png) — plus the pre-login screen at 375/1440 with no
 *     session seeded,
 *   • per-view lightweight assertions: the URL pathname is the intended route,
 *     a stable per-view data-testid / heading / row text renders, and NO
 *     horizontal scroll (documentElement + body + ground-truth scrollable delta)
 *     at every width,
 *   • axe-core scan (wcag2a/aa + wcag21aa + wcag22aa) at 768px per view —
 *     gate: 0 critical / 0 serious violations,
 *   • a mock-world completeness gate: the fail-visible abort catch-all must
 *     never fire (zero unmocked /api/v1 requests per view).
 *
 * Console-error policy (mirrors w14.3-admin-ui.e2e.mjs):
 *   • pageerror events (uncaught exceptions) FAIL the view — they mean the
 *     view crashed, not merely logged.
 *   • console.error messages are tolerated and reported (non-gating): dev-mode
 *     React warnings and "Failed to load resource" noise from any aborted
 *     request are not render regressions. The mock-world abort gate above is
 *     the real "a fixture is missing" tripwire; the pageerror gate is the real
 *     "the view exploded" tripwire.
 *
 * RAM contract (hard rule, same as w14.3): ONE Chromium instance, every
 * scenario runs in its own browser.newContext(), browser closed at the end;
 * peak Chrome RSS sampled at 400ms (ceiling 1.6GB).
 *
 * Run (dev server on 127.0.0.1:5174 — note the sandbox vite default binds
 * [::1] only, so start it with an IPv4 host, e.g.
 * `cd apps/admin-web && node_modules/.bin/vite --host 127.0.0.1`):
 *   E2E_ADMIN_URL=http://127.0.0.1:5174 node e2e/pr10-admin-smoke.e2e.mjs
 * Env overrides (same knobs as w14.3):
 *   E2E_PLAYWRIGHT_MODULE — playwright module path
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE — Chromium binary path
 *   E2E_AXE_JS — axe-core axe.js path
 *   E2E_DEBUG — print every aborted (unmocked) route as it happens
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
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:5174';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));
// PR-10: AXE_JS honors the E2E_AXE_JS override; the default is THIS workspace's
// pnpm-resolved axe-core (the cms-work path only exists on the old sandbox).
const AXE_JS = process.env.E2E_AXE_JS
  ?? '/home/z/cms-platform-manus/node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.js';
const WIDTHS = [375, 768, 1440];
const AXE_WIDTH = 768;
// W14.3 D4 shared academic URL context — the subject-scoped views hydrate from
// these query params (Questions / Exams / ExamCourses centers).
const SUBJECT_QUERY = 'univ=u1&college=c1&year=y1&semester=s1&subject=su1';

mkdirSync(SHOT_DIR, { recursive: true });

// ===== §13 helpers =====
const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log(`${ok ? '  PASS' : '! FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

async function hScroll(page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    const start = doc.scrollLeft;
    doc.scrollLeft = 99999; // RTL clamps toward the inline-start extreme
    const a = doc.scrollLeft;
    doc.scrollLeft = -99999;
    const b = doc.scrollLeft;
    doc.scrollLeft = start;
    return {
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
      // Ground truth: can the user actually scroll horizontally? (RTL scroll
      // region quirk makes scrollWidth alone unreliable — W14.3 finding.)
      scrollableDelta: Math.abs(a - b),
    };
  });
}

async function axeScan(page, label) {
  await page.addScriptTag({ content: readFileSync(AXE_JS, 'utf-8') });
  const axeResult = await page.evaluate(async () => {
    const axe = window.axe;
    const r = await axe.run(document, {
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
  return axeResult;
}

// ===== RAM sampler (best-effort, same as w14.3) =====
let peakChromeRssKb = 0;
const sampler = setInterval(() => {
  try {
    const out = execSync("ps -C chrome --no-headers -o rss= 2>/dev/null | awk '{s+=$1} END {print s+0}'", { stdio: ['ignore', 'pipe', 'ignore'] });
    const kb = Number(out.toString().trim());
    if (kb > peakChromeRssKb) peakChromeRssKb = kb;
  } catch { /* sampler is best-effort */ }
}, 400);

const consoleErrors = [];

// ≤1024px the sidebar is off-canvas (globals.css @media max-width:1024) — open it first.
async function openNav(page, width) {
  await page.locator('.admin-shell').waitFor({ timeout: 15000 });
  if (width <= 1024) {
    await page.getByRole('button', { name: 'فتح القائمة' }).click();
    await page.waitForTimeout(250);
  }
}

// ======================================================================
// PR-10 mock world — every fixture below mirrors the DTO the component
// actually reads (lib/api.ts + per-center types). Lists are small but
// non-empty where a table row anchors the visual assertion; empty lists
// would be valid too, but a seeded row proves the wire shape end-to-end.
// ======================================================================

// ===== The mock world (shared module — also used by cc-final-surfaces) =====
import { mockWorld, E2E_ADMIN_USER } from './admin-mock-world.mjs';
export { mockWorld, E2E_ADMIN_USER };

// ======================================================================
// The view matrix — every VIEW_PATHS route (App.tsx) + the PR-2 404.
// ready: structural selector that proves the view mounted; content: a
// stable data-testid / row text that proves the fixture wired end-to-end.
// ======================================================================
const VIEWS = [
  {
    name: 'overview', path: '/',
    ready: '[data-testid="dashboard-feeds"]',
    content: (page) => page.locator('.stat-value', { hasText: '1250' }).first().waitFor({ timeout: 10000 }),
    contentDesc: 'dashboard stat 1250 renders',
  },
  {
    name: 'admins', path: '/admins',
    ready: '[data-testid="admins-page-header"]',
    content: (page) => page.locator('td', { hasText: 'e2e-admin@test.example' }).first().waitFor({ timeout: 10000 }),
    contentDesc: 'admin row renders',
  },
  {
    name: 'roles', path: '/roles',
    ready: 'h2:has-text("أدوار الوصول")',
    content: (page) => page.locator('.content').getByText('مدير المحتوى').first().waitFor({ timeout: 10000 }),
    contentDesc: 'role row renders',
  },
  {
    name: 'audit', path: '/audit',
    ready: 'h2:has-text("السجل الأمني")',
    content: (page) => page.locator('.content').getByText('محاولة دخول فاشلة متكررة').first().waitFor({ timeout: 10000 }),
    contentDesc: 'security alert row renders',
  },
  {
    name: 'academic', path: '/academic',
    ready: 'h2:has-text("من الجامعة إلى المحاضرة")',
    content: (page) => page.locator('.content').getByText('جامعة الاختبار').first().waitFor({ timeout: 10000 }),
    contentDesc: 'university directory row renders',
  },
  {
    name: 'codes', path: '/codes',
    ready: '[data-testid="open-generate-modal"]',
    content: (page) => page.locator('.content').getByText('CMS-TEST-0001').first().waitFor({ timeout: 10000 }),
    contentDesc: 'code ledger row renders',
  },
  {
    name: 'students', path: '/students',
    ready: 'h2:has-text("الطلاب")',
    content: (page) => page.locator('.content').getByText('طالب الاختبار').first().waitFor({ timeout: 10000 }),
    contentDesc: 'student row renders',
  },
  {
    name: 'questions', path: `/questions?${SUBJECT_QUERY}`,
    ready: '[data-testid="questions-toolbar"]',
    content: (page) => page.locator('.content').getByText('أي غرفة القلب تستقبل').first().waitFor({ timeout: 10000 }),
    contentDesc: 'question bank row renders',
  },
  {
    name: 'exams', path: `/exams?${SUBJECT_QUERY}`,
    ready: 'h2:has-text("الاختبارات")',
    content: (page) => page.locator('.content').getByText('اختبار الدورة الدموية النهائي').first().waitFor({ timeout: 10000 }),
    contentDesc: 'exam row renders',
  },
  {
    name: 'exam-courses', path: `/exam-courses?${SUBJECT_QUERY}`,
    ready: 'td:has-text("دورة امتحانات نصف السنة الأولى")',
    content: (page) => page.locator('td', { hasText: 'دورة امتحانات نصف السنة الأولى' }).first().waitFor({ timeout: 10000 }),
    contentDesc: 'bundle row renders',
  },
  {
    name: 'library', path: '/library',
    ready: '[data-testid="library-lifecycle-filter"]',
    content: (page) => page.locator('.content').getByText('مركز المكتبة والملفات').first().waitFor({ timeout: 10000 }),
    contentDesc: 'library header renders',
  },
  {
    name: 'reports', path: '/reports',
    ready: 'h2:has-text("مركز التحليلات")',
    content: (page) => page.locator('.content').getByText('1250').first().waitFor({ timeout: 10000 }),
    contentDesc: 'overview stat card renders',
  },
  {
    name: 'settings', path: '/settings',
    ready: '[data-testid="setting-type-Security.SessionLifetimeMinutes"]',
    content: (page) => page.locator('[data-testid="settings-feature-flags"]').first().waitFor({ timeout: 10000 }),
    contentDesc: 'feature-flags inventory renders',
  },
  {
    name: 'content', path: '/content',
    ready: 'h2:has-text("صفحات المحتوى")',
    content: (page) => page.locator('.content').getByText('شروط الاستخدام').first().waitFor({ timeout: 10000 }),
    contentDesc: 'content page row renders',
  },
  {
    name: 'offline', path: '/offline',
    ready: '[data-testid="offline-center-root"]',
    content: (page) => page.locator('[data-testid="offline-row-pkg-1"]').first().waitFor({ timeout: 10000 }),
    contentDesc: 'offline package row renders',
  },
  {
    name: 'security', path: '/security',
    ready: '[data-testid="security-center"]',
    content: (page) => page.locator('[data-testid="security-event-row-ev-1"]').first().waitFor({ timeout: 10000 }),
    contentDesc: 'security event row renders',
  },
  {
    name: 'servers', path: '/servers',
    ready: '[data-testid="servers-card-render"]',
    content: (page) => page.locator('[data-testid="servers-render-service"]').first().waitFor({ timeout: 10000 }),
    contentDesc: 'render provider service card renders',
  },
  {
    name: 'not-found', path: '/nonexistent',
    ready: '[data-testid="not-found"]',
    content: (page) => page.locator('[data-testid="not-found"]').getByText('الصفحة غير موجودة').first().waitFor({ timeout: 10000 }),
    contentDesc: '404 copy renders',
  },
];

const viewPathName = (view) => new URL(`http://x${view.path}`).pathname;

// ======================================================================
// Scenario runner
// ======================================================================
try {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  // ============ Login screen — no session (empty state) ============
  console.log('\n== A. Login screen (no session) — 375 / 1440 ==');
  for (const width of [375, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 740 : 900 } });
    const aborts = [];
    const pageErrors = [];
    await mockWorld(context, aborts, { seed: false });
    const page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`login/${width}: ${message.text()}`); });
    page.on('pageerror', (error) => pageErrors.push(`login/${width}: ${String(error).slice(0, 200)}`));
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    let ok = true;
    let extra = '';
    try {
      await page.locator('.login-shell').waitFor({ timeout: 15000 });
      await page.locator('.login-shell').getByText('دخول إلى لوحة الإدارة').first().waitFor({ timeout: 8000 });
    } catch (error) {
      ok = false;
      extra = `login shell/title missing (${String(error).split('\n')[0]})`;
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOT_DIR}pr10-login-${width}.png`, fullPage: true });
    const scroll = await hScroll(page);
    const scrollOk = scroll.doc <= 0 && scroll.body <= 0 && scroll.scrollableDelta <= 1;
    check(`pr10 login @${width}px: shell + title + no horizontal scroll`, ok && scrollOk,
      `${extra ? extra + ' ' : ''}docΔ=${scroll.doc} bodyΔ=${scroll.body} scrollΔ=${scroll.scrollableDelta}`);
    check(`pr10 login @${width}px: 0 unmocked /api/v1 routes`, aborts.length === 0,
      aborts.length ? `aborted: ${aborts.slice(0, 3).join(' ; ')}` : '');
    check(`pr10 login @${width}px: 0 page errors`, pageErrors.length === 0,
      pageErrors.length ? pageErrors[0] : '');
    await context.close();
  }

  // ============ The full view matrix (17 VIEW_PATHS routes + the 404) ============
  for (const view of VIEWS) {
    console.log(`\n== ${view.name} — ${WIDTHS.join('/')}px matrix + axe @${AXE_WIDTH}px ==`);
    const viewAborts = [];
    const viewPageErrors = [];
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: width < 500 ? 740 : 900 },
      });
      await mockWorld(context, viewAborts);
      const page = await context.newPage();
      page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`${view.name}/${width}: ${message.text()}`); });
      page.on('pageerror', (error) => viewPageErrors.push(`${view.name}/${width}: ${String(error).slice(0, 200)}`));

      await page.goto(`${BASE_URL}${view.path}`, { waitUntil: 'domcontentloaded' });
      let readyOk = true;
      let contentOk = true;
      let detail = '';
      try {
        await page.locator(view.ready).first().waitFor({ timeout: 15000 });
      } catch (error) {
        readyOk = false;
        detail = `ready selector missing: ${view.ready} (${String(error).split('\n')[0]})`;
      }
      if (readyOk) {
        try {
          await view.content(page);
        } catch (error) {
          contentOk = false;
          detail = `content assertion failed: ${view.contentDesc} (${String(error).split('\n')[0]})`;
        }
      }
      // ≤1024px the sidebar is off-canvas — open it so the screenshot shows the
      // nav (same convention as w14.3).
      if (readyOk) {
        try { await openNav(page, width); } catch { /* nav already open or shell absent */ }
      }
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SHOT_DIR}pr10-${view.name}-${width}.png`, fullPage: true });

      const urlOk = new URL(page.url()).pathname === viewPathName(view);
      const scroll = await hScroll(page);
      const scrollOk = scroll.doc <= 0 && scroll.body <= 0 && scroll.scrollableDelta <= 1;
      check(`pr10 ${view.name} @${width}px: url + content + no horizontal scroll`,
        urlOk && readyOk && contentOk && scrollOk,
        `url=${urlOk ? 'ok' : new URL(page.url()).pathname} ready=${readyOk ? 'ok' : 'FAIL'} content=${contentOk ? view.contentDesc : 'FAIL'} docΔ=${scroll.doc} bodyΔ=${scroll.body} scrollΔ=${scroll.scrollableDelta}${detail ? ` :: ${detail}` : ''}`);

      if (width === AXE_WIDTH) {
        if (readyOk) {
          await axeScan(page, `${view.name} @${width}px`);
        } else {
          check(`AXE ${view.name} @${width}px: skipped (view did not mount)`, false, 'view not rendered — cannot scan');
        }
      }
      await context.close();
    }
    check(`pr10 ${view.name}: 0 unmocked /api/v1 routes (fail-visible catch-all never hit)`,
      viewAborts.length === 0,
      viewAborts.length ? `aborted: ${viewAborts.slice(0, 3).join(' ; ')}` : '');
    check(`pr10 ${view.name}: 0 page errors (pageerror events)`,
      viewPageErrors.length === 0,
      viewPageErrors.length ? viewPageErrors[0] : '');
  }

  await browser.close();
} finally {
  clearInterval(sampler);
}

const failed = results.filter(r => !r.ok);
console.log(`\n==== pr10-admin-smoke E2E: ${results.length - failed.length}/${results.length} checks passed ====`);
console.log(`peak Chromium RSS: ${(peakChromeRssKb / 1024).toFixed(0)} MB (ceiling 1562 MB)`);
// Console-error policy: tolerated (non-gating) — dev-mode warnings + the
// "Failed to load resource" noise aborted requests emit. The gating tripwires
// are the pageerror check (crashes) and the unmocked-route check (fixture gaps).
const realErrors = consoleErrors.filter(text => !text.includes('ui-permissions') && !text.includes('Failed to load resource'));
console.log(`console errors (tolerated, excluding mocked-route noise): ${realErrors.length}`);
realErrors.slice(0, 8).forEach(text => console.log('  •', text.slice(0, 220)));
console.log(`screenshot matrix: ${VIEWS.length} views x ${WIDTHS.length} widths + login (2) -> ${VIEWS.length * WIDTHS.length + 2} shots in e2e/screenshots/`);
// Failure triage so a red run is immediately interpretable: axe gate failures
// (a11y regressions in src, out of e2e scope) vs horizontal-scroll failures
// (shell layout overflow) vs render/mount failures (fixture or view wiring).
const axeFails = failed.filter(r => r.name.startsWith('AXE'));
const hscrollFails = failed.filter(r => r.name.includes('no horizontal scroll'));
const renderFails = failed.filter(r => !axeFails.includes(r) && !hscrollFails.includes(r));
console.log(`failure breakdown: axe=${axeFails.length} h-scroll=${hscrollFails.length} render/mock=${renderFails.length}`);
if (renderFails.length) {
  console.log('render/mock failures (fixture or view wiring — fix these first):');
  renderFails.forEach(r => console.log('  !', r.name));
}
process.exitCode = failed.length === 0 ? 0 : 1;
