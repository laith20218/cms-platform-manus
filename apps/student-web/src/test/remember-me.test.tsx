import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Night Task 2 — «تذكّرني» (Remember me) regression suite.
 *
 * Wave 18.2 (D-06) deleted a checkbox that promised persistence which never
 * existed. This suite locks the REAL contract introduced with
 * services/session-store.ts:
 *
 *   1. Default (unchecked) → tokens live in sessionStorage only; closing the
 *      tab ends the session (unchanged strict behavior).
 *   2. Opt-in (checked)     → tokens live in localStorage (durable across
 *      browser/WebView restarts) and are restored on load.
 *   3. Token rotations write back to the store the session lives in.
 *   4. Logout / session-expiry wipes BOTH stores and the flag.
 *   5. No password is ever persisted (tokens only — by construction, asserted
 *      via storage key inventory).
 */

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------
// 1) session-store unit contract
// ---------------------------------------------------------------------
describe('session-store — persistence modes', () => {
  it('non-persistent login writes sessionStorage only and no flag', async () => {
    const { writeSession, isRememberMeEnabled } = await import('@/services/session-store');
    writeSession({ accessToken: 'A1', refreshToken: 'R1' }, false);
    expect(window.sessionStorage.getItem('cms-access-token')).toBe('A1');
    expect(window.sessionStorage.getItem('cms-refresh-token')).toBe('R1');
    expect(window.localStorage.getItem('cms-access-token')).toBeNull();
    expect(window.localStorage.getItem('cms-refresh-token')).toBeNull();
    expect(isRememberMeEnabled()).toBe(false);
  });

  it('persistent login mirrors tokens into localStorage and sets the flag', async () => {
    const { writeSession, isRememberMeEnabled } = await import('@/services/session-store');
    writeSession({ accessToken: 'A2', refreshToken: 'R2' }, true);
    expect(window.localStorage.getItem('cms-access-token')).toBe('A2');
    expect(window.localStorage.getItem('cms-refresh-token')).toBe('R2');
    // The active tab keeps a working copy too…
    expect(window.sessionStorage.getItem('cms-access-token')).toBe('A2');
    expect(isRememberMeEnabled()).toBe(true);
  });

  it('a remembered session survives a "browser restart" (sessionStorage wiped, localStorage intact)', async () => {
    const { writeSession, readSession } = await import('@/services/session-store');
    writeSession({ accessToken: 'A3', refreshToken: 'R3' }, true);
    // Simulate browser/app close: sessionStorage is gone, localStorage persists.
    window.sessionStorage.clear();
    expect(readSession()).toEqual({ accessToken: 'A3', refreshToken: 'R3' });
  });

  it('a NON-remembered session does NOT survive the tab closing', async () => {
    const { writeSession, readSession } = await import('@/services/session-store');
    writeSession({ accessToken: 'A4', refreshToken: 'R4' }, false);
    window.sessionStorage.clear();
    expect(readSession()).toBeNull();
  });

  it('readSession prefers the sessionStorage copy when both exist', async () => {
    const { writeSession } = await import('@/services/session-store');
    writeSession({ accessToken: 'fresh', refreshToken: 'fresh-r' }, true);
    window.sessionStorage.setItem('cms-access-token', 'newer');
    window.sessionStorage.setItem('cms-refresh-token', 'newer-r');
    const { readSession } = await import('@/services/session-store');
    expect(readSession()).toEqual({ accessToken: 'newer', refreshToken: 'newer-r' });
  });

  it('a later non-persistent login drops any stale remembered copy', async () => {
    const { writeSession } = await import('@/services/session-store');
    writeSession({ accessToken: 'old', refreshToken: 'old-r' }, true);
    writeSession({ accessToken: 'new', refreshToken: 'new-r' }, false);
    expect(window.localStorage.getItem('cms-access-token')).toBeNull();
    expect(window.localStorage.getItem('cms-refresh-token')).toBeNull();
    expect(window.sessionStorage.getItem('cms-access-token')).toBe('new');
  });

  it('writeRotatedTokens refreshes the persistent copy for remembered sessions', async () => {
    const { writeSession, writeRotatedTokens } = await import('@/services/session-store');
    writeSession({ accessToken: 'A5', refreshToken: 'R5' }, true);
    // Browser restart: only the durable copy exists, then a 401→refresh rotates.
    window.sessionStorage.clear();
    writeRotatedTokens({ accessToken: 'A6', refreshToken: 'R6' });
    expect(window.localStorage.getItem('cms-access-token')).toBe('A6');
    expect(window.localStorage.getItem('cms-refresh-token')).toBe('R6');
  });

  it('writeRotatedTokens keeps a plain tab-scoped session out of localStorage', async () => {
    const { writeSession, writeRotatedTokens } = await import('@/services/session-store');
    writeSession({ accessToken: 'A7', refreshToken: 'R7' }, false);
    writeRotatedTokens({ accessToken: 'A8', refreshToken: 'R8' });
    expect(window.sessionStorage.getItem('cms-access-token')).toBe('A8');
    expect(window.localStorage.getItem('cms-access-token')).toBeNull();
  });

  it('clearSession wipes both stores and the flag (logout / forced expiry path)', async () => {
    const { writeSession, clearSession, readSession, isRememberMeEnabled } = await import('@/services/session-store');
    writeSession({ accessToken: 'A9', refreshToken: 'R9' }, true);
    clearSession();
    expect(readSession()).toBeNull();
    expect(isRememberMeEnabled()).toBe(false);
    expect(window.sessionStorage.getItem('cms-access-token')).toBeNull();
    expect(window.localStorage.getItem('cms-refresh-token')).toBeNull();
  });

  it('never persists anything beyond the two session token keys + the flag', async () => {
    const { writeSession } = await import('@/services/session-store');
    writeSession({ accessToken: 'A10', refreshToken: 'R10' }, true);
    const sessionKeys = Object.keys(window.sessionStorage);
    const localKeys = Object.keys(window.localStorage).filter((k) => k !== 'cms-installation-id');
    expect(sessionKeys.every((k) => ['cms-access-token', 'cms-refresh-token'].includes(k))).toBe(true);
    expect(localKeys.every((k) => ['cms-access-token', 'cms-refresh-token', 'cms-remember-me'].includes(k))).toBe(true);
  });
});

