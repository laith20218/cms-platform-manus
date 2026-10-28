/**
 * Push 11.1-REWRITE — HLS VideoPlayer E2E for OPTION C (variant-rewrite architecture).
 *
 * Verifies, against the production player code, the Option C contract:
 *   1. master request → API origin (proxy route, session auth headers attached);
 *   2. variant request → API origin (proxy route, auth headers) — served REWRITTEN:
 *      its segment lines are ABSOLUTE presigned-style B2 URLs;
 *   3. segment requests → B2 origin DIRECTLY (*.backblazeb2.com), carrying NO
 *      Authorization/custom headers (bare GETs — no CORS preflight, per C.3.3);
 *   4. ZERO segment requests to the API origin (the retired route answers 404 —
 *      mocked exactly like production);
 *   5. real playback advances end-to-end through hls.js→MSE→<video> (currentTime > 5s);
 *   6. silent refresh on a SHORT TTL: playback-url re-issued → the lease generation
 *      bump re-runs loadSource → variant RE-FETCHED → fresh-generation presigned
 *      segment URLs keep working (engine stays hls, time keeps advancing);
 *   7. NETWORK_ERROR recovery (the C.3.1 status-agnostic trigger): with the timer
 *      refresh parked far away (long TTL), every issued segment URL "expires"
 *      (B2 answers 403 with NO CORS headers, exactly like production), a seek past
 *      the buffer forces fragment loads, hls.js escalates to a fatal network error,
 *      the player triggers the silent refresh, and playback RESUMES at the seek
 *      position on a fresh generation.
 *
 * The API is mocked at the network layer (route.fulfill) — same philosophy as the
 * Push 11.1 proxy spec — but the ladder content is REAL (ffmpeg-generated into
 * public/e2e-hls-optionc/ with the PRODUCTION layout: {rung}/index.m3u8 +
 * {rung}/segment_%03d.ts; 120s so a seek lands beyond the 30s forward buffer —
 * regenerated automatically when missing).
 *
 * e2e-only deviations (documented, both production-covered elsewhere):
 *   - the variant mock answers Cache-Control: no-store so the TTL-compressed
 *     refresh (540s→8s) observably re-fetches the variant — production serves
 *     private,max-age=60, far shorter than the 480s cadence (unit-tested);
 *   - the third+ playback-url answer carries a long TTL to park the timer refresh
 *     during the recovery phase, isolating the NETWORK_ERROR trigger (in production
 *     the timer and error triggers coexist by design).
 *
 * RAM contract (hard rule): ONE Chromium instance, --headless=new --disable-gpu
 * --disable-dev-shm-usage, scenarios in browser.newContext()s, browser closed
 * immediately. Ceiling 1.6GB — sampled at 400ms via ps.
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/player-hls-option-c.e2e.mjs
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));
const LADDER_DIR = fileURLToPath(new URL('../public/e2e-hls-optionc/', import.meta.url));

const COURSE_ID = '21111111-1111-1111-1111-111111111111';
const EPISODE_ID = '11111111-2222-3333-4444-555555555555';
const PROXY_BASE = `${BASE_URL}/api/v1/media/hls/course-episode/${EPISODE_ID}`;
const TTL_SECONDS = 8;    // production is 540; short TTL → clamp → refresh at ~3s
const PARKED_TTL_SECONDS = 300; // from the 3rd issue on: parks the timer refresh

/** The fake object-storage origin segments presign against (host only — never hit). */
const B2_ORIGIN = 'https://s3.eu-central-003.backblazeb2.com';
const B2_KEY_BASE = `${B2_ORIGIN}/CMSmedia/e2e-optionc`;

/** Seek target for the recovery phase — far beyond the 30s forward buffer of a 120s ladder. */
const RECOVERY_SEEK_SECONDS = 80;

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

