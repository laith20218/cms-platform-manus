/**
 * W15.0 §EVIDENCE: Courses cascade — deep-linking + persistence at 375px.
 *
 * Drives the REAL student dev server with the mocked API world (w144-mock-world,
 * extended with the cascade level fixtures) against the /exam-courses cascading
 * filter bar:
 *   • select University → College → Year → Semester → Subject through the real
 *     Radix selects (entitled subject enabled, non-entitled LOCKED);
 *   • deep-link: URL params update per level (universityId/collegeId/yearId/
 *     semesterId/subjectId) and a FULL deep link renders the labels cold;
 *   • persistence: a fresh /exam-courses visit (no params, same browser context)
 *     restores the stored cascade from localStorage into the URL;
 *   • §13 gates at 375px: screenshot, zero horizontal scroll, axe 2.2 AA scan.
 *
 * RAM contract: ONE Chromium, scenarios in browser.newContext()s, closed at exit.
 *
 * Run (student dev server bound to localhost:5173):
 *   E2E_WEB_URL=http://127.0.0.1:5173 node e2e/w15.0-cascade.e2e.mjs
 */
let chromium;
const PLAYWRIGHT_CANDIDATES = [process.env.E2E_PLAYWRIGHT_MODULE, 'playwright'].filter(Boolean);
for (const candidate of PLAYWRIGHT_CANDIDATES) {
  try { ({ chromium } = await import(candidate)); break; } catch { /* try next */ }
}
if (!chromium) {
  console.error('playwright module not found — set E2E_PLAYWRIGHT_MODULE');
  process.exit(1);
}
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));
const AXE_CANDIDATES = [
  fileURLToPath(new URL('../node_modules/axe-core/axe.js', import.meta.url)),
  fileURLToPath(new URL('../../../node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.js', import.meta.url)),
];
const AXE_JS = AXE_CANDIDATES.find((path) => { try { readFileSync(path); return true; } catch { return false; } });

import { mockWorld } from './w144-mock-world.mjs';

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log(`${ok ? '  PASS' : '! FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

async function hScroll(page) {
  return page.evaluate(() => {
    const doc = document.scrollingElement ?? document.documentElement;
    const start = doc.scrollLeft;
    doc.scrollLeft = 99999;
    const a = doc.scrollLeft;
    doc.scrollLeft = -99999;
    const b = doc.scrollLeft;
    doc.scrollLeft = start;
    return {
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
      scrollableDelta: Math.abs(a - b),
    };
  });
}

async function axeScan(page, label) {
  if (!AXE_JS) { check(`AXE ${label}: axe.js found`, false); return; }
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

/** Open a Radix select and pick the option carrying the given testid. */
async function pick(page, triggerTestId, optionTestId) {
  await page.locator(`[data-testid="${triggerTestId}"]`).click();
  await page.locator(`[data-testid="${optionTestId}"]`).click();
}

mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true });
try {
  // ===== Scenario A: drive the cascade level-by-level at 375px =====
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 740 } });
    await mockWorld(context);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

    await page.goto(`${BASE_URL}/exam-courses`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="cascade-filters"]').waitFor({ timeout: 15000 });

    // University level populates from /universities (options render only while the
    // select is OPEN — pick() auto-waits for trigger + option).
    await pick(page, 'cascade-select-university', 'cascade-select-university-u-1');
    await page.waitForURL(/universityId=u-1/, { timeout: 5000 });
    check('cascade: university selection deep-links universityId=u-1', true);

    // College level unlocks (enabled) after the university loads.
    await pick(page, 'cascade-select-college', 'cascade-select-college-c-1');
    await page.waitForURL(/collegeId=c-1/, { timeout: 5000 });
    check('cascade: college selection deep-links collegeId=c-1', true);

    await pick(page, 'cascade-select-year', 'cascade-select-year-y-1');
    await page.waitForURL(/yearId=y-1/, { timeout: 5000 });

    await pick(page, 'cascade-select-semester', 'cascade-select-semester-sem-1');
    await page.waitForURL(/semesterId=sem-1/, { timeout: 5000 });
    check('cascade: year + semester levels deep-link', true);

    // Subject level: s-9 (not entitled) is LOCKED; s-1 selectable.
    await page.locator('[data-testid="cascade-select-subject"]').click();
    const locked = page.locator('[data-testid="cascade-select-subject-s-9"]');
    check('cascade: non-entitled subject rendered locked (aria-disabled)', (await locked.getAttribute('aria-disabled')) === 'true');
    await page.keyboard.press('Escape'); // close the open select
    await pick(page, 'cascade-select-subject', 'cascade-select-subject-s-1');
    await page.waitForURL(/subjectId=s-1/, { timeout: 5000 });
    check('cascade: subject selection deep-links subjectId=s-1', true);

    // Screenshot + §13 gates at 375px (full cascade selected).
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOT_DIR}w15.0-cascade-375.png`, fullPage: true });
    const scroll = await hScroll(page);
    check('§13 cascade 375px: zero horizontal scroll', scroll.doc <= 0 && scroll.body <= 0 && scroll.scrollableDelta <= 1, `docΔ=${scroll.doc} bodyΔ=${scroll.body} scrollΔ=${scroll.scrollableDelta}`);
    await axeScan(page, 'cascade @ 375px');
    check('cascade: zero console errors at 375px', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

    // ===== Persistence: a FRESH visit (no URL params) restores from localStorage =====
    await page.goto(`${BASE_URL}/exam-courses`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="cascade-filters"]').waitFor({ timeout: 15000 });
    await page.waitForURL(/universityId=u-1/, { timeout: 5000 });
    const restoredUrl = page.url();
    check(
      'persistence: fresh visit restores universityId+subjectId from localStorage',
      /universityId=u-1/.test(restoredUrl) && /subjectId=s-1/.test(restoredUrl),
      restoredUrl,
    );
    await page.screenshot({ path: `${SHOT_DIR}w15.0-cascade-restored-375.png`, fullPage: true });

    await context.close();
  }

  // ===== Scenario B: FULL cold deep link renders every level's label =====
  {
    const context = await browser.newContext({ viewport: { width: 375, height: 740 } });
    await mockWorld(context);
    const page = await context.newPage();

    await page.goto(
      `${BASE_URL}/exam-courses?universityId=u-1&collegeId=c-1&yearId=y-1&semesterId=sem-1&subjectId=s-1&tab=categorized`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.locator('[data-testid="categorized-tree"]').waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);

    const uniLabel = await page.locator('[data-testid="cascade-select-university"]').innerText();
    check('deep link: university select shows the linked university', uniLabel.includes('جامعة الاختبار'), uniLabel.replace(/\n/g, ' '));
    const subjectLabel = await page.locator('[data-testid="cascade-select-subject"]').innerText();
    check('deep link: subject select shows the linked subject', subjectLabel.includes('علم وظائف الأعضاء'), subjectLabel.replace(/\n/g, ' '));

    await page.screenshot({ path: `${SHOT_DIR}w15.0-cascade-deeplink-categorized-375.png`, fullPage: true });
    const scroll = await hScroll(page);
    check('§13 cascade deep-link 375px: zero horizontal scroll', scroll.doc <= 0 && scroll.body <= 0 && scroll.scrollableDelta <= 1, `docΔ=${scroll.doc} bodyΔ=${scroll.body} scrollΔ=${scroll.scrollableDelta}`);

    await context.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter(result => !result.ok).length;
console.log(`\n== w15.0 cascade evidence: ${results.length - failed}/${results.length} checks passed ==`);
process.exit(failed ? 1 : 0);
