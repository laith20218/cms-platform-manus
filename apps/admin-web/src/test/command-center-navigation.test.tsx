import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Phase 3 (command-center navigation + dashboard service-health summary).
 *
 * Locks:
 *   1. The sidebar's dedicated «البنية التحتية» group carries the Servers
 *      Dashboard for super admins — and the whole group is absent for
 *      non-super admins (permission-aware, never a broken link).
 *   2. «الإعدادات» group carries settings / content pages / offline packages;
 *      administrators + roles moved into «المستخدمون والوصول».
 *   3. The Overview service-health summary renders honest states only:
 *      unavailable with retry (never fabricated statuses) and the deep link
 *      to the read-only Servers Dashboard.
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
  fetchServersSummary: (token: string, fresh?: boolean) =>
    apiRequestMock(`/api/v1/admin/servers/summary${fresh ? '?fresh=true' : ''}`, token),
  ApiError: class ApiError extends Error {
    status = 500;
    errorCode?: string;
    constructor(message: string, errorCode?: string) {
      super(message);
      this.errorCode = errorCode;
    }
  },
}));

// The deep-link test only asserts the Overview → servers-center wiring; the
// center itself is covered by src/test/servers-center.test.tsx.
vi.mock('../components/ServersCenter', () => ({
  ServersCenter: () => <section data-testid="servers-center-stub" />,
}));

import { MemoryRouter } from 'react-router-dom';
import App from '../App';

const SESSION_KEYS = ['cms-admin-user', 'cms-admin-token', 'cms-admin-refresh'];

function stubApiData() {
  apiRequestMock.mockImplementation(async (path: string) => {
    if (path.startsWith('/api/v1/notifications/unread-count')) return { count: 0 };
    if (path.startsWith('/api/v1/admin/roles')) return [];
    if (path.startsWith('/api/v1/admin/dashboard')) {
      return {
        totalStudents: 0, activeToday: 0, totalQuestions: 0, totalActiveCodes: 0,
        totalActiveSubscriptions: 0, totalFiles: 0, totalExams: 0,
      };
    }
    return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
  });
}

function bootSession(role: 'super_admin' | 'admin') {
  sessionStorage.setItem('cms-admin-user', JSON.stringify({
    id: 'nav-test-admin', phone: '0900000000', fullName: 'Navigation Operator', role,
  }));
  sessionStorage.setItem('cms-admin-token', 'nav-test-token');
  sessionStorage.setItem('cms-admin-refresh', 'nav-test-refresh');
}

function renderApp() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of SESSION_KEYS) sessionStorage.removeItem(key);
  stubApiData();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sidebar command-center groups (Phase 3)', () => {
  it('super admin: servers sits in the dedicated البنية التحتية group', () => {
    bootSession('super_admin');
    renderApp();

    const infrastructureGroup = screen.getByText('البنية التحتية').closest('div.nav-group');
    expect(infrastructureGroup).not.toBeNull();
    expect(infrastructureGroup!.textContent).toContain('لوحة الخوادم');
    // The read-only servers entry is reachable from the group.
    expect(screen.getAllByText(/لوحة الخوادم|Servers Dashboard/i).length).toBeGreaterThan(0);
  });

  it('super admin: settings group carries settings, content pages, offline', () => {
    bootSession('super_admin');
    renderApp();

    const settingsGroup = screen.getByText('الإعدادات', { selector: '.nav-group-label' }).closest('div.nav-group');
    expect(settingsGroup).not.toBeNull();
    expect(settingsGroup!.textContent).toContain('إعدادات النظام');
    expect(settingsGroup!.textContent).toContain('صفحات المحتوى');
    expect(settingsGroup!.textContent).toContain('الحزم دون اتصال');
  });

  it('super admin: admins + roles moved into المستخدمون والوصول', () => {
    bootSession('super_admin');
    renderApp();

    const accessGroup = screen.getByText('المستخدمون والوصول', { selector: '.nav-group-label' }).closest('div.nav-group');
    expect(accessGroup).not.toBeNull();
    expect(accessGroup!.textContent).toContain('الطلاب');
    expect(accessGroup!.textContent).toContain('رموز الوصول');
    expect(accessGroup!.textContent).toContain('المدراء');
    expect(accessGroup!.textContent).toContain('الأدوار والصلاحيات');
  });

  it('non-super admin: the infrastructure and settings groups never render (permission-aware)', () => {
    bootSession('admin');
    renderApp();

    expect(screen.queryByText('البنية التحتية')).toBeNull();
    expect(screen.queryByText(/لوحة الخوادم|Servers Dashboard/i)).toBeNull();
    // The settings-group super-only items are absent too.
    expect(screen.queryByText('إعدادات النظام')).toBeNull();
    expect(screen.queryByText('الحزم دون اتصال')).toBeNull();
    // ...while daily navigation stays available (sidebar + breadcrumb both carry it).
    expect(screen.getAllByText('لوحة القيادة').length).toBeGreaterThan(0);
  });
});

