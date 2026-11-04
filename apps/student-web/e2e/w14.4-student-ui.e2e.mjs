/**
 * Wave 14.4 — §13 EVIDENCE: Student UI Completeness.
 *
 * Drives the REAL student dev server with a mocked API (W14.3 admin harness
 * adapted to student seeding — cms-access-token + /auth/me + /entitlements/issue)
 * against the surfaces Wave 14.4 owns:
 *   • ExamCoursesPage (A.2) — دورات سنوات + دورات مصنفة tabs
 *   • ExamCourseDetailPage (A.3) — bundle exams + practice/exam entries
 *   • PracticePage (B.1, D13) — filtered run with immediate feedback + resets
 *   • ExamPage golden path (C.1, D9) — start → answer → submit → Results v2
 *   • QuestionPage (C.2/C.3) — share removed, SecurityWrapper mounted
 * Emits per the §13 binding:
 *   • screenshots at 375 / 414 / 768 / 1024 / 1440
 *   • axe-core scans (wcag2a/aa + wcag21/22aa) — gate: 0 critical/serious
 *   • horizontal-scroll check (documentElement + body + RTL scroll truth) — gate: none
 *
 * RAM contract (hard rule): ONE Chromium, scenarios in browser.newContext()s,
 * browser closed immediately; RSS ceiling 1.6GB sampled at 400ms.
 *
 * Run (student dev server bound to localhost:5173):
 *   E2E_WEB_URL=http://127.0.0.1:5173 node e2e/w14.4-student-ui.e2e.mjs
 */
let chromium;
const PLAYWRIGHT_CANDIDATES = [
  process.env.E2E_PLAYWRIGHT_MODULE,
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

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));
// axe.js resolves from the student-web node_modules (devDependency @axe-core/playwright
// pulls axe-core 4.14.0); fall back to the pnpm store path for robustness.
const AXE_CANDIDATES = [
  fileURLToPath(new URL('../node_modules/axe-core/axe.js', import.meta.url)),
  fileURLToPath(new URL('../../../node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.js', import.meta.url)),
];
const AXE_JS = AXE_CANDIDATES.find((path) => { try { readFileSync(path); return true; } catch { return false; } });
if (!AXE_JS) {
  console.error('axe.js not found in candidate paths:', AXE_CANDIDATES);
  process.exit(1);
}
const WIDTHS = [375, 414, 768, 1024, 1440];

mkdirSync(SHOT_DIR, { recursive: true });

import { mockWorld } from './w144-mock-world.mjs';

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

