/**
 * Push 11.3 — Advanced Favorites page E2E (mocked API at the network layer).
 *
 * RAM contract (hard rule §4): ONE Chromium instance, --headless=new --disable-gpu
 * --disable-dev-shm-usage, scenarios in browser.newContext()s, browser closed
 * immediately. Ceiling 1.6GB — sampled at 400ms via ps.
 *
 * Covers: per-tab empty states, the populated enriched grid (20 cards, thumbnails,
 * type chips), type filtering, all three sorts, pagination, optimistic delete with
 * the API call verified, the متابعة visibility matrix (product decision #3), and the
 * «متابعة» → course player deep link (?episode=). Plus a 375px mobile screenshot.
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/favorites-advanced.e2e.mjs
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

const COURSE_ID = '31111111-1111-1111-1111-111111111111';

const E2E_USER = {
  id: 'e2e-u-002', phone: '+962790000000', fullName: 'طالب الاختبار',
  role: 'student', avatarUrl: null,
  university: { id: 'u-1', nameAr: 'جامعة الاختبار' }, college: { id: 'c-1', nameAr: 'كلية الطب' },
};

const ENTITLEMENT_TOKEN = [
  Buffer.from(JSON.stringify({ expiresAt: new Date(Date.now() + 3600_000).toISOString() })).toString('base64url'),
  'e2e', 'sig',
].join('.');

/** 1×1 SVG data-URI thumbnail — loads synchronously, no network, naturalWidth > 0. */
const THUMB = (hue) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="hsl(${hue},70%,60%)"/></svg>`).toString('base64')}`;

const baseItem = (index, targetType) => ({
  id: `fav-${index}`,
  targetType,
  targetId: `${targetType}-${index}`,
  subjectId: 's-e2e',
  courseId: targetType === 'episode' ? COURSE_ID : null,
  title: '',
  subtitle: null,
  thumbnailUrl: null,
  fileType: null,
  durationSeconds: null,
  processingStatus: null,
  createdAt: new Date(Date.UTC(2026, 9, 1 + (index % 28), 10, 0, 0)).toISOString(),
  progress: null,
});

// 22 mixed favorites: 8 questions, 8 files, 6 episodes (2 with progress, 1 non-Ready).
const FIXTURES = [
  ...Array.from({ length: 8 }, (_, i) => ({
    ...baseItem(i + 1, 'question'),
    title: `سؤال رقم ${i + 1} عن القلب والأوعية`,
    subtitle: 'محاضرة 1: مقدمة',
    fileType: null,
  })),
  ...Array.from({ length: 8 }, (_, i) => ({
    ...baseItem(i + 9, 'file'),
    title: ['ملف الزمالة الأمريكية', 'أطلس التشريح', 'بنك أسئلة الباطنة', 'خريطة الأمراض'][i % 4] + ` — نسخة ${i + 1}`,
    subtitle: 'Curriculum',
    thumbnailUrl: THUMB(200 + i),
    fileType: ['pdf', 'html', 'image', 'video'][i % 4],
    durationSeconds: i % 4 === 3 ? 900 : null,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    ...baseItem(i + 17, 'episode'),
    title: `حلقة الدورة الدموية — الجزء ${i + 1}`,
    subtitle: 'كورس القلب والأوعية',
    thumbnailUrl: THUMB(320 + i),
    fileType: 'video',
    durationSeconds: 2400,
    processingStatus: i === 5 ? 'Pending' : 'Ready',
    progress: i < 2 ? { lastPositionSeconds: 300 + i * 60, durationSeconds: 2400, completionPercent: 12 + i * 3 } : null,
  })),
];

const byType = (type) => (type ? FIXTURES.filter((item) => item.targetType === type) : FIXTURES);

function applySort(items, sort) {
  const copy = [...items];
  if (sort === 'oldest') copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  else if (sort === 'alpha') copy.sort((a, b) => a.title.localeCompare(b.title, 'ar'));
  else copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return copy;
}

/** Stateful deletes — the mock remembers removed targetIds so the post-delete
 *  refetch (onSettled invalidation) serves consistent data like the real API. */
const state = { deletedTargetIds: new Set() };

