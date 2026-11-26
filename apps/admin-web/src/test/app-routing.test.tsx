import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * PR-2 — admin-shell routing tests: the real 404 view, post-login deep-link
 * restoration, unauthorized deep-link fallbacks, and browser back/forward
 * behavior against the URL-derived view state.
 *
 * Router note: rendered through MemoryRouter with a location/back/forward
 * harness (the same approach as academicContext.test.tsx) — the view state is
 * derived from the URL, so the harness location is the source of truth.
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
  ApiError: class ApiError extends Error {
    status = 500;
    errorCode?: string;
    constructor(message: string, errorCode?: string) {
      super(message);
      this.errorCode = errorCode;
    }
  },
}));

import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import App from '../App';

const SESSION_KEYS = ['cms-admin-user', 'cms-admin-token', 'cms-admin-refresh'];

/** Test harness: exposes the live location plus back/forward drivers. */
function Harness() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="harness-location">{location.pathname + location.search}</span>
      <button type="button" data-testid="harness-back" onClick={() => navigate(-1)} aria-label="history back" />
      <button type="button" data-testid="harness-forward" onClick={() => navigate(1)} aria-label="history forward" />
    </>
  );
}

function stubApiData() {
  apiRequestMock.mockImplementation(async (path: string) => {
    if (path.startsWith('/api/v1/notifications/unread-count')) return { count: 0 };
    if (path.startsWith('/api/v1/admin/roles')) return [];
    return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
  });
}

function seedSession(role: 'super_admin' | 'admin') {
  sessionStorage.setItem(
    'cms-admin-user',
    JSON.stringify({ id: 'a-1', fullName: 'مدير الاختبار', role, email: 'admin@university.edu' }),
  );
  sessionStorage.setItem('cms-admin-token', 'token-1');
}

/** Render <App/> under a MemoryRouter at an exact URL. */
function renderAppAt(initialPath: string) {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
      <Harness />
    </MemoryRouter>,
  );
}

async function awaitShell() {
  await waitFor(() => {
    expect(document.querySelector('.admin-shell')).toBeTruthy();
  });
}

async function awaitLocation(expected: string) {
  await waitFor(() => {
    expect(screen.getByTestId('harness-location')).toHaveTextContent(expected);
  });
}

async function awaitBreadcrumb(title: string) {
  await waitFor(() => {
    expect(screen.getByTestId('topbar-breadcrumbs')).toHaveTextContent(title);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubApiData();
  // App's health probe + ui-permissions bundle use raw fetch — offline-safe.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  // jsdom has no real scroll implementation.
  vi.stubGlobal('scrollTo', vi.fn());
  for (const key of SESSION_KEYS) sessionStorage.removeItem(key);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PR-2 — URL routing: 404 view', () => {
  it('renders the real 404 for an unknown path instead of the overview', async () => {
    seedSession('super_admin');
    renderAppAt('/does-not-exist');

    await awaitShell();
    const notFound = await screen.findByTestId('not-found');
    expect(notFound).toHaveTextContent('الصفحة غير موجودة');
    // The unmatched path is echoed back for the operator to correct the link.
    expect(notFound).toHaveTextContent('/does-not-exist');
  });

  it('the 404 return button navigates back to the command center', async () => {
    seedSession('super_admin');
    renderAppAt('/nope');

    fireEvent.click(await screen.findByTestId('not-found-return'));
    await awaitLocation('/');
    await awaitBreadcrumb('لوحة القيادة');
  });
});

describe('PR-2 — URL routing: unauthorized deep links', () => {
  it('a non-superadmin deep link to a super-only view shows LimitedNotice, not an empty screen', async () => {
    seedSession('admin');
    renderAppAt('/admins');

    await awaitShell();
    // The limited-notice fallback (content area never renders blank).
    expect(await screen.findByText('الوصول مقيّد بالدور والنطاق')).toBeInTheDocument();
    // The admins center itself must not mount for this role.
    expect(screen.queryByTestId('admins-page-header')).not.toBeInTheDocument();
  });
});

describe('PR-2 — post-login deep-link restoration', () => {
  it('an unauthenticated deep link shows login, then restores the intended view after sign-in', async () => {
    loginMock.mockResolvedValueOnce({
      user: { id: 'a-2', fullName: 'مشرف', role: 'admin', email: 'op@university.edu' },
      accessToken: 'token-2',
      refreshToken: 'refresh-2',
    });
    renderAppAt('/questions');

    // Login screen renders over the deep-linked URL (path preserved in bar).
    expect(await screen.findByPlaceholderText('admin@university.edu')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('admin@university.edu'), {
      target: { value: 'op@university.edu' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'correct-password' },
    });
    fireEvent.submit(screen.getByPlaceholderText('admin@university.edu').closest('form')!);

    // After authentication the operator lands on the intended center —
    // NOT the default overview.
    await awaitShell();
    await awaitBreadcrumb('بنك الأسئلة');
    await awaitLocation('/questions');
    expect(sessionStorage.getItem('cms-admin-token')).toBe('token-2');
  });

  it('login without a deep link keeps the historical default landing view', async () => {
    loginMock.mockResolvedValueOnce({
      user: { id: 'a-3', fullName: 'مدير عام', role: 'super_admin', email: 'admin@university.edu' },
      accessToken: 'token-3',
      refreshToken: 'refresh-3',
    });
    renderAppAt('/');

    fireEvent.change(await screen.findByPlaceholderText('admin@university.edu'), {
      target: { value: 'admin@university.edu' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'correct-password' },
    });
    fireEvent.submit(screen.getByPlaceholderText('admin@university.edu').closest('form')!);

    await awaitLocation('/admins');
    await awaitBreadcrumb('قائمة المدراء');
  });
});

describe('PR-2 — browser back/forward against URL-derived views', () => {
  it('back returns to the previous view and forward re-enters the next one', async () => {
    seedSession('super_admin');
    renderAppAt('/');
    await awaitShell();
    await awaitBreadcrumb('لوحة القيادة');

    // Navigate via the real sidebar (a history push).
    fireEvent.click(screen.getByRole('button', { name: 'بنك الأسئلة' }));
    await awaitLocation('/questions');
    await awaitBreadcrumb('بنك الأسئلة');

    // Back: view state is derived from the URL, so history pops to overview.
    fireEvent.click(screen.getByTestId('harness-back'));
    await awaitLocation('/');
    await awaitBreadcrumb('لوحة القيادة');

    // Forward: history re-enters the questions view.
    fireEvent.click(screen.getByTestId('harness-forward'));
    await awaitLocation('/questions');
    await awaitBreadcrumb('بنك الأسئلة');
  });
});
