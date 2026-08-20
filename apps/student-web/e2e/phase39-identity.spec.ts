import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';

const redisDatabase = process.env.E2E_REDIS_DB ?? '15';
const testRunBase = 10_000_000 + (Date.now() % 89_000_000);
let userSequence = 0;

function newStudent() {
  userSequence += 1;
  const suffix = String(testRunBase + userSequence).padStart(8, '0');
  return {
    phone: `09${suffix}`,
    password: 'Phase39Pass1!x',
    fullName: `طالب مرحلة 39 ${userSequence}`,
  };
}

async function readIssuedOtp(phone: string, excludedOtp?: string): Promise<string> {
  const key = `otp:${phone.replace(/^0/, '+963')}`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const rawValue = execFileSync('redis-cli', ['-n', redisDatabase, '--raw', 'GET', key], { encoding: 'utf8' }).trim();
    const value = rawValue.startsWith('"') ? JSON.parse(rawValue) as string : rawValue;
    if (/^\d{6}$/.test(value) && value !== excludedOtp) return value;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`No six-digit OTP was issued to Redis key ${key}.`);
}

async function registerForOtp(page: Page) {
  const student = newStudent();
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'إنشاء حساب جديد' })).toBeVisible();

  await page.locator('input[type="text"]').fill(student.fullName);
  await page.locator('input[type="tel"]').fill(student.phone);
  await page.locator('input[type="password"]').nth(0).fill(student.password);
  await page.locator('input[type="password"]').nth(1).fill(student.password);

  const selects = page.locator('select');
  await expect(selects.nth(0).locator('option')).toHaveCount(2, { timeout: 10_000 });
  await selects.nth(0).selectOption({ index: 1 });
  await expect(selects.nth(1)).toBeEnabled();
  await expect(selects.nth(1).locator('option')).toHaveCount(2, { timeout: 10_000 });
  await selects.nth(1).selectOption({ index: 1 });
  await expect(selects.nth(2)).toBeEnabled();
  await expect(selects.nth(2).locator('option')).toHaveCount(2, { timeout: 10_000 });
  await selects.nth(2).selectOption({ index: 1 });

  await page.locator('label').filter({ has: page.locator('input[type="checkbox"]') }).locator('span').first().click();
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page).toHaveURL(/\/verify-otp$/);
  return { student, otp: await readIssuedOtp(student.phone) };
}

async function completeOtpInBrowser(page: Page, otp: string) {
  const otpInputs = page.locator('input[inputmode="numeric"]');
  await expect(otpInputs).toHaveCount(6);
  for (const [index, digit] of [...otp].entries()) await otpInputs.nth(index).fill(digit);
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'تسجيل الخروج' })).toBeVisible();
}

async function registerAndAuthenticate(page: Page) {
  const { student, otp } = await registerForOtp(page);
  await completeOtpInBrowser(page, otp);
  return student;
}

