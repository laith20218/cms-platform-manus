/**
 * W21.3 — Matching (وصل) student-flow E2E (mocked API at the network layer).
 *
 * RAM contract (hard rule §4, mirrors favorites-advanced.e2e.mjs): ONE Chromium
 * instance, --headless=new --disable-gpu --disable-dev-shm-usage, scenarios in
 * browser.newContext()s, browser closed immediately. Ceiling 1.6GB — sampled at
 * 400ms via ps.
 *
 * Covers the W20.6/W20.5 critical path on the question player (bank surface,
 * route /subjects/:slug/questions/:id) with a 3×3 board:
 *  A. Desktop 1280×800 — the board renders both card groups from the student
 *     payload (matchingItems: prompts + targets, NEVER the correct pairs);
 *     «تصحيح الإجابة» gates on a complete pairing; CLICK-CLICK pairing (the
 *     keyboard/touch-complete path — drag is never the only way); the answer
 *     POSTs the W20.5 wire JSON on selectedOptionId; the per-pair reveal paints
 *     green/red + «الصحيح:» on wrong pairs; the explanation AUTO-OPENS (20.2).
 *  B. Unpair (the × on the chip) re-opens the gate; re-pairing closes it again.
 *  C. Mobile 375×667 — the same click-click path end-to-end (tap-friendly),
 *     verdict markers + explanation.
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/matching-question.e2e.mjs
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));

const QUESTION_ID = 'qm-e2e';

const E2E_USER = {
  id: 'e2e-u-213', phone: '+962790000021', fullName: 'طالب الاختبار',
  role: 'student', avatarUrl: null,
  university: { id: 'u-1', nameAr: 'جامعة الاختبار' }, college: { id: 'c-1', nameAr: 'كلية الطب' },
};

const ENTITLEMENT_TOKEN = [
  Buffer.from(JSON.stringify({ expiresAt: new Date(Date.now() + 3600_000).toISOString() })).toString('base64url'),
  'e2e', 'sig',
].join('.');

// ===== The 3×3 board (the STUDENT payload — prompts + targets, no pairs) =====
const PROMPTS = [
  { id: 'p1', text: 'العضلة الدائرية للعين', sortOrder: 0 },
  { id: 'p2', text: 'العضلة المضغية', sortOrder: 1 },
  { id: 'p3', text: 'العضلة الهرمية', sortOrder: 2 },
];
const TARGETS = [
  { id: 't1', text: 'عصب الوجه', sortOrder: 0 },
  { id: 't2', text: 'عصب مثلث التوائم', sortOrder: 1 },
  { id: 't3', text: 'العصب تحت اللسان', sortOrder: 2 },
];

/** The graded response for the scrambled submission (p1 ✓, p2 ✗, p3 ✗). */
const ANSWER_RESULT = {
  isCorrect: false,
  correctOptionId: '',
  correctOptionLetter: '',
  correctAnswerText: null,
  explanation: 'كل عضلة تُعصَّب من العصب المقابل لها في القائمة الثانية.',
  reference: 'مرجع التشريح العصبي — الفصل الثالث',
  isFirstAttempt: true,
  matchingResult: {
    isCorrect: false,
    pairs: [
      { promptId: 'p1', submittedTargetId: 't1', correctTargetId: 't1', isCorrect: true },
      { promptId: 'p2', submittedTargetId: 't3', correctTargetId: 't2', isCorrect: false },
      { promptId: 'p3', submittedTargetId: 't2', correctTargetId: 't3', isCorrect: false },
    ],
    correctPairs: [
      { promptId: 'p1', targetId: 't1' },
      { promptId: 'p2', targetId: 't2' },
      { promptId: 'p3', targetId: 't3' },
    ],
  },
};

/** The scrambled pairing the scenario drives: p1→t1 (right), p2→t3, p3→t2. */
const EXPECTED_SUBMISSION = JSON.stringify([
  { promptId: 'p1', targetId: 't1' },
  { promptId: 'p2', targetId: 't3' },
  { promptId: 'p3', targetId: 't2' },
]);

const MATCHING_QUESTION = {
  id: QUESTION_ID,
  text: 'صل كل عضلة بعصبها المتحكم بها',
  type: 'Matching',
  difficulty: 'Medium',
  tags: ['تشريح', 'أعصاب'],
  lectureTitle: 'محاضرة الأعصاب القحفية',
  year: 2025,
  reference: null,
  paragraphTag: null,
  isFavorite: false,
  options: [], // Matching rows carry no options — the board rides matchingItems.
  matchingItems: { prompts: PROMPTS, targets: TARGETS },
};

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? '  PASS' : '! FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

