/**
 * R69 — Courses 403 truthfulness E2E (content-scope semantics + issue guard).
 *
 * Workorder §3.E: mock GET /courses/subject to return 403 with a "no grants"
 * reason and assert the UI shows the "No subscription" card, NOT the device
 * card. Companion scenarios cover the §2.D locked state (no VideoAudio
 * subject) and the generic device-card fallback (empty 403 body).
 *
 * Harness contract mirrors w13.2-hotfix.e2e.mjs (sessionStorage auth + route
 * mocks + screenshots). Run (dev server on 127.0.0.1:5173):
 *   node e2e/r69-courses-scope.e2e.mjs
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));

const E2E_USER = {
  id: 'e2e-u-r69', phone: '+963936185126', fullName: 'طالب الاختبار R69',
  role: 'student', avatarUrl: null,
  university: { id: 'u-1', nameAr: 'جامعة الاختبار' }, college: { id: 'c-1', nameAr: 'كلية الطب' },
};

const VIDEO_SUBJECT = { id: 's1', slug: 'مادة-فيديو', nameAr: 'تشريح مرضي', contentScopes: ['VideoAudio'] };
const TEXT_ONLY_SUBJECT = { id: 's2', slug: 'مادة-نصية', nameAr: 'مادة نصية', contentScopes: ['LecturesText'] };

const NO_GRANTS_REASON = 'No active grants for this student.';

/** Harness token — payload MUST carry a future expiresAt (entitlement-api readExpiry). */
const validIssueToken = () =>
  `${Buffer.from(JSON.stringify({ expiresAt: new Date(Date.now() + 3600_000).toISOString() })).toString('base64url')}.e2e-sig`;

let passed = 0;
let failed = 0;

function ok(condition, label) {
  if (condition) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.log(`  ✗ ${label}`); }
}

/** Route world for one scenario. */
async function mockWorld(context, { subjects, coursesStatus, coursesBody, issueStatus, issueBody }) {
  await context.route('**/api/v1/**', (route) => route.abort());
  await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
  await context.route('**/api/v1/subjects/my-subjects**', (route) => route.fulfill({ json: { items: subjects } }));
  await context.route('**/api/v1/entitlements/issue', (route) => {
    if (issueStatus === 200) return route.fulfill({ json: { token: validIssueToken() } });
    return route.fulfill({ status: issueStatus, contentType: 'application/problem+json', json: issueBody });
  });
  await context.route('**/api/v1/courses/subject/**', (route) => {
    if (coursesStatus === 200) return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: coursesStatus, contentType: 'application/problem+json', json: coursesBody ?? {} });
  });
}

async function openCourses(browser, viewport) {
  const context = await browser.newContext({ viewport, locale: 'ar' });
  await context.addInitScript(() => {
    try {
      sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
      sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
    } catch { /* ignore */ }
  });
  return context;
}

