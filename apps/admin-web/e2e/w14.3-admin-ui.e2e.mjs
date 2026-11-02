/**
 * Wave 14.3 — §13 EVIDENCE: Admin UI Completeness (D4/D5/D1/D10/D12 surfaces).
 *
 * Drives the REAL dev server with a mocked API (admin-upload.e2e.mjs pattern —
 * context.route interception, seeded super_admin session) against the screens
 * Wave 14.3 owns:
 *   • ExamCoursesCenter (D1) — list / editor / exam picker / storefront preview
 *   • ExamsCenter stats dashboard (D10) + question reports triage (D12)
 * Emits per the §13 binding:
 *   • screenshots at 375 / 414 / 768 / 1024 / 1440
 *   • axe-core scans (wcag2a/aa + wcag21/22aa) — gate: 0 critical/serious
 *   • horizontal-scroll check (documentElement + body) at every width — gate: none
 *
 * RAM contract (hard rule): ONE Chromium, scenarios in browser.newContext()s,
 * browser closed immediately; RSS ceiling 1.6GB sampled at 400ms.
 *
 * Run (admin dev server bound to localhost:5174):
 *   E2E_ADMIN_URL=http://localhost:5174 node e2e/w14.3-admin-ui.e2e.mjs
 */
let chromium;
const PLAYWRIGHT_CANDIDATES = [
  process.env.E2E_PLAYWRIGHT_MODULE,
  'file:///home/z/cms-work/cms-platform-manus/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs',
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
const AXE_JS = '/home/z/cms-work/cms-platform-manus/node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.js';
const WIDTHS = [375, 414, 768, 1024, 1440];
const SUBJECT_URL = `${BASE_URL}/?univ=u1&college=c1&year=y1&semester=s1&subject=su1`;

mkdirSync(SHOT_DIR, { recursive: true });

import { mockWorld } from './w143-mock-world.mjs';

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

// ===== RAM sampler =====
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

try {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  // ============ Scenario A — ExamCoursesCenter (D1): §13 matrix ============
  console.log('\n== A. ExamCoursesCenter — 5-width matrix + axe + h-scroll ==');
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: width < 500 ? 740 : 900 },
    });
    await mockWorld(context);
    const page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`A/${width}: ${message.text()}`); });
    await page.goto(SUBJECT_URL, { waitUntil: 'domcontentloaded' });
    await openNav(page, width);
    await page.locator('nav button', { hasText: 'الدورات الامتحانية' }).click();
    await page.locator('td', { hasText: 'دورة امتحانات نصف السنة الأولى' }).first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${SHOT_DIR}w14.3-examcourses-${width}.png`, fullPage: true });
    const scroll = await hScroll(page);
    check(`§13 examcourses ${width}px: zero horizontal scroll`, scroll.doc <= 0 && scroll.body <= 0 && scroll.scrollableDelta <= 1, `docΔ=${scroll.doc} bodyΔ=${scroll.body} scrollΔ=${scroll.scrollableDelta}`);
    if (width === 1440 || width === 375) await axeScan(page, `examcourses list @ ${width}px`);
    await context.close();
  }

  // ============ Scenario B — editor / picker / preview interactions ============
  console.log('\n== B. ExamCoursesCenter — editor + exam picker + storefront preview ==');
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await mockWorld(context);
    const page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`B: ${message.text()}`); });
    await page.goto(SUBJECT_URL, { waitUntil: 'domcontentloaded' });
    await openNav(page, 1440);
    await page.locator('nav button', { hasText: 'الدورات الامتحانية' }).click();
    await page.locator('td', { hasText: 'دورة امتحانات نصف السنة الأولى' }).first().waitFor({ timeout: 15000 });

    // Editor (edit mode with bundle exams).
    await page.getByRole('button', { name: 'إدارة الدورة' }).first().click();
    await page.locator('h4', { hasText: 'اختبارات الدورة' }).waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOT_DIR}w14.3-examcourses-editor-1440.png`, fullPage: true });
    check('editor: metadata + bundle exams render', true);
    const scrollEditor = await hScroll(page);
    check('editor 1440px: zero horizontal scroll', scrollEditor.doc <= 0 && scrollEditor.body <= 0 && scrollEditor.scrollableDelta <= 1, `docΔ=${scrollEditor.doc} scrollΔ=${scrollEditor.scrollableDelta}`);

    // Exam picker modal.
    await page.getByRole('button', { name: 'إضافة اختبار' }).first().click();
    await page.getByText('إضافة اختبار من بنك المادة').waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOT_DIR}w14.3-examcourses-picker-1440.png` });
    check('picker: subject bank modal renders', true);
    await page.getByRole('button', { name: 'إغلاق', exact: true }).click();

    // Back to list → storefront preview modal.
    await page.getByRole('button', { name: 'رجوع إلى القائمة' }).click();
    await page.locator('td', { hasText: 'دورة امتحانات نصف السنة الأولى' }).first().waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'معاينة' }).first().click();
    await page.getByText('بترتيب ظهورها للطالب').waitFor({ timeout: 10000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOT_DIR}w14.3-examcourses-preview-1440.png` });
    check('preview: student-order exam list renders', true);
    await context.close();
  }

  // ============ Scenario C — ExamsCenter stats dashboard (D10) ============
  console.log('\n== C. ExamsCenter stats dashboard — 5-width matrix + axe + h-scroll ==');
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 740 : 900 } });
    await mockWorld(context);
    const page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`C/${width}: ${message.text()}`); });
    await page.goto(SUBJECT_URL, { waitUntil: 'domcontentloaded' });
    await openNav(page, width);
    await page.locator('nav button', { hasText: 'الاختبارات' }).click();
    await page.locator('td', { hasText: 'اختبار الدورة الدموية النهائي' }).first().waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'الإحصائيات' }).first().click();
    await page.getByText('توزيع الدرجات').waitFor({ timeout: 10000 });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${SHOT_DIR}w14.3-examstats-${width}.png`, fullPage: true });
    const scroll = await hScroll(page);
    check(`§13 examstats ${width}px: zero horizontal scroll`, scroll.doc <= 0 && scroll.body <= 0 && scroll.scrollableDelta <= 1, `docΔ=${scroll.doc} bodyΔ=${scroll.body} scrollΔ=${scroll.scrollableDelta}`);
    if (width === 1440 || width === 375) await axeScan(page, `stats dashboard @ ${width}px`);
    await context.close();
  }

  // ============ Scenario D — question reports triage (D12) ============
  console.log('\n== D. Question reports — triage UI + notes dialog ==');
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 740 : 900 } });
    await mockWorld(context);
    const page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`D/${width}: ${message.text()}`); });
    await page.goto(SUBJECT_URL, { waitUntil: 'domcontentloaded' });
    await openNav(page, width);
    await page.locator('nav button', { hasText: 'الاختبارات' }).click();
    await page.locator('td', { hasText: 'اختبار الدورة الدموية النهائي' }).first().waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'بلاغات الأسئلة' }).click();
    await page.getByRole('button', { name: 'حل البلاغ' }).first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${SHOT_DIR}w14.3-reports-${width}.png`, fullPage: true });
    const scroll = await hScroll(page);
    check(`reports ${width}px: zero horizontal scroll`, scroll.doc <= 0 && scroll.body <= 0 && scroll.scrollableDelta <= 1, `docΔ=${scroll.doc} bodyΔ=${scroll.body} scrollΔ=${scroll.scrollableDelta}`);
    if (width === 375) await axeScan(page, 'reports triage @ 375px');

    if (width === 1440) {
      await axeScan(page, 'reports triage @ 1440px');
      // Notes dialog (resolve flow).
      await page.getByRole('button', { name: 'حل البلاغ' }).first().click();
      await page.getByText('ملاحظات الحل (اختياري)').waitFor({ timeout: 10000 });
      await page.screenshot({ path: `${SHOT_DIR}w14.3-report-notes-1440.png` });
      check('report notes dialog renders', true);
      await page.getByRole('button', { name: 'إلغاء' }).click();
    }
    await context.close();
  }

  await browser.close();
} finally {
  clearInterval(sampler);
}

const failed = results.filter(r => !r.ok);
console.log(`\n==== w14.3-admin-ui E2E: ${results.length - failed.length}/${results.length} checks passed ====`);
console.log(`peak Chromium RSS: ${(peakChromeRssKb / 1024).toFixed(0)} MB (ceiling 1562 MB)`);
const realErrors = consoleErrors.filter(text => !text.includes('ui-permissions') && !text.includes('Failed to load resource'));
console.log(`console errors (excluding mocked-route noise): ${realErrors.length}`);
realErrors.slice(0, 8).forEach(text => console.log('  •', text.slice(0, 220)));
process.exit(failed.length === 0 ? 0 : 1);