// ---------------------------------------------------------------------
// 2) AuthProvider — restore + login flows
// ---------------------------------------------------------------------
const { meMock, loginApiMock, loginMock } = vi.hoisted(() => ({
  meMock: vi.fn(),
  loginApiMock: vi.fn(),
  loginMock: vi.fn(),
}));

vi.mock('@/features/auth/services/auth-api', () => ({
  authApi: {
    me: (...args: unknown[]) => meMock(...args),
    login: (...args: unknown[]) => loginApiMock(...args),
    logout: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn(),
  },
}));

vi.mock('@/features/entitlements/services/entitlement-api', async () => {
  const actual = await vi.importActual<typeof import('@/features/entitlements/services/entitlement-api')>(
    '@/features/entitlements/services/entitlement-api'
  );
  return {
    ...actual,
    clearEntitlementToken: vi.fn(),
  };
});

import { useContext } from 'react';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { AuthContext } from '@/app/providers/auth-context';

function renderProvider(children: ReactElement) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        {children}
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('AuthProvider — remember-me integration', () => {
  it('calls /me to restore a remembered (localStorage) session after a "restart"', async () => {
    window.localStorage.setItem('cms-access-token', 'remembered-access');
    window.localStorage.setItem('cms-refresh-token', 'remembered-refresh');
    window.localStorage.setItem('cms-remember-me', '1');
    meMock.mockResolvedValue({ id: 'u1', fullName: 'طالب', role: 'student' });

    renderProvider(<div>probe</div>);
    await waitFor(() => expect(meMock).toHaveBeenCalledTimes(1));
  });

  it('does NOT call /me when no session exists anywhere', async () => {
    renderProvider(<div>probe</div>);
    await new Promise((r) => setTimeout(r, 30));
    expect(meMock).not.toHaveBeenCalled();
  });

  it('a failed /me clears the remembered session (fail-closed)', async () => {
    window.localStorage.setItem('cms-access-token', 'stale-access');
    window.localStorage.setItem('cms-refresh-token', 'stale-refresh');
    window.localStorage.setItem('cms-remember-me', '1');
    meMock.mockRejectedValue(new Error('expired'));

    renderProvider(<div>probe</div>);
    await waitFor(() => expect(meMock).toHaveBeenCalled());
    await waitFor(() => {
      expect(window.localStorage.getItem('cms-access-token')).toBeNull();
      expect(window.localStorage.getItem('cms-remember-me')).toBeNull();
    });
  });

  it('login(remember: true) persists tokens to localStorage', async () => {
    loginApiMock.mockResolvedValue({
      accessToken: 'optin-access',
      refreshToken: 'optin-refresh',
      user: { id: 'u2', fullName: 'طالب', role: 'student' },
    });

    let doLogin: (() => Promise<void>) | null = null;
    function Probe() {
      const { login } = useContext(AuthContext)!;
      doLogin = () => login('0999999999', 'secret', { remember: true });
      return null;
    }
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    );
    await act(async () => { await doLogin!(); });
    expect(window.localStorage.getItem('cms-access-token')).toBe('optin-access');
    expect(window.localStorage.getItem('cms-refresh-token')).toBe('optin-refresh');
    expect(window.localStorage.getItem('cms-remember-me')).toBe('1');
    expect(window.sessionStorage.getItem('cms-access-token')).toBe('optin-access');
  });

  it('login without options keeps the strict sessionStorage-only behavior', async () => {
    loginApiMock.mockResolvedValue({
      accessToken: 'strict-access',
      refreshToken: 'strict-refresh',
      user: { id: 'u3', fullName: 'طالب', role: 'student' },
    });

    let doLogin: (() => Promise<void>) | null = null;
    function Probe() {
      const { login } = useContext(AuthContext)!;
      doLogin = () => login('0999999999', 'secret');
      return null;
    }
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>
    );
    await act(async () => { await doLogin!(); });
    expect(window.sessionStorage.getItem('cms-access-token')).toBe('strict-access');
    expect(window.localStorage.getItem('cms-access-token')).toBeNull();
    expect(window.localStorage.getItem('cms-remember-me')).toBeNull();
  });
});

