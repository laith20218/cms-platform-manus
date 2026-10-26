/**
 * Push 10.4 — Admin Upload UI E2E (simulated multipart upload through the
 * real CoursesCenter, with a mocked API).
 *
 * RAM contract (hard rule): ONE Chromium instance, --headless=new
 * --disable-gpu --disable-dev-shm-usage, scenarios in browser.newContext()s,
 * browser closed immediately. Ceiling 1.6GB — sampled at 400ms via ps.
 *
 * Playwright resolves from the workspace's student-web install — admin-web
 * has no Playwright devDep (the 10.4 lockfile exception covers hls.js only).
 *
 * Flows:
 *  A. Happy ladder (desktop 1280×800): login-restore → Library → Courses →
 *     hierarchy picks → course drawer → upload panel → simulated multipart
 *     PUT → complete-upload (assert Title/Description/Difficulty + the 10.8
 *     targetQuality key ride the body) → ProcessingStatus poll ladder Pending →
 *     360p (SD) → 720p (HD) → 1080p (FHD) → Ready with the human sentences +
 *     animated bar → episode row chip + difficulty badge → edit modal (assert
 *     metadata on the PUT).
 *  B. Failed processing (desktop): ladder lands on Failed with an FFmpeg
 *     technical payload → dual-language error modal (Arabic headline +
 *     human message + collapsible LTR technical details + Copy Error +
 *     Retry that re-polls to Ready).
 *  C. Abort processing (desktop, Push 10.8 1.C): the ladder parks at
 *     Transcoding_720p (the production stuck-at-58% shape) → the "إلغاء
 *     المعالجة" button appears ONLY while encoding → click → abort-processing
 *     POST → episode flips to Failed → the deliberate-cancel banner (not the
 *     generic failure headline).
 *  D. Tablet 768×1024 (Push 10.8 1.B): P360 selected → complete-upload body
 *     carries targetQuality=P360 → the DYNAMIC timeline renders exactly
 *     [Pending, SD, Ready] (HD/FHD steps hidden) → form usable, no overflow.
 *
 * Run (admin dev server on 127.0.0.1:5174):  node e2e/admin-upload.e2e.mjs
 */
import { chromium } from 'file:///home/z/cms-recon/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE_URL = process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:5174';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));

const COURSE_ID = 'C1';
const EPISODE_ID = 'EP1';

const E2E_ADMIN_USER = {
  id: 'e2e-admin-001',
  phone: '+962790000001',
  fullName: 'مدير الاختبار',
  role: 'super_admin', // synthesizes the full ui-permissions bundle locally
  avatarUrl: null,
  university: { id: 'u1', nameAr: 'جامعة الاختبار' },
  college: { id: 'c1', nameAr: 'كلية الطب' },
};

const FFMPEG_LOG = [
  'VideoTranscodingService: episode EP1 ladder failed after 3 rung attempts.',
  'ffmpeg -nostdin -i courses/C1/source.mp4 -filter_complex ... -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2"',
  '[libx264 @ 0x55d1c2a4b800] Error:Invalid argument passed to coder',
  'ffmpeg exited with code 1 ( MEDIA_PROCESSING_FAILED )',
].join('\n');

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

/**
 * The shared mock world — the route handlers are Node-side closures, so the
 * test can arm retry flips deterministically (world.retryArmed).
 */
function makeWorld() {
  return {
    mode: 'ladder', // 'ladder' | 'failed' | 'stuck' | 'sd'
    completeUploads: 0,
    detailGetsAfterComplete: 0,
    retryArmed: false,
    completeBodies: [],
    partPuts: 0,
    editBodies: [],
    // Push 10.8 — the abort-processing world state.
    aborted: false,
    abortCalls: 0,
    // Push 10.8 — the quality the episode DTO echoes back (drives the
    // dynamic timeline); the complete-upload body carries the admin's pick.
    targetQuality: 'Auto',
  };
}

