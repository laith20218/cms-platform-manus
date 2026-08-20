import { expect, test, type Page } from '@playwright/test';

const runBase = 20_000_000 + (Date.now() % 79_000_000);
let sequence = 0;

function newStudent() {
  sequence += 1;
  const suffix = String(runBase + sequence).padStart(8, '0');
  return {
    phone: `09${suffix}`,
    password: 'Phase39Deferred1!x',
    fullName: `طالب OTP مؤجل ${sequence}`,
  };
}

async function registerWithoutOtp(page: Page) {
  const student = newStudent();
  await page.goto('/register');
  await page.locator('input[type="text"]').fill(student.fullName);
  await page.locator('input[type="tel"]').fill(student.phone);
  await page.locator('input[type="password"]').nth(0).fill(student.password);
  await page.locator('input[type="password"]').nth(1).fill(student.password);

  const selects = page.locator('select');
  await expect(selects.nth(0).locator('option')).toHaveCount(2, { timeout: 10_000 });
  await selects.nth(0).selectOption({ index: 1 });
  await expect(selects.nth(1).locator('option')).toHaveCount(2, { timeout: 10_000 });
  await selects.nth(1).selectOption({ index: 1 });
  await expect(selects.nth(2).locator('option')).toHaveCount(2, { timeout: 10_000 });
  await selects.nth(2).selectOption({ index: 1 });
  await page.locator('label').filter({ has: page.locator('input[type="checkbox"]') }).locator('span').first().click();
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page).toHaveURL(/\/login$/);
  return student;
}

test.describe('Phase 39 — deferred OTP browser evidence', () => {
  test('registers without an OTP dead-end and permits the new student to log in', async ({ page }) => {
    const student = await registerWithoutOtp(page);
    await page.locator('input[type="tel"]').fill(student.phone);
    await page.locator('input[type="password"]').fill(student.password);
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('button', { name: 'تسجيل الخروج' })).toBeVisible();
  });

  test('rejects deferred OTP endpoints explicitly and exposes password recovery as deferred rather than a false send flow', async ({ page }) => {
    const student = await registerWithoutOtp(page);
    const installationId = await page.evaluate(() => localStorage.getItem('cms-device-fingerprint'));

    const verification = await page.evaluate(async ({ phone, installationId }) => {
      const response = await fetch('/api/v1/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Device-Fingerprint': installationId ?? '' },
        body: JSON.stringify({ phone, otpCode: '123456', installationId }),
      });
      return { status: response.status, body: await response.text() };
    }, { phone: student.phone, installationId });
    expect(verification.status).toBe(400);
    expect(verification.body).toContain('OTP_DEFERRED');

    await page.getByRole('link', { name: 'نسيت كلمة المرور؟' }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await expect(page.getByRole('heading', { name: 'استعادة كلمة المرور مؤجلة' })).toBeVisible();
    await expect(page.locator('input[type="tel"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'إرسال الرمز' })).toHaveCount(0);
    await page.getByRole('link', { name: 'العودة لتسجيل الدخول' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
