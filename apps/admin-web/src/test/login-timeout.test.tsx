import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Phase 6 (login resilience) — App-level states: the login button can never
 * stay stuck in a loading state. While the bounded request is pending the
 * button shows a clear Arabic progress label + aria-busy; a connection-level
 * failure (NETWORK_TIMEOUT / NETWORK_UNREACHABLE from api.ts) surfaces the
 * connection message, re-enables the form, retains the typed email and never
 * reveals whether the account exists. (The AbortController deadline itself is
 * unit-locked in api.test.ts against the real module.)
 */

const { apiRequestMock, loginMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  loginMock: vi.fn(),
}));
vi.mock('../lib/api', () => ({
  fetchSecuritySummary: vi.fn(() => Promise.reject(new Error('security summary not stubbed for this test'))),
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

const NETWORK_TIMEOUT = 'NETWORK_TIMEOUT';
const NETWORK_UNREACHABLE = 'NETWORK_UNREACHABLE';
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

function fillCredentials(email = 'ops@example.edu', password = 'correct horse battery staple') {
  fireEvent.change(screen.getByLabelText(/البريد الإلكتروني|Email address/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/كلمة المرور|Password/i), { target: { value: password } });
}

function submitLoginForm() {
  fireEvent.submit(screen.getByPlaceholderText('admin@university.edu').closest('form')!);
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of SESSION_KEYS) sessionStorage.removeItem(key);
  stubApiData();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signIn — bounded login states (App)', () => {
  it('shows the Arabic progress label and aria-busy while the request is pending', async () => {
    let rejectLogin!: (reason: unknown) => void;
    loginMock.mockImplementation(() => new Promise((_resolve, reject) => { rejectLogin = reject; }));
    renderLogin();
    fillCredentials();
    submitLoginForm();

    const busyButton = await screen.findByRole('button', { name: /جارٍ التحقق من بيانات الدخول|Verifying sign-in details/i });
    expect(busyButton).toHaveAttribute('aria-busy', 'true');
    expect((busyButton as HTMLButtonElement).disabled).toBe(true);

    rejectLogin(new ApiError('انتهت مهلة الاتصال بالخادم.', 0, undefined, undefined, NETWORK_TIMEOUT));
    await waitFor(() => expect(screen.getByRole('button', { name: /دخول آمن|Secure sign in/i })).toBeEnabled());
  });

  it('a bounded-timeout failure shows the connection message and re-enables retry', async () => {
    loginMock.mockRejectedValue(new ApiError('انتهت مهلة الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.', 0, undefined, undefined, NETWORK_TIMEOUT));
    renderLogin();
    fillCredentials('resilient-admin@example.edu');
    submitLoginForm();

    await screen.findByText('تعذر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.');
    expect(screen.getByRole('button', { name: /دخول آمن|Secure sign in/i })).toBeEnabled();
    // The typed email is retained so a retry is one click away.
    expect((screen.getByLabelText(/البريد الإلكتروني|Email address/i) as HTMLInputElement).value).toBe('resilient-admin@example.edu');
    // No account-existence hint anywhere in the surfaced copy.
    expect(document.body.textContent).not.toMatch(/غير موجود|does not exist|not found/i);
  });

  it('an unreachable network shows the same connection message (no internals)', async () => {
    loginMock.mockRejectedValue(new ApiError('تعذر الوصول إلى الخادم.', 0, undefined, undefined, NETWORK_UNREACHABLE));
    renderLogin();
    fillCredentials();
    submitLoginForm();

    await screen.findByText('تعذر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.');
  });

  it('an invalid-credentials 401 keeps the generic auth message (not the connection one)', async () => {
    loginMock.mockRejectedValue(new ApiError('تعذر التحقق من بيانات الدخول.', 401));
    renderLogin();
    fillCredentials();
    submitLoginForm();

    await screen.findByText('تعذر التحقق من بيانات الدخول.');
    expect(screen.queryByText('تعذر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.')).toBeNull();
  });
});
