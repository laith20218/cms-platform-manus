/**
 * Push 10.4 — HLS VideoPlayer E2E (real hls.js pipeline, real ladder).
 *
 * RAM contract (hard rule): ONE Chromium instance, --headless=new --disable-gpu
 * --disable-dev-shm-usage (+ --autoplay-policy=no-user-gesture-required so the
 * silent-refresh auto-resume path is deterministic), scenarios in
 * browser.newContext()s, browser closed immediately. Ceiling 1.6GB — sampled
 * at 400ms via ps.
 *
 * The media API is mocked at the network layer; the playback URL points at a
 * REAL locally-served HLS ladder (vite public/e2e-hls/, generated with ffmpeg
 * — 360p + 720p renditions, exactly the shape the 10.3 pipeline produces).
 * Playback therefore runs through genuine hls.js→MSE→<video> plumbing: ABR
 * level selection, fragment fetching, buffered ranges, seek-on-MSE.
 *
 * Regenerate the test ladder (git-ignored, ~390KB / 12s / 2 renditions):
 *   ffmpeg -y -threads 2 \
 *     -f lavfi -i testsrc=duration=12:size=1280x720:rate=10 \
 *     -f lavfi -i sine=frequency=440:duration=12 \
 *     -filter_complex "[0:v]format=yuv420p,split=2[v1][v2];[v1]scale=640:360[o1];[v2]scale=1280:720[o2];[1:a]asplit=2[a1][a2]" \
 *     -map "[o1]" -c:v:0 libx264 -preset ultrafast -crf 35 -pix_fmt yuv420p \
 *     -map "[o2]" -c:v:1 libx264 -preset ultrafast -crf 34 -pix_fmt yuv420p \
 *     -map "[a1]" -c:a:0 aac -b:a 32k -ac 1 -map "[a2]" -c:a:1 aac -b:a 32k -ac 1 -shortest \
 *     -f hls -hls_time 4 -hls_playlist_type vod \
 *     -hls_segment_filename "public/e2e-hls/stream_%v/seg%03d.ts" \
 *     -master_pl_name "master.m3u8" \
 *     -var_stream_map "v:0,a:0,name:360p v:1,a:1,name:720p" \
 *     "public/e2e-hls/stream_%v/playlist.m3u8"
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/player-hls.e2e.mjs
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

const EPISODE_ID = '11111111-2222-3333-4444-555555555555';
const HLS_URL = `${BASE_URL}/e2e-hls/master.m3u8`; // real 2-rung ladder via vite public/
const TTL_SECONDS = 8; // production is 540; short TTL → clamp → refresh at ~3s

const E2E_USER = {
  id: 'e2e-u-002', phone: '+962790000000', fullName: 'طالب الاختبار',
  role: 'student', avatarUrl: null,
  university: { id: 'u-1', nameAr: 'جامعة الاختبار' }, college: { id: 'c-1', nameAr: 'كلية الطب' },
};

/** JWT-shaped token their parser accepts (segment 0 = base64url JSON payload). */
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

/* ===== RAM sampler (hard-rule ceiling 1.6GB) ===== */
let peakChromeRssKb = 0;
const sampler = setInterval(() => {
  try {
    const out = execSync("ps -C chrome --no-headers -o rss= 2>/dev/null | awk '{s+=$1} END {print s+0}'", { stdio: ['ignore', 'pipe', 'ignore'] });
    const kb = Number(out.toString().trim());
    if (kb > peakChromeRssKb) peakChromeRssKb = kb;
  } catch { /* ps raced with process exit */ }
}, 400);