/** The course detail (episodes) — the processing source of truth. */
function courseDetailPayload(world) {
  const episode = {
    id: EPISODE_ID, courseId: COURSE_ID, title: 'حلقة تجريبية — الدورة الدموية',
    episodeNumber: 1, durationSeconds: 930, sourceType: 'Upload',
    fileSize: 524288000, contentType: 'video/mp4', youtubeVideoId: null,
    viewsCount: 1245,
  };

  if (world.completeUploads === 0) {
    // Pre-upload: the episode shell exists, upload incomplete.
    episode.uploadCompleted = false;
    return courseDetail(episode);
  }

  world.detailGetsAfterComplete += 1;
  episode.uploadCompleted = true;
  episode.difficulty = 2;
  episode.description = 'وصف تجريبي للحلقة';
  episode.targetQuality = world.targetQuality;

  if (world.aborted) {
    // Push 10.8 — abort-processing flipped the episode to Failed (terminal).
    episode.processingStatus = 'Failed';
  } else if (world.mode === 'failed') {
    episode.processingStatus = world.retryArmed ? 'Ready' : 'Failed';
    if (episode.processingStatus === 'Failed') episode.processingError = FFMPEG_LOG;
  } else if (world.mode === 'stuck') {
    // Push 10.8 — the production shape: the encode parks at Transcoding_720p
    // (the admin UI's 58%) and never advances — the cancel-button world.
    const stuckLadder = ['Pending', 'Transcoding_360p', 'Transcoding_720p'];
    const rung = Math.min(Math.floor((world.detailGetsAfterComplete - 1) / 2), stuckLadder.length - 1);
    episode.processingStatus = stuckLadder[rung];
  } else if (world.mode === 'sd') {
    // Push 10.8 — a P360 encode: the status IS Transcoding_360p for the whole
    // single-rung encode, then Ready.
    const sdLadder = ['Pending', 'Transcoding_360p', 'Ready'];
    const rung = Math.min(Math.floor((world.detailGetsAfterComplete - 1) / 2), sdLadder.length - 1);
    episode.processingStatus = sdLadder[rung];
  } else {
    // Each rung persists for TWO detail fetches: complete-upload triggers two
    // immediate GETs (loadDetail + the poller's activation poll) — without
    // the pacing, the second one can advance past a rung before React paints
    // it. With pacing: Pending spans gets 1-2, 360p 3-4, … Ready at ~21s.
    const ladder = ['Pending', 'Transcoding_360p', 'Transcoding_720p', 'Transcoding_1080p', 'Ready'];
    const rung = Math.floor((world.detailGetsAfterComplete - 1) / 2);
    episode.processingStatus = ladder[Math.min(rung, ladder.length - 1)];
  }
  return courseDetail(episode);
}

function courseDetail(episode) {
  return {
    id: COURSE_ID, subjectId: 'sub1', title: 'كورس تجريبي — القلب',
    description: null, coverImageUrl: null, status: 'Published',
    episodesCount: 1, createdAt: new Date('2026-01-05T09:00:00Z').toISOString(),
    episodes: [episode],
  };
}

