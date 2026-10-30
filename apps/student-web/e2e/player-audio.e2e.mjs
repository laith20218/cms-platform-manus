/**
 * Push 11.7 (F1) — AudioPlayer E2E (real audio, mocked API at the network layer).
 *
 * Drives the PRODUCTION library route (/subjects/:slug/library → LibraryPage →
 * DocumentViewer) with an Audio file: the audio branch mounts the fullscreen
 * PlayerShell (kind="audio") hosting the code-split AudioPlayer (wavesurfer.js
 * waveform + transport + A-B loop + bookmarks + resume).
 *
 * RAM contract (hard rule §4): ONE Chromium instance, --headless=new
 * --disable-gpu --disable-dev-shm-usage (+ --autoplay-policy=no-user-gesture-required
 * so the silent-refresh auto-resume path is deterministic), scenarios in
 * browser.newContext()s, browser closed immediately. Ceiling 1.6GB — sampled
 * at 400ms via ps.
 *
 * The media API is mocked at the network layer; the playback URL points at a
 * REAL locally-served WAV (vite public/, generated deterministically below —
 * no ffmpeg dependency, git-ignored, ~320KB / 20s / 8kHz mono 16-bit with a
 * varying envelope so the waveform has visible peaks).
 *
 * TTL is mocked at 8s (production 540) → the lease clamp refreshes every ~3s,
 * so every scenario ≥3s long exercises the silent URL swap (media src swap +
 * time/play-state restore) against genuine playback.
 *
 * Wave 11.7.x / P4 — adapted to the P1/P2 contract and extended to 32
 * checks (26 − 2 + 8):
 *  - S4e: ONE wrap check now (the "defined" twin is subsumed by the
 *    bounds; the play-retries observability check retired with the G2/
 *    G2-ext retry arms — dataset.playRetries no longer exists).
 *  - S8a/S8b/S8c: swap survival — speed+pitch, volume+muted, and
 *    continuity (swap zeros recorded; every dip recovered ≤1.5s; net
 *    progress).
 *  - S9a/S9b/S9c: SWAPPING-phase intents through the deferred-intent
 *    queue (play queued and landed, pause respected, keyboard seek
 *    survives the merged plan). The waveform drag/click-seek stays
 *    DIRECT by F-B design — these checks drive the keyboard only.
 *  - S10: A-B loop cycles across swaps (≥4 wraps in 15s, ≥1 swap zero).
 *  - S11: terminal lease error → retry recovers to PLAYABLE (F-G
 *    weakened spec: position preservation NOT asserted).
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/player-audio.e2e.mjs
 */
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));

const SUBJECT_SLUG = 'e2e-audio-subject';
const SUBJECT_ID = 'e2e-s-audio';
const FILE_ID = '44444444-1111-2222-3333-444444444444';
const AUDIO_URL = `${BASE_URL}/e2e-test-audio.wav`;
const AUDIO_SECONDS = 20;
const TTL_SECONDS = 8; // production is 540; short TTL → clamp → refresh at ~3s

const E2E_USER = {
  id: 'e2e-u-003', phone: '+962790000001', fullName: 'طالب الاختبار الصوتي',
  role: 'student', avatarUrl: null,
  university: { id: 'u-1', nameAr: 'جامعة الاختبار' }, college: { id: 'c-1', nameAr: 'كلية الطب' },
};

/** JWT-shaped token their parser accepts (segment 0 = base64url JSON payload). */
const ENTITLEMENT_TOKEN = [
  Buffer.from(JSON.stringify({ expiresAt: new Date(Date.now() + 3600_000).toISOString() })).toString('base64url'),
  'e2e', 'sig',
].join('.');

/* ============ deterministic WAV fixture (no ffmpeg needed) ============ */

const FIXTURE_PATH = fileURLToPath(new URL('../public/e2e-test-audio.wav', import.meta.url));

function ensureAudioFixture() {
  const sampleRate = 8000;
  const n = AUDIO_SECONDS * sampleRate;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i += 1) {
    const t = i / sampleRate;
    // Two tones + a slowly varying envelope → non-flat peaks for the waveform.
    const env = 0.35 + 0.3 * Math.abs(Math.sin(t * 0.7)) + 0.15 * Math.abs(Math.sin(t * 2.3));
    const s = Math.sin(2 * Math.PI * 440 * t) * 0.6 + Math.sin(2 * Math.PI * 880 * t) * 0.25;
    const v = Math.max(-1, Math.min(1, s * env));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);   // PCM
  header.writeUInt16LE(1, 22);                                  // mono
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);   // 16-bit
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  fs.mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
  fs.writeFileSync(FIXTURE_PATH, Buffer.concat([header, data]));
  return fs.statSync(FIXTURE_PATH).size;
}

/* ============ harness ============ */

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? '  PASS' : '! FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

/**
 * Determinization helper (commit 8): poll a SYNCHRONOUS condition until it
 * returns truthy, or reject after the bound. Callers catch the rejection to
 * fall through to a clean assertion failure (never a crash). Note: fn must
 * be sync — an async fn would return a Promise (always truthy) and resolve
 * on the first tick. Reads of the Node-side route counters qualify.
 * Single helper, no variants.
 */
