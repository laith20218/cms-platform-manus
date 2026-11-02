/**
 * Wave 12.4.A — §13 evidence pack: the VIDEO player (course episode stage).
 *
 * Harness contract mirrors w13.1-axe.mjs (same AxeBuilder tags + widths) with
 * the video network mocks lifted from player-video.e2e.mjs. Per §13 width
 * (375 / 414 / 768 / 1024 / 1440) it:
 *   1. opens the production course player with real playback;
 *   2. surfaces the controls (pointer bump) and captures a screenshot;
 *   3. asserts NO horizontal scroll (document.scrollWidth <= innerWidth) and
 *      ROW-level zero overflow (scrollWidth <= clientWidth) at every width;
 *   4. runs axe-core (wcag2a, wcag2aa, wcag21aa, wcag22aa) scoped to the
 *      player container — what Wave 12.4 owns.
 *
 * Blocking = critical | serious violations. Output: console summary (for the
 * WIP_STATUS report) + machine-readable JSON at e2e/screenshots/w12.4a-axe.json.
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/w12.4a-axe.mjs
 */
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));

const COURSE_ID = '21111111-1111-1111-1111-111111111111';
const EPISODE_ID = '11111111-2222-3333-4444-555555555555';
const VIDEO_URL = `${BASE_URL}/e2e-test-video.mp4`;

const E2E_USER = {
  id: 'e2e-u-002', phone: '+962790000000', fullName: 'طالب الاختبار',
  role: 'student', avatarUrl: null,
  university: { id: 'u-1', nameAr: 'جامعة الاختبار' }, college: { id: 'c-1', nameAr: 'كلية الطب' },
};
const ENTITLEMENT_TOKEN = [
  Buffer.from(JSON.stringify({ expiresAt: new Date(Date.now() + 3600_000).toISOString() })).toString('base64url'),
  'e2e', 'sig',
].join('.');

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const runs = [];

async function newVideoContext(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'ar', hasTouch: true });
  await context.addInitScript(() => {
    sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
  });

  // Catch-all FIRST (lowest priority); specific mocks LAST (highest priority) —
  // same layering as player-video.e2e.mjs. ttl=3600 keeps the stage swap-free.
  let lease = 0;
  await context.route('**/api/v1/**', (route) => route.abort());
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));
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
    lease += 1;
    await route.fulfill({
      json: {
        url: `${VIDEO_URL}?lease=${lease}`,
        ttlSeconds: 3600,
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        contentType: 'video/mp4',
        supportsRange: true,
      },
    });
  });
  await context.route(`**/api/v1/media/course-episode/${EPISODE_ID}/progress`, (route) => route.fulfill({
    json: {
      assetType: 'CourseEpisode', assetId: EPISODE_ID,
      lastPositionSeconds: 0, durationSeconds: 90,
      completionPercent: 0, updatedAt: new Date().toISOString(),
    },
  }));
  return context;
}

async function openPlayer(page) {
  await page.goto(`${BASE_URL}/my-studies/courses/${COURSE_ID}`, { timeout: 60_000 });
  await page.getByTestId('episode-stage').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByTestId('course-episode-player').waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByTestId('video-element').waitFor({ state: 'attached', timeout: 20_000 });
}

