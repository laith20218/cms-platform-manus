import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * W4 (admin-ui) — TwoFactorCard (matrix row 2: 2FA had no UI).
 *
 * API contract (recon-verified): POST /api/v1/auth/admin/2fa/enable (no body)
 * → { qrCodeUrl, secret, recoveryCodes[] }; POST /api/v1/auth/admin/2fa/disable
 * { password } → 204. No status endpoint exists — the card never fakes state;
 * API errors surface verbatim.
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  fetchSecuritySummary: vi.fn(() => Promise.reject(new Error('security summary not stubbed for this test'))),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { TwoFactorCard } from '../components/TwoFactorCard';

const ENABLE_RESULT = {
  qrCodeUrl: 'data:image/png;base64,iVBORw0KGgo=',
  secret: 'JBSWY3DPEHPK3PXP',
  recoveryCodes: ['R1-AAAA', 'R2-BBBB', 'R3-CCCC'],
};

const notices: string[] = [];
const errors: string[] = [];
const calls: Array<{ path: string; init?: RequestInit }> = [];

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path.endsWith('/2fa/enable')) return ENABLE_RESULT;
    if (path.endsWith('/2fa/disable')) return undefined; // 204 NoContent
    throw new Error('unexpected path');
  });
}

function renderCard() {
  return render(
    <TwoFactorCard
      token="test-token"
      isArabic
      adminName="مدير النظام"
      onError={(m) => errors.push(m)}
      onNotice={(m) => notices.push(m)}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  notices.length = 0;
  errors.length = 0;
  calls.length = 0;
  stubApi();
});

describe('W4 — TwoFactorCard enable', () => {
  it('calls the enable endpoint and shows QR + secret + one-time recovery codes', async () => {
    renderCard();
    expect(screen.getByTestId('two-factor-card')).toBeInTheDocument();
    expect(screen.getByText('المصادقة الثنائية (2FA)')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('two-factor-enable'));
    await waitFor(() => {
      expect(calls.some((c) => c.path.includes('/api/v1/auth/admin/2fa/enable') && c.init?.method === 'POST')).toBe(true);
    });

    // The setup dialog renders the API payload honestly.
    await waitFor(() => expect(screen.getByTestId('two-factor-setup-dialog')).toBeInTheDocument());
    expect(screen.getByTestId('two-factor-qr')).toHaveAttribute('src', ENABLE_RESULT.qrCodeUrl);
    expect(screen.getByTestId('two-factor-secret')).toHaveTextContent(ENABLE_RESULT.secret);
    for (const code of ENABLE_RESULT.recoveryCodes) {
      expect(screen.getByText(code)).toBeInTheDocument();
    }
    expect(screen.getByText(/تظهر مرة واحدة فقط/)).toBeInTheDocument();
  });

  it('surfaces an enable failure honestly (no fake success)', async () => {
    apiRequestMock.mockImplementation(async () => {
      throw new Error('تعذّر توليد مفتاح المصادقة');
    });
    renderCard();
    fireEvent.click(screen.getByTestId('two-factor-enable'));
    await waitFor(() => expect(errors.some((m) => m.includes('تعذّر توليد مفتاح المصادقة'))).toBe(true));
    expect(screen.queryByTestId('two-factor-setup-dialog')).not.toBeInTheDocument();
    expect(notices.length).toBe(0);
  });
});

describe('W4 — TwoFactorCard disable', () => {
  it('requires a password before the request can fire, then posts it', async () => {
    renderCard();
    fireEvent.click(screen.getByTestId('two-factor-disable-open'));

    const confirm = screen.getByTestId('two-factor-disable-confirm');
    expect(screen.getByRole('dialog', { name: 'تعطيل المصادقة الثنائية' })).toBeInTheDocument();
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByTestId('two-factor-password'), { target: { value: 'wrong-pass' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(calls.some((c) => c.path.includes('/api/v1/auth/admin/2fa/disable') && c.init?.method === 'POST')).toBe(true);
    });
    const disableCall = calls.find((c) => c.path.includes('2fa/disable'));
    expect(String(disableCall?.init?.body)).toContain('wrong-pass');
    await waitFor(() => expect(screen.queryByTestId('two-factor-disable-dialog')).not.toBeInTheDocument());
  });

  it('cancel never sends the disable request', async () => {
    renderCard();
    fireEvent.click(screen.getByTestId('two-factor-disable-open'));
    fireEvent.change(screen.getByTestId('two-factor-password'), { target: { value: 'x'.repeat(8) } });
    fireEvent.click(screen.getByTestId('two-factor-disable-cancel'));
    await waitFor(() => expect(screen.queryByTestId('two-factor-disable-dialog')).not.toBeInTheDocument());
    expect(calls.some((c) => c.path.includes('2fa/disable'))).toBe(false);
  });

  it('surfaces a wrong-password failure from the API verbatim', async () => {
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path.endsWith('/2fa/disable')) throw new Error('كلمة المرور غير صحيحة');
      return ENABLE_RESULT;
    });
    renderCard();
    fireEvent.click(screen.getByTestId('two-factor-disable-open'));
    fireEvent.change(screen.getByTestId('two-factor-password'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByTestId('two-factor-disable-confirm'));
    await waitFor(() => expect(errors.some((m) => m.includes('كلمة المرور غير صحيحة'))).toBe(true));
    // The dialog stays open for a retry — honest failure, no silent close.
    expect(screen.getByTestId('two-factor-disable-dialog')).toBeInTheDocument();
  });
});