async function newAdminContext(browser, viewport, world) {
  const context = await browser.newContext({ viewport, locale: 'ar' });
  await context.addInitScript((user) => {
    sessionStorage.setItem('cms-admin-token', 'e2e-dummy-access');
    sessionStorage.setItem('cms-admin-refresh', 'e2e-dummy-refresh');
    sessionStorage.setItem('cms-admin-user', JSON.stringify(user));
  }, E2E_ADMIN_USER);

  // Catch-all FIRST (lowest priority): any unmocked /api/v1 call aborts cleanly.
  await context.route('**/api/v1/**', (route) => { if (process.env.E2E_DEBUG) console.log('ABORT:', route.request().url()); route.abort(); });

  // Specific mocks LAST (highest priority — most exact patterns registered last).
  await context.route('**/health', (route) => route.fulfill({ json: { status: 'Healthy' } }));
  await context.route('**/api/v1/auth/refresh', (route) => route.fulfill({ json: { accessToken: 'e2e-access-2' } }));
  // Overview + topbar requests the shell fires on boot — benign payloads keep
  // the browser's network log clean (no ERR_FAILED noise from the catch-all).
  await context.route('**/api/v1/admin/dashboard', (route) =>
    route.fulfill({
      json: {
        totalStudents: 1250, activeStudentsToday: 310, totalQuestions: 4800,
        totalActiveCodes: 96, totalActiveSubscriptions: 640, totalLibraryFiles: 220,
        totalExams: 48, pendingReports: 3, monthlyRevenue: 4200, revenueChangePercent: 4.2,
      },
    }));
  await context.route('**/api/v1/notifications/unread-count', (route) =>
    route.fulfill({ json: { count: 0 } }));
  // App-boot loaders (admins/roles) + the files-tab prefetch (content/files,
  // lectures) — benign empty payloads keep the network log clean.
  await context.route('**/api/v1/admin/roles', (route) => route.fulfill({ json: [] }));
  await context.route('**/api/v1/admin/admins?*', (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 } }));
  await context.route('**/api/v1/admin/content/files?*', (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 } }));
  await context.route('**/api/v1/admin/content/academic/subjects/*/lectures', (route) =>
    route.fulfill({ json: [] }));
  await context.route('**/api/v1/universities?*', (route) =>
    route.fulfill({ json: { items: [{ id: 'u1', nameAr: 'جامعة الاختبار' }], total: 1, page: 1, pageSize: 100, totalPages: 1 } }));
  await context.route('**/api/v1/universities/u1/colleges', (route) =>
    route.fulfill({ json: [{ id: 'c1', nameAr: 'كلية الطب' }] }));
  await context.route('**/api/v1/colleges/c1/years', (route) =>
    route.fulfill({ json: [{ id: 'y1', nameAr: 'السنة الأولى' }] }));
  await context.route('**/api/v1/years/y1/semesters', (route) =>
    route.fulfill({ json: [{ id: 's1', nameAr: 'الفصل الأول' }] }));
  await context.route('**/api/v1/semesters/s1/subjects', (route) =>
    route.fulfill({ json: [{ id: 'sub1', nameAr: 'الفيزياء الطبية' }] }));

  await context.route('**/api/v1/admin/courses?*', (route) =>
    route.fulfill({
      json: {
        items: [{
          id: COURSE_ID, subjectId: 'sub1', subjectName: 'الفيزياء الطبية',
          title: 'كورس تجريبي — القلب', status: 'Published',
          episodesCount: 1, viewsCount: 1245, createdAt: '2026-01-05T09:00:00Z',
        }],
        total: 1, page: 1, pageSize: 50, totalPages: 1,
      },
    }));

  await context.route(`**/api/v1/admin/courses/${COURSE_ID}`, (route) =>
    route.fulfill({ json: courseDetailPayload(world) }));

  await context.route(`**/api/v1/admin/courses/${COURSE_ID}/episodes/initiate-upload`, (route) =>
    route.fulfill({
      json: {
        episodeId: EPISODE_ID, uploadId: 'mpu-e2e-1', fileKey: `courses/${COURSE_ID}/e2e/lecture.mp4`,
        partSizeBytes: 67108864, partCount: 1, partUrls: [`${BASE_URL}/__e2e__/part-1`],
      },
    }));

  await context.route('**/__e2e__/part-1', async (route) => {
    // ~700ms of "network" so the uploading state (and its stats strip) is
    // reliably observable — an instant fulfill makes the phase flash by.
    await new Promise((resolve) => setTimeout(resolve, 700));
    world.partPuts += 1;
    route.fulfill({ status: 200, headers: { ETag: '"e2e-etag-1"' }, body: '' });
  });

  await context.route(`**/api/v1/admin/courses/episodes/${EPISODE_ID}/complete-upload`, (route) => {
    world.completeBodies.push(route.request().postDataJSON());
    world.completeUploads += 1;
    route.fulfill({ json: {} });
  });

  await context.route(`**/api/v1/admin/courses/episodes/${EPISODE_ID}`, (route) => {
    if (route.request().method() === 'PUT') {
      world.editBodies.push(route.request().postDataJSON());
      route.fulfill({ json: {} });
    } else {
      route.fulfill({ status: 405, json: { detail: 'method not allowed' } });
    }
  });

  // Push 10.8 — the abort-processing endpoint: flips the world to Failed.
  await context.route(`**/api/v1/admin/courses/episodes/${EPISODE_ID}/abort-processing`, (route) => {
    world.abortCalls += 1;
    world.aborted = true;
    route.fulfill({ json: {} });
  });

  return context;
}

