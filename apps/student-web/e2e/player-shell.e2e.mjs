/**
 * Push 10.1 — PlayerShell E2E sanity script.
 *
 * RAM-capped by contract: ONE Chromium instance launched with
 * --headless=new --disable-gpu --disable-dev-shm-usage, scenarios run in
 * browser.newContext()s (never extra browsers), and the browser is closed
 * immediately after the run. Target ceiling: 1.6 GB total.
 *
 * Run (dev server on 127.0.0.1:5173):
 *   node e2e/player-shell.e2e.mjs
 * Env overrides: E2E_WEB_URL, PLAYWRIGHT_CHROMIUM_EXECUTABLE.
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));

const E2E_USER = {
  id: 'e2e-u-001',
  phone: '+962790000000',
  fullName: 'طالب الاختبار',
  role: 'student',
  avatarUrl: null,
  university: { id: 'u-1', nameAr: 'جامعة الاختبار' },
  college: { id: 'c-1', nameAr: 'كلية الطب' },
};

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? '  PASS' : '! FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

const consoleErrors = [];

/** Auth-mocked context factory — every context gets the same setup. */
async function newStudentContext(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'ar' });
  await context.addInitScript(() => {
    sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
  });
  // Registered FIRST = lowest priority: any unmocked /api/v1 call aborts
  // cleanly (react-query error states) instead of hitting a dead backend.
  await context.route('**/api/v1/**', (route) => route.abort());
  // Registered LAST = highest priority: the auth handshake succeeds.
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  return context;
}

async function recordPrevention(page) {
  await page.evaluate(() => {
    window.__cmsE2E = { contextBlocked: null, keyBlocked: null };
    document.addEventListener('contextmenu', (e) => {
      window.__cmsE2E.contextBlocked = e.defaultPrevented;
    });
    document.addEventListener('keydown', (e) => {
      window.__cmsE2E.keyBlocked = e.defaultPrevented;
    });
  });
}

async function openModal(page) {
  await page.goto(`${BASE_URL}/my-studies/player-test`);
  await page.getByTestId('open-player-test').waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByTestId('open-player-test').click();
  await page.getByTestId('player-shell').waitFor({ state: 'visible', timeout: 10_000 });
}

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  headless: true,
  args: [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-extensions',
    '--mute-audio',
    '--hide-scrollbars',
  ],
});

