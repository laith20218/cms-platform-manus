import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the API layer — course list + lifecycle + delete endpoints.
const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { CoursesCenter } from '../components/CoursesCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

const COURSE = {
  id: 'c1', title: 'كورس التشريح المرضي', subjectName: 'التشريح', episodesCount: 3,
  viewsCount: 120, status: 'Draft', createdAt: '2026-01-01T00:00:00Z',
};

const calls: Array<{ path: string; init?: RequestInit }> = [];

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path.startsWith('/api/v1/admin/courses?')) {
      return { items: [COURSE], total: 1, page: 1, pageSize: 50, totalPages: 1 };
    }
    if (path.includes('/publish') && init?.method === 'POST') return {};
    if (/\/api\/v1\/admin\/courses\/c1$/.test(path) && init?.method === 'DELETE') return undefined;
    return { items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 };
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

describe('CoursesCenter — W2 confirm gates + create Drawer', () => {
  it('opens course creation in the accessible Drawer (Esc closes, no request fired)', async () => {
    renderCenter();
    fireEvent.click(await screen.findByText('إنشاء كورس'));
    expect(screen.getByTestId('course-create-drawer')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'إنشاء كورس جديد' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('course-create-drawer')).not.toBeInTheDocument());
    expect(calls.some((c) => c.init?.method === 'POST')).toBe(false);
  });

  it('publishes a course only after an explicit confirm dialog', async () => {
    renderCenter();
    await screen.findByText('كورس التشريح المرضي');

    fireEvent.click(screen.getByRole('button', { name: 'إجراءات كورس التشريح المرضي' }));
    const publishBtn = await screen.findByRole('menuitem', { name: 'نشر' });
    fireEvent.click(publishBtn);
    expect(screen.getByTestId('course-lifecycle-confirm')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'نشر الكورس' })).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes('/publish'))).toBe(false);

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(calls.some((c) => c.path.includes('/api/v1/admin/courses/c1/publish') && c.init?.method === 'POST')).toBe(true);
    });
  });

  it('course delete requires the danger confirm AND the acknowledge gate before firing', async () => {
    renderCenter();
    await screen.findByText('كورس التشريح المرضي');

    fireEvent.click(screen.getByRole('button', { name: 'إجراءات كورس التشريح المرضي' }));
    const deleteBtn = await screen.findByRole('menuitem', { name: 'حذف' });
    fireEvent.click(deleteBtn);
    expect(screen.getByRole('dialog', { name: 'حذف الكورس نهائيًا' })).toBeInTheDocument();
    expect(screen.getByText(/مع جميع حلقاته وملفات الفيديو المخزنة/)).toBeInTheDocument();

    const confirm = screen.getByTestId('confirm-dialog-confirm');
    expect(confirm).toBeDisabled();
    fireEvent.click(screen.getByLabelText('أفهم أن الحذف نهائي ولا يمكن التراجع عنه'));
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    await waitFor(() => {
      expect(calls.some((c) => c.path.endsWith('/api/v1/admin/courses/c1') && c.init?.method === 'DELETE')).toBe(true);
    });
  });

  it('cancel on the delete dialog never sends the DELETE', async () => {
    renderCenter();
    await screen.findByText('كورس التشريح المرضي');
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات كورس التشريح المرضي' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'حذف' }));
    fireEvent.click(screen.getByLabelText('أفهم أن الحذف نهائي ولا يمكن التراجع عنه'));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(false);
  });
});