/** Navigates to the courses drawer of the test course (hierarchy picked). */
async function openCoursesDrawer(page) {
  await page.goto(`${BASE_URL}/`);
  // Tablet/mobile widths: the sidebar is an overlay behind a hamburger.
  const menuToggle = page.getByRole('button', { name: 'فتح القائمة', exact: true });
  if (await menuToggle.isVisible().catch(() => false)) {
    await menuToggle.click();
  }
  await page.getByRole('button', { name: 'المكتبة والملفات' }).first().click();
  await page.getByRole('tab', { name: 'الكورسات' }).click();

  // Academic hierarchy: 5 selects in DOM order (university → subject).
  const selects = page.getByRole('combobox');
  await selects.nth(0).selectOption('u1');
  await page.waitForTimeout(250);
  await selects.nth(1).selectOption('c1');
  await page.waitForTimeout(250);
  await selects.nth(2).selectOption('y1');
  await page.waitForTimeout(250);
  await selects.nth(3).selectOption('s1');
  await page.waitForTimeout(250);
  await selects.nth(4).selectOption('sub1');

  await page.getByRole('button', { name: /كورس تجريبي — القلب/ }).first().click();
  await page.getByRole('heading', { name: /الحلقات/ }).waitFor({ timeout: 10_000 });
}

/** Opens the upload panel and runs a full simulated upload. */
async function runSimulatedUpload(page, world, { title, description, difficulty }) {
  await page.getByRole('button', { name: /رفع وسائط/ }).click();
  await page.getByPlaceholder('عنوان الحلقة').fill(title);
  await page.getByTestId('upload-metadata-description').fill(description);
  await page.getByTestId('upload-metadata-difficulty').selectOption(String(difficulty));
  await page.locator('input[type="file"]').setInputFiles({
    name: 'lecture-heart.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(256 * 1024, 7),
  });
  await page.getByTestId('upload-start-button').click();
}