try {
  /* ================= Desktop scenario (1280×800) ================= */
  const context = await newStudentContext(browser, { width: 1280, height: 800 });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });

  // 1 — Route + auth: the sandbox page renders behind the protected shell.
  await page.goto(`${BASE_URL}/my-studies/player-test`);
  const openBtn = page.getByTestId('open-player-test');
  await openBtn.waitFor({ state: 'visible', timeout: 20_000 });
  check('route /my-studies/player-test renders (auth mocked)', true, await page.title().then(() => ''));

  // 2 — Modal opens.
  await openBtn.click();
  await page.getByTestId('player-shell').waitFor({ state: 'visible', timeout: 10_000 });
  check('PlayerShell opens', true);

  // 3 — Header content (Radix Title) + kind badge + protection indicator.
  const headerText = await page.getByRole('dialog').getByText('محاضرة تجريبية — القلب والأوعية').isVisible();
  check('header title rendered', headerText);

  // 4 — Lazy mount: premium skeleton first, then the code-split dummy player.
  const lazyVisible = await page.getByTestId('lazy-player-mount').isVisible();
  const dummy = page.getByTestId('dummy-video-player');
  await dummy.waitFor({ state: 'visible', timeout: 15_000 });
  const hasVideo = await dummy.locator('video').count();
  check('LazyPlayerMount mounts the code-split player chunk', lazyVisible && hasVideo === 1);

  // 5 — a11y: close + fullscreen buttons expose Arabic aria-labels.
  const closeLabel = await page.getByTestId('player-close').getAttribute('aria-label');
  const fsLabel = await page.getByTestId('player-fullscreen-toggle').getAttribute('aria-label');
  check(
    'WCAG labels on close/fullscreen buttons',
    closeLabel === 'إغلاق المشغّل' && fsLabel === 'ملء الشاشة',
    `close="${closeLabel}" fs="${fsLabel}"`,
  );

  // 6 — RTL contract: close button sits in the TOP-LEFT quadrant (1280px wide).
  const closeBox = await page.getByTestId('player-close').boundingBox();
  const rtlOk = closeBox && closeBox.x < 640 && closeBox.y < 200;
  check('close button is top-LEFT under RTL', !!rtlOk, closeBox ? `x=${closeBox.x.toFixed(0)} y=${closeBox.y.toFixed(0)}` : 'no box');

  await page.screenshot({ path: path.join(SHOT_DIR, 'player-shell-01-open.png') });

  /* -------- Fullscreen (on the SHELL stage, never the media element) -------- */
  await page.getByTestId('player-fullscreen-toggle').click();
  try {
    await page.waitForFunction(
      () => document.fullscreenElement?.getAttribute('data-player-stage') === 'true',
      null,
      { timeout: 8_000 },
    );
    check('Fullscreen API targets the shell stage', true, 'document.fullscreenElement = [data-player-stage]');

    // Controls must remain visible while fullscreen.
    const controlsVisible = await page.getByTestId('player-close').isVisible()
      && await page.getByTestId('player-fullscreen-toggle').isVisible();
    check('header controls stay visible in fullscreen', controlsVisible);

    await page.screenshot({ path: path.join(SHOT_DIR, 'player-shell-02-fullscreen.png') });

    await page.getByTestId('player-fullscreen-toggle').click();
    await page.waitForFunction(() => document.fullscreenElement === null, null, { timeout: 8_000 });
    check('fullscreen toggles back off via the button', true);
  } catch {
    check('Fullscreen API targets the shell stage', false, 'waitForFunction timed out');
  }

  /* -------- Protection deterrents INSIDE the open shell -------- */
  await recordPrevention(page);

  // Right-click (real trusted event) at the stage center.
  const stageBox = await page.getByTestId('player-stage').boundingBox();
  await page.mouse.click(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2, { button: 'right' });
  const ctxBlocked = await page.evaluate(() => window.__cmsE2E.contextBlocked);
  check('contextmenu blocked inside the shell', ctxBlocked === true);

  // Ctrl+S (real trusted keypress — focus is trapped inside the dialog).
  await page.keyboard.press('Control+s');
  const saveBlocked = await page.evaluate(() => window.__cmsE2E.keyBlocked);
  check('Ctrl+S intercepted inside the shell', saveBlocked === true);

  // Synthetic copy event dispatched on an inner element — capture listener must preventDefault.
  const copyBlocked = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="player-stage"]');
    const target = stage.querySelector('[data-testid="dummy-video-player"]') ?? stage;
    const event = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  });
  check('copy event blocked inside the shell', copyBlocked === true);

  // 7 — Escape closes the modal.
  await page.keyboard.press('Escape');
  await page.getByTestId('player-shell').waitFor({ state: 'detached', timeout: 10_000 });
  check('Escape closes the shell', true);

  // 8 — Scope contract: with the modal CLOSED the page behaves normally.
  await recordPrevention(page);
  await page.mouse.click(400, 300, { button: 'right' });
  await page.keyboard.press('Control+s');
  const scoped = await page.evaluate(() => ({
    ctx: window.__cmsE2E.contextBlocked,
    key: window.__cmsE2E.keyBlocked,
  }));
  check(
    'protection scoped to the player area ONLY (page unaffected after close)',
    scoped.ctx === false && scoped.key === false,
    `contextmenu=${scoped.ctx} ctrl+s=${scoped.key}`,
  );

  // 9 — Reopen and close via the X button.
  await page.getByTestId('open-player-test').click();
  await page.getByTestId('player-shell').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByTestId('player-close').click();
  await page.getByTestId('player-shell').waitFor({ state: 'detached', timeout: 10_000 });
  check('close (X) button dismisses the shell', true);

  await context.close();

  /* ================= Mobile scenario (375×667) ================= */
  const mobile = await newStudentContext(browser, { width: 375, height: 667 });
  const mPage = await mobile.newPage();
  await openModal(mPage);
  await mPage.getByTestId('dummy-video-player').waitFor({ state: 'visible', timeout: 15_000 });

  const shellBox = await mPage.getByTestId('player-shell').boundingBox();
  const noHScroll = await mPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  check(
    'mobile 375px: shell covers viewport with no horizontal overflow',
    !!shellBox && shellBox.x === 0 && shellBox.y === 0 && shellBox.width === 375 && noHScroll,
  );
  await mPage.screenshot({ path: path.join(SHOT_DIR, 'player-shell-03-mobile-375.png') });
  await mobile.close();
} finally {
  await browser.close(); // close immediately — RAM contract.
}

const failed = results.filter((r) => !r.ok);
console.log('--------------------------------------------------');
console.log(`RESULTS: ${results.length - failed.length}/${results.length} passed`);
if (consoleErrors.length) {
  console.log(`CONSOLE ERRORS (${consoleErrors.length}):`);
  consoleErrors.slice(0, 8).forEach((e) => console.log(`  • ${e}`));
} else {
  console.log('CONSOLE ERRORS: none');
}
const mem = process.memoryUsage();
console.log(
  `NODE RSS: ${(mem.rss / 1024 / 1024).toFixed(0)} MB | heapUsed: ${(mem.heapUsed / 1024 / 1024).toFixed(0)} MB`,
);
process.exit(failed.length ? 1 : 0);