/* ===== Ladder generation (production layout: {rung}/index.m3u8 + segment_NNN.ts) ===== */
function ensureLadder() {
  if (existsSync(path.join(LADDER_DIR, 'master.m3u8'))) return;
  execSync(`mkdir -p '${LADDER_DIR}/360p' '${LADDER_DIR}/720p'`);
  // 120s of real A/V per rung, 4s segments → 30 segments/rung.
  for (const [rung, size] of [['360p', '640x360'], ['720p', '1280x720']]) {
    execSync(
      `ffmpeg -y -threads 2 -f lavfi -i testsrc2=duration=120:size=${size}:rate=24` +
      ` -f lavfi -i sine=frequency=440:duration=120` +
      ` -c:v libx264 -preset ultrafast -crf 32 -c:a aac -b:a 64k` +
      ` -f hls -hls_time 4 -hls_playlist_type vod` +
      ` -hls_segment_filename '${LADDER_DIR}/${rung}/segment_%03d.ts'` +
      ` '${LADDER_DIR}/${rung}/index.m3u8'`,
      { stdio: ['ignore', 'ignore', 'ignore'] });
  }
  // Master mirrors the real FFmpeg ladder: RELATIVE variant URIs.
  execSync(
    `printf '%s\n' '#EXTM3U' '#EXT-X-VERSION:6'` +
    ` '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360,CODECS="avc1.42c01e,mp4a.40.2"' '360p/index.m3u8'` +
    ` '#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720,CODECS="avc1.42c01e,mp4a.40.2"' '720p/index.m3u8'` +
    ` > '${LADDER_DIR}/master.m3u8'`);
}
ensureLadder();

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? '  PASS' : '! FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

const consoleErrors = [];
/** Console noise produced by the test's OWN 403 injection (expired-presign simulation)
 *  — the browser logs one "Failed to load resource" line per injected failure. These
 *  are counted separately: the spec's "console errors: 0" criterion means ZERO
 *  UNEXPECTED errors. */
const injectedFailureConsoleMessages = [];

/* ===== RAM sampler (hard-rule ceiling 1.6GB) ===== */
let peakChromeRssKb = 0;
const sampler = setInterval(() => {
  try {
    const out = execSync("ps -C chrome --no-headers -o rss= 2>/dev/null | awk '{s+=$1} END {print s+0}'", { stdio: ['ignore', 'pipe', 'ignore'] });
    const kb = Number(out.toString().trim());
    if (kb > peakChromeRssKb) peakChromeRssKb = kb;
  } catch { /* ps raced with process exit */ }
}, 400);

/** Per-request evidence. */
const evidence = {
  playbackUrlCalls: 0,
  masterFetches: 0,
  variantFetches: 0,
  b2SegmentFetches: 0,
  b2SegmentsByGeneration: {},
  b2SegmentsWithAuthHeaders: [],
  b2SegmentFailures: 0,
  apiSegmentRequests: 0,
  progressPosts: 0,
  requestsWithoutAuthHeaders: [],
};

/** The "presign generation" — bumped on every playback-url issue. Segments minted
 *  while generation N is current carry /gen-N/ in their URL. */
let currentGeneration = 0;
/** B2 mock 403s any segment URL with gen < expiredBelowGeneration (0 = nothing expired). */
let expiredBelowGeneration = 0;