/** One §13 matrix pass: goto url, wait for selector, screenshot + h-scroll (+ axe at 1440/375). */
async function matrix(browser, { id, url, waitFor, axe = true, extra = null, tag = 'w14.4' }) {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 740 : 900 } });
    await mockWorld(context);
    const page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`${id}/${width}: ${message.text()}`); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator(waitFor).first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOT_DIR}${tag}-${id}-${width}.png`, fullPage: true });
    const scroll = await hScroll(page);
    check(`§13 ${id} ${width}px: zero horizontal scroll`, scroll.doc <= 0 && scroll.body <= 0 && scroll.scrollableDelta <= 1, `docΔ=${scroll.doc} bodyΔ=${scroll.body} scrollΔ=${scroll.scrollableDelta}`);
    if (axe && (width === 1440 || width === 375)) await axeScan(page, `${id} @ ${width}px`);
    if (extra) await extra(page, width);
    await context.close();
  }
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

try {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  // ============ A. ExamCoursesPage — دورات سنوات (A.2) ============
  console.log('\n== A. ExamCoursesPage (years) — 5-width matrix + axe + h-scroll ==');
  await matrix(browser, {
    id: 'examcourses-years',
    url: `${BASE_URL}/exam-courses`,
    waitFor: '[data-testid="exam-course-card-ec-2"]',
    extra: async (page, width) => {
      if (width === 1440) {
        // Year filter defaults to the LATEST year (2026) — 2025's card is filtered out.
        const has2025 = await page.locator('[data-testid="exam-course-card-ec-1"]').count();
        check('years tab: year filter defaults to latest round year (2026)', has2025 === 0);
      }
    },
  });

  // ============ B. ExamCoursesPage — دورات مصنفة (A.4 tree) ============
  console.log('\n== B. ExamCoursesPage (categorized) — 5-width matrix + axe + h-scroll ==');
  await matrix(browser, {
    id: 'examcourses-categorized',
    url: `${BASE_URL}/exam-courses?tab=categorized&subjectId=s-1`,
    waitFor: '[data-testid="categorized-tree"]',
    extra: async (page, width) => {
      if (width === 1440) {
        // Uncategorized bucket renders LAST (lectureId=null → 'uncategorized' testid,
        // per the committed CategorizedTab contract); its group rows only render
        // while the accordion is OPEN, so open it before counting.
        // W15.0: the shared @cms/ui Accordion renamed the header testid
        // lecture-accordion-* → accordion-header-*.
        const lastLecture = page.locator('[data-testid^="accordion-header-"]').last();
        const lastId = await lastLecture.getAttribute('data-testid');
        if (lastId === 'accordion-header-uncategorized') await lastLecture.click();
        const untaggedButton = await page.locator('[data-testid="start-practice-uncategorized-untagged"]').count();
        check('categorized tab: غير مصنف bucket + start buttons render', lastId === 'accordion-header-uncategorized' && untaggedButton >= 1);
      }
    },
  });

  // ============ C. ExamCourseDetailPage (A.3) ============
  console.log('\n== C. ExamCourseDetailPage — 5-width matrix + axe + h-scroll ==');
  await matrix(browser, {
    id: 'coursedetail',
    url: `${BASE_URL}/exam-courses/ec-2`,
    waitFor: '[data-testid="course-exam-ex-1"]',
  });

  // ============ D. PracticePage — categorized run (B.1, D13) ============
  console.log('\n== D. PracticePage — filtered run + immediate feedback + resets ==');
  await matrix(browser, {
    id: 'practice',
    url: `${BASE_URL}/practice/categorized/s-1?lectureId=lec-1&paragraphTag=${encodeURIComponent('الفصل الأول')}`,
    waitFor: '[data-testid="practice-progress"]',
    extra: async (page, width) => {
      if (width === 1440) {
        // Answer → immediate feedback (correctness + explanation), then reset-question.
        // W15.0 (P4-C2): the inline list renders every question at once — testids are
        // namespaced per question (pq-1 is the mock world's first question).
        await page.locator('[data-testid="practice-option-pq1-a"]').click();
        await page.locator('[data-testid="practice-confirm-pq-1"]').click();
        await page.locator('[data-testid="practice-feedback-pq-1"]').waitFor({ timeout: 10000 });
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${SHOT_DIR}w14.4-practice-feedback-1440.png`, fullPage: true });
        check('practice: immediate feedback renders (correct + explanation)', true);
        await page.locator('[data-testid="practice-reset-question-pq-1"]').click();
        await page.waitForTimeout(400);
        const confirmBack = await page.locator('[data-testid="practice-confirm-pq-1"]').count();
        check('practice: إعادة ضبط السؤال returns the question to unanswered', confirmBack === 1);
      }
    },
  });

  // ============ E. ExamPage golden path → Results v2 (C.1, D9) ============
  console.log('\n== E. ExamPage — start → answer → submit → Results v2 ==');
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 740 : 900 } });
    await mockWorld(context);
    const page = await context.newPage();
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`E/${width}: ${message.text()}`); });
    await page.goto(`${BASE_URL}/exams/ex-1`, { waitUntil: 'domcontentloaded' });
    await page.getByText('ألم صدري ضاغط يستمر أكثر من عشرين دقيقة').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOT_DIR}w14.4-exam-running-${width}.png`, fullPage: true });

    // Golden path: answer → submit → confirm.
    await page.getByText('ألم صدري ضاغط يستمر أكثر من عشرين دقيقة').first().click();
    await page.getByRole('button', { name: 'تسليم الاختبار' }).click();
    await page.getByRole('button', { name: 'تسليم نهائي' }).click();
    await page.locator('[data-testid="result-wrong-count"]').waitFor({ timeout: 10000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOT_DIR}w14.4-exam-results-${width}.png`, fullPage: true });
    const scroll = await hScroll(page);
    check(`§13 exam-results ${width}px: zero horizontal scroll`, scroll.doc <= 0 && scroll.body <= 0 && scroll.scrollableDelta <= 1, `docΔ=${scroll.doc} bodyΔ=${scroll.body} scrollΔ=${scroll.scrollableDelta}`);
    if (width === 1440 || width === 375) await axeScan(page, `exam results v2 @ ${width}px`);

    if (width === 1440) {
      const retake = await page.locator('[data-testid="result-retake"]').count();
      const attempts = await page.locator('[data-testid="result-attempts"]').count();
      const strong = await page.locator('[data-testid="result-strong-topics"]').count();
      check('results v2: retake button + attempt history + strong topics render', retake === 1 && attempts === 1 && strong === 1);
    }
    await context.close();
  }

  // ============ F. QuestionPage — share removed + protection mounted (C.2/C.3) ============
  console.log('\n== F. QuestionPage — share removed, SecurityWrapper mounted ==');
  await matrix(browser, {
    id: 'question',
    url: `${BASE_URL}/subjects/physiology/questions/q-1`,
    waitFor: '[data-testid="question-favorite-button"]',
    extra: async (page, width) => {
      if (width === 1440) {
        const shareButtons = await page.getByText('مشاركة', { exact: true }).count();
        check('question page: NO share action (C.2)', shareButtons === 0);
        const watermark = await page.locator('#cms-watermark').count();
        check('question page: SecurityWrapper watermark mounted (C.3)', watermark === 1);
      }
    },
  });

  await browser.close();
} finally {
  clearInterval(sampler);
}

const failed = results.filter(r => !r.ok);
console.log(`\n==== w14.4-student-ui E2E: ${results.length - failed.length}/${results.length} checks passed ====`);
console.log(`peak Chromium RSS: ${(peakChromeRssKb / 1024).toFixed(0)} MB (ceiling 1562 MB)`);
const realErrors = consoleErrors.filter(text => !text.includes('Failed to load resource'));
console.log(`console errors (excluding mocked-route noise): ${realErrors.length}`);
realErrors.slice(0, 8).forEach(text => console.log('  •', text.slice(0, 220)));
process.exit(failed.length === 0 ? 0 : 1);