function waitFor(fn, { timeoutMs = 3000, intervalMs = 100 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      try {
        const v = fn();
        if (v) return resolve(v);
      } catch (_) { /* treat throw as not-ready */ }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('waitFor timeout'));
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

const consoleErrors = [];
const pageErrors = [];

// Peak Chromium RSS sampler (400ms cadence) — §4.
let peakChromeRssKb = 0;
const rssSampler = setInterval(() => {
  try {
    const kb = Number(execSync("ps -C chrome --no-headers -o rss= 2>/dev/null | awk '{s+=$1} END {print s+0}'", { stdio: ['ignore', 'pipe', 'ignore'] }));
    if (kb > peakChromeRssKb) peakChromeRssKb = kb;
  } catch { /* ps raced with process exit */ }
}, 400);

async function newAudioContext(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'ar', hasTouch: true });
  await context.addInitScript(() => {
    sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
  });

  const counters = {
    playbackUrl: 0,
    progressPosts: [],
    progressGets: 0,
    bookmarkPosts: [],
    bookmarkGets: 0,
    accessPosts: 0,
    viewPosts: 0,
  };
  const bookmarkStore = [];

  // Catch-all FIRST (lowest priority): any unmocked /api/v1 call aborts cleanly.
  await context.route('**/api/v1/**', (route) => route.abort());
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));

  const fileSummary = {
    id: FILE_ID, type: 'Audio', title: 'محاضرة صوتية تجريبية',
    description: 'تسجيل تجريبي لمشغّل الصوت — موجة حقيقية وتحكم كامل',
    fileSize: 320_044, durationSeconds: AUDIO_SECONDS, pagesCount: null,
    thumbnailUrl: null, viewsCount: 3, isFavorite: false, category: 'Curriculum',
    createdAt: '2026-10-20T12:00:00Z',
  };

  await context.route(`**/api/v1/subjects/${SUBJECT_SLUG}`, (route) => route.fulfill({
    json: {
      id: SUBJECT_ID, slug: SUBJECT_SLUG, nameAr: 'مادة الصوت التجريبية',
      color: null, totalQuestions: 0, totalLectures: 0, totalFiles: 1,
      totalExams: 0, lastContentUpdatedAt: null, userProgress: null, contentScopes: ['VideoAudio'],
      description: null,
    },
  }));

  await context.route(`**/api/v1/library/subject/${SUBJECT_ID}**`, (route) => route.fulfill({
    json: { items: [fileSummary], total: 1, page: 1, pageSize: 20, totalPages: 1 },
  }));

  await context.route(`**/api/v1/library/${FILE_ID}/access`, async (route) => {
    counters.accessPosts += 1;
    await route.fulfill({
      json: {
        accessUrl: AUDIO_URL,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        watermark: {
          studentName: 'طالب الاختبار الصوتي', studentPhone: '+962790000001',
          timestamp: new Date().toISOString(), siteName: 'CMS',
        },
      },
    });
  });

  await context.route(`**/api/v1/library/${FILE_ID}`, (route) => route.fulfill({
    json: {
      ...fileSummary, subjectId: SUBJECT_ID, lectureId: null,
      fileFormat: 'audio/wav', youtubeVideoId: null, tags: [], favoritesCount: 0,
    },
  }));

  await context.route(`**/api/v1/library/${FILE_ID}/view`, async (route) => {
    counters.viewPosts += 1;
    await route.fulfill({ status: 204, body: '' });
  });

  await context.route(`**/api/v1/media/library-file/${FILE_ID}/playback-url`, async (route) => {
    counters.playbackUrl += 1;
    await route.fulfill({
      json: {
        url: `${AUDIO_URL}?lease=${counters.playbackUrl}`,
        ttlSeconds: TTL_SECONDS,
        expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
        contentType: 'audio/wav',
        supportsRange: true,
      },
    });
  });

  await context.route(`**/api/v1/media/library-file/${FILE_ID}/progress`, async (route) => {
    if (route.request().method() === 'GET') {
      counters.progressGets += 1;
      const last = counters.progressPosts[counters.progressPosts.length - 1];
      if (!last) return route.fulfill({ status: 204, body: '' });
      return route.fulfill({
        json: {
          assetType: 'LibraryFile', assetId: FILE_ID,
          lastPositionSeconds: last.positionSeconds,
          durationSeconds: last.durationSeconds ?? AUDIO_SECONDS,
          completionPercent: Math.round((last.positionSeconds / AUDIO_SECONDS) * 10000) / 100,
          updatedAt: new Date().toISOString(),
        },
      });
    }
    const body = route.request().postDataJSON();
    counters.progressPosts.push(body);
    return route.fulfill({
      json: {
        assetType: 'LibraryFile', assetId: FILE_ID,
        lastPositionSeconds: body.positionSeconds,
        durationSeconds: body.durationSeconds ?? AUDIO_SECONDS,
        completionPercent: Math.round((body.positionSeconds / AUDIO_SECONDS) * 10000) / 100,
        updatedAt: new Date().toISOString(),
      },
    });
  });

  await context.route(`**/api/v1/media/library-file/${FILE_ID}/bookmarks`, async (route) => {
    if (route.request().method() === 'GET') {
      counters.bookmarkGets += 1;
      return route.fulfill({ json: bookmarkStore });
    }
    const body = route.request().postDataJSON();
    counters.bookmarkPosts.push(body);
    const created = {
      id: `bm-${bookmarkStore.length + 1}`, assetType: 'LibraryFile', assetId: FILE_ID,
      startSeconds: body.startSeconds, endSeconds: body.endSeconds,
      label: body.label, note: body.note ?? null,
      createdAt: new Date().toISOString(),
    };
    bookmarkStore.push(created);
    return route.fulfill({ json: created });
  });

  context.on('page', (page) => {
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', (error) => pageErrors.push(String(error)));
  });

  return { context, counters };
}

/** Navigate to the library page and open the audio file in the player shell
 *  (context routes must already be in place — the race scenarios install
 *  their shadow routes BEFORE calling this). */
