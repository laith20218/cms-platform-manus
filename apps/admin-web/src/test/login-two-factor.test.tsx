import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * PR-2 — the 2FA login challenge step, driven by the backend contract:
 * AdminLoginHandler answers DomainException 400s carrying errorCode
 * TWO_FACTOR_REQUIRED (password accepted, challenge needed),
 * TWO_FACTOR_INVALID (bad code) and TWO_FACTOR_REPLAY (reused code).
 * The UI must surface the OTP step only when the backend demands it —
 * 2FA is never weakened to make a test pass.
 */

const { apiRequestMock, loginMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  loginMock: vi.fn(),
}));
vi.mock('../lib/api', () => ({
  API_BASE_URL: 'http://e2e.test',
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  login: (...args: unknown[]) => loginMock(...args),
  refreshAccessToken: vi.fn(async () => null),
  // Signature mirrors the real ApiError (message, status, humanMessage,
  // technicalDetails, errorCode) so the mocked module stays type-compatible
  // with the production contract.
  ApiError: class ApiError extends Error {
    status: number;
    humanMessage?: string;
    technicalDetails?: string;
    errorCode?: string;
    constructor(message: string, status: number, humanMessage?: string, technicalDetails?: string, errorCode?: string) {
      super(message);
      this.status = status;
      this.humanMessage = humanMessage;
      this.technicalDetails = technicalDetails;
      this.errorCode = errorCode;
    }
  },
}));

import { ApiError } from '../lib/api';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

const SESSION_KEYS = ['cms-admin-user', 'cms-admin-token', 'cms-admin-refresh'];

function stubApiData() {
  apiRequestMock.mockImplementation(async (path: string) => {
    if (path.startsWith('/api/v1/notifications/unread-count')) return { count: 0 };
    if (path.startsWith('/api/v1/admin/roles')) return [];
    return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
  });
}

function renderLogin() {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );
}

async function submitCredentials(email: string, password: string) {
  fireEvent.change(await screen.findByPlaceholderText('admin@university.edu'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
    target: { value: password },
  });
  fireEvent.submit(screen.getByPlaceholderText('admin@university.edu').closest('form')!);
}

beforeEach(() => {
  vi.clearAllMocks();
  stubApiData();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  vi.stubGlobal('scrollTo', vi.fn());
  for (const key of SESSION_KEYS) sessionStorage.removeItem(key);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PR-2 — 2FA login challenge', () => {
  it('TWO_FACTOR_REQUIRED replaces the password field with the OTP step (no error shown)', async () => {
    loginMock.mockRejectedValueOnce(
      new ApiError('مطلوب رمز التحقق الثنائي (2FA)', 400, undefined, undefined, 'TWO_FACTOR_REQUIRED'),
    );
    renderLogin();
    await submitCredentials('admin@university.edu', 'correct-password');

    const otp = await screen.findByTestId('two-factor-input');
    expect(otp).toHaveAttribute('autocomplete', 'one-time-code');
    expect(otp).toHaveAttribute('inputmode', 'numeric');
    // The credentials step is replaced, not stacked (password hidden).
    expect(screen.queryByPlaceholderText('••••••••••••')).not.toBeInTheDocument();
    // A challenge is not an error: no error banner for TWO_FACTOR_REQUIRED.
    expect(document.querySelector('.login-error')).toBeNull();
    expect(await screen.findByText('أدخل الرمز المؤقت من تطبيق المصادقة لديك لإكمال الدخول.')).toBeInTheDocument();
  });

  it('the OTP re-submit sends the code and completes the session', async () => {
    loginMock
      .mockRejectedValueOnce(new ApiError('مطلوب رمز التحقق الثنائي (2FA)', 400, undefined, undefined, 'TWO_FACTOR_REQUIRED'))
      .mockResolvedValueOnce({
        user: { id: 'a-1', fullName: 'مدير عام', role: 'super_admin', email: 'admin@university.edu' },
        accessToken: 'token-2fa',
        refreshToken: 'refresh-2fa',
      });
    renderLogin();
    await submitCredentials('admin@university.edu', 'correct-password');

    fireEvent.change(await screen.findByTestId('two-factor-input'), {
      target: { value: '123456' },
    });
    fireEvent.submit(screen.getByTestId('two-factor-input').closest('form')!);

    // The second attempt carries the code; the session is established.
    await waitFor(() => {
      expect(loginMock).toHaveBeenNthCalledWith(2, 'admin@university.edu', 'correct-password', '123456');
    });
    await waitFor(() => {
      expect(sessionStorage.getItem('cms-admin-token')).toBe('token-2fa');
    });
    await waitFor(() => {
      expect(document.querySelector('.admin-shell')).toBeTruthy();
    });
  });

  it('TWO_FACTOR_INVALID surfaces the backend message and keeps the OTP step', async () => {
    loginMock
      .mockRejectedValueOnce(new ApiError('مطلوب رمز التحقق الثنائي (2FA)', 400, undefined, undefined, 'TWO_FACTOR_REQUIRED'))
      .mockRejectedValueOnce(new ApiError('رمز 2FA غير صحيح', 400, undefined, undefined, 'TWO_FACTOR_INVALID'));
    renderLogin();
    await submitCredentials('admin@university.edu', 'correct-password');

    fireEvent.change(await screen.findByTestId('two-factor-input'), {
      target: { value: '000000' },
    });
    fireEvent.submit(screen.getByTestId('two-factor-input').closest('form')!);

    // The invalid-code message from the backend is shown verbatim (Arabic).
    expect(await screen.findByText('رمز 2FA غير صحيح')).toBeInTheDocument();
    // The challenge step persists for a corrected retry.
    expect(screen.getByTestId('two-factor-input')).toBeInTheDocument();
    expect(sessionStorage.getItem('cms-admin-token')).toBeNull();
  });

  it('the back link returns to the credentials step without losing the e-mail', async () => {
    loginMock.mockRejectedValueOnce(
      new ApiError('مطلوب رمز التحقق الثنائي (2FA)', 400, undefined, undefined, 'TWO_FACTOR_REQUIRED'),
    );
    renderLogin();
    await submitCredentials('admin@university.edu', 'correct-password');

    fireEvent.click(await screen.findByTestId('two-factor-back'));

    expect(await screen.findByPlaceholderText('••••••••••••')).toBeInTheDocument();
    expect(screen.queryByTestId('two-factor-input')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('admin@university.edu')).toBeInTheDocument();
  });

  it('the OTP input rejects non-numeric characters', async () => {
    loginMock.mockRejectedValueOnce(
      new ApiError('مطلوب رمز التحقق الثنائي (2FA)', 400, undefined, undefined, 'TWO_FACTOR_REQUIRED'),
    );
    renderLogin();
    await submitCredentials('admin@university.edu', 'correct-password');

    const otp = await screen.findByTestId('two-factor-input');
    fireEvent.change(otp, { target: { value: '12a7' } });
    expect(otp).toHaveValue('127');
  });
});
