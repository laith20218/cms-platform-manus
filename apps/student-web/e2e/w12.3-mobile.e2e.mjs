/**
 * Wave 12.3.A — mobile UX hardening E2E (375px + 414px large phone).
 * Hotfix R35 — extends the matrix with the three field-reported bugs:
 *  - R35.1 floating toggles: absent in the DEFAULT state (M3) AND never
 *    stranded by the focus collapse (probed during focus mode too);
 *  - R35.2 zoom > 100%: pdf-scroll flips to overflow-x-auto + pan-x — at
 *    150% zoom scrollWidth > clientWidth and the inline-end side (LEFT in
 *    RTL) is reachable by scrolling; fit restores the zero-overflow §13
 *    contract;
 *  - R35.3 study-tools drawer is a SLIM icon rail: width < 100px, slide-in
 *    animation (pdf-drawer-start, 200ms) + transition utilities present.
 *
 * Supervisor A.6 contract:
 *  - M1 top bar single row (pdf-top-bar clientHeight <= 56px) at 375 & 414;
 *  - M2 bottom action bar visible (pdf-mobile-action-bar) with ≥ 4 targets
 *    ≥ 44px;
 *  - M3 floating toggles ABSENT ([data-testid*="floating"] === 0 AND the
 *    removed 12.2 triggers pdf-thumbs-open / pdf-study-tools-open === 0);
 *  - M4 thumbnails drawer: open from the action bar → backdrop present
 *    (pdf-drawer-backdrop) → tap backdrop → drawer closed;
 *  - M5 focus mode at 375: top bar / bottom action bar / status bar all
 *    aria-hidden="true" AND visually hidden; tap → chrome reveals
 *    (exit pill visible) → auto-hides after ~3s; exit via pill.
 *  - Screenshot matrix: 375 & 414 × {default, thumbs-drawer, tools-drawer,
 *    focus, focus-peek}.
 *
 * Harness contract mirrors player-pdf-11.11.e2e.mjs (same fixture + mocks).
 * Run (dev server on 127.0.0.1:5173):  node e2e/w12.3-mobile.e2e.mjs
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));

const SUBJECT_SLUG = 'e2e-pdf-subject';
const SUBJECT_ID = 'e2e-s-pdf';
const FILE_ID = '55555555-1111-2222-3333-444444444444';

const E2E_USER = {
  id: 'e2e-u-004', phone: '+962790000002', fullName: 'طالب الاختبار PDF',
  role: 'student', avatarUrl: null,
  university: { id: 'u-1', nameAr: 'جامعة الاختبار' }, college: { id: 'c-1', nameAr: 'كلية الطب' },
};

const ENTITLEMENT_TOKEN = [
  Buffer.from(JSON.stringify({ expiresAt: new Date(Date.now() + 3600_000).toISOString() })).toString('base64url'),
  'e2e', 'sig',
].join('.');

const FIXTURE_PATH = fileURLToPath(new URL('../public/e2e-test-doc-1111.pdf', import.meta.url));

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok, extra });
  console.log(`${ok ? '  PASS' : '! FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

const consoleErrors = [];
const pageErrors = [];

async function ensurePdfFixture(browser) {
  if (fs.existsSync(FIXTURE_PATH)) return fs.statSync(FIXTURE_PATH).size;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent('<html><body><p>fixture</p></body></html>');
  await context.close();
  throw new Error('fixture missing — run player-pdf-11.11.e2e.mjs once to generate it');
}

async function newContext(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'ar', hasTouch: true });
  await context.addInitScript(() => {
    sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
  });

  await context.route('**/api/v1/**', (route) => route.abort());
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));

  const fileSummary = {
    id: FILE_ID, type: 'Pdf', title: 'محاضرة PDF تجريبية',
    description: 'مستند تجريبي لمشغّل PDF — مصفوفة العروض الأربع',
    fileSize: fs.existsSync(FIXTURE_PATH) ? fs.statSync(FIXTURE_PATH).size : 50_000,
    durationSeconds: null, pagesCount: 3,
    thumbnailUrl: null, viewsCount: 1, isFavorite: false, category: 'Curriculum',
    createdAt: '2026-10-30T12:00:00Z',
  };

  await context.route(`**/api/v1/subjects/${SUBJECT_SLUG}`, (route) => route.fulfill({
    json: {
      id: SUBJECT_ID, slug: SUBJECT_SLUG, nameAr: 'مادة PDF التجريبية',
      color: null, totalQuestions: 0, totalLectures: 0, totalFiles: 1,
      totalExams: 0, lastContentUpdatedAt: null, userProgress: null, contentScopes: ['LecturesText'],
      description: null,
    },
  }));
  await context.route(`**/api/v1/library/subject/${SUBJECT_ID}**`, (route) => route.fulfill({
    json: { items: [fileSummary], total: 1, page: 1, pageSize: 20, totalPages: 1 },
  }));
  await context.route(`**/api/v1/library/${FILE_ID}/access`, async (route) => {
    await route.fulfill({
      json: {
        accessUrl: `${BASE_URL}/e2e-test-doc-1111.pdf`,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        watermark: {
          studentName: 'طالب الاختبار PDF', studentPhone: '+962790000002',
          timestamp: new Date().toISOString(), siteName: 'CMS',
        },
      },
    });
  });
  await context.route(`**/api/v1/library/${FILE_ID}`, (route) => route.fulfill({
    json: {
      ...fileSummary, subjectId: SUBJECT_ID, lectureId: null,
      fileFormat: 'application/pdf', youtubeVideoId: null, tags: [], favoritesCount: 0,
    },
  }));
  await context.route(`**/api/v1/library/${FILE_ID}/content`, async (route) => {
    await route.fulfill({
      body: fs.readFileSync(FIXTURE_PATH),
      contentType: 'application/pdf',
      headers: { 'Cache-Control': 'private, max-age=120' },
    });
  });
  await context.route(`**/api/v1/library/${FILE_ID}/view`, async (route) => route.fulfill({ status: 204, body: '' }));
  await context.route(`**/api/v1/library/${FILE_ID}/annotations`, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] });
    return route.fulfill({ json: { appliedCount: 0, serverTime: new Date().toISOString() } });
  });

  context.on('page', (page) => {
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text();
        if (text.includes('Failed to load resource')) return;
        consoleErrors.push(text);
      }
    });
    page.on('pageerror', (error) => {
      const text = error instanceof Error ? error.message : String(error);
      if (text.includes('sessionStorage') && text.includes('Access is denied')) return;
      pageErrors.push(text);
    });
  });

  return context;
}

async function openPdfPlayer(page) {
  await page.goto(`${BASE_URL}/subjects/${SUBJECT_SLUG}/library`, { timeout: 60_000 });
  await page.locator('text=محاضرة PDF تجريبية').first().click();
  await page.locator('[data-testid="pdf-player-shell"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-testid="pdf-controls-bar"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-testid="pdf-page-1"] canvas').waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(500);
}

/** The §13 horizontal-scroll gate. */
async function horizontalScrollProbe(page) {
  return page.evaluate(() => {
    const scroller = document.querySelector('[data-testid="pdf-scroll"]');
    return {
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      scrollerDefined: !!scroller,
      scrollerScrollWidth: scroller ? scroller.scrollWidth : -1,
      scrollerClientWidth: scroller ? scroller.clientWidth : -1,
    };
  });
}

async function assertCompactChrome(page, width, label) {
  // M1 — single-row compact top bar.
  const topBar = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="pdf-top-bar"]');
    return bar ? { h: bar.clientHeight, w: bar.clientWidth } : null;
  });
  check(`${label} M1: top bar single row (clientHeight <= 56)`, !!topBar && topBar.h <= 56, `h=${topBar?.h}`);

  // M2 — bottom action bar visible with ≥ 4 targets ≥ 44px.
  const actionBar = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="pdf-mobile-action-bar"]');
    if (!bar) return null;
    const box = bar.getBoundingClientRect();
    const targets = Array.from(bar.querySelectorAll('button'))
      .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height >= 44 && r.height < 60; })
      .length;
    const actionButtons = bar.querySelectorAll('button').length;
    return { visible: box.height > 0 && box.width > 0, h: box.height, targets, actionButtons };
  });
  check(
    `${label} M2: bottom action bar visible, ≥4 targets ≥44px`,
    !!actionBar && actionBar.visible && actionBar.targets >= 4,
    `h=${actionBar?.h} targets=${actionBar?.targets}/${actionBar?.actionButtons}`,
  );

  // M3 — floating toggles absent.
  const floating = await page.evaluate(() => ({
    any: document.querySelectorAll('[data-testid*="floating"]').length,
    oldThumbs: document.querySelectorAll('[data-testid="pdf-thumbs-open"]').length,
    oldTools: document.querySelectorAll('[data-testid="pdf-study-tools-open"]').length,
  }));
  check(
    `${label} M3: floating toggles absent`,
    floating.any === 0 && floating.oldThumbs === 0 && floating.oldTools === 0,
    JSON.stringify(floating),
  );

  // §13 — zero horizontal scroll.
  const probe = await horizontalScrollProbe(page);
  check(
    `${label} §13: zero horizontal scroll`,
    probe.docScrollWidth <= probe.innerWidth && (!probe.scrollerDefined || probe.scrollerScrollWidth === probe.scrollerClientWidth),
    `doc=${probe.docScrollWidth}/${probe.innerWidth}`,
  );
}

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'],
  });

  try {
    await ensurePdfFixture(browser);
    check('A.0 fixture available', true);

    for (const width of [375, 414]) {
      const label = `${width}px`;
      const context = await newContext(browser, { width, height: 812 });
      const page = await context.newPage();
      await openPdfPlayer(page);

      await assertCompactChrome(page, width, label);
      await page.screenshot({ path: `${SHOT_DIR}/w12.3-${width}-default.png` });

      // M4 — thumbnails drawer via the bottom action bar.
      await page.locator('[data-testid="pdf-mobile-thumbs"]').click();
      await page.locator('[data-testid="pdf-thumbs-close"]').waitFor({ state: 'visible', timeout: 4000 });
      const backdrop = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="pdf-drawer-backdrop"]');
        if (!el) return null;
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return { covers: box.width >= window.innerWidth * 0.9 && box.height >= window.innerHeight * 0.9, bg: style.backgroundColor };
      });
      // Chromium ≥121 reports colors in oklab — assert the 60% alpha dim, whatever the color space.
      const dimmed = !!backdrop && backdrop.covers && /0\.6/.test(backdrop.bg);
      check(`${label} M4a: thumbs drawer opens with dimmed backdrop`, dimmed, JSON.stringify(backdrop));
      await page.screenshot({ path: `${SHOT_DIR}/w12.3-${width}-thumbs-drawer.png` });
      // Tap the backdrop on the side AWAY from the drawer: the thumbs drawer
      // slides from inline-end (LEFT in this RTL layout, 0..288px), so tap
      // the far edge; the tools drawer mirrors (inline-start = RIGHT).
      await page.mouse.click(width - 8, Math.round(812 / 2));
      await page.locator('[data-testid="pdf-thumbs-close"]').waitFor({ state: 'detached', timeout: 4000 });
      check(`${label} M4b: tap backdrop closes the drawer`, true);

      // Tools drawer — same contract (start side).
      await page.locator('[data-testid="pdf-mobile-tools"]').click();
      await page.locator('[data-testid="pdf-study-tools-close"]').waitFor({ state: 'visible', timeout: 4000 });
      await page.screenshot({ path: `${SHOT_DIR}/w12.3-${width}-tools-drawer.png` });
      // R35.3 — the study-tools drawer is a SLIM icon rail (< 100px wide;
      // was 85vw) with a real slide-in (pdf-drawer-start 200ms keyframes +
      // transition-all/duration-200/ease-out utilities on the element).
      const slimDrawer = await page.evaluate(() => {
        const drawer = document.querySelector('[data-testid="pdf-study-tools-drawer"]');
        if (!drawer) return null;
        const style = getComputedStyle(drawer);
        return {
          w: drawer.getBoundingClientRect().width,
          animationName: style.animationName,
          transitionDuration: style.transitionDuration,
        };
      });
      check(
        `${label} R35.3a: tools drawer slim (< 100px)`,
        !!slimDrawer && slimDrawer.w > 0 && slimDrawer.w < 100,
        `w=${slimDrawer?.w}`,
      );
      check(
        `${label} R35.3b: drawer slide-in animation + 200ms transition`,
        !!slimDrawer && slimDrawer.animationName.includes('pdf-drawer-start-in') && slimDrawer.transitionDuration.includes('0.2'),
        JSON.stringify(slimDrawer),
      );
      // The desktop rail also renders the focus toggle (display:none at this
      // width) — scope to the VISIBLE drawer copy.
      await page.locator('[data-testid="pdf-study-focus"]:visible').waitFor({ state: 'visible', timeout: 4000 });
      check(`${label} M4c: tools drawer open — focus toggle reachable inside panel`, true);
      // The tools drawer occupies the RIGHT strip (inline-start in RTL) —
      // the backdrop is reachable on the LEFT edge.
      await page.mouse.click(8, Math.round(812 / 2));
      await page.locator('[data-testid="pdf-study-tools-close"]').waitFor({ state: 'detached', timeout: 4000 });

      // M5 — focus mode at compact width: EVERYTHING hides.
      await page.locator('[data-testid="pdf-focus-toggle"]').click();
      await page.waitForTimeout(450); // collapse animation + visibility flip
      const hiddenState = await page.evaluate(() => {
        const probe = (testid) => {
          const el = document.querySelector(`[data-testid="${testid}"]`);
          if (!el) return { present: false };
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          const host = el.closest('[aria-hidden="true"]');
          return { present: true, ariaHidden: !!host, invisible: style.visibility === 'hidden', zeroBox: box.width === 0 || box.height === 0 };
        };
        return {
          topBar: probe('pdf-top-bar'),
          bottomBar: probe('pdf-mobile-action-bar'),
          statusBar: probe('pdf-status-bar'),
          pill: document.querySelectorAll('[data-testid="pdf-focus-exit"]').length,
          // R35.1 — the removed floating toggles must NEVER be stranded by
          // the focus collapse: zero matching nodes while chrome is hidden.
          floatingAny: document.querySelectorAll('[data-testid*="floating"]').length,
          oldTriggers: document.querySelectorAll('[data-testid="pdf-thumbs-open"], [data-testid="pdf-study-tools-open"]').length,
        };
      });
      check(
        `${label} M5a: focus hides top/action/status bars (aria-hidden + visually hidden)`,
        hiddenState.topBar.ariaHidden && (hiddenState.topBar.invisible || hiddenState.topBar.zeroBox)
          && hiddenState.bottomBar.ariaHidden && (hiddenState.bottomBar.invisible || hiddenState.bottomBar.zeroBox)
          && hiddenState.statusBar.ariaHidden && (hiddenState.statusBar.invisible || hiddenState.statusBar.zeroBox),
        JSON.stringify(hiddenState),
      );
      check(`${label} M5b: focus hides the floating exit pill on mobile`, hiddenState.pill === 0, `pills=${hiddenState.pill}`);
      check(
        `${label} R35.1: no floating toggles stranded in focus mode`,
        hiddenState.floatingAny === 0 && hiddenState.oldTriggers === 0,
        `floating=${hiddenState.floatingAny} old=${hiddenState.oldTriggers}`,
      );
      await page.screenshot({ path: `${SHOT_DIR}/w12.3-${width}-focus.png` });

      // Tap to reveal — chrome peeks for 3s. The scroll column is the tap
      // target (the canvas is covered by the text layer; the click bubbles
      // to the player root's tap-to-reveal handler).
      {
        const box = await page.locator('[data-testid="pdf-scroll"]').boundingBox();
        await page.locator('[data-testid="pdf-scroll"]').click({ position: { x: 60, y: 60 } });
        void box;
      }
      await page.waitForTimeout(350);
      const peek = await page.evaluate(() => ({
        pill: document.querySelectorAll('[data-testid="pdf-focus-exit"]').length,
        topBarVisible: (() => {
          const el = document.querySelector('[data-testid="pdf-top-bar"]');
          if (!el) return false;
          return el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== 'hidden';
        })(),
      }));
      check(`${label} M5c: tap reveals chrome (pill + top bar)`, peek.pill === 1 && peek.topBarVisible, JSON.stringify(peek));
      await page.screenshot({ path: `${SHOT_DIR}/w12.3-${width}-focus-peek.png` });

      // Auto-hide after ~3s.
      await page.waitForTimeout(3400);
      const afterPeek = await page.evaluate(() => document.querySelectorAll('[data-testid="pdf-focus-exit"]').length);
      check(`${label} M5d: chrome auto-hides after 3s`, afterPeek === 0, `pills=${afterPeek}`);

      // Exit: tap → pill → click.
      await page.locator('[data-testid="pdf-scroll"]').click({ position: { x: 60, y: 60 } });
      await page.locator('[data-testid="pdf-focus-exit"]').waitFor({ state: 'visible', timeout: 4000 });
      await page.locator('[data-testid="pdf-focus-exit"]').click();
      await page.locator('[data-testid="pdf-controls-bar"]').waitFor({ state: 'visible', timeout: 4000 });
      check(`${label} M5e: exit focus via revealed pill`, true);

      // R35.2 — zoom > 100% must allow horizontal panning (the inline-end
      // side — LEFT in RTL — was clipped by overflow-x-hidden). Drive the
      // bottom-bar zoom menu to 150%, assert overflow + pan, restore fit.
      await page.locator('[data-testid="pdf-mobile-zoom"]').click();
      await page.locator('[data-testid="pdf-mobile-zoom-in"]').click(); // 100 → 125
      await page.waitForTimeout(150);
      await page.locator('[data-testid="pdf-mobile-zoom-in"]').click(); // 125 → 150
      await page.waitForTimeout(150);
      await page.locator('[data-testid="pdf-scroll"]').click({ position: { x: 30, y: 30 } }); // dismiss menu
      await page.waitForTimeout(450); // canvas re-render settle
      const zoomProbe = await page.evaluate(() => {
        const scroller = document.querySelector('[data-testid="pdf-scroll"]');
        return {
          zoomLabel: document.querySelector('[data-testid="pdf-mobile-zoom"]')?.textContent?.trim() ?? '',
          touchActionInline: scroller ? scroller.style.touchAction : '',
          touchActionComputed: scroller ? getComputedStyle(scroller).touchAction : '',
          overflowX: scroller ? getComputedStyle(scroller).overflowX : '',
          scrollWidth: scroller ? scroller.scrollWidth : -1,
          clientWidth: scroller ? scroller.clientWidth : -1,
        };
      });
      check(`${label} R35.2a: zoom menu reached 150%`, zoomProbe.zoomLabel.includes('150'), zoomProbe.zoomLabel);
      // Chromium folds the computed value of `pan-x pan-y pinch-zoom` into
      // its EXACT equivalent keyword `manipulation` (pan + pinch-zoom, no
      // double-tap-zoom) — accept either serialization of the same contract.
      const touchOk = zoomProbe.touchActionInline.includes('pan-x') && zoomProbe.touchActionInline.includes('pinch-zoom')
        && (zoomProbe.touchActionComputed === 'manipulation' || zoomProbe.touchActionComputed.includes('pan-x'));
      check(
        `${label} R35.2b: scroller overflow-x auto + pan-x pinch-zoom`,
        zoomProbe.overflowX === 'auto' && touchOk,
        `${zoomProbe.overflowX}/${zoomProbe.touchActionInline} => ${zoomProbe.touchActionComputed}`,
      );
      check(
        `${label} R35.2c: h-overflow exists at 150% (scrollWidth > clientWidth)`,
        zoomProbe.scrollWidth > zoomProbe.clientWidth,
        `${zoomProbe.scrollWidth}/${zoomProbe.clientWidth}`,
      );
      // RTL scroll model: inline-start (RIGHT) = scrollLeft 0; scrolling
      // toward the inline-end (LEFT) drives scrollLeft NEGATIVE (Chromium
      // follows the CSSOM spec). A negative scrollLeft ⇔ the left side of
      // the zoomed page is now reachable.
      const panProbe = await page.evaluate(() => {
        const scroller = document.querySelector('[data-testid="pdf-scroll"]');
        const before = scroller ? scroller.scrollLeft : null;
        scroller?.scrollBy({ left: -160, behavior: 'instant' });
        return { before, after: scroller ? scroller.scrollLeft : null };
      });
      check(
        `${label} R35.2d: left side reachable (scrollLeft pans negative)`,
        panProbe.before === 0 && panProbe.after !== null && panProbe.after < -40,
        JSON.stringify(panProbe),
      );
      await page.screenshot({ path: `${SHOT_DIR}/w12.3-${width}-zoom-150.png` });
      // Restore fit — the §13 zero-overflow contract must hold again.
      await page.locator('[data-testid="pdf-mobile-zoom"]').click();
      await page.locator('[data-testid="pdf-mobile-zoom-fit"]').click();
      await page.waitForTimeout(500);
      const fitProbe = await horizontalScrollProbe(page);
      check(
        `${label} R35.2e: fit restores zero horizontal scroll`,
        fitProbe.scrollerScrollWidth === fitProbe.scrollerClientWidth && fitProbe.docScrollWidth <= fitProbe.innerWidth,
        `doc=${fitProbe.docScrollWidth}/${fitProbe.innerWidth} column=${fitProbe.scrollerScrollWidth}/${fitProbe.scrollerClientWidth}`,
      );

      await context.close();
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log('─'.repeat(64));
  console.log(`Mobile 12.3.A: ${results.length - failed} passed / ${failed} failed (of ${results.length})`);
  console.log(`Console errors: ${consoleErrors.length}${consoleErrors.length ? ` — ${consoleErrors.slice(0, 5).join(' | ')}` : ''}`);
  console.log(`Page errors: ${pageErrors.length}${pageErrors.length ? ` — ${pageErrors.slice(0, 5).join(' | ')}` : ''}`);
  process.exit(failed === 0 && pageErrors.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('SPEC CRASHED:', error);
  console.error(`Page errors (${pageErrors.length}):`, pageErrors.slice(0, 10).join('\n  '));
  process.exit(2);
});
