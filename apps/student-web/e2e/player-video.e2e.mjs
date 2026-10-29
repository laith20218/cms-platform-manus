/**
 * Push 10.2 — VideoPlayer E2E (real video, real API mocks).
 * Push 10.8 — retargeted from the deleted /player-test sandbox to the PRODUCTION
 * course player page (/my-studies/courses/:courseId): the same player now runs
 * inline with the episode metadata card under it.
 *
 * RAM contract: ONE Chromium instance, --headless=new --disable-gpu
 * --disable-dev-shm-usage (+ --autoplay-policy=no-user-gesture-required so
 * the silent-refresh auto-resume path is deterministic), scenarios in
 * browser.newContext()s, browser closed immediately. Ceiling 1.6GB.
 *
 * The media API is mocked at the network layer; the playback URL points at
 * a REAL locally-served MP4 (vite public/, generated with ffmpeg) — so
 * play/seek/buffer/double-tap/lease-swap all run against genuine media
 * playback, not stubs.
 *
 * Regenerate the test asset (git-ignored, ~880KB / 90s / h264+aac):
 *   ffmpeg -f lavfi -i testsrc=duration=90:size=640x360:rate=15 \
 *          -f lavfi -i sine=frequency=440:duration=90 -pix_fmt yuv420p \
 *          -movflags +faststart -c:v libx264 -preset veryfast -crf 30 \
 *          -c:a aac -b:a 48k -shortest public/e2e-test-video.mp4
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/player-video.e2e.mjs
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));

const COURSE_ID = '21111111-1111-1111-1111-111111111111';
const EPISODE_ID = '11111111-2222-3333-4444-555555555555';
const VIDEO_URL = `${BASE_URL}/e2e-test-video.mp4`; // real 90s MP4 via vite public/
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

async function newStudentContext(browser, viewport) {
  // hasTouch: the double-tap zones are exercised with touchscreen.tap on
  // both form factors (touch pointer events drive the ±10s logic).
  const context = await browser.newContext({ viewport, locale: 'ar', hasTouch: true });
  await context.addInitScript(() => {
    sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
  });

  const counters = { playbackUrl: 0, progressPosts: [], bookmarkPosts: [] };

  // Catch-all FIRST (lowest priority): any unmocked /api/v1 call aborts cleanly.
  await context.route('**/api/v1/**', (route) => route.abort());
  // Specific mocks LAST (highest priority).
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));

  // Push 10.8 — the production course page's detail payload: one Ready video
  // episode carrying rich metadata (drives the 2.B metadata card checks).
  await context.route(`**/api/v1/courses/${COURSE_ID}`, (route) => route.fulfill({
    json: {
      id: COURSE_ID, subjectId: 's-e2e', title: 'كورس الاختبار — مشغّل الإنتاج',
      description: null, coverImageUrl: null, status: 'Published', episodesCount: 1,
      createdAt: '2026-10-20T12:00:00Z',
      episodes: [{
        id: EPISODE_ID, courseId: COURSE_ID,
        title: 'محاضرة تجريبية — القلب والأوعية', episodeNumber: 1,
        durationSeconds: 90, sourceType: 'Upload', fileSize: 903_000,
        contentType: 'video/mp4', youtubeVideoId: null, uploadCompleted: true,
        viewsCount: 1245,
        description: 'مراجعة شاملة لجهاز الدوران القلبي مع حالات سريرية قصيرة وأسئلة مراجعة.',
        difficulty: 'Medium', processingStatus: 'Ready', targetQuality: 'Auto',
      }],
    },
  }));

  await context.route(`**/api/v1/media/course-episode/${EPISODE_ID}/playback-url`, async (route) => {
    counters.playbackUrl += 1;
    await route.fulfill({
      json: {
        url: `${VIDEO_URL}?lease=${counters.playbackUrl}`,
        ttlSeconds: TTL_SECONDS,
        expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
        contentType: 'video/mp4',
        supportsRange: true,
      },
    });
  });

  await context.route(`**/api/v1/media/course-episode/${EPISODE_ID}/progress`, async (route) => {
    if (route.request().method() === 'GET') {
      // Resume from 12s — proves the resume path.
      await route.fulfill({
        json: {
          assetType: 'CourseEpisode', assetId: EPISODE_ID,
          lastPositionSeconds: 12, durationSeconds: 90,
          completionPercent: 13.33, updatedAt: new Date().toISOString(),
        },
      });
    } else {
      // N11 hardening (11.5.7-a): an escaping keepalive beacon can arrive with
      // a degraded postBody that postDataJSON() fails to parse. An unprotected
      // throw kills the handler BEFORE route.fulfill — the route aborts, the
      // page sees net::ERR_FAILED, and the beacon is never counted. Parse
      // defensively: the sentinel body keeps check 13's shape validation
      // satisfied (positionSeconds=0 is finite and impossible for a real
      // beacon — the app guards position>0) while __unparseable preserves
      // the forensics.
      let body;
      try {
        body = route.request().postDataJSON();
      } catch {
        body = { positionSeconds: 0, durationSeconds: 0, __unparseable: true };
      }
      counters.progressPosts.push(body);
      await route.fulfill({
        json: {
          assetType: 'CourseEpisode', assetId: EPISODE_ID,
          lastPositionSeconds: 20, durationSeconds: 90,
          completionPercent: 22.22, updatedAt: new Date().toISOString(),
        },
      });
    }
  });

  await context.route(`**/api/v1/media/course-episode/${EPISODE_ID}/bookmarks`, async (route) => {
    counters.bookmarkPosts.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        id: 'bm-e2e-001', assetType: 'CourseEpisode', assetId: EPISODE_ID,
        startSeconds: 20, endSeconds: 50, label: 'مقطع الاختبار', note: null,
        createdAt: new Date().toISOString(),
      },
    });
  });

  context.__counters = counters;
  return context;
}

async function openPlayer(page) {
  await page.goto(`${BASE_URL}/my-studies/courses/${COURSE_ID}`);
  await page.getByTestId('episode-stage').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('course-episode-player').waitFor({ state: 'visible', timeout: 20_000 });
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
  /* ================= Desktop (1280×800) — full player flow ================= */
  const context = await newStudentContext(browser, { width: 1280, height: 800 });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });

  await openPlayer(page);

  // 1 — Playback URL fetched, real video element attached with our src.
  await page.waitForFunction(
    () => { const v = document.querySelector('[data-testid="video-element"]'); return v && v.src.includes('e2e-test-video.mp4'); },
    null, { timeout: 15_000 },
  );
  check('playback-url fetched → real <video> src attached', true);

  // 1b — Push 10.8: the production page renders the custom player + the rich
  //      metadata card (title / difficulty badge / views / description).
  {
    const metaTitle = await page.getByTestId('episode-metadata-title').textContent();
    const badgeVisible = await page.getByTestId('episode-metadata-difficulty').isVisible();
    const viewsText = await page.getByTestId('episode-metadata-views').textContent();
    const descVisible = await page.getByTestId('episode-metadata-description').isVisible();
    check(
      'metadata card renders title + difficulty badge + views + description',
      metaTitle === 'محاضرة تجريبية — القلب والأوعية' && badgeVisible && /1245|1\.2ألف/.test(viewsText ?? '') && descVisible,
      `title="${metaTitle}" views="${viewsText}"`,
    );
  }

  // 2 — Resume: GET progress (12s) → seek applied once metadata loads.
  await page.waitForFunction(
    () => { const v = document.querySelector('[data-testid="video-element"]'); return v && Math.abs(v.currentTime - 12) < 1.5; },
    null, { timeout: 15_000 },
  );
  check('progress resume: seeked to lastPositionSeconds=12', true);

  // 3 — Center play → actually plays (real media).
  await page.getByTestId('video-center-play').click();
  await page.waitForFunction(
    () => { const v = document.querySelector('[data-testid="video-element"]'); return v && !v.paused && v.currentTime > 12.5; },
    null, { timeout: 15_000 },
  );
  check('center play button starts real playback', true);

  const beforeTime = await page.evaluate(() => document.querySelector('[data-testid="video-element"]').currentTime);

  // 4 — SILENT REFRESH: ttl=8s → clamp → refresh at ~3s; the new URL keeps
  //     playing at the same timestamp (seamless swap). Short TTLs cascade a
  //     swap every ~3s — assert "at least the 2nd lease, still playing, time
  //     never regressed", not an exact lease number.
  //     Commit 6 (11.7.x/P2 gate, base-17 #5): the original poll counted
  //     __counters.playbackUrl then read v.src IMMEDIATELY — CI attempt 3
  //     (run 40824944242) caught the fetch counted before the new src was
  //     attached (requests=2 lease=1): count-then-read races the swap's src
  //     attachment. Same hardening P1 gave its FETCH checks: wait on the
  //     ELEMENT's lease param itself (the attachment IS the swap's visible
  //     effect) via waitForFunction, then assert the outcome. Budget stays
  //     25s (the counter poll's 50×500ms) — this poll spans the full wait
  //     for the 2nd attach, not just the count catch-up.
  {
    let swapAttached = true;
    try {
      await page.waitForFunction(
        () => {
          const v = document.querySelector('[data-testid="video-element"]');
          const m = v && v.src ? v.src.match(/lease=(\d+)/) : null;
          return !!(m && Number(m[1]) >= 2);
        },
        null, { timeout: 25_000, polling: 50 },
      );
    } catch { swapAttached = false; }
    const swaps = context.__counters.playbackUrl;
    const after = await page.evaluate(() => {
      const v = document.querySelector('[data-testid="video-element"]');
      return { time: v.currentTime, paused: v.paused, lease: Number((v.src.match(/lease=(\d+)/) || [0, 0])[1]) };
    });
    const seamless = swapAttached && swaps >= 2 && !after.paused && after.time >= beforeTime - 0.2 && after.lease >= 2;
    check(
      'silent refresh at ttl-60 (clamped): seamless swap',
      seamless,
      `requests=${swaps} time ${beforeTime.toFixed(1)}→${after.time.toFixed(1)} paused=${after.paused} lease=${after.lease}`,
    );
  }

  // Show the controls in the screenshot: wake the auto-hide.
  await page.mouse.move(640, 400);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOT_DIR, 'video-player-01-playing.png') });

  // 5 — Custom controls: pause/play via bottom bar.
  await page.getByTestId('video-play-pause').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="video-element"]').paused, null, { timeout: 5_000 });
  check('bottom-bar play/pause toggles pause', true);
  await page.getByTestId('video-play-pause').click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="video-element"]').paused, null, { timeout: 5_000 });

  // 6 — Keyboard seek on the player region (Space/K/J/L/M/F + arrows).
  const tBefore = await page.evaluate(() => document.querySelector('[data-testid="video-element"]').currentTime);
  await page.getByTestId('course-episode-player').focus();
  await page.keyboard.press('ArrowRight');
  const tAfter = await page.evaluate(() => document.querySelector('[data-testid="video-element"]').currentTime);
  check('keyboard: ArrowRight on the player region seeks +5s', tAfter - tBefore >= 4 && tAfter - tBefore <= 6.5,
    `${tBefore.toFixed(1)}→${tAfter.toFixed(1)}`);

  // 7 — Buffer indicator present and non-zero (real buffered ranges — the
  //     local file buffers instantly after the seek above).
  await page.waitForTimeout(700);
  const bufferWidth = await page.getByTestId('video-buffer-fill').evaluate((el) => parseFloat(el.style.width));
  check('buffer indicator reflects real buffered data', bufferWidth > 0, `width=${bufferWidth}%`);

  // 8 — Volume: mute/unmute.
  await page.getByTestId('video-mute').click();
  let muted = await page.evaluate(() => document.querySelector('[data-testid="video-element"]').muted);
  await page.getByTestId('video-mute').click();
  const unmuted = await page.evaluate(() => document.querySelector('[data-testid="video-element"]').muted);
  check('mute/unmute toggles video.muted', muted === true && unmuted === false);

  // 9 — Speed selector: open Radix Select, pick 1.5×.
  await page.getByTestId('video-rate-trigger').click();
  await page.getByTestId('video-rate-option-1-5').click();
  const rate = await page.evaluate(() => document.querySelector('[data-testid="video-element"]').playbackRate);
  check('speed selector sets playbackRate=1.5', rate === 1.5, `rate=${rate}`);

  // 10 — DOUBLE TAP: left zone −10s with ripple badge.
  //      N11 (11.5.4): raw touchscreen.tap(x, y) with a pre-measured boundingBox
  //      dispatches at stale viewport coordinates when the layout shifts between
  //      measure and dispatch (observed locally + CI: pointerups landing on
  //      episode-stage above the player — zero pairs ever registered, the app's
  //      280ms window is NOT the culprit). locator.tap() re-resolves geometry
  //      with actionability + hit-target checks at dispatch time. Retry absorbs
  //      residual pairing misses; t0 re-baselined per attempt.
  {
    let rippleVisible = false;
    let t0 = 0;
    let t1 = 0;
    const zone = page.getByTestId('video-tap-zone-left');
    for (let attempt = 0; attempt < 5 && !rippleVisible; attempt++) {
      t0 = await page.evaluate(() => document.querySelector('[data-testid="video-element"]').currentTime);
      await zone.tap();
      await page.waitForTimeout(120);
      await zone.tap();
      rippleVisible = await page.getByTestId('video-ripple-left').isVisible().catch(() => false);
      await page.waitForTimeout(400); // let the seek settle
      t1 = await page.evaluate(() => document.querySelector('[data-testid="video-element"]').currentTime);
    }
    check('double-tap LEFT: −10s + ripple badge', rippleVisible && t0 - t1 >= 8.5 && t0 - t1 <= 11.5,
      `${t0.toFixed(1)}→${t1.toFixed(1)} ripple=${rippleVisible}`);
  }

  // 11 — DOUBLE TAP: right zone +10s. (N11 11.5.4: same locator.tap retry as 10.)
  {
    let rippleVisible = false;
    let t0 = 0;
    let t1 = 0;
    const zone = page.getByTestId('video-tap-zone-right');
    for (let attempt = 0; attempt < 5 && !rippleVisible; attempt++) {
      t0 = await page.evaluate(() => document.querySelector('[data-testid="video-element"]').currentTime);
      await zone.tap();
      await page.waitForTimeout(120);
      await zone.tap();
      rippleVisible = await page.getByTestId('video-ripple-right').isVisible().catch(() => false);
      await page.waitForTimeout(400);
      t1 = await page.evaluate(() => document.querySelector('[data-testid="video-element"]').currentTime);
    }
    check('double-tap RIGHT: +10s + ripple badge', rippleVisible && t1 - t0 >= 8.5 && t1 - t0 <= 11.5,
      `${t0.toFixed(1)}→${t1.toFixed(1)} ripple=${rippleVisible}`);
  }

  // 12 — Bookmark dialog: defaults seeded from currentTime; submit → POST + toast.
  {
    const tNow = await page.evaluate(() => document.querySelector('[data-testid="video-element"]').currentTime);
    await page.getByTestId('video-bookmark-button').click();
    await page.getByTestId('bookmark-dialog').waitFor({ state: 'visible', timeout: 5_000 });
    const startVal = await page.getByTestId('bookmark-start').inputValue();
    const endVal = await page.getByTestId('bookmark-end').inputValue();
    const defaultsOk = Math.abs(Number(startVal) - tNow) < 2 && Math.abs(Number(endVal) - (Number(startVal) + 30)) <= 31;
    await page.getByTestId('bookmark-label').fill('مقطع مهم جداً');
    await page.getByTestId('bookmark-submit').click();
    await page.getByTestId('bookmark-dialog').waitFor({ state: 'hidden', timeout: 5_000 });
    const post = context.__counters.bookmarkPosts.at(-1);
    const toastShown = await page.locator('[data-sonner-toast]').first().isVisible().catch(() => false);
    check(
      'bookmark: defaults from currentTime + POST + success toast',
      defaultsOk && !!post && post.label === 'مقطع مهم جداً' && toastShown,
      `start=${startVal} end=${endVal} posted=${JSON.stringify(post?.label)}`,
    );
  }

  // 13 — Progress autosave: 10s cadence while playing (we've been playing a
  //      while — poll up to 15s so the interval's phase never flakes the window).
  {
    const before = context.__counters.progressPosts.length;
    let after = before;
    for (let i = 0; i < 30 && after === before; i++) {
      await page.waitForTimeout(500);
      after = context.__counters.progressPosts.length;
    }
    const bodiesOk = context.__counters.progressPosts.every((p) =>
      Number.isFinite(p?.positionSeconds) && Number.isFinite(p?.durationSeconds));
    check('progress POST every 10s during playback', after > before && bodiesOk,
      `posts ${before}→${after}`);
  }

  // 14 — Leaving the page fires the keepalive final save.
  //      N11 (11.5.7): the 11.5.4 redesign (REAL SPA nav-link click → unmount)
  //      still flaked intermittently — CI 2 fails / 3 recent runs, local 1 fail
  //      / 5 — always posts 2→2 with the vite proxy logging ECONNREFUSED on
  //      /progress ~2s later: the beacon FIRES (app correct) but escapes CDP
  //      route interception when the document tears down mid-flight. That is
  //      a genuine Chromium/CDP race on unload-time keepalive fetches, not app
  //      logic. Determinize by dispatching a synthetic window 'beforeunload'
  //      on the STILL-LIVE page: the app's listener runs, the beacon is issued
  //      from a live document, and interception is fully reliable (11.5.7
  //      probe PHASE A: 5/5 runs, counted in ~260ms, jsonOk, rawLen=43).
  //      Unmount-path onHide coverage moves to unit tests (supervisor decision
  //      11.5.7); then poll for the final post instead of a fixed window.
  {
    const before = context.__counters.progressPosts.length;
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
    let after = context.__counters.progressPosts.length;
    for (let i = 0; i < 30 && after === before; i++) {
      await page.waitForTimeout(500);
      after = context.__counters.progressPosts.length;
    }
    check('page-leave (beforeunload) → final progress save (keepalive)', after > before, `posts ${before}→${after}`);
  }

  await context.close();

  /* ================= Mobile (375×667) — layout + tap zones ================= */
  const mobile = await newStudentContext(browser, { width: 375, height: 667 });
  const mPage = await mobile.newPage();
  await openPlayer(mPage);
  await mPage.getByTestId('video-center-play').click();
  await mPage.waitForFunction(() => !document.querySelector('[data-testid="video-element"]').paused, null, { timeout: 10_000 });

  const noHScroll = await mPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  const controlsBox = await mPage.getByTestId('video-controls-bar').boundingBox();
  check(
    'mobile 375px: player + controls fit, no horizontal overflow',
    noHScroll && controlsBox.width <= 376,
    `controlsW=${controlsBox.width.toFixed(0)} noHScroll=${noHScroll}`,
  );

  // Double-tap works with touch on mobile too. (N11 11.5.4: locator.tap retry — see 10/11.)
  {
    let t0 = 0;
    let t1 = 0;
    const zone = mPage.getByTestId('video-tap-zone-right');
    for (let attempt = 0; attempt < 5 && !(t1 - t0 >= 8.5); attempt++) {
      t0 = await mPage.evaluate(() => document.querySelector('[data-testid="video-element"]').currentTime);
      await zone.tap();
      await mPage.waitForTimeout(120);
      await zone.tap();
      await mPage.waitForTimeout(400);
      t1 = await mPage.evaluate(() => document.querySelector('[data-testid="video-element"]').currentTime);
    }
    check('mobile double-tap RIGHT: +10s', t1 - t0 >= 8.5 && t1 - t0 <= 11.5, `${t0.toFixed(1)}→${t1.toFixed(1)}`);
  }

  await mPage.screenshot({ path: path.join(SHOT_DIR, 'video-player-02-mobile-375.png') });
  await mobile.close();

  /* ============ Wave 11.7.x / P1 — fetch-phase race windows (W1/W2/W3/W7) ============
   *
   * Deterministic race harness. The race scenarios own their playback-url
   * mock and serve ttlSeconds=68: the hook's arm formula max(3000, (ttl−60)·s)
   * schedules each silent refresh 8s after the last URL landed — the scenario
   * setup (resume + play + optional pause) ALWAYS beats the first one, so the
   * overlay that appears next is guaranteed to be the target refresh. The
   * target refresh's POST is held for LEASE_FETCH_DELAY_MS (the FETCH window —
   * every user intent below lands inside it), and the following refresh is 8s
   * away, so the target swap is the only one in flight during the assertions.
   *
   * Refresh discrimination (why a gap check, not a call counter): React dev
   * StrictMode double-invokes the hook's asset effect at mount — the app issues
   * TWO initial playback-url POSTs ~20ms apart (the second run clears the
   * in-flight slot, so they do not coalesce). Delaying by call index would hit
   * the second INITIAL, which lands misclassified (initial → no capture) and
   * kills playback at 0 — a StrictMode artifact, not the race under test. The
   * timer-driven silent refresh is the first POST issued a ≥2s gap after the
   * previous one; that one (and only it) gets the delay.
   * W2 additionally delays the swapped media response (route.fetch pass-through
   * with delay), widening the classic resolve-then-reset kill zone: the play
   * has RESOLVED on the old URL, then the load from the swap lands late and
   * resets the element.
   *
   * The refreshing indicator appears at fetch ENTRY on both the P0 hook and
   * the P1 rewrite (P1: refreshing spans fetch + SWAPPING + RESTORING), so it
   * is the cross-codebase FETCH-window signal the specs poll. The
   * data-swap-in-flight attribute (P1 instrumentation, set imperatively in
   * onSwapStart, cleared at every terminal) is asserted ABSENT after settle
   * — and, since P2 landed, polled PRESENT mid-flight: the SWAPPING-phase
   * specs (W1s/W7a/W7b at the bottom of this block) aim the user's intent
   * between onSwapStart and the element's readiness (the media response is
   * route-held for SWAPPING_MEDIA_DELAY_MS, so the consumer cannot ack and
   * the swap lifecycle is deterministically mid-SWAPPING).
   *
   * RED evidence: run against main 5168f37 (P0 hook) before the P1 rewrite —
   * each spec fails exactly as its window predicts (per-window excerpts in the
   * P1 e2e commit message).
   */
  {
    const LEASE_FETCH_DELAY_MS = 2_000;
    const W2_MEDIA_DELAY_MS = 800;
    /** P2: widens SWAPPING (not FETCH) — the swapped media response is held
     *  this long, so onSwapStart has fired (attr set) but the element cannot
     *  become ready and ack. Comfortably inside the 5s ack deadline. */
    const SWAPPING_MEDIA_DELAY_MS = 1_500;
    const SETTLE_GRACE_MS = 2_000;

    const readVideo = (page) => page.evaluate(() => {
      const v = document.querySelector('[data-testid="video-element"]');
      return v
        ? { time: v.currentTime, paused: v.paused, swapAttr: v.getAttribute('data-swap-in-flight') }
        : { time: -1, paused: true, swapAttr: null };
    });

    const overlayVisible = (page, visible, timeout) => page.waitForFunction(
      (wantVisible) => {
        const el = document.querySelector('[data-testid="video-refreshing"]');
        return wantVisible ? !!el : !el;
      },
      visible, { timeout },
    );

    /** P2: polls the imperative swap instrumentation MID-FLIGHT —
     *  data-swap-in-flight is set in onSwapStart (SWAPPING begins) and
     *  cleared at every terminal. present=true resolves the moment the
     *  swap lifecycle is deterministically inside SWAPPING. */
    const swapAttrVisible = (page, present, timeout) => page.waitForFunction(
      (want) => {
        const v = document.querySelector('[data-testid="video-element"]');
        return want === (v ? v.getAttribute('data-swap-in-flight') !== null : false);
      },
      present, { timeout },
    );

    /** The race scenarios' OWN playback-url mock (shadows the base one): every
     *  lease carries ttl=68 (each silent refresh arms 8s after the last URL —
     *  setup always beats the first). The FIRST SILENT REFRESH — identified by
     *  the >=2s gap since the previous POST, NOT by call index (React dev
     *  StrictMode double-invokes the hook's asset effect at mount: TWO initial
     *  POSTs ~20ms apart; delaying by index would hit the second initial,
     *  which lands misclassified and kills playback at 0 — a StrictMode
     *  artifact, not the race under test) — is held for LEASE_FETCH_DELAY_MS;
     *  state.refreshLease records its lease number for W2's media delay.
     *  Installed BEFORE navigation so the machine's speed can never shift
     *  which request is delayed. */
    const raceLeaseRoute = (context, state) => {
      let n = 0;
      let lastPostAt = 0;
      return context.route(`**/api/v1/media/course-episode/${EPISODE_ID}/playback-url`, async (route) => {
        n += 1;
        const now = Date.now();
        // The silent refresh is the first POST a >=2s gap after the previous
        // one (the StrictMode mount pair lands ~20ms apart — see header).
        const isSilentRefresh = lastPostAt > 0 && now - lastPostAt >= 2_000;
        lastPostAt = now;
        if (isSilentRefresh && !state.delayedRefreshDone) {
          state.delayedRefreshDone = true;
          state.refreshLease = n;
          await new Promise((r) => setTimeout(r, LEASE_FETCH_DELAY_MS));
        }
        await route.fulfill({
          json: {
            url: `${VIDEO_URL}?lease=${n}`,
            ttlSeconds: 68,
            expiresAt: new Date(Date.now() + 68_000).toISOString(),
            contentType: 'video/mp4',
            supportsRange: true,
          },
        });
      });
    };

    /** W2: holds the swapped media response (the delayed refresh's lease) so
     *  the load lands while the play has already resolved on the old URL.
     *  Other media requests pass straight through to vite's static file.
     *  P2: delayMs parametrized — the SWAPPING-phase specs hold it longer
     *  (SWAPPING_MEDIA_DELAY_MS) to widen the swap window. */
    const delaySwappedMedia = (context, state, delayMs = W2_MEDIA_DELAY_MS) => context.route(`${VIDEO_URL}*`, async (route) => {
      if (state.refreshLease && route.request().url().includes(`lease=${state.refreshLease}`)) {
        const response = await route.fetch();
        await new Promise((r) => setTimeout(r, delayMs));
        await route.fulfill({ response });
      } else {
        await route.fallback();
      }
    });

    const openPlayingPlayer = async (page) => {
      await openPlayer(page);
      await page.waitForFunction(
        () => { const v = document.querySelector('[data-testid="video-element"]'); return v && Math.abs(v.currentTime - 12) < 1.5; },
        null, { timeout: 15_000 },
      );
      await page.getByTestId('video-center-play').click();
      await page.waitForFunction(
        () => { const v = document.querySelector('[data-testid="video-element"]'); return v && !v.paused && v.currentTime > 12.5; },
        null, { timeout: 15_000 },
      );
      await page.getByTestId('course-episode-player').focus();
    };

    const runRaceScenario = async (name, body) => {
      const context = await newStudentContext(browser, { width: 1280, height: 800 });
      const page = await context.newPage();
      const state = { delayedRefreshDone: false, refreshLease: 0 };
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(`[${name}] ${msg.text().slice(0, 160)}`);
      });
      try {
        await body(context, page, state);
      } catch (err) {
        check(name, false, `SPEC ERROR: ${err?.message ?? err}`);
      } finally {
        await context.close();
      }
    };

    // W1 — play intent issued during the (route-delayed) FETCH window must
    // survive the swap. P0 captured wasPlaying at fetch ENTRY (still paused)
    // → the restore never replays the play → dead tap.
    await runRaceScenario('W1 — play during FETCH survives the swap (dead tap)', async (context, page, state) => {
      await raceLeaseRoute(context, state);
      await openPlayingPlayer(page);
      await page.keyboard.press('Space'); // pause — the intent setup
      await page.waitForFunction(
        () => document.querySelector('[data-testid="video-element"]').paused,
        null, { timeout: 5_000 },
      );
      const pausedAt = await readVideo(page);

      await overlayVisible(page, true, 12_000); // FETCH window open
      await page.keyboard.press('Space'); // PLAY — the user's tap inside the window
      await overlayVisible(page, false, LEASE_FETCH_DELAY_MS + 12_000); // swap landed

      let playing = true;
      try {
        await page.waitForFunction(
          () => { const v = document.querySelector('[data-testid="video-element"]'); return v && !v.paused && v.currentTime > 0.5; },
          null, { timeout: 10_000 },
        );
      } catch { playing = false; }
      const finalState = await readVideo(page);
      check(
        'W1 — play during FETCH survives the swap (dead tap)',
        playing && !finalState.paused && finalState.time >= pausedAt.time - 1 && finalState.swapAttr === null,
        `pausedAt=${pausedAt.time.toFixed(1)}s final=${finalState.time.toFixed(1)}s paused=${finalState.paused} swapAttr=${finalState.swapAttr}`,
      );
    });

    // W2 — resolve-then-reset: the play RESOLVES on the old URL (time visibly
    // advancing), then the swapped load lands (media response delayed) and
    // kills playback. P0 restores from the entry capture (paused) → dead.
    await runRaceScenario('W2 — resolved play survives the late swap (resolve-then-reset)', async (context, page, state) => {
      await raceLeaseRoute(context, state);
      await delaySwappedMedia(context, state);
      await openPlayingPlayer(page);
      await page.keyboard.press('Space');
      await page.waitForFunction(
        () => document.querySelector('[data-testid="video-element"]').paused,
        null, { timeout: 5_000 },
      );
      const pausedAt = await readVideo(page);

      await overlayVisible(page, true, 12_000);
      await page.keyboard.press('Space'); // play
      // The RESOLVE half: real playback on the OLD url, confirmed before the
      // delayed fetch can land the swap.
      await page.waitForFunction(
        () => {
          const v = document.querySelector('[data-testid="video-element"]');
          return v && !v.paused && v.currentTime > 13;
        },
        null, { timeout: 1_500 },
      );
      await overlayVisible(page, false, LEASE_FETCH_DELAY_MS + 12_000);

      let playing = true;
      try {
        await page.waitForFunction(
          () => { const v = document.querySelector('[data-testid="video-element"]'); return v && !v.paused && v.currentTime > 0.5; },
          null, { timeout: 10_000 },
        );
      } catch { playing = false; }
      const finalState = await readVideo(page);
      check(
        'W2 — resolved play survives the late swap (resolve-then-reset)',
        playing && !finalState.paused && finalState.time >= pausedAt.time - 1 && finalState.swapAttr === null,
        `pausedAt=${pausedAt.time.toFixed(1)}s final=${finalState.time.toFixed(1)}s paused=${finalState.paused} swapAttr=${finalState.swapAttr}`,
      );
    });

    // W3 — pause intent issued during the FETCH window must be respected.
    // P0 captured wasPlaying=true at entry → the restore ghost-un-pauses.
    await runRaceScenario('W3 — pause during FETCH is respected (no ghost un-pause)', async (context, page, state) => {
      await raceLeaseRoute(context, state);
      await openPlayingPlayer(page);

      await overlayVisible(page, true, 12_000);
      await page.keyboard.press('Space'); // PAUSE inside the window
      await page.waitForFunction(
        () => document.querySelector('[data-testid="video-element"]').paused,
        null, { timeout: 5_000 },
      );
      const pausedAt = await readVideo(page);

      await overlayVisible(page, false, LEASE_FETCH_DELAY_MS + 12_000);
      await page.waitForTimeout(SETTLE_GRACE_MS);

      const finalState = await readVideo(page);
      check(
        'W3 — pause during FETCH is respected (no ghost un-pause)',
        finalState.paused && Math.abs(finalState.time - pausedAt.time) < 3 && finalState.swapAttr === null,
        `pausedAt=${pausedAt.time.toFixed(1)}s final=${finalState.time.toFixed(1)}s paused=${finalState.paused} swapAttr=${finalState.swapAttr}`,
      );
    });

    // W7 — seek intent issued during the FETCH window must survive the swap.
    // P0 captured currentTime at entry → the restore reverts the playhead.
    await runRaceScenario('W7 — seek during FETCH survives the swap (no seek revert)', async (context, page, state) => {
      await raceLeaseRoute(context, state);
      await openPlayingPlayer(page);

      await overlayVisible(page, true, 12_000);
      for (let i = 0; i < 5; i += 1) {
        await page.keyboard.press('l'); // +10s each → ~13s → ~63s
        await page.waitForTimeout(80);
      }
      await page.waitForFunction(
        () => { const v = document.querySelector('[data-testid="video-element"]'); return v && v.currentTime >= 55; },
        null, { timeout: 3_000 },
      );
      const seekedTo = await readVideo(page);

      await overlayVisible(page, false, LEASE_FETCH_DELAY_MS + 12_000);
      await page.waitForTimeout(SETTLE_GRACE_MS);

      const finalState = await readVideo(page);
      check(
        'W7 — seek during FETCH survives the swap (no seek revert)',
        finalState.time >= 55 && Math.abs(finalState.time - seekedTo.time) <= 8 && finalState.swapAttr === null,
        `seekedTo=${seekedTo.time.toFixed(1)}s final=${finalState.time.toFixed(1)}s paused=${finalState.paused} swapAttr=${finalState.swapAttr}`,
      );
    });

    /* ============ Wave 11.7.x / P2 — SWAPPING-phase intent windows ============
     *
     * The residual window P1 left open: intent issued AFTER onSwapStart (the
     * element is torn down mid-load on the fresh URL) and BEFORE the restore.
     * Aim: swapAttrVisible(true) — the imperative instrumentation set in
     * onSwapStart — then the intent; the media response is route-held
     * (SWAPPING_MEDIA_DELAY_MS), so the consumer cannot ack and the swap is
     * deterministically mid-SWAPPING when the intent lands.
     *
     * Honest red-first classification (per the P2 review's F1/F2 analysis):
     *  - W7a RED on P1: the consumer classifier reads el.paused of the
     *    torn-down element (paused=true after the fresh load) and issues
     *    PLAY — the ghost un-pause, intent inverted before any queue could
     *    help. P2's togglePlay classifies against the capture (playing → the
     *    user's toggle is PAUSE) and the restore replays it.
     *  - W7b RED on P1: the consumer seekBy computes el.currentTime + delta
     *    on the reset element and its duration guard drops the intent
     *    entirely (mid-load duration is NaN) — the seek revert. P2's seekBy
     *    accumulates from the CAPTURE base and the restore lands it.
     *  - W1s GREEN-BY-PASSTHROUGH on P1 (documented as such, kept as a
     *    permanent guard): the reset already happened at onSwapStart, the
     *    user's play() lands on the mid-load element and survives, and the
     *    restore never pauses — an accident P2 converts into a guarantee
     *    via the queue replay.
     */
    await runRaceScenario('W1s — play during SWAPPING survives the swap (dead tap, queue form)', async (context, page, state) => {
      await raceLeaseRoute(context, state);
      await delaySwappedMedia(context, state, SWAPPING_MEDIA_DELAY_MS);
      await openPlayingPlayer(page);
      await page.keyboard.press('Space'); // pause — the deterministic pre-state (the capture: paused)
      await page.waitForFunction(
        () => document.querySelector('[data-testid="video-element"]').paused,
        null, { timeout: 5_000 },
      );
      const pausedAt = await readVideo(page);

      await overlayVisible(page, true, 12_000); // FETCH window opens
      await swapAttrVisible(page, true, 4_000); // SWAPPING begins (onSwapStart fired)
      await page.keyboard.press('Space'); // PLAY — inside SWAPPING (media held)

      await overlayVisible(page, false, LEASE_FETCH_DELAY_MS + 12_000);
      await page.waitForTimeout(SETTLE_GRACE_MS);

      let playing = true;
      try {
        await page.waitForFunction(
          () => { const v = document.querySelector('[data-testid="video-element"]'); return v && !v.paused && v.currentTime > 0.5; },
          null, { timeout: 10_000 },
        );
      } catch { playing = false; }
      const finalState = await readVideo(page);
      check(
        'W1s — play during SWAPPING survives the swap (dead tap, queue form)',
        playing && !finalState.paused && finalState.time >= pausedAt.time - 1 && finalState.swapAttr === null,
        `pausedAt=${pausedAt.time.toFixed(1)}s final=${finalState.time.toFixed(1)}s paused=${finalState.paused} swapAttr=${finalState.swapAttr}`,
      );
    });

    await runRaceScenario('W7a — pause during SWAPPING is respected (no ghost un-pause)', async (context, page, state) => {
      await raceLeaseRoute(context, state);
      await delaySwappedMedia(context, state, SWAPPING_MEDIA_DELAY_MS);
      await openPlayingPlayer(page); // playing — the capture base (paused=false)
      const baseAt = await readVideo(page);

      await overlayVisible(page, true, 12_000);
      await swapAttrVisible(page, true, 4_000); // SWAPPING begins
      await page.keyboard.press('Space'); // PAUSE — inside SWAPPING (media held)

      await overlayVisible(page, false, LEASE_FETCH_DELAY_MS + 12_000);
      await page.waitForTimeout(SETTLE_GRACE_MS);

      const finalState = await readVideo(page);
      check(
        'W7a — pause during SWAPPING is respected (no ghost un-pause)',
        finalState.paused && finalState.time >= baseAt.time - 1 && finalState.time <= baseAt.time + 10 && finalState.swapAttr === null,
        `baseAt=${baseAt.time.toFixed(1)}s final=${finalState.time.toFixed(1)}s paused=${finalState.paused} swapAttr=${finalState.swapAttr}`,
      );
    });

    await runRaceScenario('W7b — seek during SWAPPING survives the swap (no seek revert)', async (context, page, state) => {
      await raceLeaseRoute(context, state);
      await delaySwappedMedia(context, state, SWAPPING_MEDIA_DELAY_MS);
      await openPlayingPlayer(page); // playing — wasPlaying replays after the restore

      await overlayVisible(page, true, 12_000);
      await swapAttrVisible(page, true, 4_000); // SWAPPING begins
      for (let i = 0; i < 5; i += 1) {
        await page.keyboard.press('l'); // +10s each — accumulates from the capture base
        await page.waitForTimeout(80);
      }
      // The presses land inside SWAPPING (media held 1.5s; 5×(press+80ms)
      // ≈ 0.5s) — the element cannot seek yet; only the restore can land it.

      await overlayVisible(page, false, LEASE_FETCH_DELAY_MS + 12_000);
      await page.waitForTimeout(SETTLE_GRACE_MS);

      const finalState = await readVideo(page);
      check(
        'W7b — seek during SWAPPING survives the swap (no seek revert)',
        finalState.time >= 55 && !finalState.paused && finalState.swapAttr === null,
        `final=${finalState.time.toFixed(1)}s paused=${finalState.paused} swapAttr=${finalState.swapAttr}`,
      );
    });
  }
} finally {
  await browser.close(); // RAM contract: close immediately.
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
const mem = process.memoryUsage();
console.log(`NODE RSS: ${(mem.rss / 1024 / 1024).toFixed(0)} MB | heapUsed: ${(mem.heapUsed / 1024 / 1024).toFixed(0)} MB`);
process.exit(failed.length ? 1 : 0);
