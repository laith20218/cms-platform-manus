/**
 * Wave 11.9 — Library PDF upload + Ghostscript processing E2E (admin-web,
 * simulated through the REAL LibraryCenter with a mocked API).
 *
 * RAM contract (hard rule): ONE Chromium instance, --headless=new
 * --disable-gpu --disable-dev-shm-usage, scenarios in browser.newContext()s,
 * browser closed immediately. Ceiling 1.6GB — sampled at 400ms via ps.
 *
 * Playwright resolves from the workspace's student-web install (admin-web has
 * no Playwright devDep — same lockfile exception as admin-upload.e2e.mjs).
 *
 * Flows:
 *  A. Happy pipeline (desktop 1280×800): login-restore → Library → hierarchy
 *     picks → upload panel → file pick (application/pdf) → presigned PUT →
 *     complete-upload (assert the body still binds fileId/fileKey) → the
 *     R22.3 friendly phase timeline appears (رفع الملف ✓ → جاري فحص وإصلاح
 *     الخطوط العربية… + the reassurance sub-text + the ? tooltip) → the list
 *     poll walks Pending → Normalizing → Ready → the panel closes on its own
 *     with the success notice → the R22.4 placeholder button announces Wave 12.
 *  B. Failed processing (desktop): the pipeline lands on Failed with a
 *     diagnosticReport payload → ProcessingErrorModal (Push 10.4 pattern)
 *     with the R22.3 headline «تعذر معالجة الملف» + the collapsible
 *     «تفاصيل تقنية للدعم الفني» carrying the Arabic font report + GS evidence.
 *
 * Run (admin dev server on 127.0.0.1:5174):
 *   node e2e/admin-upload-pdf-processing.e2e.mjs
 */
// Playwright resolves from the workspace's student-web install (admin-web has
// no Playwright devDep — same lockfile exception as admin-upload.e2e.mjs).
// Env override first, then the pnpm workspace path, then bare resolution.
let chromium;
const PLAYWRIGHT_CANDIDATES = [
  process.env.E2E_PLAYWRIGHT_MODULE,
  'file:///home/z/cms-diag/cms-platform-manus/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs',
  'playwright',
].filter(Boolean);
for (const candidate of PLAYWRIGHT_CANDIDATES) {
  try { ({ chromium } = await import(candidate)); break; } catch { /* try next */ }
}
if (!chromium) {
  console.error('playwright module not found — set E2E_PLAYWRIGHT_MODULE');
  process.exit(1);
}
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE_URL = process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:5174';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));

const FILE_ID = 'F11.9E2E';
const FILE_KEY = 'library/e2e119/obj';
const PDF_TITLE = 'محاضرة القلب — النسخة المُصلحة';

const E2E_ADMIN_USER = {
  id: 'e2e-admin-001',
  phone: '+962790000001',
  fullName: 'مدير الاختبار',
  role: 'super_admin', // synthesizes the full ui-permissions bundle locally
  avatarUrl: null,
  university: { id: 'u1', nameAr: 'جامعة الاختبار' },
  college: { id: 'c1', nameAr: 'كلية الطب' },
};

const GS_FAILURE_LOG = [
  'PdfProcessingService: file F11.9E2E Ghostscript pass failed.',
  'gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite -dEmbedAllFonts=true -dSubsetFonts=true',
  'Unrecoverable error: typecheck in --pdf_write_embedded_font',
  'Ghostscript exited with code 1',
].join('\n');

// R22.2 — the backend's diagnosticReport shape (Arabic substitution report;
// on Failed rows the raw GS exit evidence rides the same payload).
const ARABIC_FONT_REPORT = [
  'الخط الأصلي (SakkalMajalla) غير مدمج، وتم استبداله بـ (Amiri).',
  'سجل الخادم: Ghostscript exited with code 1',
].join('\n');
const WAVE_12_TOAST = 'هذه الميزة ستكون متاحة في التحديث القادم (Wave 12).';

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
 * The shared mock world — route handlers are Node-side closures, so the list
 * endpoint walks the backend's PdfProcessingStatus ladder deterministically.
 */
function makeWorld() {
  return {
    mode: 'ladder', // 'ladder' | 'failed'
    listGets: 0,
    listGetsAfterComplete: 0,
    completeBodies: [],
  };
}