async function waitForPhaseActive(page, phase, timeout = 20_000) {
  await page
    .locator(`[data-testid="processing-phase-${phase}"][data-phase-state="active"]`)
    .waitFor({ state: 'visible', timeout });
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
  /* ================= Flow A — happy ladder (1280×800) ================= */
  {
    const world = makeWorld();
    const context = await newAdminContext(browser, { width: 1280, height: 800 }, world);
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
    });

    await openCoursesDrawer(page);

    // 1 — Upload stats strip while uploading (size · speed · ETA · parts).
    await runSimulatedUpload(page, world, {
      title: 'حلقة القلب والأوعية',
      description: 'مراجعة شاملة لدورة القلب مع حالات سريرية.',
      difficulty: 2,
    });
    await page.getByTestId('upload-stats').waitFor({ state: 'visible', timeout: 10_000 });
    const sizeText = await page.getByTestId('upload-stat-size').textContent();
    check('uploading stats strip: file size shown', sizeText?.includes('KB') || sizeText?.includes('MB') || Boolean(sizeText), sizeText ?? '');

    // 2 — The multipart PUT + complete-upload fired with the metadata payload.
    await waitForPhaseActive(page, 'Pending', 15_000);
    const completeBody = world.completeBodies[0];
    check('simulated multipart PUT executed (presigned part)', world.partPuts === 1, `puts=${world.partPuts}`);
    check('complete-upload body carries the metadata (1.A) + targetQuality (10.8)',
      Boolean(completeBody?.parts?.length)
        && completeBody?.title === 'حلقة القلب والأوعية'
        && completeBody?.description === 'مراجعة شاملة لدورة القلب مع حالات سريرية.'
        && completeBody?.difficulty === 2
        && completeBody?.targetQuality === 'Auto',
      `title=${completeBody?.title} difficulty=${completeBody?.difficulty} target=${completeBody?.targetQuality} parts=${completeBody?.parts?.length}`);

    // 2b — Push 10.8 (1.C): the cancel button is HIDDEN while Pending (queued,
    //      not encoding) — it must appear only for Transcoding_* statuses.
    {
      const cancelCount = await page.getByTestId('cancel-processing-button').count();
      check('cancel button hidden while Pending (not encoding yet)', cancelCount === 0);
    }

    // 3 — The human ladder: each rung's exact Arabic sentence + active state.
    await waitForPhaseActive(page, 'Transcoding_360p');
    const phase360 = await page.getByTestId('processing-phase-Transcoding_360p').textContent();
    check('phase sentence SD (exact task-book Arabic, 10.8 vocabulary)',
      phase360?.includes('جاري إنشاء نسخة SD (مناسبة للجوال)...') ?? false, phase360 ?? '');
    const percent360 = await page.getByTestId('processing-bar-percent').textContent();
    check('animated bar reflects the 360p rung (~32%)', percent360?.includes('32') ?? false, percent360 ?? '');

    // 4 — Live processing chip on the episode row.
    await page.getByTestId(`episode-processing-chip-${EPISODE_ID}`).waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    const chipVisible = await page.getByTestId(`episode-processing-chip-${EPISODE_ID}`).isVisible().catch(() => false);
    check('episode row shows the live processing chip', chipVisible);

    await waitForPhaseActive(page, 'Transcoding_720p');
    const phase720 = await page.getByTestId('processing-phase-Transcoding_720p').textContent();
    check('phase sentence HD', phase720?.includes('جاري إنشاء نسخة HD (جودة عالية)...') ?? false, phase720 ?? '');

    await waitForPhaseActive(page, 'Transcoding_1080p');
    const phase1080 = await page.getByTestId('processing-phase-Transcoding_1080p').textContent();
    check('phase sentence FHD', phase1080?.includes('جاري إنشاء نسخة FHD (جودة فائقة)...') ?? false, phase1080 ?? '');
    await page.screenshot({ path: path.join(SHOT_DIR, 'admin-upload-02-ladder-1080p.png') });

    // 5 — Ready: the success sentence + full bar + row badge.
    await page.getByTestId('upload-ready-banner').waitFor({ state: 'visible', timeout: 20_000 });
    const readyText = await page.getByTestId('upload-ready-banner').textContent();
    check('Ready banner: الفيديو جاهز للمشاهدة ✅', readyText?.includes('الفيديو جاهز للمشاهدة ✅') ?? false);
    const percentFinal = await page.getByTestId('processing-bar-percent').textContent();
    check('bar completes at 100%', percentFinal?.includes('100') ?? false, percentFinal ?? '');

    const badgeText = await page.getByTestId(`episode-difficulty-${EPISODE_ID}`).textContent();
    check('episode row difficulty badge = صعب', badgeText === 'صعب', badgeText ?? '');

    await page.screenshot({ path: path.join(SHOT_DIR, 'admin-upload-03-ready.png') });

    // 6 — Edit modal: metadata prefilled + sent on the PUT (update endpoint).
    await page.getByTestId(`episode-edit-button-${EPISODE_ID}`).click();
    await page.getByTestId('episode-edit-modal').waitFor({ state: 'visible', timeout: 5_000 });
    const prefilledTitle = await page.getByTestId('episode-edit-title').inputValue();
    const prefilledDifficulty = await page.getByTestId('episode-edit-difficulty').inputValue();
    check('edit modal prefills title + difficulty from the episode',
      prefilledTitle === 'حلقة تجريبية — الدورة الدموية' && prefilledDifficulty === '2',
      `title="${prefilledTitle}" difficulty=${prefilledDifficulty}`);

    await page.getByTestId('episode-edit-title').fill('حلقة تجريبية — الدورة الدموية (مراجعة)');
    await page.getByTestId('episode-edit-difficulty').selectOption('0');
    await page.getByTestId('episode-edit-description').fill('وصف محدّث بعد المراجعة.');
    await page.getByTestId('episode-edit-save').click();
    await page.waitForTimeout(600);
    const editBody = world.editBodies[0];
    check('episode PUT (update endpoint) carries the metadata (1.A)',
      editBody?.title === 'حلقة تجريبية — الدورة الدموية (مراجعة)'
        && editBody?.difficulty === 0
        && editBody?.description === 'وصف محدّث بعد المراجعة.'
        && typeof editBody?.episodeNumber === 'number',
      `title=${editBody?.title} difficulty=${editBody?.difficulty}`);

    await context.close();
  }

  /* ============ Flow B — failed processing + error modal (1.C) ============ */
  {
    const world = makeWorld();
    world.mode = 'failed';
    const context = await newAdminContext(browser, { width: 1280, height: 800 }, world);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
    });

    await openCoursesDrawer(page);
    await runSimulatedUpload(page, world, {
      title: 'حلقة ستفشل معالجتها',
      description: 'اختبار نافذة الخطأ.',
      difficulty: 1,
    });

    // 7 — The dual-language modal opens on Failed.
    await page.getByTestId('upload-error-modal').waitFor({ state: 'visible', timeout: 20_000 });
    const headline = await page.getByTestId('processing-error-headline').textContent();
    check('error modal Arabic headline: عذراً، تعذر معالجة الفيديو.',
      headline?.includes('عذراً، تعذر معالجة الفيديو.') ?? false, headline ?? '');
    const human = await page.getByTestId('processing-error-human').textContent();
    check('error modal simplified human message present', Boolean(human && human.length > 10), (human ?? '').slice(0, 40));

    // 8 — Collapsible technical details (English, LTR monospace, FFmpeg log).
    await page.getByTestId('processing-error-details-toggle').click();
    const technical = await page.getByTestId('processing-error-technical-body').textContent();
    const technicalDir = await page.getByTestId('processing-error-technical-body').getAttribute('dir');
    check('collapsible technical details show the FFmpeg payload (LTR)',
      technicalDir === 'ltr' && (technical?.includes('ffmpeg') ?? false) && (technical?.includes('MEDIA_PROCESSING_FAILED') ?? false),
      `dir=${technicalDir} len=${technical?.length ?? 0}`);

    // 9 — Copy Error button → clipboard carries the technical payload.
    await page.getByTestId('processing-error-copy').click();
    await page.waitForTimeout(400);
    const clipboard = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    check('Copy Error → clipboard contains the technical payload',
      clipboard.includes('ffmpeg') && clipboard.includes('MEDIA_PROCESSING_FAILED'),
      `len=${clipboard.length}`);

    await page.screenshot({ path: path.join(SHOT_DIR, 'admin-upload-04-error-modal.png') });

    // 10 — Retry: re-arms the watcher + one forced poll → mock flips to Ready.
    world.retryArmed = true; // the "reprocessing succeeded" simulation
    await page.getByTestId('processing-error-retry').click();
    await page.getByTestId('upload-ready-banner').waitFor({ state: 'visible', timeout: 20_000 });
    check('Retry re-polls the pipeline → Ready banner', true);

    await context.close();
  }

  /* ============ Flow C — abort processing (Push 10.8 1.C) ============ */
  {
    const world = makeWorld();
    world.mode = 'stuck'; // parks at Transcoding_720p — the 58% production freeze
    const context = await newAdminContext(browser, { width: 1280, height: 800 }, world);
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
    });

    await openCoursesDrawer(page);
    await runSimulatedUpload(page, world, {
      title: 'حلقة عالقة في المعالجة',
      description: 'اختبار زر إلغاء المعالجة.',
      difficulty: 1,
    });

    // 11 — The encode parks at Transcoding_720p → the cancel button appears.
    await waitForPhaseActive(page, 'Transcoding_720p', 30_000);
    await page.getByTestId('cancel-processing-button').waitFor({ state: 'visible', timeout: 10_000 });
    const cancelLabel = await page.getByTestId('cancel-processing-button').textContent();
    check('إلغاء المعالجة button visible while encoding (Transcoding_720p)',
      cancelLabel?.includes('إلغاء المعالجة') ?? false, cancelLabel ?? '');

    // 12 — Click → POST abort-processing → the episode flips to Failed → the
    //      deliberate-cancel banner (NOT the generic upload-failure headline).
    await page.getByTestId('cancel-processing-button').click();
    await page.getByTestId('upload-error-banner').waitFor({ state: 'visible', timeout: 10_000 });
    check('abort-processing POST fired exactly once', world.abortCalls === 1, `calls=${world.abortCalls}`);
    const banner = await page.getByTestId('upload-error-banner').textContent();
    check('deliberate-cancel banner headline (تم إلغاء المعالجة)',
      (banner?.includes('تم إلغاء المعالجة') ?? false) && !(banner ?? '').includes('تعذّر إتمام الرفع'),
      (banner ?? '').slice(0, 80));

    // 13 — The button disappears once the episode is no longer encoding.
    await page.waitForTimeout(600);
    const cancelGone = (await page.getByTestId('cancel-processing-button').count()) === 0;
    check('cancel button disappears after the abort (Failed is terminal)', cancelGone);

    await page.screenshot({ path: path.join(SHOT_DIR, 'admin-upload-06-abort-processing.png') });
    await context.close();
  }

  /* ======== Flow D — tablet 768×1024: P360 dynamic timeline (10.8 1.B) ======== */
  {
    const world = makeWorld();
    world.mode = 'sd';
    world.targetQuality = 'P360'; // the episode echoes the stored target
    const context = await newAdminContext(browser, { width: 768, height: 1024 }, world);
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
    });

    await openCoursesDrawer(page);
    await page.getByRole('button', { name: /رفع وسائط/ }).click();

    const fieldsVisible = await page.getByPlaceholder('عنوان الحلقة').isVisible()
      && await page.getByTestId('upload-metadata-difficulty').isVisible()
      && await page.getByTestId('upload-metadata-description').isVisible()
      && await page.locator('input[type="file"]').isVisible();
    check('tablet 768px: upload form fields all visible', fieldsVisible);

    // 14 — Pick the video FIRST (the quality dropdown renders only for video
    //      picks), then select P360 → the complete-upload body carries it — the
    //      10.8 binding-chain evidence at the HTTP layer (the 10.7 gap dropped
    //      the key exactly here).
    await page.getByPlaceholder('عنوان الحلقة').fill('حلقة SD بخطوة واحدة');
    await page.getByTestId('upload-metadata-description').fill('اختبار الجدول الزمني الديناميكي.');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'lecture-sd.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(256 * 1024, 7),
    });
    await page.getByTestId('upload-metadata-target-quality').waitFor({ state: 'visible', timeout: 5_000 });
    await page.getByTestId('upload-metadata-target-quality').selectOption('P360');
    await page.getByTestId('upload-start-button').click();

    await waitForPhaseActive(page, 'Transcoding_360p', 25_000);
    const sdBody = world.completeBodies[0];
    check('complete-upload body carries targetQuality=P360 (10.8 binding fix)',
      sdBody?.targetQuality === 'P360', `target=${sdBody?.targetQuality}`);

    // 15 — The DYNAMIC timeline: exactly [Pending, SD, Ready]; the HD/FHD
    //      steps that will never run are NOT rendered.
    const phaseCount = await page.getByTestId('processing-phases').locator('li').count();
    const hdCount = await page.getByTestId('processing-phase-Transcoding_720p').count();
    const fhdCount = await page.getByTestId('processing-phase-Transcoding_1080p').count();
    check('P360 timeline: exactly 3 steps [Pending, SD, Ready] — HD/FHD hidden',
      phaseCount === 3 && hdCount === 0 && fhdCount === 0,
      `steps=${phaseCount} hd=${hdCount} fhd=${fhdCount}`);
    const sdSentence = await page.getByTestId('processing-phase-Transcoding_360p').textContent();
    check('single-rung sentence uses the SD vocabulary',
      sdSentence?.includes('جاري إنشاء نسخة SD (مناسبة للجوال)...') ?? false, sdSentence ?? '');

    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check('tablet 768px: no horizontal overflow', noOverflow);

    await page.screenshot({ path: path.join(SHOT_DIR, 'admin-upload-07-p360-dynamic-timeline.png') });
    await context.close();
  }

  /* ================= Report ================= */
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'-'.repeat(64)}`);
  console.log(`ADMIN UPLOAD E2E: ${results.length - failed.length}/${results.length} passed`);
  console.log(`Peak Chromium RSS: ${(peakChromeRssKb / 1024).toFixed(0)} MB (${peakChromeRssKb} KB) — ceiling 1638 MB`);
  console.log(`Console errors: ${consoleErrors.length}`);
  if (consoleErrors.length) consoleErrors.slice(0, 8).forEach((e) => console.log(`  ! ${e}`));
  if (failed.length) {
    failed.forEach((r) => console.log(`  FAIL: ${r.name} ${r.extra}`));
    process.exitCode = 1;
  }
} finally {
  clearInterval(sampler);
  await browser.close();
}
