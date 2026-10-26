/**
 * Push 11.1 — HLS VideoPlayer E2E through the API PROXY route (the 401 fix).
 *
 * Verifies, against the production player code, the flow that replaces presigned
 * master.m3u8 URLs:
 *   1. playback-url answers the API proxy route
 *      (/api/v1/media/hls/course-episode/{id}/master.m3u8 — absolute, API origin);
 *   2. hls.js attaches the session auth headers (Authorization + X-Entitlement +
 *      X-Installation-Id/X-Device-Fingerprint) to EVERY ladder request via xhrSetup
 *      — master, variant playlists AND .ts segments (this is precisely what the
 *      401 incident lacked: the ladder's children arrived at storage with no
 *      authorization at all);
 *   3. the playlists' RELATIVE URIs resolve back into the proxy route (base-URL
 *      stability — the property that makes the proxy work without rewriting
 *      manifests), so no request ever bypasses the API;
 *   4. real playback advances end-to-end through hls.js→MSE→<video> with zero
 *      401s and zero direct ladder fetches;
 *   5. the silent lease refresh (short TTL → swap at ~3s) reloads through the
 *      proxy seamlessly (engine stays hls, time keeps advancing).
 *
 * The API is mocked at the network layer (route.fulfill) — same philosophy as
 * player-hls.e2e.mjs — but the ladder content is REAL (vite public/e2e-hls/,
 * generated with ffmpeg; regenerate with the command documented there). The
 * proxy routes serve those real files, so hls.js parses genuine manifests and
 * fetches genuine MPEG-TS bytes.
 *
 * RAM contract (hard rule): ONE Chromium instance, --headless=new --disable-gpu
 * --disable-dev-shm-usage, scenarios in browser.newContext()s, browser closed
 * immediately. Ceiling 1.6GB — sampled at 400ms via ps.
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/player-hls-proxy.e2e.mjs
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));
const LADDER_DIR = fileURLToPath(new URL('../public/e2e-hls/', import.meta.url));

const COURSE_ID = '21111111-1111-1111-1111-111111111111';
const EPISODE_ID = '11111111-2222-3333-4444-555555555555';
const PROXY_BASE = `${BASE_URL}/api/v1/media/hls/course-episode/${EPISODE_ID}`;
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

/** Per-request evidence collected by the proxy route mocks. */
const proxyEvidence = {
  master: 0,
  variants: 0,
  segments: 0,
  requestsWithoutAuthHeaders: [],
};