/** The admin content/files list — the processing status source of truth. */
function filesPayload(world) {
  if (world.completeUploads === 0) return { items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };

  world.listGetsAfterComplete += 1;
  let pdfProcessingStatus;
  let processingError = null;
  let diagnosticReport = null;
  if (world.mode === 'failed') {
    // Poll 1 rides Pending (complete-upload's commit), then terminal failure.
    pdfProcessingStatus = world.listGetsAfterComplete === 1 ? 'Pending' : 'Failed';
    if (pdfProcessingStatus === 'Failed') {
      processingError = GS_FAILURE_LOG;
      diagnosticReport = ARABIC_FONT_REPORT;
    }
  } else {
    // Each server phase persists for TWO polls (the CoursesCenter pacing
    // precedent): Pending 1-2, Normalizing 3-4, Ready 5+ → ~15s total at 3s.
    const ladder = ['Pending', 'Pending', 'Normalizing', 'Normalizing', 'Ready'];
    pdfProcessingStatus = ladder[Math.min(world.listGetsAfterComplete - 1, ladder.length - 1)];
    if (pdfProcessingStatus === 'Ready') {
      // R22.2 — a Ready row can carry a substitution report (exposed on the
      // wire; the upload panel surfaces failures only).
      diagnosticReport = 'الخط الأصلي (SakkalMajalla) غير مدمج، وتم استبداله بـ (Amiri).';
    }
  }

  return {
    items: [{
      id: FILE_ID,
      subjectId: 'sub1',
      lectureId: null,
      subjectNameAr: 'طب القلب',
      title: PDF_TITLE,
      type: 'Pdf',
      category: 'Lecture',
      fileSize: 262_144,
      durationSeconds: null,
      status: 'Draft',
      virusScanStatus: 'Clean',
      createdAt: new Date().toISOString(),
      pdfProcessingStatus,
      processingError,
      diagnosticReport,
      fontPipelineFixed: pdfProcessingStatus === 'Ready',
    }],
    total: 1,
    page: 1,
    pageSize: 25,
    totalPages: 1,
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
  await context.route('**/api/v1/**', (route) => {
    if (process.env.E2E_DEBUG) console.log('ABORT:', route.request().url());
    route.abort();
  });

  // Specific mocks LAST (highest priority — most exact patterns registered last).
  await context.route('**/health', (route) => route.fulfill({ json: { status: 'Healthy' } }));
  await context.route('**/api/v1/auth/refresh', (route) => route.fulfill({ json: { accessToken: 'e2e-access-2' } }));
  await context.route('**/api/v1/auth/admin/me/ui-permissions', (route) =>
    route.fulfill({ json: { mode: 'super_admin', isSuperAdmin: true, registryVersion: 'v1', allKeys: [], allowedKeys: [] } }));
  await context.route('**/api/v1/notifications/unread-count', (route) => route.fulfill({ json: { count: 0 } }));
  await context.route('**/api/v1/admin/dashboard', (route) =>
    route.fulfill({
      json: {
        totalStudents: 1250, activeStudentsToday: 310, totalQuestions: 4800,
        totalActiveCodes: 96, totalActiveSubscriptions: 640, totalLibraryFiles: 220,
        totalExams: 48, pendingReports: 3, monthlyRevenue: 4200, revenueChangePercent: 4.2,
      },
    }));
  await context.route('**/api/v1/admin/roles', (route) => route.fulfill({ json: [] }));
  await context.route('**/api/v1/admin/admins?*', (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 50, totalPages: 0 } }));

  // Academic hierarchy (single chain — the upload panel's subject options ride it).
  await context.route('**/api/v1/universities?*', (route) =>
    route.fulfill({ json: { items: [{ id: 'u1', nameAr: 'جامعة الاختبار' }], total: 1, page: 1, pageSize: 100, totalPages: 1 } }));
  await context.route('**/api/v1/universities/u1/colleges', (route) =>
    route.fulfill({ json: [{ id: 'c1', nameAr: 'كلية الطب' }] }));
  await context.route('**/api/v1/colleges/c1/years', (route) =>
    route.fulfill({ json: [{ id: 'y1', nameAr: 'السنة الأولى' }] }));
  await context.route('**/api/v1/years/y1/semesters', (route) =>
    route.fulfill({ json: [{ id: 's1', nameAr: 'الفصل الأول' }] }));
  await context.route('**/api/v1/semesters/s1/subjects', (route) => {
    if (process.env.E2E_DEBUG) console.log('SUBJECTS-FETCH:', route.request().url());
    route.fulfill({ json: [{ id: 'sub1', nameAr: 'طب القلب', nameEn: 'Cardiology' }] });
  });
  await context.route('**/api/v1/admin/content/academic/subjects/*/lectures', (route) =>
    route.fulfill({ json: [] }));

  // THE POLL — /api/v1/admin/content/files.
  await context.route('**/api/v1/admin/content/files?*', (route) => {
    world.listGets += 1;
    route.fulfill({ json: filesPayload(world) });
  });

  // Upload flow.
  await context.route('**/api/v1/library/upload-url', (route) => {
    const method = route.request().method();
    if (process.env.E2E_DEBUG) console.log('UPLOAD-URL-HIT:', method, route.request().url().slice(0, 90));
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*' } });
    if (method !== 'POST') return route.abort();
    route.fulfill({ json: { uploadUrl: `${BASE_URL}/mock-storage-put`, fileKey: FILE_KEY, fileId: FILE_ID } });
  });
  await context.route('**/mock-storage-put', (route) => {
    const method = route.request().method();
    if (process.env.E2E_DEBUG) console.log('STORAGE-PUT-HIT:', method, route.request().url());
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'PUT, OPTIONS', 'Access-Control-Allow-Headers': '*' } });
    if (method !== 'PUT') return route.abort();
    route.fulfill({ status: 200 });
  });
  await context.route('**/api/v1/library/complete-upload', (route) => {
    const method = route.request().method();
    if (process.env.E2E_DEBUG) console.log('COMPLETE-HIT:', method, route.request().url().slice(0, 90), 'raw=', route.request().postData()?.slice(0, 120));
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': '*' } });
    if (method !== 'POST') return route.abort();
    let parsed = {};
    try { parsed = JSON.parse(route.request().postData() ?? '{}'); } catch { /* malformed body surfaces in the assertion */ }
    world.completeBodies.push(parsed);
    world.completeUploads += 1;
    // The backend DTO answer: Pending rides the response (FontPipelineFixed false —
    // the worker has not produced the {key}-fixed object yet).
    route.fulfill({ json: {
      id: FILE_ID, subjectId: 'sub1', lectureId: null, type: 'Pdf', category: 'Lecture',
      title: PDF_TITLE, description: null, fileSize: 262_144, fileFormat: 'application/pdf',
      durationSeconds: null, pagesCount: null, thumbnailUrl: null, youtubeVideoId: null,
      tags: [], viewsCount: 0, favoritesCount: 0, createdAt: new Date().toISOString(),
      difficulty: 'Easy', processingStatus: null, processingError: null, hlsKey: null,
      targetQuality: 'Auto', pdfProcessingStatus: 'Pending', fontPipelineFixed: false,
      fontProcessingError: null, diagnosticReport: null,
    } });
  });

  return context;
}