function buildListResponse(searchParams) {
  const type = searchParams.get('type') || null;
  const sort = searchParams.get('sort') || 'recent';
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('pageSize') || '20', 10) || 20));
  const filtered = byType(type === 'question' || type === 'file' || type === 'episode' ? type : null)
    .filter((item) => !state.deletedTargetIds.has(`${item.targetType}:${item.targetId}`));
  const sorted = applySort(filtered, sort);
  const total = sorted.length;
  const items = sorted.slice((page - 1) * pageSize, page * pageSize);
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

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

async function newStudentContext(browser, viewport, { favoritesApi } = {}) {
  const context = await browser.newContext({ viewport, locale: 'ar' });
  await context.addInitScript(() => {
    sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
  });

  const counters = favoritesApi?.counters ?? { deletes: 0, deletedIds: [] };

  // Catch-all FIRST (lowest priority): any unmocked /api/v1 call aborts cleanly.
  await context.route('**/api/v1/**', (route) => route.abort());
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/entitlements/issue', (route) =>
    route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));

  await context.route('**/api/v1/favorites**', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      const url = new URL(route.request().url());
      if (favoritesApi?.empty) {
        await route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 } });
        return;
      }
      favoritesApi?.onGet?.(url.searchParams);
      await route.fulfill({ json: buildListResponse(url.searchParams) });
    } else {
      counters.deletes += 1;
      const url = new URL(route.request().url());
      const match = url.pathname.match(/\/favorites\/(question|file|episode)\/([\w-]+)$/);
      if (match) state.deletedTargetIds.add(`${match[1]}:${match[2]}`);
      counters.deletedIds.push(url.toString());
      await route.fulfill({ status: 204, body: '' });
    }
  });

  // The course player target of the «متابعة» deep link.
  await context.route(`**/api/v1/courses/${COURSE_ID}`, (route) => route.fulfill({
    json: {
      id: COURSE_ID, subjectId: 's-e2e', title: 'كورس القلب والأوعية',
      description: null, coverImageUrl: null, status: 'Published', episodesCount: 1,
      createdAt: '2026-10-20T12:00:00Z',
      episodes: [
        { id: 'episode-17', courseId: COURSE_ID, title: 'حلقة الدورة الدموية — الجزء 1', episodeNumber: 1, durationSeconds: 2400, sourceType: 'Upload', fileSize: 900_000, contentType: 'video/mp4', youtubeVideoId: null, uploadCompleted: true, viewsCount: 12, processingStatus: 'Ready' },
        { id: 'episode-18', courseId: COURSE_ID, title: 'حلقة الدورة الدموية — الجزء 2', episodeNumber: 2, durationSeconds: 2400, sourceType: 'Upload', fileSize: 900_000, contentType: 'video/mp4', youtubeVideoId: null, uploadCompleted: true, viewsCount: 8, processingStatus: 'Ready' },
      ],
    },
  }));

  context.__counters = counters;
  return context;
}

const browser = await chromium.launch({
  executablePath: EXECUTABLE,
  headless: true,
  args: [
    '--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox',
    '--disable-extensions', '--mute-audio', '--hide-scrollbars',
  ],
});

