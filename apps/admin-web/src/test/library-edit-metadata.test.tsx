import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * W-coverage (row 21) — library file metadata edit (PUT /library/{id} existed
 * with no UI). Locks: the edit modal pre-fills title/lecture, requires a
 * title, PATCH-optional difficulty/quality stay null when «بدون تغيير», the
 * PUT body matches the DTO, and the list refreshes after save.
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { LibraryCenter } from '../components/LibraryCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

const FILE = {
  id: 'f1', title: 'ملف منهاج تشريح', type: 'Video', status: 'Published', virusScanStatus: 'Clean',
  subjectNameAr: 'التشريح', fileSize: 1024, category: 'Curriculum', createdAt: '2026-01-01T00:00:00Z',
  lectureId: 'lec1',
} as unknown as Record<string, unknown>;

function makePage(items: unknown[], total: number) {
  return { items, total, page: 1, pageSize: 25, totalPages: Math.max(1, Math.ceil(total / 25)) };
}

const calls: Array<{ path: string; init?: RequestInit }> = [];

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path.startsWith('/api/v1/admin/content/files')) return makePage([FILE], 1);
    if (/\/api\/v1\/library\/f1$/.test(path) && init?.method === 'PUT') return { id: 'f1' };
    return makePage([], 0);
  });
}

function renderCenter() {
  return render(
    <UiPermissionsProvider value={{ phase: 'idle' }}>
      <LibraryCenter token="test-token" isArabic onNotice={vi.fn()} onError={vi.fn()} />
    </UiPermissionsProvider>,
  );
}

async function loadFileList() {
  const statusFilter = screen.getByRole('combobox', { name: 'الحالة' });
  fireEvent.change(statusFilter, { target: { value: 'Draft' } });
  await screen.findByText('ملف منهاج تشريح');
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  stubApi();
});

describe('W-coverage — library metadata edit (row 21)', () => {
  it('opens with the current title, requires one, and PUTs the exact DTO shape', async () => {
    renderCenter();
    await loadFileList();

    fireEvent.click(screen.getByRole('button', { name: 'إجراءات ملف منهاج تشريح' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'تعديل البيانات' }));
    await waitFor(() => expect(screen.getByTestId('library-edit-dialog')).toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'تعديل بيانات الملف' })).toBeInTheDocument();
    expect((screen.getByTestId('library-edit-title') as HTMLInputElement).value).toBe('ملف منهاج تشريح');

    // Save is enabled with the prefilled title; clearing it disables it again.
    expect(screen.getByTestId('library-edit-save')).toBeEnabled();
    fireEvent.change(screen.getByTestId('library-edit-title'), { target: { value: '' } });
    expect(screen.getByTestId('library-edit-save')).toBeDisabled();
    fireEvent.change(screen.getByTestId('library-edit-title'), { target: { value: 'ملف منهاج تشريح — نسخة محدثة' } });
    expect(screen.getByTestId('library-edit-save')).toBeEnabled();

    // PATCH-optional fields left as «بدون تغيير» must NOT travel in the body.
    fireEvent.change(screen.getByTestId('library-edit-tags'), { target: { value: 'مراجعة, نهائي' } });
    fireEvent.click(screen.getByTestId('library-edit-save'));

    await waitFor(() => expect(calls.some((c) => /\/api\/v1\/library\/f1$/.test(c.path) && c.init?.method === 'PUT')).toBe(true));
    const body = JSON.parse(String(calls.find((c) => /\/library\/f1$/.test(c.path))?.init?.body));
    expect(body.title).toBe('ملف منهاج تشريح — نسخة محدثة');
    expect(body.tags).toEqual(['مراجعة', 'نهائي']);
    expect(body.lectureId).toBe('lec1');
    expect(body.difficulty).toBeUndefined();
    expect(body.targetQuality).toBeUndefined();

    // List refresh after save.
    await waitFor(() => expect(calls.filter((c) => c.path.startsWith('/api/v1/admin/content/files')).length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.queryByTestId('library-edit-dialog')).not.toBeInTheDocument());
  });

  it('sends difficulty/targetQuality only when the operator picks a value', async () => {
    renderCenter();
    await loadFileList();
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات ملف منهاج تشريح' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'تعديل البيانات' }));
    await screen.findByTestId('library-edit-dialog');

    fireEvent.change(screen.getByTestId('library-edit-difficulty'), { target: { value: 'Hard' } });
    fireEvent.change(screen.getByTestId('library-edit-quality'), { target: { value: 'P720' } });
    fireEvent.click(screen.getByTestId('library-edit-save'));

    await waitFor(() => expect(calls.some((c) => /\/api\/v1\/library\/f1$/.test(c.path) && c.init?.method === 'PUT')).toBe(true));
    const body = JSON.parse(String(calls.find((c) => /\/library\/f1$/.test(c.path))?.init?.body));
    expect(body.difficulty).toBe('Hard');
    expect(body.targetQuality).toBe('P720');
  });

  it('cancel closes the modal without any PUT', async () => {
    renderCenter();
    await loadFileList();
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات ملف منهاج تشريح' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'تعديل البيانات' }));
    await screen.findByTestId('library-edit-dialog');
    fireEvent.click(screen.getByTestId('library-edit-cancel'));
    await waitFor(() => expect(screen.queryByTestId('library-edit-dialog')).not.toBeInTheDocument());
    expect(calls.some((c) => c.init?.method === 'PUT')).toBe(false);
  });
});
