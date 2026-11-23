import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AxiosError } from 'axios';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * Wave A — «تذكّرني» hardening regression suite.
 *
 * The Owner's manual test failed: close/reopen landed on the login screen even
 * though the remembered session was still valid. Root causes (all fixed and
 * locked here):
 *
 *   1. AuthProvider's restore wiped the session on ANY /me failure — including
 *      transport faults/timeouts. The API hosts on Render (free-tier cold
 *      start can exceed the 30 s apiClient timeout), so a reopen during a cold
 *      start destroyed a perfectly valid remembered session. Fix: only a
 *      definitive server verdict (401/403) may end the session.
 *   2. api-client's refresh-failure path had the same catch-all bug: a network
 *      blip on /auth/refresh wiped the session and force-redirected to /login.
 *      Fix: verdicts (401) fail closed; transport faults keep the session and
 *      propagate the retryable error so the restore path stays on the cached
 *      shell.
 *   3. No cached profile: reopen blocked on /me before rendering anything, so
 *      every slow reopen flashed the login form. Fix: remembered sessions
 *      cache the /me profile (durable, 7-day freshness) and hydrate instantly.
 *
 * This suite asserts the full matrix: verdict vs transport, remember on/off,
 * logout, rotation persistence, and cache hygiene.
 */

// ---------------------------------------------------------------------------
// Helpers — build axios-shaped errors exactly like axios does in production.
// ---------------------------------------------------------------------------

/** A definitive server verdict (e.g. expired refresh token rejected with 401). */
function makeVerdictError(status = 401): AxiosError {
  const error = new AxiosError('Request failed with status code 401', undefined, undefined, undefined, {
    status,
    statusText: 'Unauthorized',
    data: {},
    headers: {},
    config: { headers: {} } as never,
  } as never);
  return error;
}

/** A transport fault: no response at all (offline / DNS / timeout). */
function makeTransportError(): AxiosError {
  return new AxiosError('Network Error', 'ECONNABORTED' as never, undefined, undefined, undefined);
}