async function newStudentContext(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'ar', hasTouch: true });
  await context.addInitScript(() => {
    sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
  });

  const counters = { playbackUrl: 0, progressPosts: [] };

  // Catch-all FIRST (lowest priority): any unmocked /api/v1 call aborts cleanly.
  await context.route('**/api/v1/**', (route) => route.abort());
  // Specific mocks LAST (highest priority).
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));

  await context.route(`**/api/v1/media/course-episode/${EPISODE_ID}/playback-url`, async (route) => {
    counters.playbackUrl += 1;
    await route.fulfill({
      json: {
        // The presigned-style URL: .m3u8 pathname + signature query — exactly
        // the shape the isHlsUrl pathname check must survive.
        url: `${HLS_URL}?lease=${counters.playbackUrl}&X-Amz-Signature=deadbeef`,
        ttlSeconds: TTL_SECONDS,
        expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
        contentType: 'application/vnd.apple.mpegurl',
        supportsRange: true,
      },
    });
  });

  await context.route(`**/api/v1/media/course-episode/${EPISODE_ID}/progress`, async (route) => {
    if (route.request().method() === 'GET') {
      // Resume from 3s — proves the HLS seek-on-MSE resume path.
      await route.fulfill({
        json: {
          assetType: 'CourseEpisode', assetId: EPISODE_ID,
          lastPositionSeconds: 3, durationSeconds: 12,
          completionPercent: 25, updatedAt: new Date().toISOString(),
        },
      });
    } else {
      counters.progressPosts.push(route.request().postDataJSON());
      await route.fulfill({
        json: {
          assetType: 'CourseEpisode', assetId: EPISODE_ID,
          lastPositionSeconds: 4, durationSeconds: 12,
          completionPercent: 33.33, updatedAt: new Date().toISOString(),
        },
      });
    }
  });

  await context.route(`**/api/v1/media/course-episode/${EPISODE_ID}/bookmarks`, (route) =>
    route.fulfill({
      json: {
        id: 'bm-e2e-hls', assetType: 'CourseEpisode', assetId: EPISODE_ID,
        startSeconds: 4, endSeconds: 12, label: 'مقطع الاختبار', note: null,
        createdAt: new Date().toISOString(),
      },
    }));

  context.__counters = counters;
  return context;
}

