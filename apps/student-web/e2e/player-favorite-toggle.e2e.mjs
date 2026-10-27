/**
 * Push 11.3 — player ⭐ favorite toggle E2E (real video, network-layer API mocks).
 *
 * RAM contract (§4): ONE Chromium instance, --headless=new --disable-gpu
 * --disable-dev-shm-usage, scenarios in browser.newContext()s, browser closed
 * immediately. Ceiling 1.6GB — sampled at 400ms via ps.
 *
 * Verifies the star button contract: presence on episodes, optimistic fill + the
 * POST /favorites/episodes/{id} call, optimistic unfill + DELETE call, and rollback
 * with the Arabic toast when the POST fails.
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/player-favorite-toggle.e2e.mjs
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));

const COURSE_ID = '41111111-1111-1111-1111-111111111111';
const EPISODE_ID = '11111111-2222-3333-4444-555555555555';
const VIDEO_URL = `${BASE_URL}/e2e-test-video.mp4`;
const TTL_SECONDS = 600; // long TTL — this spec is about the star, not lease refresh

const E2E_USER = {
  id: 'e2e-u-002', phone: '+962790000000', fullName: 'طالب الاختبار',
  role: 'student', avatarUrl: null,
  university: { id: 'u-1', nameAr: 'جامعة الاختبار' }, college: { id: 'c-1', nameAr: 'كلية الطب' },
};

const ENTITLEMENT_TOKEN = [
  Buffer.from(JSON.stringify({ expiresAt: new Date(Date.now() + 3600_000).toISOString() })).toString('base64url'),
  'e2e', 'sig',
].join('.');

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? '  PASS' : '! FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

const consoleErrors = [];
/** Scenario 3 injects a deliberate 500 — its resource-error console line is EXPECTED
 *  and must not fail the run (the 11.1 injected-403 convention). */
function collectConsole(page, { allowInjectedFailure = false } = {}) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (allowInjectedFailure && /status of 500/.test(msg.text())) return;
    consoleErrors.push(msg.text().slice(0, 200));
  });
}

let peakChromeRssKb = 0;
const rssSampler = setInterval(() => {
  try {
    const kb = Number(execSync("ps -C chrome --no-headers -o rss= 2>/dev/null | awk '{s+=$1} END {print s+0}'", { stdio: ['ignore', 'pipe', 'ignore'] }));
    if (kb > peakChromeRssKb) peakChromeRssKb = kb;
  } catch { /* ps raced with process exit */ }
}, 400);

async function newStudentContext(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar' });
  await context.addInitScript(() => {
    sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
  });

  const counters = { favoritePosts: 0, favoriteDeletes: 0 };

  await context.route('**/api/v1/**', (route) => route.abort());
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));

  await context.route(`**/api/v1/courses/${COURSE_ID}`, (route) => route.fulfill({
    json: {
      id: COURSE_ID, subjectId: 's-e2e', title: 'كورس الاختبار — زر المفضلة',
      description: null, coverImageUrl: null, status: 'Published', episodesCount: 1,
      createdAt: '2026-10-20T12:00:00Z',
      episodes: [{
        id: EPISODE_ID, courseId: COURSE_ID,
        title: 'محاضرة تجريبية — القلب والأوعية', episodeNumber: 1,
        durationSeconds: 90, sourceType: 'Upload', fileSize: 903_000,
        contentType: 'video/mp4', youtubeVideoId: null, uploadCompleted: true,
        viewsCount: 1245, processingStatus: 'Ready',
      }],
    },
  }));

  await context.route(`**/api/v1/media/course-episode/${EPISODE_ID}/playback-url`, async (route) => {
    await route.fulfill({
      json: {
        url: `${VIDEO_URL}?lease=1`,
        ttlSeconds: TTL_SECONDS,
        expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
        contentType: 'video/mp4',
        supportsRange: true,
        isFavorite: options.initialIsFavorite ?? false,
      },
    });
  });

  await context.route(`**/api/v1/media/course-episode/${EPISODE_ID}/progress`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 204, body: '' }); // no resume row
    } else {
      await route.fulfill({
        json: {
          assetType: 'CourseEpisode', assetId: EPISODE_ID,
          lastPositionSeconds: 1, durationSeconds: 90, completionPercent: 1.1,
          updatedAt: new Date().toISOString(),
        },
      });
    }
  });

  await context.route(`**/api/v1/media/course-episode/${EPISODE_ID}/bookmarks`, (route) =>
    route.fulfill({ json: [] }));

  // POST /favorites/episodes/{id} (plural route) and DELETE /favorites/episode/{id}
  // (the unified {targetType}/{targetId} route — singular) both land here.
  await context.route(/\/api\/v1\/favorites\/episodes?\//, async (route) => {
    if (route.request().method() === 'POST') {
      counters.favoritePosts += 1;
      if (options.failFavoritePost) {
        // Delay the injected 500 so the optimistic state is OBSERVABLE before the
        // rollback (a local instant failure closes the window in milliseconds).
        await new Promise((resolve) => setTimeout(resolve, 800));
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'injected failure' }) });
        return;
      }
      await route.fulfill({ json: { favoriteId: 'fav-e2e-1', targetId: EPISODE_ID, targetType: 'episode', isFavorite: true } });
    } else {
      counters.favoriteDeletes += 1;
      await route.fulfill({ status: 204, body: '' });
    }
  });

  context.__counters = counters;
  return context;
}

