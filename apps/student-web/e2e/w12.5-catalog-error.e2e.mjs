/**
 * Wave 12.5.A — e2e: the exams catalog error card (the Group-1 reference fix).
 *
 * Scenario: the student's entitlements resolve, but EVERY per-subject exams fetch
 * fails (500s) → the page must render the honest error card with a retry button —
 * NEVER the old false empty state (the `catch { exams: [] }` swallow). §13 spot:
 * 375px, zero horizontal scroll, retry target ≥44px, screenshot.
 *
 * Run (dev server on 127.0.0.1:5173):  node e2e/w12.5-catalog-error.e2e.mjs
 */
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';
const SHOT_DIR = fileURLToPath(new URL('./screenshots/', import.meta.url));

const E2E_USER = {
  id: 'e2e-u-005', phone: '+962790000003', fullName: 'طالب الخطأ',
  role: 'student', avatarUrl: null,
  university: { id: 'u-1', nameAr: 'جامعة الاختبار' }, college: { id: 'c-1', nameAr: 'كلية الطب' },
};
const ENTITLEMENT_TOKEN = [
  Buffer.from(JSON.stringify({ expiresAt: new Date(Date.now() + 3600_000).toISOString() })).toString('base64url'),
  'e2e', 'sig',
].join('.');

const MY_SUBJECTS = [
  { id: 'sub-1', slug: 'sub-1', nameAr: 'الباطنة', contentScopes: ['QuestionsExams'] },
  { id: 'sub-2', slug: 'sub-2', nameAr: 'الجراحة', contentScopes: ['QuestionsExams'] },
];

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log(`${ok ? '  PASS' : '! FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    headless: true,
    args: ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox', '--hide-scrollbars'],
  });

  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ar', hasTouch: true });
    await context.addInitScript(() => {
      sessionStorage.setItem('cms-access-token', 'e2e-dummy-access');
      sessionStorage.setItem('cms-refresh-token', 'e2e-dummy-refresh');
    });

    await context.route('**/api/v1/**', (route) => route.abort());
    await context.route('**/api/v1/auth/me', (route) => route.fulfill({ json: E2E_USER }));
    await context.route('**/api/v1/entitlements/issue', (route) =>
      route.fulfill({ json: { token: ENTITLEMENT_TOKEN } }));
    await context.route('**/api/v1/subjects/my-subjects**', (route) => route.fulfill({
      json: { items: MY_SUBJECTS },
    }));
    // EVERY per-subject exams fetch fails (the swallow used to hide this).
    await context.route(/\/api\/v1\/exams\/by-subject\//, (route) =>
      route.fulfill({ status: 500, json: { title: 'Server Error' } }));
    // Entitlement self-heal re-issue succeeds (retry then re-fails → honest card).
    await context.route('**/api/v1/subjects/*/lectures**', (route) => route.fulfill({ json: { items: [] } }));
    await context.route(/\/api\/v1\/library\/subject\//, (route) => route.fulfill({ json: { items: [] } }));
    await context.route(/\/api\/v1\/courses\/subject\//, (route) => route.fulfill({ json: [] }));

    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error instanceof Error ? error.message : String(error)));

    await page.goto(`${BASE_URL}/my-studies?tab=exams`, { timeout: 60_000 });

    // The error card (NOT the empty state) — the Group-1 contract.
    const card = page.locator('[data-testid="exams-catalog-error"]');
    await card.waitFor({ state: 'visible', timeout: 15_000 });
    check('12.5-A: exams catalog renders the ERROR card on total failure', true);
    check(
      '12.5-A: card copy is the honest failure (not "no exams")',
      (await card.innerText()).includes('تعذّر تحميل الاختبارات'),
    );
    const retryVisible = await page.locator('[data-testid="exams-catalog-error"] button:has-text("إعادة المحاولة")').isVisible();
    check('12.5-A: retry action visible', retryVisible);

    // §13 spot @375px: zero horizontal scroll + ≥44px retry target.
    const layout = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="exams-catalog-error"] button');
      const box = btn ? btn.getBoundingClientRect() : null;
      return {
        pageNoHScroll: document.documentElement.scrollWidth <= window.innerWidth,
        retryH: box ? Math.round(box.height) : null,
      };
    });
    check('12.5-A §13 @375px: zero horizontal scroll', layout.pageNoHScroll);
    check('12.5-A §13 @375px: retry target ≥44px', (layout.retryH ?? 0) >= 44, `h=${layout.retryH}`);

    await page.screenshot({ path: `${SHOT_DIR}w12.5-catalog-error-375.png` });

    // And the PRACTICE tab (same Group-1 contract, different catalog).
    await page.goto(`${BASE_URL}/my-studies?tab=practice`, { timeout: 60_000 });
    await page.locator('[data-testid="practice-catalog-error"]').waitFor({ state: 'visible', timeout: 15_000 });
    check('12.5-A: practice catalog renders the ERROR card on total failure', true);

    check('12.5-A: zero page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
    await context.close();
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n==== w12.5-catalog-error: ${results.length - failed} passed / ${failed} failed (of ${results.length}) ====\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('SPEC CRASHED:', error);
  process.exit(2);
});