// ---------------------------------------------------------------------
// 3) LoginPage — the «تذكّرني» control drives the login call
// ---------------------------------------------------------------------
vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    login: loginMock,
    logout: vi.fn(),
    refreshToken: vi.fn(),
    completeAuthentication: vi.fn(),
  }),
}));

import LoginPage from '@/features/auth/pages/LoginPage';

function renderLogin(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>
  );
}

describe('LoginPage — «تذكّرني» control', () => {
  it('defaults to unchecked (privacy-safe)', () => {
    renderLogin();
    const box = screen.getByTestId('login-remember-me').querySelector('input') as HTMLInputElement;
    expect(box.checked).toBe(false);
  });

  it('submits with remember=false when unchecked', async () => {
    loginMock.mockResolvedValue(undefined);
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText('0999999999'), { target: { value: '0999999999' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: /تسجيل الدخول/ }));
    await waitFor(() => expect(loginMock).toHaveBeenCalled());
    const [, , options] = loginMock.mock.calls[0];
    expect(options).toEqual({ remember: false });
  });

  it('submits with remember=true when the student opts in', async () => {
    loginMock.mockResolvedValue(undefined);
    renderLogin();
    fireEvent.change(screen.getByPlaceholderText('0999999999'), { target: { value: '0999999999' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByTestId('login-remember-me').querySelector('input')!);
    fireEvent.click(screen.getByRole('button', { name: /تسجيل الدخول/ }));
    await waitFor(() => expect(loginMock).toHaveBeenCalled());
    const [, , options] = loginMock.mock.calls[0];
    expect(options).toEqual({ remember: true });
  });
});