async function openPlayer(page) {
  await page.goto(`${BASE_URL}/my-studies/courses/${COURSE_ID}`);
  await page.getByTestId('episode-stage').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('course-episode-player').waitFor({ state: 'visible', timeout: 20_000 });
  // Wake the auto-hidden controls so the star button is visible.
  await page.mouse.move(640, 380);
  await page.waitForTimeout(400);
}

const starState = (page) => page.getByTestId('video-favorite-button').getAttribute('aria-pressed');

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  headless: true,
  args: [
    '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox',
    '--autoplay-policy=no-user-gesture-required', '--disable-extensions',
    '--mute-audio', '--hide-scrollbars',
  ],
});

try {
  /* ================= Scenario 1 — star present, unfavorited initial state ================= */
  {
    const context = await newStudentContext(browser, { initialIsFavorite: false });
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });

    await openPlayer(page);
    await page.getByTestId('video-favorite-button').waitFor({ state: 'visible', timeout: 15_000 });
    check('star button present in the controls bar (next to 🔖 bookmark)', true);
    check('initial state: unfavorited (aria-pressed=false)', (await starState(page)) === 'false');
    check('aria-label = «إضافة للمفضلة»',
      (await page.getByTestId('video-favorite-button').getAttribute('aria-label')) === 'إضافة للمفضلة');

    // Click → optimistic fill + POST called.
    await page.getByTestId('video-favorite-button').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="video-favorite-button"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5_000 });
    check('click → optimistic fill (aria-pressed=true instantly)', true);
    await page.waitForFunction(() => document.querySelector('[data-testid="video-favorite-button"]')?.getAttribute('aria-label') === 'إزالة من المفضلة', null, { timeout: 5_000 });
    check('aria-label flips to «إزالة من المفضلة»', true);
    await page.waitForTimeout(400);
    check('POST /favorites/episodes/{id} called once', context.__counters.favoritePosts === 1, `posts=${context.__counters.favoritePosts}`);
    check('success toast shown («أُضيفت الحلقة إلى المفضلة»)',
      await page.getByText('أُضيفت الحلقة إلى المفضلة').isVisible().catch(() => false));

    await page.screenshot({ path: path.join(SHOT_DIR, 'player-favorite-01-starred.png') });

    // Click again → optimistic unfill + DELETE called.
    await page.mouse.move(640, 380);
    await page.getByTestId('video-favorite-button').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="video-favorite-button"]')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5_000 });
    check('second click → optimistic unfill (aria-pressed=false)', true);
    await page.waitForTimeout(400);
    check('DELETE /favorites/episodes/{id} called once', context.__counters.favoriteDeletes === 1, `deletes=${context.__counters.favoriteDeletes}`);

    await context.close();
  }

  /* ================= Scenario 2 — favorited initial state (from playback-url) ================= */
  {
    const context = await newStudentContext(browser, { initialIsFavorite: true });
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });

    await openPlayer(page);
    await page.getByTestId('video-favorite-button').waitFor({ state: 'visible', timeout: 15_000 });
    check('playback-url isFavorite=true → star starts filled (aria-pressed=true)', (await starState(page)) === 'true');
    check('aria-label starts as «إزالة من المفضلة»',
      (await page.getByTestId('video-favorite-button').getAttribute('aria-label')) === 'إزالة من المفضلة');

    await context.close();
  }

  /* ================= Scenario 3 — POST failure → rollback + toast ================= */
  {
    const context = await newStudentContext(browser, { initialIsFavorite: false, failFavoritePost: true });
    const page = await context.newPage();
    collectConsole(page, { allowInjectedFailure: true });

    await openPlayer(page);
    await page.getByTestId('video-favorite-button').waitFor({ state: 'visible', timeout: 15_000 });

    await page.getByTestId('video-favorite-button').click();
    // Optimistic fill first…
    await page.waitForFunction(() => document.querySelector('[data-testid="video-favorite-button"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5_000 });
    // …then the 500 lands and the star REVERTS with the error toast.
    await page.waitForFunction(() => document.querySelector('[data-testid="video-favorite-button"]')?.getAttribute('aria-pressed') === 'false', null, { timeout: 10_000 });
    check('failed POST → star reverts to unfavorited (rollback)', true);
    const toastVisible = await page.getByText('تعذّر تحديث المفضلة، حاول مجددًا').isVisible().catch(() => false);
    check('error toast shown («تعذّر تحديث المفضلة، حاول مجددًا»)', toastVisible);
    check('failed POST still counted once', context.__counters.favoritePosts === 1, `posts=${context.__counters.favoritePosts}`);

    await context.close();
  }
} finally {
  await browser.close(); // RAM contract: close immediately.
  clearInterval(rssSampler);
}

const failed = results.filter((r) => !r.ok);
console.log('--------------------------------------------------');
console.log(`RESULTS: ${results.length - failed.length}/${results.length} passed`);
if (consoleErrors.length) {
  console.log(`CONSOLE ERRORS (${consoleErrors.length}):`);
  consoleErrors.slice(0, 10).forEach((e) => console.log(`  • ${e}`));
} else {
  console.log('CONSOLE ERRORS: none');
}
console.log(`PEAK CHROME RSS: ${(peakChromeRssKb / 1024).toFixed(0)} MB (ceiling 1600 MB)`);
process.exit(failed.length ? 1 : 0);