async function newStudentContext(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'ar', hasTouch: true });
  await context.addInitScript(() => {
    sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
  });

  const counters = { playbackUrl: 0, progressPosts: [] };

  // Catch-all FIRST (lowest priority): any unmocked /api/v1 call aborts cleanly —
  // if hls.js resolved a ladder URI anywhere other than our mocked proxy routes,
  // the request dies here and playback stalls (the test fails loudly).
  await context.route('**/api/v1/**', (route) => route.abort());
  // Specific mocks LAST (highest priority).
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));

  await context.route(`**/api/v1/courses/${COURSE_ID}`, (route) => route.fulfill({
    json: {
      id: COURSE_ID, subjectId: 's-e2e', title: 'كورس الاختبار — وكيل المشغّل',
      description: null, coverImageUrl: null, status: 'Published', episodesCount: 1,
      createdAt: '2026-10-20T12:00:00Z',
      episodes: [{
        id: EPISODE_ID, courseId: COURSE_ID,
        title: 'محاضرة تجريبية — القلب والأوعية', episodeNumber: 1,
        durationSeconds: 930, sourceType: 'Upload', fileSize: 120_000,
        contentType: 'video/mp4', youtubeVideoId: null, uploadCompleted: true,
        viewsCount: 1245,
        description: 'مراجعة شاملة لجهاز الدوران القلبي.',
        difficulty: 'Medium', processingStatus: 'Ready', targetQuality: 'Auto',
      }],
    },
  }));

  // Push 11.1 — playback-url answers the PROXY route (absolute, API origin),
  // exactly what MediaController.GetPlaybackUrl now returns for Ready HLS assets.
  await context.route(`**/api/v1/media/course-episode/${EPISODE_ID}/playback-url`, async (route) => {
    counters.playbackUrl += 1;
    await route.fulfill({
      json: {
        url: `${PROXY_BASE}/master.m3u8`,
        ttlSeconds: TTL_SECONDS,
        expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
        contentType: 'application/vnd.apple.mpegurl',
        supportsRange: false,
      },
    });
  });

  await context.route(`**/api/v1/media/course-episode/${EPISODE_ID}/progress`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          assetType: 'CourseEpisode', assetId: EPISODE_ID,
          lastPositionSeconds: 2, durationSeconds: 12,
          completionPercent: 16.67, updatedAt: new Date().toISOString(),
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

  /* ===== THE PROXY — serves the REAL ladder files at the proxy route ===== */

  const requireAuthHeaders = (route) => {
    const headers = route.request().headers();
    const missing = [];
    if (!headers.authorization?.startsWith('Bearer ')) missing.push('Authorization');
    if (!headers['x-entitlement']) missing.push('X-Entitlement');
    if (!headers['x-installation-id']) missing.push('X-Installation-Id');
    if (missing.length > 0) {
      proxyEvidence.requestsWithoutAuthHeaders.push(
        `${route.request().method()} ${route.request().url().replace(PROXY_BASE, '…')} missing: ${missing.join(',')}`);
    }
  };

  await context.route(`${PROXY_BASE}/master.m3u8`, async (route) => {
    requireAuthHeaders(route);
    proxyEvidence.master += 1;
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'private, no-store' },
      body: await readFile(path.join(LADDER_DIR, 'master.m3u8'), 'utf8'),
    });
  });

  await context.route(new RegExp(`${PROXY_BASE.replaceAll('/', '\\/')}/stream_(360p|720p)/playlist\\.m3u8.*`), async (route) => {
    requireAuthHeaders(route);
    proxyEvidence.variants += 1;
    const match = route.request().url().match(/stream_(360p|720p)\/playlist\.m3u8/);
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'private, no-store' },
      body: await readFile(path.join(LADDER_DIR, `stream_${match[1]}`, 'playlist.m3u8'), 'utf8'),
    });
  });

  await context.route(new RegExp(`${PROXY_BASE.replaceAll('/', '\\/')}/stream_(360p|720p)/seg\\d+\\.ts.*`), async (route) => {
    requireAuthHeaders(route);
    proxyEvidence.segments += 1;
    const match = route.request().url().match(/stream_(360p|720p)\/(seg\d+\.ts)/);
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'video/mp2t', 'Cache-Control': 'private, max-age=300' },
      body: await readFile(path.join(LADDER_DIR, `stream_${match[1]}`, match[2])),
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
  /* ================= Desktop (1280×800) — full proxy HLS flow ================= */
  const context = await newStudentContext(browser, { width: 1280, height: 800 });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });

  await openPlayer(page);

  // 1 — Engine selection: the proxy master.m3u8 URL routes to the hls.js engine.
  const engineInfo = await page.waitForFunction(() => {
    const container = document.querySelector('[data-testid="course-episode-player"]');
    const v = document.querySelector('[data-testid="video-element"]');
    if (!container || !v) return null;
    return {
      engine: container.getAttribute('data-engine'),
      src: v.getAttribute('src') ?? '',
      readyState: v.readyState,
    };
  }, null, { timeout: 15_000 }).then((handle) => handle.jsonValue());
  const engineOk = engineInfo?.engine === 'hls'
    && (engineInfo.src === '' || engineInfo.src.startsWith('blob:'));
  check('proxy playback-url (.m3u8, API origin) → hls.js engine + MSE-fed element', engineOk,
    `engine=${engineInfo?.engine} src=${String(engineInfo?.src).slice(0, 24)}…`);

  // 2 — Center play → genuinely playing through the proxied MSE pipeline.
  await page.getByTestId('video-center-play').click();
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-testid="video-element"]');
    return v && !v.paused && v.currentTime > 2.5;
  }, null, { timeout: 20_000 });
  check('playback advances through the proxy (currentTime advances, no fatal error)', true);

  // 3 — SILENT REFRESH through the proxy: ttl=8s → clamp → swap at ~3s. The new
  //     playback-url is the SAME proxy route; hls.loadSource re-fetches master +
  //     playlist through it. Time must keep advancing, engine must stay hls.
  {
    let swaps = 0;
    for (let i = 0; i < 50; i++) {
      await page.waitForTimeout(500);
      swaps = context.__counters.playbackUrl;
      if (swaps >= 2) break;
    }
    const after = await page.evaluate(() => {
      const v = document.querySelector('[data-testid="video-element"]');
      const container = document.querySelector('[data-testid="course-episode-player"]');
      return { time: v.currentTime, paused: v.paused, engine: container.getAttribute('data-engine') };
    });
    const seamless = swaps >= 2 && !after.paused && after.engine === 'hls';
    check('silent refresh reloads through the proxy seamlessly (engine stable, still playing)',
      seamless, `requests=${swaps} time=${after.time.toFixed(1)} paused=${after.paused} engine=${after.engine}`);
  }

  // 4 — THE network evidence: master + variants + segments were ALL fetched via the
  //     proxy route, every one carrying the auth headers (xhrSetup), and NOTHING
  //     touched the ladder directly (no direct /e2e-hls/ fetch = no bypassed API).
  //     (The regenerated ladder packs its full 12s into ONE segment per rung —
  //     see the ffmpeg command — so "segments >= 1" is the complete-playback count.)
  const directLadderFetches = await page.evaluate(() =>
    performance.getEntriesByType('resource').filter((e) => e.name.includes('/e2e-hls/')).length);
  check('master + variant playlists + segments ALL served by the proxy route',
    proxyEvidence.master >= 1 && proxyEvidence.variants >= 1 && proxyEvidence.segments >= 1,
    `master=${proxyEvidence.master} variants=${proxyEvidence.variants} segments=${proxyEvidence.segments}`);
  check('every proxied request carried Authorization + X-Entitlement + X-Installation-Id',
    proxyEvidence.requestsWithoutAuthHeaders.length === 0,
    proxyEvidence.requestsWithoutAuthHeaders.slice(0, 3).join(' | ') || 'all headers present');
  check('no ladder object was fetched outside the proxy (0 direct /e2e-hls/ requests)',
    directLadderFetches === 0, `direct=${directLadderFetches}`);

  await page.mouse.move(640, 400);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOT_DIR, 'player-hls-proxy-01-playing.png') });

  // 5 — Progress POSTs still flow while playing (the 10s cadence).
  {
    let posts = 0;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      posts = context.__counters.progressPosts.length;
      if (posts >= 1) break;
    }
    check('progress tracking POSTs while playing (proxy mode)', posts >= 1, `posts=${posts}`);
  }

  await context.close();

  /* ================= Report ================= */
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'-'.repeat(64)}`);
  console.log(`HLS PROXY PLAYER E2E: ${results.length - failed.length}/${results.length} passed`);
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