/** Navigates to the Library files tab with the hierarchy picked. */
async function openLibraryFiles(page) {
  await page.goto(`${BASE_URL}/`);
  await page.waitForTimeout(2500);
  if (process.env.E2E_DEBUG) {
    const buttons = await page.locator('button').allTextContents().catch(() => []);
    const links = await page.locator('a').allTextContents().catch(() => []);
    const body = await page.locator('body').textContent().catch(() => '');
    console.log('DEBUG buttons:', JSON.stringify(buttons.slice(0, 20).map((t) => t.trim()).filter(Boolean)));
    console.log('DEBUG links:', JSON.stringify(links.slice(0, 12).map((t) => t.trim()).filter(Boolean)));
    console.log('DEBUG body[:300]:', (body ?? '').slice(0, 300));
    await page.screenshot({ path: path.join(SHOT_DIR, 'debug-pdf-e2e-boot.png') });
  }
  const menuToggle = page.getByRole('button', { name: 'فتح القائمة', exact: true });
  if (await menuToggle.isVisible().catch(() => false)) {
    await menuToggle.click();
  }
  await page.getByRole('button', { name: 'المكتبة والملفات' }).first().click();
  await page.getByRole('tab', { name: 'الملفات' }).waitFor({ timeout: 10_000 });
  if (process.env.E2E_DEBUG) {
    const comboCount = await page.getByRole('combobox').count();
    const labels = await page.evaluate(() =>
      Array.from(document.querySelectorAll('label')).map((l) => l.textContent?.trim().slice(0, 30)).filter(Boolean).slice(0, 14),
    );
    console.log('DEBUG comboboxes:', comboCount, 'labels:', JSON.stringify(labels));
  }

  // Academic hierarchy by LABEL (nth indexing is fragile — a status filter
  // select also lives on this page). NOTE: the wrapping <label> repeats the
  // caption text (span + placeholder option), so exact matching never hits —
  // substring it is; each caption is unique among labels.
  // The semester pick loads the upload panel's subject options.
  await page.getByLabel('الجامعة').first().selectOption('u1');
  await page.waitForTimeout(250);
  await page.getByLabel('الكلية').first().selectOption('c1');
  await page.waitForTimeout(250);
  await page.getByLabel('السنة').first().selectOption('y1');
  await page.waitForTimeout(250);
  await page.getByLabel('الفصل').first().selectOption('s1');
  await page.waitForTimeout(500);
  if (process.env.E2E_DEBUG) {
    const selects = await page.evaluate(() =>
      Array.from(document.querySelectorAll('select')).map((s) => ({
        label: s.closest('label')?.textContent?.trim().slice(0, 24),
        value: s.value,
        disabled: s.disabled,
        options: Array.from(s.options).map((o) => o.value).slice(0, 4),
      })),
    );
    console.log('DEBUG selects:', JSON.stringify(selects));
  }
}

