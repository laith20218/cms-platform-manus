import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * PR-2 — URL query-state restoration for the App-shell surfaces:
 *  - admins-center filters (?q=…&role=…&status=…) hydrate from the URL,
 *    write back through history replace, and clear cleanly;
 *  - the overview tab (?tab=metrics|activity) restores from a shared link.
 * The centers' internal filters migrate with their overhaul PRs (PR-4/5/6).
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
  ApiError: class ApiError extends Error { status = 500; },
}));

import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App';

const SESSION_KEYS = ['cms-admin-user', 'cms-admin-token', 'cms-admin-refresh'];

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="harness-location">{location.pathname + location.search}</span>;
}

function stubApiData() {
  apiRequestMock.mockImplementation(async (path: string) => {
    if (path.startsWith('/api/v1/notifications/unread-count')) return { count: 0 };
    if (path.startsWith('/api/v1/admin/roles')) return [];
    if (path.startsWith('/api/v1/admin/admins')) {
      return { items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 };
    }
    return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
  });
}

function seedSession(role: 'super_admin' | 'admin' = 'super_admin') {
  sessionStorage.setItem(
    'cms-admin-user',
    JSON.stringify({ id: 'a-1', fullName: 'مدير الاختبار', role, email: 'admin@university.edu' }),
  );
  sessionStorage.setItem('cms-admin-token', 'token-1');
}

function renderAppAt(initialPath: string) {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
}

async function awaitShell() {
  await waitFor(() => {
    expect(document.querySelector('.admin-shell')).toBeTruthy();
  });
}

async function awaitLocation(contains: string) {
  await waitFor(() => {
    expect(screen.getByTestId('harness-location').textContent).toContain(contains);
  });
}

async function awaitLocationClean() {
  await waitFor(() => {
    const url = screen.getByTestId('harness-location').textContent ?? '';
    expect(url).not.toContain('q=');
    expect(url).not.toContain('status=');
    expect(url).not.toContain('role=');
  });
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

describe('PR-2 — admins-center filters live in the URL', () => {
  it('a deep link with ?q=…&status=… restores the exact filter state', async () => {
    seedSession();
    renderAppAt('/admins?q=%D8%A3%D8%AD%D9%85%D8%AF&status=active');

    // The search input and status select hydrate from the query string.
    await waitFor(() => {
      expect(screen.getByPlaceholderText('ابحث بالاسم أو البريد أو الهاتف')).toHaveValue('أحمد');
    });
    const statusSelect = screen.getAllByRole('combobox').find(
      (el) => (el as HTMLSelectElement).value === 'active',
    ) as HTMLSelectElement | undefined;
    expect(statusSelect).toBeTruthy();
    // The paged fetch carries the restored filters server-side.
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        expect.stringContaining('search='),
        'token-1',
      );
    });
  });

  it('typing in the search box writes the parameter back to the URL', async () => {
    seedSession();
    renderAppAt('/admins');
    await screen.findByPlaceholderText('ابحث بالاسم أو البريد أو الهاتف');

    fireEvent.change(screen.getByPlaceholderText('ابحث بالاسم أو البريد أو الهاتف'), {
      target: { value: 'سارة' },
    });

    await awaitLocation('q=');
    expect(decodeURIComponent(screen.getByTestId('harness-location').textContent ?? '')).toContain('سارة');
  });

  it('clearing the filters removes every parameter from the URL', async () => {
    seedSession();
    renderAppAt('/admins?q=%D8%B3%D8%A7%D8%B1%D8%A9&status=disabled');
    await screen.findByPlaceholderText('ابحث بالاسم أو البريد أو الهاتف');

    // The clear action renders in the filter bar and (with zero rows) in the
    // empty state — both drive the same clearFilters handler.
    const clearButtons = await screen.findAllByRole('button', { name: 'إزالة التصفية' });
    fireEvent.click(clearButtons[0]);

    await awaitLocationClean();
    expect(screen.getByPlaceholderText('ابحث بالاسم أو البريد أو الهاتف')).toHaveValue('');
  });

  it('an out-of-whitelist status value falls back to the default (hand-edited URLs stay safe)', async () => {
    seedSession();
    renderAppAt('/admins?status=hacked');
    await awaitShell();

    await waitFor(() => {
      const statusSelect = screen
        .getAllByRole('combobox')
        .find((el) => (el as HTMLSelectElement).value === 'all') as HTMLSelectElement | undefined;
      expect(statusSelect).toBeTruthy();
    });
  });
});

describe('PR-2 — overview tab lives in the URL', () => {
  it('a shared ?tab=activity link opens the activity tab for a super-admin', async () => {
    seedSession();
    renderAppAt('/?tab=activity');

    const activityTab = await screen.findByRole('tab', { name: 'مراقبة النشاط' });
    expect(activityTab).toHaveAttribute('aria-selected', 'true');
    await awaitLocation('tab=activity');
  });

  it('switching tabs updates the URL; returning to the default removes the parameter', async () => {
    seedSession();
    renderAppAt('/');
    await screen.findByRole('tab', { name: 'المؤشرات' });

    fireEvent.click(screen.getByRole('tab', { name: 'مراقبة النشاط' }));
    await awaitLocation('tab=activity');

    fireEvent.click(screen.getByRole('tab', { name: 'المؤشرات' }));
    await waitFor(() => {
      expect(screen.getByTestId('harness-location').textContent).not.toContain('tab=');
    });
  });
});