async function newStudentContext(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'ar', hasTouch: true });
  await context.addInitScript(() => {
    sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
  });

  // Catch-all FIRST (lowest priority): any unmocked /api/v1 call aborts cleanly —
  // a ladder URI that escaped our mocks dies here and playback stalls (loud failure).
  await context.route('**/api/v1/**', (route) => route.abort());

  // The RETIRED segment proxy, mocked exactly like production: API-origin .ts
  // requests answer 404 (and are counted — the spec asserts ZERO of them).
  await context.route('**/api/v1/**/*.ts*', async (route) => {
    evidence.apiSegmentRequests += 1;
    await route.fulfill({ status: 404, contentType: 'text/plain', body: 'retired' });
  });

  // B2 DIRECT segment traffic (host-only pattern — never the API origin):
  // fulfills with the ladder's REAL .ts bytes; 403s URLs from expired generations.
  // CodeQL js/regex/missing-regexp-anchor (#151): anchored to https:// + B2 host
  // so the route can never match a merely-B2-containing URL (e.g. the API origin).
  await context.route(/^https:\/\/[^/]*\.backblazeb2\.com\/.*\.ts/, async (route) => {
    const url = route.request().url();
    const gen = Number(url.match(/\/gen-(\d+)\//)?.[1] ?? 0);
    const file = url.match(/(360p|720p)\/(segment_\d+\.ts)/);
    const headers = route.request().headers();
    if (headers.authorization || headers['x-entitlement'] || headers['x-installation-id']) {
      evidence.b2SegmentsWithAuthHeaders.push(url.slice(B2_ORIGIN.length, B2_ORIGIN.length + 60));
    }
    if (gen < expiredBelowGeneration || !file) {
      // Production-measured behavior (PART B): B2 403s an expired presign with NO
      // CORS headers — the browser surfaces an opaque network error to hls.js
      // (the C.3.1 premise). !file = URL outside the mocked ladder → also 403.
      evidence.b2SegmentFailures += 1;
      await route.fulfill({ status: 403, contentType: 'application/xml', body: '<Error><Code>AccessDenied</Code></Error>' });
      return;
    }
    evidence.b2SegmentFetches += 1;
    evidence.b2SegmentsByGeneration[gen] = (evidence.b2SegmentsByGeneration[gen] ?? 0) + 1;
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'video/mp2t', 'Access-Control-Allow-Origin': '*' },
      body: await readFile(path.join(LADDER_DIR, file[1], file[2])),
    });
  });

  // Specific API mocks LAST (highest priority).
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));

  await context.route(`**/api/v1/courses/${COURSE_ID}`, (route) => route.fulfill({
    json: {
      id: COURSE_ID, subjectId: 's-e2e', title: 'كورس الاختبار — Option C',
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

  // playback-url answers the PROXY master route (stable string, API origin) —
  // each issue bumps the presign generation (fresh segment URLs per refresh).
  // From the 3rd issue on, a LONG TTL parks the timer refresh so the recovery
  // phase isolates the NETWORK_ERROR trigger (see file header).
  await context.route(`**/api/v1/media/course-episode/${EPISODE_ID}/playback-url`, async (route) => {
    evidence.playbackUrlCalls += 1;
    currentGeneration += 1;
    const ttl = evidence.playbackUrlCalls >= 3 ? PARKED_TTL_SECONDS : TTL_SECONDS;
    await route.fulfill({
      json: {
        url: `${PROXY_BASE}/master.m3u8`,
        ttlSeconds: ttl,
        expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
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
          lastPositionSeconds: 2, durationSeconds: 120,
          completionPercent: 1.67, updatedAt: new Date().toISOString(),
        },
      });
    } else {
      evidence.progressPosts += 1;
      await route.fulfill({
        json: {
          assetType: 'CourseEpisode', assetId: EPISODE_ID,
          lastPositionSeconds: 6, durationSeconds: 120,
          completionPercent: 5, updatedAt: new Date().toISOString(),
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

  /* ===== THE API SURFACE: master (raw) + variant (REWRITTEN — Option C) ===== */

  const requireAuthHeaders = (route) => {
    const headers = route.request().headers();
    const missing = [];
    if (!headers.authorization?.startsWith('Bearer ')) missing.push('Authorization');
    if (!headers['x-entitlement']) missing.push('X-Entitlement');
    if (!headers['x-installation-id']) missing.push('X-Installation-Id');
    if (missing.length > 0) {
      evidence.requestsWithoutAuthHeaders.push(
        `${route.request().method()} ${route.request().url().replace(PROXY_BASE, '…')} missing: ${missing.join(',')}`);
    }
  };

  // Master: served RAW (relative variant URIs — the property that keeps variant
  // requests on the API origin). no-store, exactly like production.
  await context.route(`${PROXY_BASE}/master.m3u8`, async (route) => {
    requireAuthHeaders(route);
    evidence.masterFetches += 1;
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'private, no-store' },
      body: await readFile(path.join(LADDER_DIR, 'master.m3u8'), 'utf8'),
    });
  });

  // Variant: what the production handler now returns — the playlist REWRITTEN so
  // every segment line is an ABSOLUTE presigned-style B2 URL of the CURRENT
  // generation. (e2e deviation: no-store so the compressed-TTL refresh observably
  // re-fetches; production serves private,max-age=60 — unit-tested.)
  await context.route(new RegExp(`${PROXY_BASE.replaceAll('/', '\\/')}\\/(360p|720p)\\/index\\.m3u8.*`), async (route) => {
    requireAuthHeaders(route);
    evidence.variantFetches += 1;
    const rung = route.request().url().match(/(360p|720p)\/index\.m3u8/)[1];
    const original = await readFile(path.join(LADDER_DIR, rung, 'index.m3u8'), 'utf8');
    const rewritten = original
      .split('\n')
      .map((line) => {
        const core = line.trim();
        if (core.endsWith('.ts') && !core.startsWith('#') && !core.includes('/')) {
          return `${B2_KEY_BASE}/gen-${currentGeneration}/${rung}/${core}?X-Amz-Signature=mock-gen${currentGeneration}`;
        }
        return line;
      })
      .join('\n');
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'private, no-store' },
      body: rewritten,
    });
  });

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
  /* ================= Desktop (1280×800) — full Option C flow ================= */
  const context = await newStudentContext(browser, { width: 1280, height: 800 });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text().slice(0, 200);
    if (/Failed to load resource.*status of 40[13]/.test(text)) {
      injectedFailureConsoleMessages.push(text);
      return;
    }
    consoleErrors.push(text);
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
    `engine=${engineInfo?.engine} src=${String(engineInfo.src).slice(0, 24)}…`);

  // 2 — Center play → genuinely playing on B2-direct segments.
  await page.getByTestId('video-center-play').click();
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-testid="video-element"]');
    return v && !v.paused && v.currentTime > 2.5;
  }, null, { timeout: 25_000 });
  check('playback advances (currentTime > 2.5s) on B2-direct segments', true);

  // 3 — SILENT REFRESH (short TTL): playback-url re-issued → generation-keyed
  //     loadSource → variant RE-FETCHED → fresh-generation segments keep working.
  {
    let calls = 0;
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(500);
      calls = evidence.playbackUrlCalls;
      if (calls >= 2) break;
    }
    const after = await page.evaluate(() => {
      const v = document.querySelector('[data-testid="video-element"]');
      const container = document.querySelector('[data-testid="course-episode-player"]');
      return { time: v.currentTime, paused: v.paused, engine: container.getAttribute('data-engine') };
    });
    const gen2Segments = evidence.b2SegmentsByGeneration[2] ?? 0;
    const seamless = calls >= 2 && evidence.variantFetches >= 2 && gen2Segments >= 1
      && !after.paused && after.engine === 'hls';
    check('silent refresh: variant RE-FETCHED, gen-2 presigned segments serve, playback seamless',
      seamless,
      `playbackUrl=${calls} variants=${evidence.variantFetches} gen2Segments=${gen2Segments} time=${after.time.toFixed(1)} paused=${after.paused} engine=${after.engine}`);
  }

  // 4 — Playback keeps advancing past 5s on the refreshed ladder.
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-testid="video-element"]');
    return v && !v.paused && v.currentTime > 5;
  }, null, { timeout: 30_000 });
  check('playback advances past 5s (post-refresh)', true);

  // 5 — NETWORK_ERROR recovery (the C.3.1 status-agnostic trigger). First park the
  //     timer refresh (wait for the long-TTL issue), then expire EVERY issued
  //     segment URL and seek far past the forward buffer: hls.js fragment loads
  //     403 (no CORS headers — opaque network failure), retries exhaust → fatal
  //     NETWORK_ERROR → silent refresh → a FRESH generation serves → playback
  //     resumes at the seek position. Only the error trigger can mint that
  //     generation — the timer is parked 240s away.
  {
    for (let i = 0; i < 60 && evidence.playbackUrlCalls < 3; i++) {
      await page.waitForTimeout(500);
    }
    const floorGeneration = currentGeneration; // everything ≤ this is "expired"
    expiredBelowGeneration = floorGeneration + 1;
    await page.evaluate((target) => {
      document.querySelector('[data-testid="video-element"]').currentTime = target;
    }, RECOVERY_SEEK_SECONDS);

    let recovered = false;
    let snapshot = { time: 0, paused: true, engine: 'hls' };
    for (let i = 0; i < 160; i++) {
      await page.waitForTimeout(500);
      snapshot = await page.evaluate(() => {
        const v = document.querySelector('[data-testid="video-element"]');
        const container = document.querySelector('[data-testid="course-episode-player"]');
        return { time: v.currentTime, paused: v.paused, engine: container.getAttribute('data-engine') };
      });
      if (!snapshot.paused && snapshot.time > RECOVERY_SEEK_SECONDS + 0.5
        && evidence.playbackUrlCalls >= floorGeneration + 1) {
        recovered = true;
        break;
      }
    }
    // N11 (11.5.4): the recovery loop can break the instant playback resumes
    // while the fresh-generation segment response is still in flight through
    // the route interceptor (observed on CI: recovered=true, freshGenSegments=0
    // with byGen frozen — the next gen-N+1 segment serves seconds later). Poll
    // the counter for up to 15s before judging instead of reading it once.
    let freshGenSegments = evidence.b2SegmentsByGeneration[floorGeneration + 1] ?? 0;
    for (let i = 0; i < 30 && recovered && freshGenSegments < 1; i++) {
      await page.waitForTimeout(500);
      freshGenSegments = evidence.b2SegmentsByGeneration[floorGeneration + 1] ?? 0;
    }
    check('NETWORK_ERROR recovery: expired B2 presigns → fatal → silent refresh → playback resumes at the seek position',
      recovered && freshGenSegments >= 1,
      `recovered=${recovered} playbackUrl=${evidence.playbackUrlCalls} (floor gen=${floorGeneration}) freshGenSegments=${freshGenSegments} b2Failures=${evidence.b2SegmentFailures} time=${snapshot.time.toFixed(1)}`);
    expiredBelowGeneration = 0; // stop expiring — keep the session stable for the evidence phase
  }

  // 6 — THE network evidence (after all traffic settled):
  check('master fetched via the API proxy route (auth headers present)',
    evidence.masterFetches >= 1, `master=${evidence.masterFetches}`);
  check('variant fetched via the API proxy route (auth headers present)',
    evidence.variantFetches >= 2, `variants=${evidence.variantFetches}`);
  check('segments fetched DIRECTLY from the B2 origin (≥2)',
    evidence.b2SegmentFetches >= 2, `b2Segments=${evidence.b2SegmentFetches} byGen=${JSON.stringify(evidence.b2SegmentsByGeneration)}`);
  check('every B2 segment request carried NO Authorization/X-Entitlement/X-Installation-Id (bare presigned GETs)',
    evidence.b2SegmentsWithAuthHeaders.length === 0,
    evidence.b2SegmentsWithAuthHeaders.slice(0, 2).join(' | ') || 'all bare');
  check('ZERO segment requests to the API origin (retired route untouched)',
    evidence.apiSegmentRequests === 0, `apiSegmentRequests=${evidence.apiSegmentRequests}`);
  check('every API-origin playlist request carried Authorization + X-Entitlement + X-Installation-Id',
    evidence.requestsWithoutAuthHeaders.length === 0,
    evidence.requestsWithoutAuthHeaders.slice(0, 3).join(' | ') || 'all headers present');
  check('progress tracking POSTs while playing (Option C mode)',
    evidence.progressPosts >= 1, `posts=${evidence.progressPosts}`);
  check('ZERO unexpected console errors (the injected 403s are the spec\'s own failure simulation)',
    consoleErrors.length === 0,
    `unexpected=${consoleErrors.length} injected403=${injectedFailureConsoleMessages.length} (matches b2Failures=${evidence.b2SegmentFailures})`);

  await page.mouse.move(640, 400);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOT_DIR, 'player-hls-optionc-01-playing.png') });

  await context.close();

  /* ================= Report ================= */
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'-'.repeat(64)}`);
  console.log(`HLS OPTION-C PLAYER E2E: ${results.length - failed.length}/${results.length} passed`);
  console.log(`Peak Chromium RSS: ${(peakChromeRssKb / 1024).toFixed(0)} MB (${peakChromeRssKb} KB) — ceiling 1638 MB`);
  console.log(`Console errors (unexpected): ${consoleErrors.length} | injected-403 messages: ${injectedFailureConsoleMessages.length} (deliberate expiry simulation)`);
  if (consoleErrors.length) consoleErrors.slice(0, 5).forEach((e) => console.log(`  ! ${e}`));
  if (failed.length) {
    failed.forEach((r) => console.log(`  FAIL: ${r.name} ${r.extra}`));
    process.exitCode = 1;
  }
} finally {
  clearInterval(sampler);
  await browser.close();
}