/** Opens the upload panel and runs a simulated PDF upload. */
async function runSimulatedPdfUpload(page, world, title) {
  await page.getByRole('button', { name: 'رفع ملف', exact: true }).first().click();
  await page.getByLabel('العنوان').fill(title);

  // The panel's own subject select, scoped to the slide-in <aside>: a bare
  // getByLabel('المادة') also substring-matches the hierarchy filter select AND
  // the panel's lecture select ("على مستوى المادة") — .last() then lands on the
  // disabled lecture select.
  const panelSubject = page.locator('aside').getByLabel('المادة').first();
  await panelSubject.selectOption('sub1');

  await page.locator('aside input[type="file"]').setInputFiles({
    name: 'lecture-heart.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(128 * 1024, 5),
  });
  await page.getByRole('button', { name: 'رفع', exact: true }).click();
  if (process.env.E2E_DEBUG) {
    await page.waitForTimeout(4000);
    const toasts = await page.locator('[data-sonner-toast]').allTextContents().catch(() => []);
    console.log('DEBUG toasts:', JSON.stringify(toasts));
  }
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
  /* ================= Flow A — happy pipeline (1280×800) ================= */
  {
    const world = makeWorld();
    const context = await newAdminContext(browser, { width: 1280, height: 800 }, world);
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
    });
    if (process.env.E2E_DEBUG) {
      page.on('pageerror', (err) => console.log('PAGE-ERR:', String(err).slice(0, 300)));
      page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE-ERR:', msg.text().slice(0, 200)); });
    }

    await openLibraryFiles(page);
    await runSimulatedPdfUpload(page, world, PDF_TITLE);

    // 1 — The panel switched to the phase timeline (the form no longer closes on
    //     upload). This is downstream of complete-upload, so the captured body
    //     below is guaranteed to have landed (no ordering race).
    await page.getByTestId('pdf-processing-timeline').waitFor({ state: 'visible', timeout: 15_000 });
    check('upload panel shows the Ghostscript phase timeline', true);

    // 2 — The upload PUT really hit the presigned URL, and complete-upload bound
    //     the identity pair the pipeline keys on.
    const body = world.completeBodies[0];
    check('complete-upload body binds fileId + fileKey',
      body?.fileId === FILE_ID && body?.fileKey === FILE_KEY,
      `body=${JSON.stringify(body)?.slice(0, 140) ?? '<missing>'}`);

    // 3 — R22.3: the fonts step speaks HUMAN Arabic (no "Ghostscript" jargon)
    //     and carries the reassurance sub-text while the pipeline runs.
    await page.waitForFunction(
      () => document.querySelector('[data-testid="pdf-phase-fonts"]')?.textContent?.includes('فحص وإصلاح الخطوط') ?? false,
      undefined,
      { timeout: 20_000 },
    );
    const fontsLabel = await page.getByTestId('pdf-phase-fonts').textContent();
    check('fonts step uses the friendly Arabic label (jargon-free)',
      (fontsLabel ?? '').includes('فحص وإصلاح الخطوط العربية'), fontsLabel ?? '');

    await page.getByTestId('pdf-phase-fonts-sub').waitFor({ state: 'visible', timeout: 10_000 });
    const fontsSub = await page.getByTestId('pdf-phase-fonts-sub').textContent();
    check('fonts step carries the font-embedding sub-text',
      (fontsSub ?? '').includes('نقوم بدمج الخطوط لضمان أفضل جودة للعرض'), fontsSub ?? '');

    // 3b — R22.3 UI polish: the ? tooltip next to «معالجة الخطوط» carries the
    //      exact task-book sentence.
    const tooltipTitle = await page.getByTestId('pdf-fonts-tooltip')
      .getAttribute('title', { timeout: 10_000 }).catch(() => null);
    check('the ? tooltip carries the task-book sentence',
      (tooltipTitle ?? '').includes('متصلاً وسليماً على جميع الأجهزة'), tooltipTitle ?? '');

    // 4 — The ladder resolves: the timeline unmounts when the completion effect
    //     closes the panel (Ready at poll 5 → ~15s at the 3s cadence).
    await page.getByTestId('pdf-processing-timeline').waitFor({ state: 'detached', timeout: 30_000 });
    check('timeline resolves and the panel closes on Ready', true);

    // 5 — The success notice (sonner toast) + the fixed row is in the table.
    const toastText = await page.locator('[data-sonner-toast]')
      .first().textContent({ timeout: 10_000 }).catch(() => '');
    check('success notice announces the font fix', (toastText ?? '').includes('تم إصلاح خطوط الملف'), toastText ?? '');
    const rowVisible = await page.getByRole('cell', { name: PDF_TITLE }).first().isVisible().catch(() => false);
    check('the fixed file row is visible in the files table', rowVisible);

    // 6 — R22.4: the Wave 12 placeholder button rides every PDF row and the
    //     toast announces the roadmap (NO backend behind it yet). The success
    //     notice may still be on screen — wait for the NEW toast by content.
    const convertBtn = page.getByTestId('convert-images-btn').first();
    await convertBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await convertBtn.click();
    const waveToast = await page.locator('[data-sonner-toast]')
      .filter({ hasText: 'Wave 12' })
      .first().textContent({ timeout: 10_000 }).catch(() => '');
    check('the convert-to-images placeholder announces Wave 12',
      (waveToast ?? '').includes('Wave 12') && (waveToast ?? '').includes('ستكون متاحة'), waveToast ?? '');
    const convertLabel = await convertBtn.getAttribute('aria-label');
    check('the convert button carries the task-book label',
      (convertLabel ?? '').includes('تحويل إلى صور عالية الجودة'), convertLabel ?? '');

    await page.screenshot({ path: path.join(SHOT_DIR, 'admin-upload-08-pdf-processing-ready.png') });
    await context.close();
  }

  /* ================= Flow B — failed processing (1280×800) ================= */
  {
    const world = makeWorld();
    world.mode = 'failed';
    const context = await newAdminContext(browser, { width: 1280, height: 800 }, world);
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
    });

    await openLibraryFiles(page);
    await runSimulatedPdfUpload(page, world, PDF_TITLE);

    // 6 — The failure modal (Push 10.4 pattern) opens on Failed.
    await page.getByTestId('pdf-processing-error-modal').waitFor({ state: 'visible', timeout: 30_000 });
    check('ProcessingErrorModal opens when the Ghostscript pass fails', true);

    // 7 — R22.3: the collapsible support section «تفاصيل تقنية للدعم الفني»
    //     carries the Arabic diagnosticReport WITH the GS exit evidence.
    const toggle = page.getByTestId('processing-error-details-toggle');
    await toggle.waitFor({ state: 'visible', timeout: 10_000 });
    const toggleLabel = await toggle.textContent();
    check('the support collapsible uses the R22.3 Arabic label',
      (toggleLabel ?? '').includes('تفاصيل تقنية للدعم الفني'), toggleLabel ?? '');
    await toggle.click();
    const supportBody = await page.getByTestId('processing-error-technical-body')
      .textContent({ timeout: 5_000 }).catch(() => '');
    check('the support block carries the Arabic report + GS evidence',
      (supportBody ?? '').includes('الخط الأصلي (SakkalMajalla)')
      && (supportBody ?? '').includes('Ghostscript exited with code 1'), (supportBody ?? '').slice(0, 90));

    // 8 — R22.3: the modal headline is file-appropriate (no "الفيديو" for PDFs).
    const headline = await page.getByTestId('processing-error-headline').textContent().catch(() => '');
    check('the failure headline says the FILE could not be processed',
      (headline ?? '').includes('تعذر معالجة الملف'), headline ?? '');

    await page.screenshot({ path: path.join(SHOT_DIR, 'admin-upload-09-pdf-processing-failed.png') });
    await context.close();
  }

  /* ================= Report ================= */
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${'-'.repeat(64)}`);
  console.log(`PDF PROCESSING E2E: ${results.length - failed.length}/${results.length} passed`);
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