/** A non-axios client error (unexpected local bug) — must still end the session. */
function makePlainError(): Error {
  return new Error('client bug');
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { meMock, loginApiMock, logoutApiMock, refreshApiMock, toastErrorMock } = vi.hoisted(() => ({
  meMock: vi.fn(),
  loginApiMock: vi.fn(),
  logoutApiMock: vi.fn(),
  refreshApiMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('@/features/auth/services/auth-api', () => ({
  authApi: {
    me: (...args: unknown[]) => meMock(...args),
    login: (...args: unknown[]) => loginApiMock(...args),
    logout: (...args: unknown[]) => logoutApiMock(...args),
    refresh: (...args: unknown[]) => refreshApiMock(...args),
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

vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args), success: vi.fn(), info: vi.fn() },
}));

import { useContext } from 'react';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { AuthContext } from '@/app/providers/auth-context';
import { resetSessionExpiredFlagForTests } from '@/services/session-expiry';
import {
  writeSession,
  readSession,
  clearSession,
  writeRememberedUser,
  readRememberedUser,
  REMEMBERED_USER_KEY,
} from '@/services/session-store';
import { isSessionEndingFailure } from '@/utils/api-error';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER = { id: 'u1', phone: '0999999999', fullName: 'طالب تذكّرني', role: 'student' as const };

/** jsdom's location.assign throws "not implemented" into the console; stub it. */
let assignMock: ReturnType<typeof vi.fn>;
const originalLocation = window.location;
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  meMock.mockReset();
  loginApiMock.mockReset();
  logoutApiMock.mockReset();
  refreshApiMock.mockReset();
  toastErrorMock.mockReset();
  resetSessionExpiredFlagForTests();
  // The restore effect always fires when a session exists; default to a
  // never-settling /me so tests that don't care about restore stay quiet.
  meMock.mockImplementation(() => new Promise(() => { /* never settles */ }));
  assignMock = vi.fn();
  delete (window as unknown as Record<string, unknown>).location;
  (window as unknown as Record<string, unknown>).location = {
    ...originalLocation,
    assign: assignMock,
    pathname: '/',
  };
});

afterEach(() => {
  vi.useRealTimers();
  (window as unknown as Record<string, unknown>).location = originalLocation;
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function renderProvider(children: ReactElement) {
  return render(
    <MemoryRouter>
      <AuthProvider>{children}</AuthProvider>
    </MemoryRouter>
  );
}

/** Probe exposing the live auth state inside the tree. */
function AuthStateProbe({ onReady }: { onReady?: (state: { user: unknown; isLoading: boolean }) => void }) {
  const auth = useContext(AuthContext)!;
  onReady?.({ user: auth.user, isLoading: auth.isLoading });
  return (
    <span
      data-testid="auth-state"
      data-authenticated={auth.isAuthenticated ? 'yes' : 'no'}
      data-loading={auth.isLoading ? 'yes' : 'no'}
      data-name={auth.user?.fullName ?? ''}
    />
  );
}

// ---------------------------------------------------------------------------
// 1) isSessionEndingFailure — the single policy classifier
// ---------------------------------------------------------------------------

describe('isSessionEndingFailure — verdict vs transport', () => {
  it('401 and 403 verdicts end the session', () => {
    expect(isSessionEndingFailure(makeVerdictError(401))).toBe(true);
    expect(isSessionEndingFailure(makeVerdictError(403))).toBe(true);
  });

  it('transport faults keep the session (offline / timeout / no response)', () => {
    expect(isSessionEndingFailure(makeTransportError())).toBe(false);
  });

  it('408 / 429 / 5xx keep the session — the request never reached an auth decision', () => {
    for (const status of [408, 429, 500, 502, 503]) {
      const error = new AxiosError('server', undefined, undefined, undefined, {
        status,
        data: {},
        headers: {},
        config: {} as never,
      } as never);
      expect(isSessionEndingFailure(error)).toBe(false);
    }
  });

  it('a non-axios error fails closed (ends the session)', () => {
    expect(isSessionEndingFailure(makePlainError())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2) Remembered profile cache — instant hydration on reopen
// ---------------------------------------------------------------------------

describe('remembered-user cache (session-store)', () => {
  it('writeRememberedUser persists and readRememberedUser round-trips', () => {
    writeSession({ accessToken: 'A', refreshToken: 'R' }, true);
    writeRememberedUser(USER);
    expect(readRememberedUser()).toEqual(USER);
  });

  it('is a no-op for non-remembered sessions (strict session stays minimal)', () => {
    writeSession({ accessToken: 'A', refreshToken: 'R' }, false);
    writeRememberedUser(USER);
    expect(window.localStorage.getItem(REMEMBERED_USER_KEY)).toBeNull();
    expect(readRememberedUser()).toBeNull();
  });

  it('a cache older than the 7-day window is ignored (fossil guard)', () => {
    writeSession({ accessToken: 'A', refreshToken: 'R' }, true);
    writeRememberedUser(USER);
    // Age the copy past the window.
    const aged = JSON.parse(window.localStorage.getItem(REMEMBERED_USER_KEY)!) as { user: unknown; cachedAt: number };
    aged.cachedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(REMEMBERED_USER_KEY, JSON.stringify(aged));
    expect(readRememberedUser()).toBeNull();
  });

  it('clearSession wipes the profile cache too', () => {
    writeSession({ accessToken: 'A', refreshToken: 'R' }, true);
    writeRememberedUser(USER);
    clearSession();
    expect(window.localStorage.getItem(REMEMBERED_USER_KEY)).toBeNull();
  });

  it('a later NON-remembered login drops the stale remembered profile (privacy)', () => {
    writeSession({ accessToken: 'A', refreshToken: 'R' }, true);
    writeRememberedUser(USER);
    writeSession({ accessToken: 'B', refreshToken: 'R2' }, false);
    expect(window.localStorage.getItem(REMEMBERED_USER_KEY)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3) AuthProvider restore — the reopen matrix
// ---------------------------------------------------------------------------

describe('AuthProvider restore — reopen matrix (Wave A)', () => {
  it('renders the authenticated shell INSTANTLY from the cache while /me is in flight', async () => {
    writeSession({ accessToken: 'A', refreshToken: 'R' }, true);
    writeRememberedUser(USER);
    // /me hangs forever — the cached shell must still paint immediately.
    meMock.mockImplementation(() => new Promise(() => { /* never settles */ }));

    renderProvider(<AuthStateProbe />);
    await waitFor(() => expect(screen.getByTestId('auth-state').dataset.authenticated).toBe('yes'));
    expect(screen.getByTestId('auth-state').dataset.name).toBe(USER.fullName);
    expect(screen.getByTestId('auth-state').dataset.loading).toBe('no');
  });

  it('a transport fault on /me KEEPS the remembered session (Render cold start)', async () => {
    vi.useFakeTimers();
    writeSession({ accessToken: 'A', refreshToken: 'R' }, true);
    writeRememberedUser(USER);
    meMock.mockRejectedValue(makeTransportError());

    renderProvider(<AuthStateProbe />);

    // Exhaust all RESTORE_VERIFY_MAX_ATTEMPTS attempts (3 attempts → 2 retries:
    // delays 2 s then 4 s). Under fake timers nothing settles until advanced.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(4_000);
      await vi.advanceTimersByTimeAsync(6_000);
    });

    // The session SURVIVES: tokens intact, user hydrated, no toast, no wipe.
    expect(readSession()).toEqual({ accessToken: 'A', refreshToken: 'R' });
    expect(meMock).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId('auth-state').dataset.authenticated).toBe('yes');
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('a 401 verdict on /me wipes the session, toasts once, and requires login', async () => {
    writeSession({ accessToken: 'stale-A', refreshToken: 'dead-R' }, true);
    writeRememberedUser(USER);
    meMock.mockRejectedValue(makeVerdictError(401));

    renderProvider(<AuthStateProbe />);
    await waitFor(() => expect(meMock).toHaveBeenCalled());
    await waitFor(() => {
      expect(readSession()).toBeNull();
      expect(window.localStorage.getItem('cms-remember-me')).toBeNull();
      expect(screen.getByTestId('auth-state').dataset.authenticated).toBe('no');
    });
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith('انتهت الجلسة، يُرجى تسجيل الدخول مجددًا', { duration: 6000 });
  });

  it('retries /me on transport faults (bounded) and recovers when the API warms up', async () => {
    vi.useFakeTimers();
    writeSession({ accessToken: 'A', refreshToken: 'R' }, true);
    writeRememberedUser(USER);
    // Fail twice (cold start), then succeed on the 3rd attempt.
    meMock
      .mockRejectedValueOnce(makeTransportError())
      .mockRejectedValueOnce(makeTransportError())
      .mockResolvedValue({ ...USER, fullName: 'محدث' });

    renderProvider(<AuthStateProbe />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(4_000);
    });

    // Recovered: fresh profile rendered + cache refreshed.
    expect(screen.getByTestId('auth-state').dataset.name).toBe('محدث');
    expect(readRememberedUser()).toEqual({ ...USER, fullName: 'محدث' });
  });

  it('a NON-remembered session with no tokens never calls /me', async () => {
    renderProvider(<AuthStateProbe />);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(meMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('auth-state').dataset.authenticated).toBe('no');
  });
});

// ---------------------------------------------------------------------------
// 4) refreshToken() — verdict vs transport
// ---------------------------------------------------------------------------

describe('AuthProvider.refreshToken — verdict vs transport', () => {
  it('a 401 refresh verdict logs out (no zombie session)', async () => {
    writeSession({ accessToken: 'A', refreshToken: 'R' }, true);
    refreshApiMock.mockRejectedValue(makeVerdictError(401));
    logoutApiMock.mockResolvedValue(undefined);

    let doRefresh: (() => Promise<void>) | null = null;
    function Probe() {
      const { refreshToken } = useContext(AuthContext)!;
      doRefresh = refreshToken;
      return null;
    }
    renderProvider(<Probe />);
    await act(async () => { await doRefresh!(); });

    expect(readSession()).toBeNull();
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(assignMock).toHaveBeenCalledWith('/login');
  });

  it('a transport fault on refresh KEEPS the session and stays silent (Render cold start)', async () => {
    writeSession({ accessToken: 'A', refreshToken: 'R' }, true);
    refreshApiMock.mockRejectedValue(makeTransportError());

    let doRefresh: (() => Promise<void>) | null = null;
    function Probe() {
      const { refreshToken } = useContext(AuthContext)!;
      doRefresh = refreshToken;
      return null;
    }
    renderProvider(<Probe />);
    await act(async () => { await doRefresh!(); });

    expect(readSession()).toEqual({ accessToken: 'A', refreshToken: 'R' });
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(assignMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 5) completeAuthentication — cache maintenance on fresh logins
// ---------------------------------------------------------------------------

describe('completeAuthentication — profile cache on fresh login', () => {
  it('login(remember: true) caches the profile for the next reopen', async () => {
    loginApiMock.mockResolvedValue({
      accessToken: 'optin-access',
      refreshToken: 'optin-refresh',
      user: USER,
    });

    let doLogin: (() => Promise<void>) | null = null;
    function Probe() {
      const { login } = useContext(AuthContext)!;
      doLogin = () => login('0999999999', 'secret', { remember: true });
      return null;
    }
    renderProvider(<Probe />);
    await act(async () => { await doLogin!(); });

    expect(readRememberedUser()).toEqual(USER);
    expect(window.localStorage.getItem('cms-remember-me')).toBe('1');
  });

  it('login(remember: false) leaves NO durable trace (strict session)', async () => {
    loginApiMock.mockResolvedValue({
      accessToken: 'strict-access',
      refreshToken: 'strict-refresh',
      user: USER,
    });

    let doLogin: (() => Promise<void>) | null = null;
    function Probe() {
      const { login } = useContext(AuthContext)!;
      doLogin = () => login('0999999999', 'secret');
      return null;
    }
    renderProvider(<Probe />);
    await act(async () => { await doLogin!(); });

    expect(window.localStorage.getItem(REMEMBERED_USER_KEY)).toBeNull();
    expect(window.localStorage.getItem('cms-access-token')).toBeNull();
    expect(window.localStorage.getItem('cms-remember-me')).toBeNull();
    expect(window.sessionStorage.getItem('cms-access-token')).toBe('strict-access');
  });
});

// ---------------------------------------------------------------------------
// 6) logout — explicit logout always requires a fresh login
// ---------------------------------------------------------------------------

describe('logout — explicit logout kills every durable trace', () => {
  it('wipes tokens + profile cache + flag and redirects to /login', async () => {
    writeSession({ accessToken: 'A', refreshToken: 'R' }, true);
    writeRememberedUser(USER);
    logoutApiMock.mockResolvedValue(undefined);

    let doLogout: (() => Promise<void>) | null = null;
    function Probe() {
      const { logout } = useContext(AuthContext)!;
      doLogout = logout;
      return null;
    }
    renderProvider(<Probe />);
    await act(async () => { await doLogout!(); });

    expect(readSession()).toBeNull();
    expect(readRememberedUser()).toBeNull();
    expect(window.localStorage.getItem('cms-remember-me')).toBeNull();
    expect(assignMock).toHaveBeenCalledWith('/login');
  });

  it('still wipes locally when the network is down (fail-closed)', async () => {
    writeSession({ accessToken: 'A', refreshToken: 'R' }, true);
    writeRememberedUser(USER);
    logoutApiMock.mockRejectedValue(new Error('offline'));

    let doLogout: (() => Promise<void>) | null = null;
    function Probe() {
      const { logout } = useContext(AuthContext)!;
      doLogout = logout;
      return null;
    }
    renderProvider(<Probe />);
    await act(async () => { await doLogout!(); });

    expect(readSession()).toBeNull();
    expect(readRememberedUser()).toBeNull();
    expect(assignMock).toHaveBeenCalledWith('/login');
  });
});

// ---------------------------------------------------------------------------
// 7) Full reopen simulation — the Owner's exact scenario
// ---------------------------------------------------------------------------

describe('reopen simulation — the Owner scenario, end to end', () => {
  it('remember ON: browser restart → authenticated shell, no login form, session survives', async () => {
    // Login with remember ON in a previous "browser life".
    writeSession({ accessToken: 'A', refreshToken: 'R' }, true);
    writeRememberedUser(USER);
    // Restart: sessionStorage dies, localStorage survives.
    window.sessionStorage.clear();

    meMock.mockResolvedValue(USER);
    renderProvider(<AuthStateProbe />);

    await waitFor(() => expect(screen.getByTestId('auth-state').dataset.authenticated).toBe('yes'));
    expect(meMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('auth-state').dataset.name).toBe(USER.fullName);
    // No redirect to login happened.
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('remember OFF: browser restart → login required (by design)', async () => {
    writeSession({ accessToken: 'A', refreshToken: 'R' }, false);
    window.sessionStorage.clear();

    renderProvider(<AuthStateProbe />);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(meMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('auth-state').dataset.authenticated).toBe('no');
  });
});

// ---------------------------------------------------------------------------
// 8) Route-level protection stays intact (ProtectedRoute + /login?next=)
// ---------------------------------------------------------------------------

describe('ProtectedRoute stays strict under the cached shell', () => {
  it('an unauthenticated visitor is still redirected to /login?next=', async () => {
    const { ProtectedRoute } = await import('@/components/common/ProtectedRoute');

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<span data-testid="login-route">login</span>} />
            <Route path="/dashboard" element={<ProtectedRoute><div data-testid="dashboard">dashboard</div></ProtectedRoute>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    // No tokens anywhere → AuthProvider flips isLoading=false immediately and
    // ProtectedRoute must park the destination and show /login instead.
    await waitFor(() => expect(screen.getByTestId('login-route')).toBeInTheDocument());
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
  });

  it('a cached remembered session renders the protected page immediately (no login flash)', async () => {
    const { ProtectedRoute } = await import('@/components/common/ProtectedRoute');
    writeSession({ accessToken: 'A', refreshToken: 'R' }, true);
    writeRememberedUser(USER);
    // /me hangs — the cached profile must still authorize the shell.
    meMock.mockImplementation(() => new Promise(() => { /* never settles */ }));

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<span data-testid="login-route">login</span>} />
            <Route path="/dashboard" element={<ProtectedRoute><div data-testid="dashboard">dashboard</div></ProtectedRoute>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByTestId('dashboard')).toBeInTheDocument());
    expect(screen.queryByTestId('login-route')).not.toBeInTheDocument();
  });
});