const consoleErrors = [];

// Peak Chromium RSS sampler (400ms cadence) — §4.
let peakChromeRssKb = 0;
const rssSampler = setInterval(() => {
  try {
    const kb = Number(execSync("ps -C chrome --no-headers -o rss= 2>/dev/null | awk '{s+=$1} END {print s+0}'", { stdio: ['ignore', 'pipe', 'ignore'] }));
    if (kb > peakChromeRssKb) peakChromeRssKb = kb;
  } catch { /* ps raced with process exit */ }
}, 400);

async function newStudentWorld(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'ar' });
  await context.addInitScript(() => {
    sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
  });
  context.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  const world = { answerPosts: [] };

  // Catch-all FIRST (lowest priority): any unmocked /api/v1 call aborts cleanly.
  await context.route('**/api/v1/**', (route) => route.abort());
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));
  await context.route('**/api/v1/subjects/my-subjects**', (route) =>
    route.fulfill({ json: { items: [{ id: 's1', slug: 'anatomy', nameAr: 'تشريح مرضي', contentScopes: ['QuestionsExams'] }] } }));
  await context.route('**/api/v1/favorites/lists**', (route) => route.fulfill({ json: [] }));
  await context.route('**/api/v1/favorites', (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 } }));
  // The question read (student payload — matchingItems, never the pairs).
  await context.route(`**/api/v1/questions/${QUESTION_ID}`, (route) =>
    route.fulfill({ json: MATCHING_QUESTION }));
  // The answer POST — capture the wire body, then reveal the graded result.
  // Registered LAST so it wins over the question-read glob above.
  await context.route(`**/api/v1/questions/${QUESTION_ID}/answer`, async (route) => {
    const body = route.request().postDataJSON();
    world.answerPosts.push(body);
    await route.fulfill({ json: ANSWER_RESULT });
  });

  return { context, world };
}

/** Click-click pairing: arm the target card, then tap the prompt's pair zone. */
async function pairByClick(page, targetId, promptId) {
  await page.getByTestId(`question-matching-target-${targetId}`).click();
  await page.getByTestId(`question-matching-pairzone-${promptId}`).click();
}