async function axeScan(page, label) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS)
    // §13 contract: the scan measures what Wave 12.4 OWNS — the video player
    // container (element + custom controls bar + dialogs).
    .include('[data-testid="course-episode-player"]')
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }));
  runs.push({ label, violations: results.violations.length, blocking });
  console.log(`  AXE ${label}: ${results.violations.length} total, ${blocking.length} blocking${blocking.length ? ' → ' + JSON.stringify(blocking) : ''}`);
  return blocking;
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: [
      '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--hide-scrollbars',
    ],
  });

  let anyBlocking = false;
  try {
    const VIEWPORTS = [
      { width: 375, height: 812 },
      { width: 414, height: 812 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ];

    for (const viewport of VIEWPORTS) {
      console.log(`  == viewport ${viewport.width}x${viewport.height} ==`);
      const context = await newVideoContext(browser, viewport);
      const page = await context.newPage();
      await openPlayer(page);
      // Deterministic pre-click gate (same settle philosophy as
      // player-video.e2e.mjs openPlayingPlayer): metadata parsed, controls
      // bar mounted (it only mounts once lease info arrives), element ready.
      await page.waitForFunction(() => {
        const v = document.querySelector('[data-testid="video-element"]');
        return !!v && !!document.querySelector('[data-testid="video-controls-bar"]')
          && Number.isFinite(v.duration) && v.duration > 0 && v.readyState >= 1;
      }, null, { timeout: 15_000 });
      // Real playback so the auto-hide contract is live. Bounded retry: a
      // transient hit-target interception re-clicks (fresh hit-test) instead
      // of burning the whole default timeout.
      let clicked = false;
      for (let attempt = 0; attempt < 3 && !clicked; attempt++) {
        try {
          await page.getByTestId('video-center-play').click({ timeout: 8_000 });
          clicked = true;
        } catch {
          console.log('    center-play click retry (transient interception)');
        }
      }
      if (!clicked) {
        const diag = await page.evaluate(() => {
          const box = (sel) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
          };
          const btn = document.querySelector('[data-testid="video-center-play"]');
          let hit = null;
          if (btn) {
            const r = btn.getBoundingClientRect();
            const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            hit = el ? { tag: el.tagName, testid: el.getAttribute('data-testid'), inBtn: btn.contains(el) } : null;
          }
          return {
            btn: box('[data-testid="video-center-play"]'),
            row: box('[data-testid="video-controls-row"]'),
            player: box('[data-testid="course-episode-player"]'),
            hit, scrollY: window.scrollY,
            scrollableAncestors: (() => {
              let el = btn, out = [];
              while (el && el !== document.body) {
                if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) {
                  out.push(`${el.tagName}.${String(el.className).slice(0, 40)} sw${el.scrollWidth}/cw${el.clientWidth} sh${el.scrollHeight}/ch${el.clientHeight}`);
                }
                el = el.parentElement;
              }
              return out;
            })(),
          };
        });
        console.log('    DIAG:', JSON.stringify(diag));
        throw new Error(`video-center-play unreachable @ ${viewport.width}px after 3 attempts`);
      }
      await page.waitForFunction(
        () => { const v = document.querySelector('[data-testid="video-element"]'); return v && !v.paused; },
        null, { timeout: 10_000 },
      );
      // Bump the controls with a REAL pointer move over the player stage.
      const pbox = await page.getByTestId('course-episode-player').boundingBox();
      await page.mouse.move(pbox.x + pbox.width / 2, pbox.y + pbox.height / 2);
      await page.waitForTimeout(400);

      // §13: zero horizontal scroll (page) + zero row overflow (controls row).
      const layout = await page.evaluate(() => {
        const row = document.querySelector('[data-testid="video-controls-row"]');
        return {
          pageNoHScroll: document.documentElement.scrollWidth <= window.innerWidth,
          row: row ? { sw: row.scrollWidth, cw: row.clientWidth } : null,
        };
      });
      const layoutOk = layout.pageNoHScroll && !!layout.row && layout.row.sw <= layout.row.cw;
      console.log(`  LAYOUT @${viewport.width}px: pageNoHScroll=${layout.pageNoHScroll} row=${layout.row ? `${layout.row.sw}/${layout.row.cw}` : 'MISSING'} → ${layoutOk ? 'OK' : 'FAIL'}`);

      await page.screenshot({ path: path.join(SHOT_DIR, `w12.4a-video-${viewport.width}.png`) });
      const blocking = await axeScan(page, `video player @ ${viewport.width}px`);
      anyBlocking = blocking.length > 0 || anyBlocking;
      runs[runs.length - 1].layoutOk = layoutOk;
      if (!layoutOk) anyBlocking = true;
      await context.close();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(`${SHOT_DIR}w12.4a-axe.json`, JSON.stringify({ generatedAt: new Date().toISOString(), runs }, null, 2));
  console.log(`\n==== w12.4a-axe: ${runs.length} scans, blocking=${anyBlocking ? 'YES' : 'NONE'} ====\n`);
  process.exitCode = anyBlocking ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