async function run() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true });
  const errors = [];

  try {
    // ============ Scenario A — §3.E: 403 + "no grants" reason → No-subscription card ============
    console.log('Scenario A: /courses/subject 403 "No active grants" → No-subscription card');
    {
      const context = await openCourses(browser, { width: 1280, height: 800 });
      context.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
      await mockWorld(context, {
        subjects: [VIDEO_SUBJECT],
        coursesStatus: 403, coursesBody: { detail: NO_GRANTS_REASON },
        issueStatus: 403, issueBody: { detail: NO_GRANTS_REASON },
      });
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/my-studies?tab=courses`, { waitUntil: 'domcontentloaded' });
      const card = page.getByTestId('courses-entitlement-error');
      await card.waitFor({ state: 'visible', timeout: 15_000 });
      ok((await card.getAttribute('data-variant')) === 'no-grants', 'card variant is no-grants');
      ok(await card.getAttribute('role') === 'alert', 'card has role=alert (WCAG 2.2 AA)');
      ok(await page.getByTestId('entitlement-login-link').count() === 0, 'NO login button on the no-subscription card');
      ok(await page.getByTestId('entitlement-activate-link').getAttribute('href') === '/activate-code', 'activation CTA points at /activate-code');
      ok(await page.getByTestId('entitlement-retry-button').count() === 1, 'retry button present (≥44px target)');
      await page.screenshot({ path: `${SHOT_DIR}r69-no-grants-desktop.png`, fullPage: false });
      ok(fs.existsSync(`${SHOT_DIR}r69-no-grants-desktop.png`), 'desktop screenshot saved');
      await context.close();
    }

    // ============ Scenario B — same denial on mobile 375 (§13 contract) ============
    console.log('Scenario B: no-subscription card at 375px');
    {
      const context = await openCourses(browser, { width: 375, height: 667 });
      context.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
      await mockWorld(context, {
        subjects: [VIDEO_SUBJECT],
        coursesStatus: 403, coursesBody: { detail: NO_GRANTS_REASON },
        issueStatus: 403, issueBody: { detail: NO_GRANTS_REASON },
      });
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/my-studies?tab=courses`, { waitUntil: 'domcontentloaded' });
      const card = page.getByTestId('courses-entitlement-error');
      await card.waitFor({ state: 'visible', timeout: 15_000 });
      ok((await card.getAttribute('data-variant')) === 'no-grants', '375px: card variant is no-grants');
      const box = await page.getByTestId('entitlement-retry-button').boundingBox();
      ok(!!box && box.height >= 44 && box.width >= 44, '375px: retry target ≥44×44px');
      await page.screenshot({ path: `${SHOT_DIR}r69-no-grants-mobile.png`, fullPage: false });
      ok(fs.existsSync(`${SHOT_DIR}r69-no-grants-mobile.png`), 'mobile screenshot saved');
      await context.close();
    }

    // ============ Scenario C — §2.D locked state (no VideoAudio subject at all) ============
    console.log('Scenario C: LecturesText-only subject → truthful locked state, zero /courses/ calls');
    {
      const context = await openCourses(browser, { width: 375, height: 667 });
      context.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
      let coursesCalled = 0;
      await context.route('**/api/v1/**', (route) => route.abort());
      await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
      await context.route('**/api/v1/subjects/my-subjects**', (route) => route.fulfill({ json: { items: [TEXT_ONLY_SUBJECT] } }));
      await context.route('**/api/v1/courses/subject/**', (route) => { coursesCalled += 1; return route.fulfill({ status: 403, json: { detail: NO_GRANTS_REASON } }); });
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/my-studies?tab=courses`, { waitUntil: 'domcontentloaded' });
      await page.getByTestId('locked-empty-state').waitFor({ state: 'visible', timeout: 15_000 });
      ok(await page.getByText('لا توجد كورسات فيديو متاحة لحسابك. يرجى تفعيل اشتراك.').count() === 1, 'spec locked-state text rendered');
      ok(coursesCalled === 0, 'NO /courses/subject call for a non-video subject');
      await page.screenshot({ path: `${SHOT_DIR}r69-locked-mobile.png`, fullPage: false });
      ok(fs.existsSync(`${SHOT_DIR}r69-locked-mobile.png`), 'locked-state screenshot saved');
      await context.close();
    }

    // ============ Scenario D — empty 403 body → generic device fallback ============
    console.log('Scenario D: empty 403 body (Forbid()) → device card fallback with login link');
    {
      const context = await openCourses(browser, { width: 1280, height: 800 });
      context.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
      await mockWorld(context, {
        subjects: [VIDEO_SUBJECT],
        coursesStatus: 403, coursesBody: {},
        issueStatus: 200, issueBody: null,
      });
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/my-studies?tab=courses`, { waitUntil: 'domcontentloaded' });
      const card = page.getByTestId('courses-entitlement-error');
      await card.waitFor({ state: 'visible', timeout: 15_000 });
      ok((await card.getAttribute('data-variant')) === 'device', 'unknown reason falls back to device card');
      ok(await page.getByTestId('entitlement-login-link').getAttribute('href') === '/login', 'login link kept for the generic card');
      await page.screenshot({ path: `${SHOT_DIR}r69-device-fallback-desktop.png`, fullPage: false });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\nR69 e2e: ${passed} passed, ${failed} failed, console errors: ${errors.length}`);
  // NOTE: 'Failed to load resource: 403' lines are the browser's own logs of the
  // MOCKED denial responses this suite serves on purpose — they are not app errors.
  const appErrors = errors.filter((text) => !text.includes('Failed to load resource'));
  if (appErrors.length) console.log('app console errors:', appErrors.slice(0, 5));
  process.exit(failed > 0 || appErrors.length > 0 ? 1 : 0);
}

run().catch((error) => { console.error(error); process.exit(1); });
