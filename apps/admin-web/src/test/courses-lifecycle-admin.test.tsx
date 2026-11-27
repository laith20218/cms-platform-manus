import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the API layer — course list + lifecycle + usage endpoints.
const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  fetchSecuritySummary: vi.fn(() => Promise.reject(new Error('security summary not stubbed for this test'))),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { CoursesCenter } from '../components/CoursesCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

/**
 * PR-5 — course (video course) lifecycle completion:
 *  1. unpublish appears only for Published rows and posts only after confirm;
 *  2. duplicate copies metadata as a fresh Draft (confirm text explains the
 *     no-episodes rule) and posts only after confirm;
 *  3. restore appears only for Archived rows and posts only after confirm;
 *  4. the archive confirm carries the real usage/dependency numbers from the
 *     usage endpoint (episodes / views / favorites);
 *  5. server-side pagination + status filter reach the wire (page, status, search).
 */

const COURSE_PUBLISHED = {
  id: 'c1', title: 'كورس التشريح المرضي', subjectName: 'التشريح', episodesCount: 3,
  viewsCount: 120, status: 'Published', createdAt: '2026-01-01T00:00:00Z',
};
const COURSE_ARCHIVED = { ...COURSE_PUBLISHED, id: 'c2', title: 'كورس مؤرشف', status: 'Archived' };
const COURSE_DRAFT = { ...COURSE_PUBLISHED, id: 'c3', title: 'كورس مسودة', status: 'Draft' };

const USAGE = {
  courseId: 'c1', episodesCount: 3, totalEpisodeViews: 450,
  episodeFavorites: 12, hasInFlightUploads: false,
};

const calls: Array<{ path: string; init?: RequestInit }> = [];

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path.startsWith('/api/v1/admin/courses?')) {
      return { items: [COURSE_PUBLISHED, COURSE_ARCHIVED, COURSE_DRAFT], total: 3, page: 1, pageSize: 20, totalPages: 1 };
    }
    if (path.startsWith('/api/v1/admin/courses/c1/usage')) return USAGE;
    if (path.includes('/archive') && init?.method === 'POST') return {};
    if (path.includes('/unpublish') && init?.method === 'POST') return {};
    if (path.includes('/duplicate') && init?.method === 'POST') return {};
    if (path.includes('/restore') && init?.method === 'POST') return {};
    return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
  });
}

function renderCenter() {
  return render(
    <UiPermissionsProvider value={{ phase: 'idle' }}>
      <CoursesCenter token="test-token" isArabic onError={vi.fn()} onNotice={vi.fn()} subjectId="s1" />
    </UiPermissionsProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  stubApi();
});

describe('PR-5 — course unpublish', () => {
  it('shows unpublish only for Published rows and posts only after confirm', async () => {
    renderCenter();
    await screen.findByText('كورس التشريح المرضي');

    // Published row: unpublish exists.
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات كورس التشريح المرضي' }));
    expect(await screen.findByRole('menuitem', { name: /إلغاء النشر/ })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);

    // Draft row: no unpublish.
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات كورس مسودة' }));
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    expect(screen.queryByRole('menuitem', { name: /إلغاء النشر/ })).toBeNull();
    fireEvent.pointerDown(document.body);

    // Confirm gate with the episodes-untouched consequence text.
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات كورس التشريح المرضي' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /إلغاء النشر/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/الحلقات ومشاهداتها ومفضلات الطلاب تبقى دون تغيير/)).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes('/unpublish'))).toBe(false);

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => expect(calls.some((c) => c.path.includes('/api/v1/admin/courses/c1/unpublish') && c.init?.method === 'POST')).toBe(true));
  });
});

describe('PR-5 — course duplicate', () => {
  it('shows duplicate on every row with the no-episodes consequence text and posts only on confirm', async () => {
    renderCenter();
    await screen.findByText('كورس التشريح المرضي');

    fireEvent.click(screen.getByRole('button', { name: 'إجراءات كورس التشريح المرضي' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /نسخ كمسودة/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/بدون الحلقات/)).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes('/duplicate'))).toBe(false);

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => expect(calls.some((c) => c.path.includes('/api/v1/admin/courses/c1/duplicate') && c.init?.method === 'POST')).toBe(true));
  });

  it('cancel in the duplicate confirm never posts', async () => {
    renderCenter();
    await screen.findByText('كورس التشريح المرضي');
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات كورس التشريح المرضي' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /نسخ كمسودة/ }));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.some((c) => c.path.includes('/duplicate'))).toBe(false);
  });
});

describe('PR-5 — course restore', () => {
  it('shows restore only for Archived rows and posts only after confirm', async () => {
    renderCenter();
    await screen.findByText('كورس مؤرشف');

    // Draft row: no restore.
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات كورس مسودة' }));
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    expect(screen.queryByRole('menuitem', { name: /استعادة من الأرشفة/ })).toBeNull();
    fireEvent.pointerDown(document.body);

    // Archived row: restore + confirm.
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات كورس مؤرشف' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /استعادة من الأرشفة/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes('/restore'))).toBe(false);

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => expect(calls.some((c) => c.path.includes('/api/v1/admin/courses/c2/restore') && c.init?.method === 'POST')).toBe(true));
  });
});

describe('PR-5 — real usage numbers inside the archive confirm', () => {
  it('fetches the usage endpoint when opening the archive dialog and renders the chips', async () => {
    renderCenter();
    await screen.findByText('كورس التشريح المرضي');

    fireEvent.click(screen.getByRole('button', { name: 'إجراءات كورس التشريح المرضي' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'أرشفة' }));
    await waitFor(() => expect(calls.some((c) => c.path.includes('/api/v1/admin/courses/c1/usage'))).toBe(true));

    const warning = await screen.findByTestId('course-usage-warning');
    expect(warning).toBeInTheDocument();
    expect(screen.getByText('عدد الحلقات: 3')).toBeInTheDocument();
    expect(screen.getByText('إجمالي المشاهدات: 450')).toBeInTheDocument();
    expect(screen.getByText('مفضلات الطلاب لهذه الحلقات: 12')).toBeInTheDocument();
  });
});

describe('PR-5 — server-side pagination + filters reach the wire', () => {
  it('sends page, pageSize and the status filter to the list endpoint', async () => {
    renderCenter();
    await screen.findByText('كورس التشريح المرضي');

    fireEvent.change(screen.getByTestId('courses-status-filter'), { target: { value: 'Published' } });
    await waitFor(() => {
      expect(calls.some((c) => c.path.startsWith('/api/v1/admin/courses?') && c.path.includes('status=Published'))).toBe(true);
    });
    const latest = calls.filter((c) => c.path.startsWith('/api/v1/admin/courses?')).at(-1);
    expect(latest?.path).toContain('page=1');
    expect(latest?.path).toContain('pageSize=20');
  });

  it('renders the shared pager when total exceeds one page and fetches the requested page', async () => {
    apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path.startsWith('/api/v1/admin/courses?')) {
        return { items: [COURSE_PUBLISHED], total: 45, page: 1, pageSize: 20, totalPages: 3 };
      }
      return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
    });
    renderCenter();
    await screen.findByText('كورس التشريح المرضي');

    expect(screen.getByTestId('courses-list-pagination')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    await waitFor(() => expect(calls.some((c) => c.path.includes('page=2'))).toBe(true));
  });
});