describe('Overview service-health summary (Phase 3)', () => {
  it('super admin: honest unavailable state with retry — never fabricated statuses', async () => {
    bootSession('super_admin');
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/v1/admin/servers/summary')) {
        throw new Error('summary unavailable');
      }
      if (path.startsWith('/api/v1/notifications/unread-count')) return { count: 0 };
      if (path.startsWith('/api/v1/admin/roles')) return [];
      if (path.startsWith('/api/v1/admin/dashboard')) {
        return {
          totalStudents: 0, activeToday: 0, totalQuestions: 0, totalActiveCodes: 0,
          totalActiveSubscriptions: 0, totalFiles: 0, totalExams: 0,
        };
      }
      return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
    });
    renderApp();

    const summary = await screen.findByTestId('service-health-summary');
    await waitFor(() => expect(screen.getByTestId('service-health-unavailable')).toBeInTheDocument());
    expect(summary.textContent).toContain('تعذّر تحميل ملخص حالة الخوادم.');
    expect(screen.getByTestId('service-health-retry')).toBeInTheDocument();
    // No fabricated provider status rows.
    expect(summary.textContent).not.toContain('operational');
  });

  it('super admin: renders the real summary and deep-links to the servers center', async () => {
    bootSession('super_admin');
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/v1/admin/servers/summary')) {
        return {
          overallStatus: 'unavailable',
          checkedAt: new Date().toISOString(),
          providers: [
            { provider: 'render', status: 'missing_credentials', checkedAt: new Date().toISOString(), responseTimeMs: -1, freshness: { cached: false, ageSeconds: 0 }, note: 'credentials not configured' },
            { provider: 'vercel', status: 'missing_credentials', checkedAt: new Date().toISOString(), responseTimeMs: -1, freshness: { cached: false, ageSeconds: 0 }, note: 'credentials not configured' },
          ],
        };
      }
      if (path.startsWith('/api/v1/notifications/unread-count')) return { count: 0 };
      if (path.startsWith('/api/v1/admin/roles')) return [];
      if (path.startsWith('/api/v1/admin/dashboard')) {
        return {
          totalStudents: 0, activeToday: 0, totalQuestions: 0, totalActiveCodes: 0,
          totalActiveSubscriptions: 0, totalFiles: 0, totalExams: 0,
        };
      }
      return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
    });
    renderApp();

    await waitFor(() => expect(screen.getByTestId('service-health-overall')).toBeInTheDocument());
    expect(screen.getByTestId('service-health-overall').textContent).toContain('غير متاح');
    expect(screen.getByText('render')).toBeInTheDocument();
    expect(screen.getByText('vercel')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('service-health-open-center'));
    await waitFor(() => expect(screen.getByTestId('servers-center-stub')).toBeInTheDocument());
  });

  it('non-super admin: the summary never renders on the Overview', async () => {
    bootSession('admin');
    renderApp();
    // Give any stray effects a beat.
    await waitFor(() => expect(screen.getAllByText('لوحة القيادة').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('service-health-summary')).toBeNull();
  });
});