async function gotoAudioPlayer(page) {
  await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library`);
  await page.locator('text=محاضرة صوتية تجريبية').first().click();
  await page.locator('[data-testid="audio-player-shell"]').waitFor({ state: 'visible', timeout: 20_000 });
  // Waveform decoded + ready: the total duration appears in the time display.
  await page.locator('[data-testid="audio-time-display"]:has-text("0:20")').waitFor({ state: 'visible', timeout: 20_000 });
  // S4e determinization: in-page timeupdate log, attached BEFORE any playback
  // (every scenario starts paused). The native media-clock event keeps firing
  // through compositor/rAF stalls that step out-of-band evaluate sampling on
  // loaded runners — the recorded sequence is analyzed in the test afterward.
  await page.evaluate(() => {
    window.__audioLog = [];
    const audio = document.querySelector('audio');
    if (!audio) throw new Error('audio element missing');
    audio.addEventListener('timeupdate', () => {
      window.__audioLog.push(audio.currentTime);
    });
  });
}

async function openAudioPlayer(browser, viewport) {
  const { context, counters } = await newAudioContext(browser, viewport);
  const page = await context.newPage();
  await gotoAudioPlayer(page);
  return { context, page, counters };
}

const audioState = (page) => page.evaluate(() => {
  const el = document.querySelector('audio[data-testid="audio-element"]');
  if (!el) return null;
  return {
    paused: el.paused,
    currentTime: el.currentTime,
    playbackRate: el.playbackRate,
    preservesPitch: el.preservesPitch === true,
    muted: el.muted,
    volume: el.volume,
    // P4: the imperative swap instrumentation (set in onSwapStart, cleared
    // at every terminal) — the race scenarios' SWAPPING-window probe.
    swapAttr: el.getAttribute('data-swap-in-flight'),
  };
});

/** Poll the audio element until the predicate passes (bounded by timeoutMs). */
async function waitForAudio(page, predicate, timeoutMs, label = '') {
  const deadline = Date.now() + timeoutMs;
  let state = null;
  while (Date.now() < deadline) {
    state = await audioState(page);
    if (state && predicate(state)) return state;
    await page.waitForTimeout(120);
  }
  return state;
}

/** Click the waveform at a horizontal fraction (0..1) — a real seek gesture. */
async function clickWaveform(page, fraction) {
  const box = await page.locator('[data-testid="audio-waveform"]').boundingBox();
  if (!box) throw new Error('waveform not measurable');
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
}

/* ============ scenarios ============ */

async function main() {
  const fixtureBytes = ensureAudioFixture();
  console.log(`fixture: public/e2e-test-audio.wav (${Math.round(fixtureBytes / 1024)}KB, ${AUDIO_SECONDS}s, 8kHz mono PCM16)`);

  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: [
      '--headless=new',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  try {
    /* ---- S1: waveform renders + audio ready + responsive (375/768/1024) ---- */
    for (const viewport of [
      { width: 375, height: 667 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
    ]) {
      const { context, page, counters } = await openAudioPlayer(browser, viewport);
      const canvas = await page.locator('[data-testid="audio-waveform"] canvas').count();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(
        `S1 waveform renders + ready @${viewport.width}x${viewport.height}`,
        canvas > 0 && overflow <= 1,
        `canvas=${canvas} hOverflowPx=${overflow} playbackUrlCalls=${counters.playbackUrl}`,
      );
      if (viewport.width === 375) {
        await page.screenshot({ path: path.join(SHOT_DIR, 'player-audio-375.png'), fullPage: false });
      }
      await context.close();
    }

    /* ---- S2: play toggles isPlaying; time advances ---- */
    {
      const { context, page } = await openAudioPlayer(browser, { width: 375, height: 667 });
      await page.locator('[data-testid="audio-play"]').click();
      let state = await audioState(page);
      check('S2a play → playing', state && state.paused === false, JSON.stringify(state));
      await page.waitForTimeout(2000);
      state = await audioState(page);
      // Additive observability (no assertion change): proves the in-page
      // __audioLog listener starts empty and grows during playback.
      const logSamples = await page.evaluate(() => window.__audioLog?.length ?? -1);
      check('S2b time advances after 2s', state && state.currentTime > 1.5,
        `currentTime=${state?.currentTime.toFixed(2)} logSamples=${logSamples}`);
      await page.locator('[data-testid="audio-play"]').click();
      state = await audioState(page);
      check('S2c pause → paused', state && state.paused === true, `currentTime=${state?.currentTime.toFixed(2)}`);
      await context.close();
    }

    /* ---- S3: speed 1.5× → preservesPitch true AND playbackRate 1.5 ---- */
    {
      const { context, page } = await openAudioPlayer(browser, { width: 768, height: 1024 });
      await page.locator('[data-testid="audio-rate-trigger"]').click();
      await page.locator('[data-testid="audio-rate-menu"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-testid="audio-rate-option-1-5"]').click();
      await page.waitForTimeout(300);
      const state = await audioState(page);
      check(
        'S3 speed 1.5× → playbackRate 1.5 + preservesPitch true',
        state && state.playbackRate === 1.5 && state.preservesPitch === true,
        `rate=${state?.playbackRate} preservesPitch=${state?.preservesPitch}`,
      );
      await context.close();
    }

    /* ---- S4: A-B loop wraps playback ---- */
    {
      const { context, page } = await openAudioPlayer(browser, { width: 768, height: 1024 });
      // Waveform click-to-seek still gets covered — with a generous tolerance
      // (the exact landing point shifts a few % with the canvas layout).
      await clickWaveform(page, 0.75);
      const afterWaveClick = await waitForAudio(page, (s) => s.currentTime > 12, 4000);
      check('S4a waveform click seeks', afterWaveClick && afterWaveClick.currentTime > 12 && afterWaveClick.currentTime <= 20,
        `currentTime=${afterWaveClick?.currentTime.toFixed(2)} (clicked 75%)`);
      // Park back near the start, then drive A/B with precise play/pause timing.
      await page.locator('[data-testid="audio-back-15"]').click();
      await page.waitForTimeout(300);
      // A ≈ 3s: play, pause inside the window, set A.
      await page.locator('[data-testid="audio-play"]').click();
      const atA = await waitForAudio(page, (s) => s.currentTime >= 2.6, 6000);
      await page.locator('[data-testid="audio-play"]').click(); // pause
      await page.locator('[data-testid="audio-set-a"]').click();
      check('S4b Set A ≈3s', atA && atA.currentTime >= 2.6 && atA.currentTime < 3.6,
        `a=${atA?.currentTime.toFixed(2)}`);
      // B ≈ 5s: resume, pause inside the window, set B.
      await page.locator('[data-testid="audio-play"]').click();
      const atB = await waitForAudio(page, (s) => s.currentTime >= 4.6, 6000);
      await page.locator('[data-testid="audio-play"]').click(); // pause
      await page.locator('[data-testid="audio-set-b"]').click();
      check('S4c Set B ≈5s', atB && atB.currentTime >= 4.6 && atB.currentTime < 5.6,
        `b=${atB?.currentTime.toFixed(2)}`);
      const statusText = await page.locator('[data-testid="audio-ab-status"]').innerText();
      check('S4d loop status visible', statusText.includes('التكرار مفعّل'), statusText.replace(/\s+/g, ' '));
      // Play → the loop must CYCLE: climb A→B, wrap back to A, repeat.
      // Rewritten (commit 8): A/B are now stored at exact element precision
      // (A≈2.7, B≈4.7 from S4b/S4c) — the previous thresholds (high ≥4.5,
      // wrap <3.0) were tuned for the buggy floored [2,4] loop and only ever
      // matched the startup wrap. New derivation over the full in-page
      // __audioLog (native timeupdate, media clock, ~4Hz): sawHigh at ≥3.5
      // (crossed on every single cycle), wrap = a high sample (≥4.0)
      // immediately followed by a sharp backward jump (>0.5s) — the
      // seek-commit lands at A+ε ≈ 2.73-2.78, so <3.2 has generous margin.
      // Bounded 15s ≈ 7 full cycles.
      // Swap-zero artifacts (commit 8, Step G): lease refresh resets
      // currentTime to 0 for ~10-50ms; the in-page timeupdate listener
      // records these but they are not real wraps. Skip them in detection
      // (log count for observability) and only accept wraps landing in the
      // plausible A-region.
      await page.evaluate(() => { window.__audioLog = []; });
      await page.locator('[data-testid="audio-play"]').click();
      const deadline = Date.now() + 15000;
      let sawHigh = false;
      let wrappedTo = null;
      let swapZeros = 0;
      let scannedUpTo = 0; // index of the next unprocessed log[i]
      let log = [];
      // Incremental scan (commit 8, P3): each poll processes ONLY the pairs
      // added since the previous poll (scannedUpTo watermark) — the old
      // full-rescan re-counted every swap-zero ~75x on long runs. The final
      // pass (below, only when no wrap was found) re-uses the same watermark,
      // so it cannot double-count: it only picks up a pair whose successor
      // arrived with the very last fetch.
      const scan = (entries) => {
        for (let i = Math.max(0, scannedUpTo); i < entries.length - 1; i += 1) {
          // 3.5 is easily crossed every cycle: the cycle always reaches B.
          if (entries[i] >= 3.5) sawHigh = true;
          // Detect wrap: sharp backward jump landing near A — EXCEPT the
          // lease-swap reset (lands at 0), which is a swap artifact, not a
          // wrap: count it and keep scanning for the real wrap.
          if (entries[i] >= 4.0 && entries[i + 1] < entries[i] - 0.5) {
            if (entries[i + 1] <= 0.5) {
              swapZeros += 1;
              continue;
            }
            wrappedTo = entries[i + 1];
            break;
          }
        }
        scannedUpTo = Math.max(scannedUpTo, entries.length - 1);
      };
      while (Date.now() < deadline && wrappedTo === null) {
        await page.waitForTimeout(200);
        log = await page.evaluate(() => window.__audioLog || []);
        scan(log);
      }
      // Final pass (only if still unresolved): the last pair may only have
      // become complete on the final poll.
      if (wrappedTo === null) scan(log);
      const highSamples = log.filter((v) => v >= 3.5).length;
      check('S4e sawHigh (currentTime reached ≥ 3.5)', sawHigh === true, `highSamples=${highSamples} logLen=${log.length} swapZeros=${swapZeros}`);
      // P4 (F-A): ONE wrap check — the old "wrappedTo defined" twin is
      // subsumed here (the bounds already imply defined), and the old
      // play-retries observability check is retired with the G2/G2-ext
      // retry arms (the P1/P2 queue supersedes them; dataset.playRetries
      // no longer exists — the check had become a vacuous pass).
      // Lower+upper bound (commit 8 expansion): the seek-commit lands at
      // A+ε ≈ 2.73-2.78. A wrap recorded at ≤ 2.0 can only be a lease-swap
      // zero-window masquerading as a wrap (timeupdate fired mid-load with
      // currentTime 0) — now independently falsifiable against that defect.
      check('S4e wrapped to near A (a real wrap, not a swap zero)', wrappedTo !== null && wrappedTo > 2.0 && wrappedTo < 3.2, `wrappedTo=${wrappedTo?.toFixed(2) ?? 'undefined'} (expected 2.7x) swapZeros=${swapZeros}`);
      // Clear
      await page.locator('[data-testid="audio-play"]').click(); // pause
      await page.locator('[data-testid="audio-clear-ab"]').click();
      await page.waitForTimeout(200);
      const statusGone = await page.locator('[data-testid="audio-ab-status"]').count();
      check('S4f Clear AB removes the status line', statusGone === 0, `statusNodes=${statusGone}`);
      await context.close();
    }

    /* ---- S5: bookmark create → list → marker → click marker seeks ---- */
    {
      const { context, page, counters } = await openAudioPlayer(browser, { width: 768, height: 1024 });
      // Park the playhead at ~10s so the dialog seeds a meaningful window.
      await page.locator('[data-testid="audio-play"]').click();
      await waitForAudio(page, (s) => s.currentTime >= 9.5, 15000);
      await page.locator('[data-testid="audio-play"]').click(); // pause
      await page.locator('[data-testid="audio-bookmark-open"]').click();
      await page.locator('[data-testid="bookmark-dialog"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-testid="bookmark-label"]').fill('قسم مهم جداً');
      await page.locator('[data-testid="bookmark-submit"]').click();
      await page.locator('[data-testid="bookmark-dialog"]').waitFor({ state: 'hidden', timeout: 5000 });
      check(
        'S5a bookmark POST captured',
        counters.bookmarkPosts.length === 1 && counters.bookmarkPosts[0].label === 'قسم مهم جداً',
        `posts=${JSON.stringify(counters.bookmarkPosts)}`,
      );
      // Dialog close → list refetch → marker renders.
      await page.locator('[data-testid="audio-bookmark-marker"]').first().waitFor({ state: 'visible', timeout: 5000 });
      const markerCount = await page.locator('[data-testid="audio-bookmark-marker"]').count();
      check('S5b marker renders after refetch', markerCount === 1, `markers=${markerCount} listGets=${counters.bookmarkGets}`);
      // Seek elsewhere, then click the marker → playhead returns to its start.
      await page.locator('[data-testid="audio-back-15"]').click();
      await page.waitForTimeout(300);
      const awayState = await audioState(page);
      await page.locator('[data-testid="audio-bookmark-marker"]').first().click();
      await page.waitForTimeout(400);
      const state = await audioState(page);
      // Null-safe (commit 8): if S5a ever fails, S5c must FAIL — not crash the
      // remaining checks (same class as the S6c guard from commit 6). The
      // assertion itself is UNCHANGED, including the away-divergence arm.
      const bm = counters.bookmarkPosts[0] ?? null;
      const expected = bm?.startSeconds ?? null;
      check(
        'S5c click marker → seeks to bookmark start',
        bm != null && state && awayState && Math.abs(awayState.currentTime - expected) > 1.5 && Math.abs(state.currentTime - expected) < 0.75,
        `away=${awayState?.currentTime.toFixed(2)} → marker=${state?.currentTime.toFixed(2)} bm=${JSON.stringify(bm)}`,
      );
      await context.close();
    }

    /* ---- S6: resume — unmount saves, remount seeks to saved position ---- */
    {
      const { context, page, counters } = await openAudioPlayer(browser, { width: 768, height: 1024 });
      // 2× for speed, then play until ≥10s.
      await page.locator('[data-testid="audio-rate-trigger"]').click();
      await page.locator('[data-testid="audio-rate-menu"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-testid="audio-rate-option-2"]').click();
      await page.locator('[data-testid="audio-play"]').click();
      const deadline = Date.now() + 20_000;
      let reached = false;
      let state = null;
      while (Date.now() < deadline) {
        state = await audioState(page);
        if (state && state.currentTime >= 10) { reached = true; break; }
        await page.waitForTimeout(250);
      }
      check('S6a playback reached ≥10s (2×)', reached, `currentTime=${state?.currentTime.toFixed(2)}`);
      // Counter semantics (commit 8, Step F): with the product guards, the
      // lease-swap 'pause' checkpoints (generation-bump effect) now POST too
      // — posts[0] no longer denotes the unmount save. Snapshot the count
      // BEFORE the close-click, wait (bounded 3s) for a NEW post to land,
      // then assert the LATEST one: "the unmount produced a new save".
      // On timeout: fall through — S6b must FAIL cleanly, never crash.
      const nAtClose = counters.progressPosts.length;
      await page.locator('[data-testid="player-close"]').click();
      await page.locator('[data-testid="audio-player-shell"]').waitFor({ state: 'hidden', timeout: 5000 });
      try {
        await waitFor(
          () => counters.progressPosts.length > nAtClose,
          { timeoutMs: 3000 },
        );
      } catch (_) { /* fall through to the assertion */ }
      const saved = counters.progressPosts[counters.progressPosts.length - 1] ?? null;
      check(
        'S6b unmount saved progress (position ≥ 9)',
        (saved?.positionSeconds ?? -1) >= 9,
        `saved=${JSON.stringify(saved)} totalPosts=${counters.progressPosts.length} nAtClose=${nAtClose}`,
      );
      // Reopen → GET progress → resume applied.
      await page.locator('text=محاضرة صوتية تجريبية').first().click();
      await page.locator('[data-testid="audio-player-shell"]').waitFor({ state: 'visible', timeout: 20_000 });
      await page.locator('[data-testid="audio-time-display"]:has-text("0:20")').waitFor({ state: 'visible', timeout: 20_000 });
      await page.waitForTimeout(800);
      state = await audioState(page);
      // Guarded deref: when S6b fails (no save), S6c must FAIL — not crash the
      // remaining checks (S6d/S7a-c still run and report). `null` arithmetic →
      // NaN → the tolerance check is false, so the assertion is NOT weakened.
      check(
        'S6c remount resumes at the saved position',
        state && Math.abs(state.currentTime - saved?.positionSeconds ?? null) < 0.75,
        `currentTime=${state?.currentTime.toFixed(2)} saved=${saved?.positionSeconds ?? null}`,
      );
      check('S6d resume read the progress endpoint', counters.progressGets >= 2, `gets=${counters.progressGets}`);
      await context.close();
    }

    /* ---- S7: protection — contextmenu / copy / Ctrl+C prevented inside the stage ---- */
    {
      const { context, page } = await openAudioPlayer(browser, { width: 768, height: 1024 });
      await page.evaluate(() => {
        window.__t = {};
        document.addEventListener('contextmenu', (e) => { window.__t.context = e.defaultPrevented; }, false);
        document.addEventListener('copy', (e) => { window.__t.copy = e.defaultPrevented; }, false);
        window.addEventListener('keydown', (e) => {
          if (e.ctrlKey && e.key.toLowerCase() === 'c') window.__t.ctrlc = e.defaultPrevented;
        }, false);
      });
      const box = await page.locator('[data-testid="audio-player-shell"]').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
      await page.waitForTimeout(200);
      const contextBlocked = await page.evaluate(() => window.__t.context === true);
      check('S7a right-click inside stage prevented', contextBlocked === true, `defaultPrevented=${contextBlocked}`);

      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="audio-waveform-wrap"]');
        el.dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true }));
      });
      await page.waitForTimeout(200);
      const copyBlocked = await page.evaluate(() => window.__t.copy === true);
      check('S7b copy event inside stage prevented', copyBlocked === true, `defaultPrevented=${copyBlocked}`);

      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="audio-waveform-wrap"]');
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }));
      });
      await page.waitForTimeout(200);
      const ctrlCBlocked = await page.evaluate(() => window.__t.ctrlc === true);
      check('S7c Ctrl+C inside stage prevented', ctrlCBlocked === true, `defaultPrevented=${ctrlCBlocked}`);
      await context.close();
    }

    /* ---- S8: swap survival — speed/pitch, volume/mute, continuity ---- */

    {
      const { context, page } = await openAudioPlayer(browser, { width: 768, height: 1024 });
      await page.locator('[data-testid="audio-rate-trigger"]').click();
      await page.locator('[data-testid="audio-rate-menu"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-testid="audio-rate-option-1-5"]').click();
      await page.waitForTimeout(300);
      await page.locator('[data-testid="audio-play"]').click();
      // 5s of playback ≥ 1 silent swap (TTL 8 → refresh at ~3s): the capture
      // (rate 1.5 + preservesPitch) must ride the hook's restore back.
      await page.waitForTimeout(5000);
      const state = await audioState(page);
      check(
        'S8a speed + pitch survive the swap',
        state && state.playbackRate === 1.5 && state.preservesPitch === true && state.paused === false && state.currentTime > 1,
        `rate=${state?.playbackRate} preservesPitch=${state?.preservesPitch} paused=${state?.paused} t=${state?.currentTime.toFixed(2)}`,
      );
      await context.close();
    }

    {
      const { context, page } = await openAudioPlayer(browser, { width: 768, height: 1024 });
      const box = await page.locator('[data-testid="audio-volume-slider"]').boundingBox();
      await page.mouse.click(box.x + box.width * 0.4, box.y + box.height / 2);
      await page.waitForTimeout(200);
      await page.locator('[data-testid="audio-mute"]').click();
      await page.waitForTimeout(200);
      let state = await audioState(page);
      const preSet = state && state.volume >= 0.3 && state.volume <= 0.5 && state.muted === true;
      await page.locator('[data-testid="audio-play"]').click();
      await page.waitForTimeout(5000); // ≥1 silent swap
      state = await audioState(page);
      check(
        'S8b volume + muted survive the swap',
        preSet && state && Math.abs(state.volume - 0.4) <= 0.06 && state.muted === true && state.paused === false,
        `preSet=${preSet} volume=${state?.volume.toFixed(2)} muted=${state?.muted} paused=${state?.paused}`,
      );
      await context.close();
    }

    {
      const { context, page } = await openAudioPlayer(browser, { width: 768, height: 1024 });
      // Deterministic swap ledger (P4): a MutationObserver on the audio
      // element timestamps every data-swap-in-flight set/clear cycle (the
      // hook's imperative swap instrumentation), and a 10ms poll samples the
      // element position INSIDE each open window (the load() zero-dip — the
      // 10-50ms reset can fall between the ~4Hz timeupdate samples, so the
      // log alone cannot prove it). The timeupdate log stays for the
      // net-progress readout.
      await page.evaluate(() => {
        window.__swapLog = [];
        window.__swaps = [];
        const audio = document.querySelector('audio');
        if (!audio) throw new Error('audio element missing');
        audio.addEventListener('timeupdate', () => {
          window.__swapLog.push({ p: audio.currentTime, at: Date.now() });
        });
        const obs = new MutationObserver(() => {
          const present = audio.getAttribute('data-swap-in-flight') !== null;
          if (present) window.__swaps.push({ setAt: Date.now(), clearAt: null, minPos: Infinity });
          else {
            const last = window.__swaps[window.__swaps.length - 1];
            if (last && last.clearAt == null) last.clearAt = Date.now();
          }
        });
        obs.observe(audio, { attributes: true, attributeFilter: ['data-swap-in-flight'] });
        window.__swapPoll = setInterval(() => {
          const last = window.__swaps[window.__swaps.length - 1];
          if (last && last.clearAt == null && audio.currentTime < last.minPos) last.minPos = audio.currentTime;
        }, 10);
      });
      await page.locator('[data-testid="audio-play"]').click();
      // 10s of playback → ≥2 silent swaps (TTL 8 → refresh at ~3s/~6s/~9s).
      await page.waitForTimeout(10_000);
      const data = await page.evaluate(() => {
        clearInterval(window.__swapPoll);
        return { swaps: window.__swaps, log: window.__swapLog };
      });
      const state = await audioState(page);
      const swaps = data.swaps ?? [];
      const completed = swaps.filter((s) => s.clearAt != null);
      const cycles = completed.length;
      // Dip→recovery (≤1.5s): every completed cycle's SWAPPING+RESTORING
      // window — the clear fires just after the hook's restore lands.
      const slowCycles = completed.filter((s) => s.clearAt - s.setAt > 1500).length;
      // Zeros persist: the element genuinely reset inside the window.
      const zeroDips = completed.filter((s) => s.minPos < 0.5).length;
      const firstSig = data.log.find((e) => e.p >= 1);
      const last = data.log[data.log.length - 1];
      const netProgress = firstSig && last ? last.p - firstSig.p : -1;
      check(
        'S8c swap continuity (zeros persist; dip→recovery; net progress)',
        cycles >= 2 && slowCycles === 0 && zeroDips >= 1 && netProgress >= 5 && state && !state.paused,
        `cycles=${cycles} slowCycles=${slowCycles} zeroDips=${zeroDips} net=${netProgress.toFixed(1)}s paused=${state?.paused}`,
      );
      await context.close();
    }

    /* ============ Wave 11.7.x / P4 — swap-phase race scenarios ============
     *
     * Audio-adapted ports of player-video's P2 race harness. The race
     * contexts shadow the base playback-url mock: every lease carries
     * ttl=68 (the first silent refresh arms 8s after mount — the setup
     * always beats it), and the FIRST silent refresh (identified by the
     * ≥2s gap since the previous POST, NOT by call index — the React dev
     * StrictMode mount pair lands ~20ms apart) is held at the FETCH level
     * for LEASE_FETCH_DELAY_MS, opening the FETCH window; the swapped
     * media response is then route-held for SWAPPING_MEDIA_DELAY_MS so the
     * consumer cannot ack and the swap is deterministically mid-SWAPPING
     * when the intent lands. */

    const LEASE_FETCH_DELAY_MS = 2_000;
    const SWAPPING_MEDIA_DELAY_MS = 1_500;
    const SETTLE_GRACE_MS = 2_000;

    /** Polls the imperative swap instrumentation MID-FLIGHT —
     *  data-swap-in-flight is set in onSwapStart (SWAPPING begins) and
     *  cleared at every terminal. present=true resolves the moment the
     *  swap lifecycle is deterministically inside SWAPPING. */
    const audioSwapAttrVisible = (page, present, timeout) => page.waitForFunction(
      (want) => {
        const el = document.querySelector('[data-testid="audio-element"]');
        return want === (el ? el.getAttribute('data-swap-in-flight') !== null : false);
      },
      present, { timeout },
    );

    const audioRefreshingVisible = (page, visible, timeout) => page.waitForFunction(
      (wantVisible) => {
        const el = document.querySelector('[data-testid="audio-refreshing"]');
        return wantVisible ? !!el : !el;
      },
      visible, { timeout },
    );

    const raceLeaseRoute = (context, state) => {
      let n = 0;
      let lastPostAt = 0;
      return context.route(`**/api/v1/media/library-file/${FILE_ID}/playback-url`, async (route) => {
        n += 1;
        const now = Date.now();
        // The silent refresh is the first POST a >=2s gap after the previous
        // one (the StrictMode mount pair lands ~20ms apart — same rule as
        // player-video's harness).
        const isSilentRefresh = lastPostAt > 0 && now - lastPostAt >= 2_000;
        lastPostAt = now;
        if (isSilentRefresh && !state.delayedRefreshDone) {
          state.delayedRefreshDone = true;
          state.refreshLease = n;
          await new Promise((r) => setTimeout(r, LEASE_FETCH_DELAY_MS));
        }
        await route.fulfill({
          json: {
            url: `${AUDIO_URL}?lease=${n}`,
            ttlSeconds: 68,
            expiresAt: new Date(Date.now() + 68_000).toISOString(),
            contentType: 'audio/wav',
            supportsRange: true,
          },
        });
      });
    };

    /** Holds the swapped media response (the delayed refresh's lease) so the
     *  element cannot become ready and the consumer cannot ack — the swap is
     *  deterministically mid-SWAPPING for delayMs. Other media requests pass
     *  through to vite's static file. */
    const delaySwappedMedia = (context, state, delayMs = SWAPPING_MEDIA_DELAY_MS) => context.route(`${AUDIO_URL}*`, async (route) => {
      if (state.refreshLease && route.request().url().includes(`lease=${state.refreshLease}`)) {
        const response = await route.fetch();
        await new Promise((r) => setTimeout(r, delayMs));
        await route.fulfill({ response });
      } else {
        await route.fallback();
      }
    });

    const openPlayingAudio = async (page) => {
      await gotoAudioPlayer(page);
      await page.locator('[data-testid="audio-play"]').click();
      await page.waitForFunction(
        () => { const a = document.querySelector('audio[data-testid="audio-element"]'); return a && !a.paused && a.currentTime > 0.5; },
        null, { timeout: 15_000 },
      );
      await page.locator('[data-testid="library-audio-player"]').focus();
    };

    const runRaceScenario = async (name, body) => {
      const { context } = await newAudioContext(browser, { width: 1280, height: 800 });
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

    await runRaceScenario('S9a play during SWAPPING is queued and lands', async (context, page, state) => {
      await raceLeaseRoute(context, state);
      await delaySwappedMedia(context, state, SWAPPING_MEDIA_DELAY_MS);
      await openPlayingAudio(page);
      await page.keyboard.press('Space'); // pause — the deterministic pre-state (the capture: paused)
      await page.waitForFunction(
        () => document.querySelector('audio[data-testid="audio-element"]').paused,
        null, { timeout: 5_000 },
      );
      const pausedAt = await audioState(page);

      await audioRefreshingVisible(page, true, 12_000); // FETCH window opens
      await audioSwapAttrVisible(page, true, 4_000);    // SWAPPING begins (onSwapStart fired)
      await page.keyboard.press('Space');               // PLAY — inside SWAPPING (media held)

      await audioRefreshingVisible(page, false, LEASE_FETCH_DELAY_MS + 12_000); // swap landed
      await page.waitForTimeout(SETTLE_GRACE_MS);

      let playing = true;
      try {
        await page.waitForFunction(
          () => { const a = document.querySelector('audio[data-testid="audio-element"]'); return a && !a.paused && a.currentTime > 0.5; },
          null, { timeout: 10_000 },
        );
      } catch { playing = false; }
      const finalState = await audioState(page);
      check(
        'S9a play during SWAPPING is queued and lands',
        playing && finalState && !finalState.paused && finalState.currentTime >= (pausedAt?.currentTime ?? 0) - 1 && finalState.swapAttr === null,
        `pausedAt=${pausedAt?.currentTime.toFixed(1)}s final=${finalState?.currentTime.toFixed(1)}s paused=${finalState?.paused} swapAttr=${finalState?.swapAttr}`,
      );
    });

    await runRaceScenario('S9b pause during SWAPPING is respected (no ghost un-pause)', async (context, page, state) => {
      await raceLeaseRoute(context, state);
      await delaySwappedMedia(context, state, SWAPPING_MEDIA_DELAY_MS);
      await openPlayingAudio(page); // playing — the capture base (paused=false)
      const baseAt = await audioState(page);

      await audioRefreshingVisible(page, true, 12_000);
      await audioSwapAttrVisible(page, true, 4_000); // SWAPPING begins
      await page.keyboard.press('Space');            // PAUSE — inside SWAPPING (media held)

      await audioRefreshingVisible(page, false, LEASE_FETCH_DELAY_MS + 12_000);
      await page.waitForTimeout(SETTLE_GRACE_MS);

      const finalState = await audioState(page);
      check(
        'S9b pause during SWAPPING is respected (no ghost un-pause)',
        finalState && finalState.paused && finalState.currentTime >= (baseAt?.currentTime ?? 0) - 1 && finalState.currentTime <= (baseAt?.currentTime ?? 0) + 10 && finalState.swapAttr === null,
        `baseAt=${baseAt?.currentTime.toFixed(1)}s final=${finalState?.currentTime.toFixed(1)}s paused=${finalState?.paused} swapAttr=${finalState?.swapAttr}`,
      );
    });

    await runRaceScenario('S9c keyboard seek during SWAPPING survives (not waveform; F-B)', async (context, page, state) => {
      await raceLeaseRoute(context, state);
      await delaySwappedMedia(context, state, SWAPPING_MEDIA_DELAY_MS);
      await openPlayingAudio(page);
      // Park deterministically (the position keeps advancing while playing —
      // a parked base keeps base+10 safely inside the 20s fixture).
      await waitForAudio(page, (s) => s.currentTime >= 2, 15_000);
      await page.keyboard.press('Space'); // pause
      await page.waitForFunction(
        () => document.querySelector('audio[data-testid="audio-element"]').paused,
        null, { timeout: 5_000 },
      );
      const parkedAt = await audioState(page);

      await audioRefreshingVisible(page, true, 12_000);
      await audioSwapAttrVisible(page, true, 4_000); // SWAPPING begins
      await page.keyboard.press('Space');      // PLAY — queued (classified vs the paused capture, F1)
      await page.keyboard.press('ArrowRight'); // +10s — queued (capture base + 10, F2)

      await audioRefreshingVisible(page, false, LEASE_FETCH_DELAY_MS + 12_000);
      await page.waitForTimeout(SETTLE_GRACE_MS);

      // The merged plan (A3): one restore carrying BOTH intents — playing at
      // parked+10.
      const finalState = await audioState(page);
      check(
        'S9c keyboard seek during SWAPPING survives (not waveform; F-B)',
        finalState && !finalState.paused && finalState.currentTime >= (parkedAt?.currentTime ?? 0) + 8 && finalState.currentTime <= 20 && finalState.swapAttr === null,
        `parkedAt=${parkedAt?.currentTime.toFixed(1)}s final=${finalState?.currentTime.toFixed(1)}s paused=${finalState?.paused} swapAttr=${finalState?.swapAttr}`,
      );
    });

    /* ---- S10: A-B loop cycles ACROSS silent swaps ---- */
    {
      const { context, page } = await openAudioPlayer(browser, { width: 768, height: 1024 });
      // A ≈ 2s, B ≈ A+2.5s (the S4b/c precision pattern).
      await page.locator('[data-testid="audio-play"]').click();
      const atA = await waitForAudio(page, (s) => s.currentTime >= 1.8, 10_000);
      await page.locator('[data-testid="audio-play"]').click(); // pause
      await page.locator('[data-testid="audio-set-a"]').click();
      await page.locator('[data-testid="audio-play"]').click();
      const aVal = atA?.currentTime ?? -1;
      const atB = await waitForAudio(page, (s) => s.currentTime >= aVal + 2.0, 10_000);
      await page.locator('[data-testid="audio-play"]').click(); // pause
      await page.locator('[data-testid="audio-set-b"]').click();
      const bVal = atB?.currentTime ?? -1;

      // Cycle for 15s — TTL 8 → silent swaps at ~3s/~6s/~9s/~12s: the loop
      // must keep wrapping ACROSS them (the A-B gates hold during the swap
      // window; the hook's restore re-lands inside the loop). Swap proof is
      // the deterministic MutationObserver cycle count (the timeupdate
      // zero-lottery is observability only).
      await page.evaluate(() => {
        window.__audioLog = [];
        window.__swapCycles = 0;
        window.__swapPresent = false;
        const audio = document.querySelector('audio');
        const obs = new MutationObserver(() => {
          const present = audio.getAttribute('data-swap-in-flight') !== null;
          if (present && !window.__swapPresent) window.__swapCycles += 1;
          window.__swapPresent = present;
        });
        obs.observe(audio, { attributes: true, attributeFilter: ['data-swap-in-flight'] });
      });
      await page.locator('[data-testid="audio-play"]').click();
      const deadline = Date.now() + 15_000;
      let wraps = 0;
      let swapZeros = 0;
      let scannedUpTo = 0;
      let log = [];
      const scan = (entries) => {
        for (let i = Math.max(0, scannedUpTo); i < entries.length - 1; i += 1) {
          // Wrap: a ≥B−0.5 sample followed by a sharp backward jump landing
          // in the plausible A-region — EXCEPT the lease-swap reset (≤0.5).
          if (entries[i] >= bVal - 0.5 && entries[i + 1] < entries[i] - 0.5) {
            if (entries[i + 1] <= 0.5) {
              swapZeros += 1;
              continue;
            }
            if (entries[i + 1] >= aVal - 0.3 && entries[i + 1] <= aVal + 1.5) wraps += 1;
          }
        }
        scannedUpTo = Math.max(scannedUpTo, entries.length - 1);
      };
      while (Date.now() < deadline) {
        await page.waitForTimeout(250);
        log = await page.evaluate(() => window.__audioLog || []);
        scan(log);
      }
      scan(log); // final pass: the last pair may only have completed on the final poll
      const cycles = await page.evaluate(() => window.__swapCycles ?? 0);
      check(
        'S10 A-B cycles across swaps (≥4 wraps/15s; ≥2 swaps)',
        aVal > 0 && bVal > aVal + 1 && wraps >= 4 && cycles >= 2,
        `a=${aVal.toFixed(2)} b=${bVal.toFixed(2)} wraps=${wraps} cycles=${cycles} swapZeros=${swapZeros} logLen=${log.length}`,
      );
      await context.close();
    }

    /* ---- S11: terminal lease error → retry recovers to PLAYABLE (F-G) ---- */
    {
      const { context } = await newAudioContext(browser, { width: 768, height: 1024 });
      // Shadow the playback-url mock: same TTL-8 cadence, but record the
      // FIRST silent refresh's lease number (≥2s gap rule — StrictMode pair).
      let leaseN = 0;
      let lastPostAt = 0;
      let failedLease = 0;
      await context.route(`**/api/v1/media/library-file/${FILE_ID}/playback-url`, async (route) => {
        leaseN += 1;
        const now = Date.now();
        const isSilentRefresh = lastPostAt > 0 && now - lastPostAt >= 2_000;
        lastPostAt = now;
        if (isSilentRefresh && !failedLease) failedLease = leaseN;
        await route.fulfill({
          json: {
            url: `${AUDIO_URL}?lease=${leaseN}`,
            ttlSeconds: TTL_SECONDS,
            expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
            contentType: 'audio/wav',
            supportsRange: true,
          },
        });
      });
      // 404 the failed lease's MEDIA: the swap assigns the src, the element
      // can never become ready → the 5s ack deadline terminal-fails the swap
      // → onSwapError → the fatal card. (The deferred refresh from the
      // element's error event drains at the terminal and lands a HEALTHY
      // lease — the auto-recovery the final gate must tolerate.)
      await context.route(`${AUDIO_URL}*`, async (route) => {
        if (failedLease && route.request().url().includes(`lease=${failedLease}`)) {
          return route.fulfill({ status: 404, body: 'e2e forced lease failure' });
        }
        return route.fallback();
      });
      const page = await context.newPage();
      await gotoAudioPlayer(page);
      // Snapshot the console-error ledger: the forced 404 below produces
      // EXPECTED resource-error noise — bounded-removed after the scenario
      // so a REAL regression anywhere stays visible in the report.
      const consoleBase = consoleErrors.length;
      await page.locator('[data-testid="audio-play"]').click();
      // The fatal card: the ack-timeout path guarantees it (~3s refresh +
      // 5s ack deadline), regardless of whether the double-media-error path
      // surfaced it first.
      await page.locator('[data-testid="audio-fatal-error"]').waitFor({ state: 'visible', timeout: 20_000 });
      // Gate on IDLE FIRST: the early card (double-media-error path) can
      // appear while the failed swap is still SWAPPING — a retry clicked
      // then coalesces into the doomed swap's deferred queue, and further
      // error events from the still-404 src would re-set the card. Wait for
      // the terminal (attr cleared; the drained refresh's healthy swap
      // completed), THEN retry in IDLE.
      await audioSwapAttrVisible(page, false, 15_000);
      await audioRefreshingVisible(page, false, 15_000);
      await page.waitForTimeout(SETTLE_GRACE_MS);
      // Retry: setFatalError(null) + refresh('manual') → a healthy lease →
      // the swap lands and terminal-clears.
      await page.locator('[data-testid="audio-fatal-error"] button').click();
      await audioSwapAttrVisible(page, false, 15_000);
      await audioRefreshingVisible(page, false, 15_000);
      await page.waitForTimeout(SETTLE_GRACE_MS);
      // Auto-recovery race (F-G): the failed swap's capture may have left
      // the player paused OR the drained refresh may have already replayed
      // play — either way it must reach PLAYABLE. Position preservation is
      // deliberately NOT asserted (weakened spec).
      let st = await audioState(page);
      if (st && st.paused) {
        await page.locator('[data-testid="audio-play"]').click();
        try {
          await page.waitForFunction(
            () => { const a = document.querySelector('audio[data-testid="audio-element"]'); return a && !a.paused && a.currentTime > 0.5; },
            null, { timeout: 10_000 },
          );
        } catch { /* fall through to the assertion */ }
      }
      // Final read in an IDLE moment (the TTL-8 cadence keeps swapping
      // every ~3s; data-swap-in-flight is present only ~300ms per cycle —
      // poll for a reading outside that window).
      const idleDeadline = Date.now() + 15_000;
      st = null;
      while (Date.now() < idleDeadline) {
        const s = await audioState(page);
        if (s && s.swapAttr === null && !s.paused && s.currentTime > 0.5) { st = s; break; }
        await page.waitForTimeout(200);
      }
      if (!st) st = await audioState(page);
      const cardGone = (await page.locator('[data-testid="audio-fatal-error"]').count()) === 0;
      // Bounded removal of the S11-window 404 noise (only entries added
      // during this scenario, only the 404 signature).
      const s11Added = consoleErrors.slice(consoleBase);
      consoleErrors.length = consoleBase;
      for (const e of s11Added) {
        if (!e.includes('404')) consoleErrors.push(e);
      }
      check(
        'S11 terminal lease error recovers to playable (retry; F-G: position not asserted)',
        st && !st.paused && st.currentTime > 0.5 && st.swapAttr === null && cardGone,
        `paused=${st?.paused} t=${st?.currentTime?.toFixed(2)} swapAttr=${st?.swapAttr} cardGone=${cardGone} failedLease=${failedLease} leases=${leaseN}`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
    clearInterval(rssSampler);
  }

  /* ============ summary ============ */
  const failed = results.filter((r) => !r.ok).length;
  console.log('─'.repeat(64));
  console.log(`Scenarios: ${results.length - failed} passed / ${failed} failed (of ${results.length})`);
  console.log(`Peak Chromium RSS: ${(peakChromeRssKb / 1024).toFixed(0)} MB (ceiling 1600 MB per §4)`);
  console.log(`Console errors: ${consoleErrors.length}${consoleErrors.length ? ` — ${consoleErrors.slice(0, 5).join(' | ')}` : ''}`);
  console.log(`Page errors: ${pageErrors.length}${pageErrors.length ? ` — ${pageErrors.slice(0, 5).join(' | ')}` : ''}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  clearInterval(rssSampler);
  console.error('SPEC CRASHED:', error);
  process.exit(2);
});