async function browserApi(page: Page, path: string, payload?: unknown, bearer = true, installationOverride?: string) {
  return page.evaluate(async ({ path, payload, bearer, installationOverride }) => {
    const accessToken = sessionStorage.getItem('cms-access-token');
    const installationId = installationOverride ?? localStorage.getItem('cms-device-fingerprint');
    const response = await fetch(`/api/v1/auth${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Fingerprint': installationId ?? '',
        ...(bearer && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    return { status: response.status, body: await response.text() };
  }, { path, payload, bearer, installationOverride });
}

async function currentTokens(page: Page) {
  return page.evaluate(() => ({
    access: sessionStorage.getItem('cms-access-token'),
    refresh: sessionStorage.getItem('cms-refresh-token'),
    installation: localStorage.getItem('cms-device-fingerprint'),
  }));
}

test.describe.serial('Phase 39 — Same Identity browser evidence', () => {
  test('redirects a visitor without a session away from a protected route', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
  });

  test('replaces a legacy installation value during the real registration request and keeps the replacement stable', async ({ page }) => {
    await page.goto('/register');
    await page.evaluate(() => localStorage.setItem('cms-device-fingerprint', 'legacy-browser-fingerprint'));
    const { student } = await registerForOtp(page);
    const afterRegistration = await currentTokens(page);
    expect(afterRegistration.installation).toMatch(/^web-[a-f0-9]{32}$/);
    expect(afterRegistration.installation).not.toBe('legacy-browser-fingerprint');
    await page.reload();
    expect((await currentTokens(page)).installation).toBe(afterRegistration.installation);
    expect(student.phone).toMatch(/^09\d{8}$/);
  });

  test('registers through real academic selectors, reads the issued OTP from Redis, and authenticates', async ({ page }) => {
    await registerAndAuthenticate(page);
    const tokens = await currentTokens(page);
    expect(tokens.access).toBeTruthy();
    expect(tokens.refresh).toBeTruthy();
    expect(tokens.installation).toMatch(/^web-[a-f0-9]{32}$/);
  });

  test('logs in an activated student through the UI and restores an authenticated protected state', async ({ page }) => {
    const student = await registerAndAuthenticate(page);
    await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.locator('input[type="tel"]').fill(student.phone);
    await page.locator('input[type="password"]').fill(student.password);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const tokens = await currentTokens(page);
    expect(tokens.access).toBeTruthy();
    expect(tokens.refresh).toBeTruthy();
  });

  test('rejects OTP without its installation binding and accepts it only from the registering installation', async ({ page }) => {
    const { student, otp } = await registerForOtp(page);
    const registeredInstallation = (await currentTokens(page)).installation;
    expect(registeredInstallation).toMatch(/^web-[a-f0-9]{32}$/);

    const missingInstallation = await page.evaluate(async ({ phone, otp }) => {
      const response = await fetch('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otpCode: otp }),
      });
      return { status: response.status, body: await response.text() };
    }, { phone: student.phone, otp });
    expect(missingInstallation.status).toBe(400);

    const invalidOtp = await browserApi(page, '/verify-otp', {
      phone: student.phone,
      otpCode: '000000',
      installationId: registeredInstallation,
    }, false);
    expect(invalidOtp.status).toBe(400);
    expect(invalidOtp.body).toContain('OTP_INVALID');

    const differentInstallation = 'web-fedcba9876543210fedcba9876543210';
    const mismatch = await browserApi(page, '/verify-otp', {
      phone: student.phone,
      otpCode: otp,
      installationId: differentInstallation,
    }, false, differentInstallation);
    expect(mismatch.status).toBe(400);
    expect(mismatch.body).toContain('OTP_INSTALLATION_MISMATCH');

    await completeOtpInBrowser(page, otp);
    const replayedOtp = await browserApi(page, '/verify-otp', {
      phone: student.phone,
      otpCode: otp,
      installationId: registeredInstallation,
    }, false);
    expect(replayedOtp.status).toBe(400);
    expect(replayedOtp.body).toContain('OTP_EXPIRED');
  });

  test('permits only one successful session when the same OTP is submitted concurrently', async ({ page }) => {
    const { student, otp } = await registerForOtp(page);
    const results = await page.evaluate(async ({ phone, otp }) => {
      const installationId = localStorage.getItem('cms-device-fingerprint');
      const submit = async () => {
        const response = await fetch('/api/v1/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Device-Fingerprint': installationId ?? '' },
          body: JSON.stringify({ phone, otpCode: otp, installationId }),
        });
        return response.status;
      };
      return Promise.all([submit(), submit()]);
    }, { phone: student.phone, otp });
    expect(results.filter(status => status === 200)).toHaveLength(1);
    expect(results.filter(status => status === 400)).toHaveLength(1);
  });

  test('rejects an OTP that has expired from the real Redis cache before a session is created', async ({ page }) => {
    const { student, otp } = await registerForOtp(page);
    const normalizedPhone = student.phone.replace(/^0/, '+963');
    execFileSync('redis-cli', ['-n', redisDatabase, 'DEL', `otp:${normalizedPhone}`, `otp-installation:${normalizedPhone}`]);

    const expired = await browserApi(page, '/verify-otp', {
      phone: student.phone,
      otpCode: otp,
      installationId: (await currentTokens(page)).installation,
    }, false);
    expect(expired.status).toBe(400);
    expect(expired.body).toContain('OTP_EXPIRED');
  });

  test('resends OTP through the real UI, invalidates the earlier code, and retains the installation binding', async ({ page }) => {
    test.setTimeout(95_000);
    const { student, otp: originalOtp } = await registerForOtp(page);
    const installationId = (await currentTokens(page)).installation;
    await page.waitForTimeout(60_500);
    await page.getByRole('button', { name: 'إعادة إرسال الرمز' }).click();
    const resentOtp = await readIssuedOtp(student.phone, originalOtp);

    const oldOtp = await browserApi(page, '/verify-otp', {
      phone: student.phone,
      otpCode: originalOtp,
      installationId,
    }, false);
    expect(oldOtp.status).toBe(400);
    expect(oldOtp.body).toContain('OTP_INVALID');

    await completeOtpInBrowser(page, resentOtp);
  });

  test('rehydrates one stable installation and an authenticated identity after reload', async ({ page }) => {
    await registerAndAuthenticate(page);
    const before = await currentTokens(page);
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('button', { name: 'تسجيل الخروج' })).toBeVisible();
    const after = await currentTokens(page);
    expect(after.installation).toBe(before.installation);
    expect(after.access).toBe(before.access);
    expect(after.refresh).toBe(before.refresh);
  });

  test('rotates refresh tokens once and revokes the entire family on replay', async ({ page }) => {
    await registerAndAuthenticate(page);
    const original = await currentTokens(page);
    expect(original.refresh).toBeTruthy();

    const mismatchedInstallation = await browserApi(
      page,
      '/refresh',
      { refreshToken: original.refresh },
      false,
      'web-fedcba9876543210fedcba9876543210',
    );
    expect(mismatchedInstallation.status).toBe(401);

    const rotated = await browserApi(page, '/refresh', { refreshToken: original.refresh }, false);
    expect(rotated.status).toBe(200);
    const rotatedBody = JSON.parse(rotated.body) as { accessToken: string; refreshToken: string };
    expect(rotatedBody.accessToken).not.toBe(original.access);
    expect(rotatedBody.refreshToken).not.toBe(original.refresh);

    const replay = await browserApi(page, '/refresh', { refreshToken: original.refresh }, false);
    expect(replay.status).toBe(401);

    const afterReplay = await browserApi(page, '/refresh', { refreshToken: rotatedBody.refreshToken }, false);
    expect(afterReplay.status).toBe(401);

    const oldAccess = await page.evaluate(async (token) => {
      const response = await fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      return response.status;
    }, original.access);
    expect(oldAccess).toBe(401);
  });

  test('invalidates the server session before logout navigation completes', async ({ page }) => {
    await registerAndAuthenticate(page);
    const { access } = await currentTokens(page);
    await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect.poll(() => page.evaluate(() => ({
      access: sessionStorage.getItem('cms-access-token'),
      refresh: sessionStorage.getItem('cms-refresh-token'),
    }))).toEqual({ access: null, refresh: null });

    const status = await page.evaluate(async (token) => {
      const response = await fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      return response.status;
    }, access);
    expect(status).toBe(401);
  });

  test('revokes an authenticated clone tab after logout in its sibling tab', async ({ page, context }) => {
    await registerAndAuthenticate(page);
    const newTab = context.waitForEvent('page');
    await page.evaluate(() => window.open('/dashboard', '_blank'));
    const sibling = await newTab;
    await sibling.waitForLoadState('domcontentloaded');
    await expect(sibling).toHaveURL(/\/dashboard$/);
    await expect(sibling.getByRole('button', { name: 'تسجيل الخروج' })).toBeVisible();

    await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await sibling.reload();
    await expect(sibling).toHaveURL(/\/login$/);
    await sibling.close();
  });

  test('preserves only the installation identity across a simulated browser restart', async ({ browser, page, context }) => {
    await registerAndAuthenticate(page);
    const before = await currentTokens(page);
    expect(before.installation).toBeTruthy();
    await context.close();

    const restarted = await browser.newContext();
    await restarted.addInitScript((installation) => {
      localStorage.setItem('cms-device-fingerprint', installation);
    }, before.installation);
    const restartedPage = await restarted.newPage();
    await restartedPage.goto('/dashboard');
    await expect(restartedPage).toHaveURL(/\/login$/);
    const after = await currentTokens(restartedPage);
    expect(after.installation).toBe(before.installation);
    expect(after.access).toBeNull();
    expect(after.refresh).toBeNull();
    await restarted.close();
  });

  test('handles real 403 authorization denial and 401 identity rejection without retaining a stale authenticated state', async ({ page }) => {
    await registerAndAuthenticate(page);
    const before = await currentTokens(page);
    const forbidden = await page.evaluate(async (token) => {
      const response = await fetch('/api/v1/security/alerts', { headers: { Authorization: `Bearer ${token}` } });
      return response.status;
    }, before.access);
    expect(forbidden).toBe(403);

    await page.evaluate(() => sessionStorage.setItem('cms-access-token', 'invalid-access-token'));
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    const after401 = await currentTokens(page);
    expect(after401.access).toBeNull();
    expect(after401.refresh).toBeNull();
  });

  test('resets the password with a six-digit code, revokes the prior session, and consumes the reset code once', async ({ page }) => {
    const student = await registerAndAuthenticate(page);
    const original = await currentTokens(page);
    const forgot = await browserApi(page, '/forgot-password', { phone: student.phone }, false);
    expect(forgot.status).toBe(204);

    const normalizedPhone = student.phone.replace(/^0/, '+963');
    const rawResetOtp = execFileSync('redis-cli', ['-n', redisDatabase, '--raw', 'GET', `reset:${normalizedPhone}`], { encoding: 'utf8' }).trim();
    const resetOtp = rawResetOtp.startsWith('"') ? JSON.parse(rawResetOtp) as string : rawResetOtp;
    expect(resetOtp).toMatch(/^\d{6}$/);

    const resetResults = await page.evaluate(async ({ phone, resetOtp }) => {
      const installationId = localStorage.getItem('cms-device-fingerprint');
      const reset = async (newPassword: string) => {
        const response = await fetch('/api/v1/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Device-Fingerprint': installationId ?? '' },
          body: JSON.stringify({ phone, otpCode: resetOtp, newPassword }),
        });
        return response.status;
      };
      return Promise.all([reset('ResetPassword!2026A'), reset('ResetPassword!2026B')]);
    }, { phone: student.phone, resetOtp });
    expect(resetResults.filter(status => status === 204)).toHaveLength(1);
    expect(resetResults.filter(status => status === 400)).toHaveLength(1);

    const revoked = await page.evaluate(async (token) => {
      const response = await fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      return response.status;
    }, original.access);
    expect(revoked).toBe(401);
  });

  test('completes forgot-password and six-digit reset through the browser UI', async ({ page }) => {
    const student = await registerAndAuthenticate(page);
    await page.goto('/forgot-password');
    await page.locator('input[type="tel"]').fill(student.phone);
    await page.getByRole('button', { name: 'إرسال الرمز' }).click();
    await expect(page.getByRole('heading', { name: 'تم إرسال الرمز' })).toBeVisible();
    await page.getByRole('link', { name: 'إعادة تعيين كلمة المرور' }).click();
    await expect(page).toHaveURL(/\/reset-password$/);

    const resetInputs = page.locator('input[inputmode="numeric"]');
    await expect(resetInputs).toHaveCount(6);
    const normalizedPhone = student.phone.replace(/^0/, '+963');
    const rawResetOtp = execFileSync('redis-cli', ['-n', redisDatabase, '--raw', 'GET', `reset:${normalizedPhone}`], { encoding: 'utf8' }).trim();
    const resetOtp = rawResetOtp.startsWith('"') ? JSON.parse(rawResetOtp) as string : rawResetOtp;
    for (const [index, digit] of [...resetOtp].entries()) await resetInputs.nth(index).fill(digit);
    await page.locator('input[type="password"]').fill('ResetUiPassword!2026');
    await page.getByRole('button', { name: 'إعادة التعيين' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('fails closed and clears transient tokens when the identity API is unavailable on reload', async ({ page }) => {
    await registerAndAuthenticate(page);
    const stableInstallation = (await currentTokens(page)).installation;
    await page.route('**/api/v1/auth/me', route => route.abort('failed'));
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    const afterFailure = await currentTokens(page);
    expect(afterFailure.installation).toBe(stableInstallation);
    expect(afterFailure.access).toBeNull();
    expect(afterFailure.refresh).toBeNull();
  });
});