try {
  /* ================= Scenario A — per-tab empty states (4 tabs) ================= */
  {
    const context = await newStudentContext(browser, { width: 1280, height: 800 }, {
      favoritesApi: { empty: true },
    });
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });

    await page.goto(`${BASE_URL}/favorites`);
    await page.getByTestId('favorites-empty').waitFor({ state: 'visible', timeout: 15_000 });
    check('empty state (all): «لا توجد عناصر محفوظة بعد»',
      (await page.getByText('لا توجد عناصر محفوظة بعد').isVisible()) === true);

    const tabs = [
      ['favorites-tab-question', 'لا توجد أسئلة محفوظة'],
      ['favorites-tab-file', 'لا توجد ملفات محفوظة'],
      ['favorites-tab-episode', 'لا توجد حلقات محفوظة'],
    ];
    for (const [tab, copy] of tabs) {
      await page.getByTestId(tab).click();
      // Wait for the SPECIFIC copy — placeholderData renders the previous tab's copy
      // for a frame while the new key fetches.
      await page.getByText(copy).waitFor({ state: 'visible', timeout: 10_000 });
      check(`empty state per tab: ${copy}`, true);
    }

    // Per-tab empty CTA present and focusable.
    const cta = page.getByRole('link', { name: 'تصفح الدورات' });
    check('per-tab empty state carries a CTA button', await cta.isVisible());

    await context.close();
  }

  /* ================= Scenario B — populated grid, type filter, sort, متابعة matrix ================= */
  {
    const seenParams = [];
    const context = await newStudentContext(browser, { width: 1280, height: 800 }, {
      favoritesApi: { onGet: (sp) => seenParams.push(sp.toString()) },
    });
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });

    await page.goto(`${BASE_URL}/favorites`);
    const cards = page.locator('[data-testid^="favorite-card-"]');
    await cards.first().waitFor({ state: 'visible', timeout: 15_000 });
    check('populated grid: 20 cards on page 1 (22 total)', await cards.count() === 20, `count=${await cards.count()}`);
    check('total count label rendered', (await page.getByText('22 عنصرًا محفوظًا').isVisible()) === true);

    // Thumbnails actually load (data-URI, naturalWidth > 0).
    const thumbsOk = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="favorite-card-"] img')).every((img) => img.complete && img.naturalWidth > 0));
    const thumbCount = await page.locator('[data-testid^="favorite-card-"] img').count();
    check('thumbnails load (14 files+episodes cards, naturalWidth > 0)', thumbsOk && thumbCount === 14, `imgs=${thumbCount}`);

    // Type chips: questions render «سؤال», files their kind, episodes «فيديو».
    const chips = (await page.locator('[data-testid^="favorite-card-"] span.rounded-full').allTextContents()).filter((t) => t.trim());
    check('type chips correct across all three types',
      chips.includes('سؤال') && chips.includes('فيديو') && chips.some((t) => t.includes('PDF')),
      `chips=${[...new Set(chips)].join('|')}`);

    // متابعة matrix (product decision #3): episodes with progress only.
    const continueButtons = page.locator('[data-testid="favorite-continue"]');
    check('متابعة visible ONLY on episodes with progress (2 of 6)', await continueButtons.count() === 2, `count=${await continueButtons.count()}`);
    const fileOpens = page.locator('[data-testid="favorite-card-file"] [data-testid="favorite-open"]');
    check('file cards open in library (no متابعة)', await fileOpens.count() === 8);
    const questionCards = page.locator('[data-testid="favorite-card-question"]');
    const questionActions = questionCards.locator('[data-testid="favorite-open"], [data-testid="favorite-continue"]');
    check('question cards carry NO open/continue action', await questionActions.count() === 0);

    // Non-Ready episode card: متابعة/فتح disabled + «قيد المعالجة» badge.
    const pendingCard = page.locator('[data-testid="favorite-card-episode"]').filter({ hasText: 'قيد المعالجة' });
    check('non-Ready episode shows «قيد المعالجة» badge', await pendingCard.count() === 1);
    const pendingButton = pendingCard.locator('button[disabled]');
    check('non-Ready episode action disabled', await pendingButton.count() === 1);

    // Type filter: Episodes tab → only episodes (wait for the stale placeholder view
    // to be REPLACED — question/file cards must disappear, not just episodes exist).
    await page.getByTestId('favorites-tab-episode').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="favorite-card-"]').length === 6, null, { timeout: 10_000 });
    const mixed = await page.locator('[data-testid^="favorite-card-"]').count();
    check('Episodes tab → only episode cards (6)', mixed === 6, `count=${mixed}`);
    check('URL carries ?type=episode', new URL(page.url()).searchParams.get('type') === 'episode');

    // Sort: alpha → alphabetical order (titles from fixture).
    await page.getByTestId('favorites-sort').click();
    await page.getByRole('option', { name: 'أبجديًا (أ–ي)' }).click();
    await page.waitForFunction(() => {
      const titles = Array.from(document.querySelectorAll('[data-testid="favorite-card-episode"] h3')).map((el) => el.textContent);
      const sorted = [...titles].sort((a, b) => a.localeCompare(b, 'ar'));
      return titles.length === 6 && titles.every((t, i) => t === sorted[i]);
    }, null, { timeout: 10_000 });
    check('sort=alpha → Arabic alphabetical order in DOM', true);

    await page.getByTestId('favorites-sort').click();
    await page.getByRole('option', { name: 'الأقدم حفظًا' }).click();
    await page.waitForFunction(() => {
      const cards = Array.from(document.querySelectorAll('[data-testid="favorite-card-episode"]'));
      return cards.length === 6 && cards[0].textContent.includes('الجزء 1') && cards[5].textContent.includes('الجزء 6');
    }, null, { timeout: 10_000 });
    check('sort=oldest → oldest-saved first (mock order respected)', true);
    check('URL carries ?sort=oldest', new URL(page.url()).searchParams.get('sort') === 'oldest');

    await page.screenshot({ path: path.join(SHOT_DIR, 'favorites-01-desktop.png'), fullPage: true });
    await context.close();
  }

  /* ================= Scenario C — pagination ================= */
  {
    const context = await newStudentContext(browser, { width: 1280, height: 800 });
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });

    await page.goto(`${BASE_URL}/favorites`);
    await page.locator('[data-testid^="favorite-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });
    check('pagination controls visible (22 items / 20 per page)', await page.getByTestId('favorites-next-page').isVisible());

    await page.getByTestId('favorites-next-page').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="favorite-card-"]').length === 2, null, { timeout: 10_000 });
    check('next page loads the fresh batch (2 remaining cards)', true);
    check('URL carries ?page=2', new URL(page.url()).searchParams.get('page') === '2');
    const indicator = await page.locator('nav[aria-label="تصفح المفضلة"] span[aria-current="page"]').textContent();
    check('page indicator shows 2 / 2', (indicator ?? '').trim() === '2 / 2', indicator ?? '');

    await page.getByTestId('favorites-prev-page').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^="favorite-card-"]').length === 20, null, { timeout: 10_000 });
    check('prev page returns to the full first page', true);

    await context.close();
  }

  /* ================= Scenario D — optimistic delete + API call ================= */
  {
    const context = await newStudentContext(browser, { width: 1280, height: 800 });
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });

    await page.goto(`${BASE_URL}/favorites`);
    await page.locator('[data-testid^="favorite-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    // NOTE: the first page is FULL (20 of 22) — after a delete the next item slides
    // in from page 2, so the raw card count stays 20. The optimistic delete is
    // asserted on the SPECIFIC card disappearing + the total label dropping.
    const firstCardTitle = (await page.locator('[data-testid^="favorite-card-"] h3').first().textContent()) ?? '';
    await page.locator('[data-testid="favorite-delete"]').first().click();

    await page.locator('[data-testid^="favorite-card-"]').filter({ hasText: firstCardTitle })
      .first().waitFor({ state: 'detached', timeout: 5_000 });
    check('optimistic delete: the clicked card disappears', true, `removed="${firstCardTitle.slice(0, 24)}…"`);
    await page.getByText('21 عنصرًا محفوظًا').waitFor({ state: 'visible', timeout: 10_000 });
    check('total label reflects the deletion (22 → 21)', true);
    check('DELETE API called once', context.__counters.deletes === 1, `deletes=${context.__counters.deletes}`);

    await context.close();
  }

  /* ================= Scenario E — متابعة deep link → course player ?episode= ================= */
  {
    const context = await newStudentContext(browser, { width: 1280, height: 800 });
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });

    await page.goto(`${BASE_URL}/favorites`);
    await page.locator('[data-testid="favorite-continue"]').first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.locator('[data-testid="favorite-continue"]').first().click();

    await page.waitForURL(new RegExp(`/my-studies/courses/${COURSE_ID}\\?episode=episode-1[78]`), { timeout: 10_000 });
    check('متابعة navigates to the course player with ?episode= deep link', true, new URL(page.url()).search);

    await context.close();
  }

  /* ================= Scenario F — mobile 375px (§8) ================= */
  {
    const context = await newStudentContext(browser, { width: 375, height: 667 });
    const page = await context.newPage();
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });

    await page.goto(`${BASE_URL}/favorites`);
    await page.locator('[data-testid^="favorite-card-"]').first().waitFor({ state: 'visible', timeout: 15_000 });

    const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const tabHeight = await page.getByTestId('favorites-tab-all').evaluate((el) => el.getBoundingClientRect().height);
    check('mobile 375px: no horizontal overflow', noHScroll);
    check('mobile 375px: tab touch targets ≥ 44px', tabHeight >= 44, `h=${tabHeight.toFixed(0)}`);

    await page.screenshot({ path: path.join(SHOT_DIR, 'favorites-02-mobile-375.png'), fullPage: true });
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