async function runScenario(browser, { viewport, label, shot, withUnpair }) {
  const { context, world } = await newStudentWorld(browser, viewport);
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/subjects/anatomy/questions/${QUESTION_ID}`, { waitUntil: 'domcontentloaded' });

    // 1) The board renders BOTH card groups from the student payload.
    const board = page.getByTestId(`question-matching-${QUESTION_ID}`);
    await board.waitFor({ state: 'visible', timeout: 15_000 });
    check(`[${label}] board renders from matchingItems`, true);
    for (const prompt of PROMPTS) {
      check(`[${label}] prompt card «${prompt.text}»`,
        (await page.getByTestId(`question-matching-prompt-${prompt.id}`).textContent()).includes(prompt.text));
    }
    for (const target of TARGETS) {
      check(`[${label}] target card «${target.text}»`,
        (await page.getByTestId(`question-matching-target-${target.id}`).textContent()).includes(target.text));
    }
    // The live counter starts at 0 / 3.
    check(`[${label}] counter starts 0 / 3`,
      (await page.getByTestId(`question-matching-count-${QUESTION_ID}`).textContent()).trim() === '0 / 3');

    // 2) The submit gate: disabled until EVERY prompt is paired.
    const confirm = page.getByRole('button', { name: 'تصحيح الإجابة' });
    await confirm.waitFor({ state: 'visible', timeout: 10_000 });
    check(`[${label}] «تصحيح الإجابة» disabled with zero pairs`, await confirm.isDisabled());
    await pairByClick(page, 't1', 'p1');
    check(`[${label}] still disabled after ONE pair`, await confirm.isDisabled());
    check(`[${label}] counter 1 / 3 after one pair`,
      (await page.getByTestId(`question-matching-count-${QUESTION_ID}`).textContent()).trim() === '1 / 3');

    if (withUnpair) {
      // Scenario B only: unpair p1 via the chip's × — the gate re-opens.
      await page.getByTestId(`question-matching-remove-p1`).click();
      check(`[${label}] unpair via × re-opens the gate`, await confirm.isDisabled());
      check(`[${label}] counter back to 0 / 3`,
        (await page.getByTestId(`question-matching-count-${QUESTION_ID}`).textContent()).trim() === '0 / 3');
      await pairByClick(page, 't1', 'p1');
    }

    // 3) Complete the scrambled pairing — click-click only, no drag.
    await pairByClick(page, 't3', 'p2');
    await pairByClick(page, 't2', 'p3');
    check(`[${label}] enabled once all 3 paired`, await confirm.isEnabled());

    // 4) Submit — the POST carries the W20.5 wire JSON on selectedOptionId.
    await confirm.click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="question-explanation"]').length > 0, { timeout: 10_000 });
    check(`[${label}] one answer POST fired`, world.answerPosts.length === 1, `posts=${world.answerPosts.length}`);
    check(`[${label}] wire JSON rides selectedOptionId`,
      world.answerPosts[0]?.selectedOptionId === EXPECTED_SUBMISSION,
      `got=${world.answerPosts[0]?.selectedOptionId ?? '—'}`);

    // 5) Per-pair verdicts: p1 green, p2/p3 red — one exclusive tone per card.
    const p1Class = await page.getByTestId('question-matching-prompt-p1').getAttribute('class');
    const p2Class = await page.getByTestId('question-matching-prompt-p2').getAttribute('class');
    const p3Class = await page.getByTestId('question-matching-prompt-p3').getAttribute('class');
    check(`[${label}] p1 painted green (correct pair)`, (p1Class ?? '').includes('cms-success') && !(p1Class ?? '').includes('cms-danger'));
    check(`[${label}] p2 painted red (wrong pair)`, (p2Class ?? '').includes('cms-danger'));
    check(`[${label}] p3 painted red (wrong pair)`, (p3Class ?? '').includes('cms-danger'));

    // The submitted chips show what the student chose…
    check(`[${label}] p2 chip shows the submitted target`,
      (await page.getByTestId('question-matching-submitted-p2').textContent()).includes('العصب تحت اللسان'));
    // …and every wrong pair ALSO reveals the correct target (the reveal moment).
    const p2Card = await page.getByTestId('question-matching-prompt-p2').textContent();
    const p3Card = await page.getByTestId('question-matching-prompt-p3').textContent();
    check(`[${label}] p2 reveals «الصحيح: عصب مثلث التوائم»`, p2Card.includes('الصحيح: عصب مثلث التوائم'));
    check(`[${label}] p3 reveals «الصحيح: العصب تحت اللسان»`, p3Card.includes('الصحيح: العصب تحت اللسان'));

    // 6) The explanation AUTO-OPENS with the reveal (the 20.2 pattern) and
    //    carries the text + reference the API sent.
    const explanation = await page.getByTestId('question-explanation').textContent();
    check(`[${label}] explanation auto-opened with the reveal`, explanation.includes('كل عضلة تُعصَّب من العصب المقابل لها في القائمة الثانية.'));
    check(`[${label}] reference rendered`, explanation.includes('مرجع التشريح العصبي — الفصل الثالث'));

    if (shot) {
      await page.screenshot({ path: `${SHOT_DIR}${shot}`, fullPage: false });
      check(`[${label}] screenshot saved`, fs.existsSync(`${SHOT_DIR}${shot}`));
    }
  } finally {
    await context.close();
  }
}

async function run() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    console.log('Scenario A: desktop 1280×800 — full critical path (click-click, gate, wire, reveal, explanation)');
    await runScenario(browser, { viewport: { width: 1280, height: 800 }, label: 'desktop', shot: 'w21.3-matching-desktop.png' });

    console.log('Scenario B: unpair (×) re-opens the gate, re-pair closes it');
    await runScenario(browser, { viewport: { width: 1280, height: 800 }, label: 'unpair', withUnpair: true });

    console.log('Scenario C: mobile 375×667 — the same click-click path end-to-end');
    await runScenario(browser, { viewport: { width: 375, height: 667 }, label: 'mobile', shot: 'w21.3-matching-mobile.png' });
  } finally {
    await browser.close();
    clearInterval(rssSampler);
  }

  const failed = results.filter((result) => !result.ok).length;
  const peakMb = (peakChromeRssKb / 1024).toFixed(0);
  console.log(`\n${results.length - failed}/${results.length} checks passed — peak Chromium RSS: ${peakMb} MB (ceiling 1600 MB)`);
  if (consoleErrors.length > 0) {
    console.log('console.error entries (informational):');
    for (const error of [...new Set(consoleErrors)].slice(0, 5)) console.log(`  • ${error.slice(0, 200)}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => { console.error(error); process.exit(1); });