async function openPlayer(page) {
  await page.goto(`${BASE_URL}/my-studies/player-test`);
  await page.getByTestId('open-player-test').click();
  await page.getByTestId('player-shell').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('sandbox-video-player').waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByTestId('video-element').waitFor({ state: 'attached', timeout: 20_000 });
}

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
  /* ================= Desktop (1280×800) — full HLS flow ================= */
  const context = await newStudentContext(browser, { width: 1280, height: 800 });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });

  await openPlayer(page);

  // 1 — Engine selection: .m3u8 URL (with presign query) → hls.js attached,
  //     element fed through MSE (blob: src, never the playlist URL itself).
  const engineInfo = await page.waitForFunction(() => {
    const container = document.querySelector('[data-testid="sandbox-video-player"]');
    const v = document.querySelector('[data-testid="video-element"]');
    if (!container || !v) return null;
    return {
      engine: container.getAttribute('data-engine'),
      src: v.getAttribute('src') ?? '',
      readyState: v.readyState,
    };
  }, null, { timeout: 15_000 }).then((handle) => handle.jsonValue());
  const engineOk = engineInfo?.engine === 'hls'
    && (engineInfo.src === '' || engineInfo.src.startsWith('blob:'))
    && !engineInfo.src.includes('master.m3u8');
  check('playback-url (.m3u8 + presign query) → hls.js engine + MSE-fed element', engineOk,
    `engine=${engineInfo?.engine} src=${String(engineInfo?.src).slice(0, 24)}…`);

  // 2 — The real ladder loaded: hls.js fetched the master + a variant
  //     (network evidence, not just DOM state).
  const ladderOk = await page.evaluate(async () => {
    const entries = performance.getEntriesByType('resource');
    const master = entries.some((e) => e.name.includes('e2e-hls/master.m3u8'));
    const variant = entries.some((e) => /e2e-hls\/stream_(360p|720p)\/playlist\.m3u8/.test(e.name));
    const segment = entries.some((e) => /e2e-hls\/stream_(360p|720p)\/seg\d+\.ts/.test(e.name));
    return { master, variant, segment };
  });
  check('hls.js parsed master → variant → segments (real ladder fetches)',
    ladderOk.master && ladderOk.variant && ladderOk.segment,
    `master=${ladderOk.master} variant=${ladderOk.variant} segment=${ladderOk.segment}`);

  // 3 — Resume: GET progress (3s) → MSE seek applied.
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-testid="video-element"]');
    return v && Math.abs(v.currentTime - 3) < 1.2;
  }, null, { timeout: 15_000 });
  check('progress resume: seeked to lastPositionSeconds=3 over MSE', true);

  // 4 — Center play → genuinely playing through the MSE pipeline.
  await page.getByTestId('video-center-play').click();
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-testid="video-element"]');
    return v && !v.paused && v.currentTime > 3.5;
  }, null, { timeout: 15_000 });
  check('center play starts real HLS playback (currentTime advances)', true);

  const beforeTime = await page.evaluate(() => document.querySelector('[data-testid="video-element"]').currentTime);

  // 5 — SILENT REFRESH on HLS: ttl=8s → clamp → refresh at ~3s. The swap is
  //     hls.loadSource(newUrl) (+ startLoad at the captured playhead): the
  //     engine must stay hls, time must not regress, playback must continue.
  {
    let swaps = 0;
    for (let i = 0; i < 50; i++) {
      await page.waitForTimeout(500);
      swaps = context.__counters.playbackUrl;
      if (swaps >= 2) break;
    }
    const after = await page.evaluate(() => {
      const v = document.querySelector('[data-testid="video-element"]');
      const container = document.querySelector('[data-testid="sandbox-video-player"]');
      return {
        time: v.currentTime, paused: v.paused,
        engine: container.getAttribute('data-engine'),
        readyState: v.readyState,
      };
    });
    const seamless = swaps >= 2 && !after.paused && after.time >= beforeTime - 0.2 && after.engine === 'hls';
    check('silent refresh on HLS via loadSource: seamless swap (engine stable, time kept, playing)',
      seamless,
      `requests=${swaps} time ${beforeTime.toFixed(1)}→${after.time.toFixed(1)} paused=${after.paused} engine=${after.engine}`);
  }

  // Show the controls in the screenshot: wake the auto-hide.
  await page.mouse.move(640, 400);
  await page.waitForTimeout(300);

  // 6 — Buffer indicator reflects MSE-buffered data.
  await page.waitForTimeout(700);
  const bufferWidth = await page.getByTestId('video-buffer-fill').evaluate((el) => parseFloat(el.style.width));
  check('buffer indicator reflects MSE buffered ranges', bufferWidth > 0, `width=${bufferWidth}%`);

  // 7 — Player controls still functional under hls.js: pause/play + speed
  //     (deliberately BEFORE the double-tap — the 12s ladder ends at +10s
  //     from anywhere, and an ended video must not poison these checks).
  await page.getByTestId('video-play-pause').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="video-element"]').paused, null, { timeout: 5_000 });
  check('bottom-bar play/pause toggles pause (HLS mode)', true);
  await page.getByTestId('video-play-pause').click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="video-element"]').paused, null, { timeout: 5_000 });
  check('bottom-bar play/pause resumes (HLS mode)', true);

  await page.getByTestId('video-rate-trigger').click();
  await page.getByTestId('video-rate-option-1-5').click();
  const rate = await page.evaluate(() => document.querySelector('[data-testid="video-element"]').playbackRate);
  check('speed selector sets playbackRate=1.5 (HLS mode)', rate === 1.5, `rate=${rate}`);
  // Back to 1× so the timing assertions below stay deterministic.
  await page.getByTestId('video-rate-trigger').click();
  await page.getByTestId('video-rate-option-1').click();

  // 8 — Double-tap zone (touch): preposition near the top (MSE seek), then
  //     right zone ×2 → +10s (~11.5s on the 12s ladder) with ripple badge.
  await page.evaluate(() => {
    const v = document.querySelector('[data-testid="video-element"]');
    if (v) v.currentTime = 1.5;
  });
  await page.waitForTimeout(600);
  const tBeforeDouble = await page.evaluate(() => document.querySelector('[data-testid="video-element"]').currentTime);
  await page.touchscreen.tap(940, 400);
  await page.touchscreen.tap(940, 400);
  await page.getByTestId('video-ripple-right').waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {});
  await page.waitForTimeout(400);
  const tAfterDouble = await page.evaluate(() => document.querySelector('[data-testid="video-element"]').currentTime);
  const doubleOk = tAfterDouble >= Math.min(tBeforeDouble + 10, 12) - 1.2 && tAfterDouble > tBeforeDouble + 5;
  check('double-tap +10s works over MSE (12s ladder)', doubleOk,
    `${tBeforeDouble.toFixed(1)}→${tAfterDouble.toFixed(1)}`);

  await page.screenshot({ path: path.join(SHOT_DIR, 'player-hls-01-playing.png') });

  /* ================= Metadata card (2.A) — same open shell ================= */

  // 9 — Episode metadata: title, difficulty badge (متوسط), duration 15:30, views.
  const metaVisible = await page.getByTestId('player-shell-metadata').isVisible();
  check('episode metadata card renders inside the shell', metaVisible);
  const metaTitle = await page.getByTestId('episode-metadata-title').textContent();
  check('metadata title prominent', Boolean(metaTitle && metaTitle.includes('القلب والأوعية')), metaTitle ?? '');
  const badge = await page.getByTestId('episode-metadata-difficulty').textContent();
  const badgeTier = await page.getByTestId('episode-metadata-difficulty').getAttribute('data-difficulty');
  check('difficulty badge = متوسط (tier 1, amber)', badge === 'متوسط' && badgeTier === '1', `badge=${badge} tier=${badgeTier}`);
  const durationText = await page.getByTestId('episode-metadata-duration').textContent();
  check('duration shows 15:30', durationText?.includes('15:30') ?? false, durationText ?? '');
  const viewsText = await page.getByTestId('episode-metadata-views').textContent();
  check('views count rendered', viewsText?.includes('مشاهدة') ?? false, viewsText ?? '');

  // 10 — Collapsible description: clamped by default, expands via the toggle.
  const descClamped = await page.getByTestId('episode-metadata-description').evaluate((el) => el.className.includes('line-clamp'));
  check('long description clamped by default', descClamped);
  await page.getByTestId('episode-metadata-toggle').click();
  await page.waitForTimeout(250);
  const descExpanded = await page.getByTestId('episode-metadata-description').evaluate((el) => !el.className.includes('line-clamp'));
  const ariaExpanded = await page.getByTestId('episode-metadata-toggle').getAttribute('aria-expanded');
  check('عرض المزيد expands the description (aria-expanded)', descExpanded && ariaExpanded === 'true');
  await page.screenshot({ path: path.join(SHOT_DIR, 'player-hls-02-metadata.png') });

  // 11 — Progress POSTs flow while playing (the 10s cadence).
  {
    let posts = 0;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      posts = context.__counters.progressPosts.length;
      if (posts >= 1) break;
    }
    check('progress tracking POSTs while playing (HLS mode)', posts >= 1, `posts=${posts}`);
  }

  await context.close();

  /* ================= Mobile (375×667) — metadata at 375px ================= */
  const mobileContext = await newStudentContext(browser, { width: 375, height: 667 });
  const mobilePage = await mobileContext.newPage();
  mobilePage.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });
  await openPlayer(mobilePage);
  await mobilePage.getByTestId('video-center-play').click().catch(() => {});
  await mobilePage.waitForTimeout(1200);
  const noHorizontalOverflow = await mobilePage.evaluate(() => {
    const stage = document.querySelector('[data-testid="player-stage"]');
    return stage ? stage.scrollWidth <= window.innerWidth + 1 : false;
  });
  check('mobile 375px: shell + metadata card, no horizontal overflow', noHorizontalOverflow);
  await mobilePage.screenshot({ path: path.join(SHOT_DIR, 'player-hls-03-mobile-375.png') });
  await mobileContext.close();

  /* ================= Report ================= */
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'-'.repeat(64)}`);
  console.log(`HLS PLAYER E2E: ${results.length - failed.length}/${results.length} passed`);
  console.log(`Peak Chromium RSS: ${(peakChromeRssKb / 1024).toFixed(0)} MB (${peakChromeRssKb} KB) — ceiling 1638 MB`);
  console.log(`Console errors: ${consoleErrors.length}`);
  if (consoleErrors.length) consoleErrors.slice(0, 5).forEach((e) => console.log(`  ! ${e}`));
  if (failed.length) {
    failed.forEach((r) => console.log(`  FAIL: ${r.name} ${r.extra}`));
    process.exitCode = 1;
  }
} finally {
  clearInterval(sampler);
  await browser.close();
}
