import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the API layer — the file list + lifecycle endpoints.
const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  fetchSecuritySummary: vi.fn(() => Promise.reject(new Error('security summary not stubbed for this test'))),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { LibraryCenter } from '../components/LibraryCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

const FILE_DRAFT = {
  id: 'f1', title: 'ملف منهاج تشريح', type: 'Pdf', status: 'Draft', virusScanStatus: 'Clean',
  subjectNameAr: 'التشريح', fileSize: 1024, category: 'Curriculum', createdAt: '2026-01-01T00:00:00Z',
} as unknown as Record<string, unknown>;

const FILE_PUBLISHED = {
  id: 'f2', title: 'ملف محاضرة فيسيولوجي', type: 'Pdf', status: 'Published', virusScanStatus: 'Clean',
  subjectNameAr: 'الفيسيولوجي', fileSize: 2048, category: 'Lecture', createdAt: '2026-01-02T00:00:00Z',
} as unknown as Record<string, unknown>;

function makePage(items: unknown[], total: number, page: number) {
  return { items, total, page, pageSize: 25, totalPages: Math.max(1, Math.ceil(total / 25)) };
}

const calls: Array<{ path: string; init?: RequestInit }> = [];

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path.startsWith('/api/v1/admin/content/files')) return makePage([FILE_DRAFT, FILE_PUBLISHED], 60, 1);
    if (path.includes('/publish') && init?.method === 'POST') return {};
    if (path.includes('/archive') && init?.method === 'POST') return {};
    if (/\/api\/v1\/library\/f\d+$/.test(path) && init?.method === 'DELETE') return undefined;
    return makePage([], 0, 1);
  });
}

function renderCenter(isArabic = true) {
  return render(
    <UiPermissionsProvider value={{ phase: 'idle' }}>
      <LibraryCenter token="test-token" isArabic={isArabic} onNotice={vi.fn()} onError={vi.fn()} />
    </UiPermissionsProvider>,
  );
}

async function loadFileList() {
  // The list only loads when a filter is active (subject/status/category/search).
  const statusFilter = screen.getByRole('combobox', { name: 'الحالة' });
  fireEvent.change(statusFilter, { target: { value: 'Draft' } });
  await screen.findByText('ملف منهاج تشريح');
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  stubApi();
});

describe('LibraryCenter file lifecycle — W2 confirm gates + pager', () => {
  it('publishes a file only after an explicit confirm dialog with consequence text', async () => {
    renderCenter();
    await loadFileList();

    // Clicking publish (draft + clean) must NOT fire the request immediately.
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات ملف منهاج تشريح' }));
    const publishBtn = await screen.findByRole('menuitem', { name: 'نشر' });
    fireEvent.click(publishBtn);
    expect(screen.getByTestId('library-publish-confirm')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'نشر الملف' })).toBeInTheDocument();
    expect(screen.getByText(/مرئيًا لجميع الطلاب/)).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes('/publish'))).toBe(false);

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(calls.some((c) => c.path.includes('/api/v1/library/f1/publish') && c.init?.method === 'POST')).toBe(true);
    });
  });

  it('archives a published file only after an explicit confirm dialog', async () => {
    renderCenter();
    await loadFileList();

    fireEvent.click(screen.getByRole('button', { name: 'إجراءات ملف محاضرة فيسيولوجي' }));
    const archiveBtn = await screen.findByRole('menuitem', { name: 'أرشفة' });
    fireEvent.click(archiveBtn);
    expect(screen.getByRole('dialog', { name: 'أرشفة الملف' })).toBeInTheDocument();
    expect(screen.getByText(/سيُخفى الملف/)).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes('/archive'))).toBe(false);

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(calls.some((c) => c.path.includes('/api/v1/library/f2/archive') && c.init?.method === 'POST')).toBe(true);
    });
  });

  it('keeps delete behind the danger confirm and never fires on cancel', async () => {
    renderCenter();
    await loadFileList();

    fireEvent.click(screen.getByRole('button', { name: 'إجراءات ملف منهاج تشريح' }));
    const deleteBtn = await screen.findByRole('menuitem', { name: 'حذف' });
    fireEvent.click(deleteBtn);
    expect(screen.getByRole('dialog', { name: 'تأكيد الحذف' })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(false);
  });

  it('renders the shared pager when total exceeds one page and fetches the requested page', async () => {
    renderCenter();
    await loadFileList();

    expect(screen.getByTestId('library-files-pagination')).toBeInTheDocument();
    expect(screen.getByText('صفحة 1 من 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    await waitFor(() => {
      expect(calls.some((c) => c.path.includes('page=2'))).toBe(true);
    });
  });

  it('renders the English pager labels in the EN locale', async () => {
    renderCenter(false);
    const statusFilter = screen.getByRole('combobox', { name: 'Status' });
    fireEvent.change(statusFilter, { target: { value: 'Draft' } });
    await screen.findByText('ملف منهاج تشريح');

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });
});
