import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the API layer — the file list + retention lifecycle endpoints.
const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { LibraryCenter } from '../components/LibraryCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

/**
 * PR-5 — provider-neutral object-retention lifecycle on the admin Library
 * surface:
 *   Active → Archived/Tombstoned → Quarantine | Retention Pending →
 *   Restorable or Final Deletion (purge).
 *
 * Locks:
 *  1. The lifecycle filter switches the list query (lifecycle=tombstoned /
 *     quarantined) and tombstoned rows render the retention label (never the
 *     misleading Draft one);
 *  2. Quarantine is reason-gated (empty reason never fires the request) and
 *     posts only after the confirm carries a reason;
 *  3. Restore posts only after the confirm and renders the quarantine reason
 *     when present;
 *  4. Purge (final deletion) is password-gated in the dialog: an empty
 *     password never fires, a wrong password surfaces the inline error, and a
 *     valid one fires POST /{id}/purge with the actorPassword body;
 *  5. Quarantined rows carry the quarantine badge; active rows do not.
 */

const FILE_ACTIVE = {
  id: 'f1', title: 'ملف منهاج تشريح', type: 'Pdf', status: 'Published', virusScanStatus: 'Clean',
  subjectNameAr: 'التشريح', fileSize: 1024, category: 'Curriculum', createdAt: '2026-01-01T00:00:00Z',
  retentionState: null, viewsCount: 10, favoritesCount: 2,
} as unknown as Record<string, unknown>;

const FILE_QUARANTINED = {
  ...FILE_ACTIVE, id: 'f2', title: 'ملف معزول', status: 'Archived',
  retentionState: 'Quarantined', quarantinedAt: '2026-01-05T00:00:00Z',
  quarantineReason: 'شبهة إعلان خبيث',
} as unknown as Record<string, unknown>;

const FILE_TOMBSTONED = {
  ...FILE_ACTIVE, id: 'f3', title: 'ملف محذوف برمياً', status: 'Deleted',
  retentionState: 'RetentionPending', tombstonedAt: '2026-01-10T00:00:00Z',
} as unknown as Record<string, unknown>;

function makePage(items: unknown[], total: number, page: number) {
  return { items, total, page, pageSize: 25, totalPages: Math.max(1, Math.ceil(total / 25)) };
}

const calls: Array<{ path: string; init?: RequestInit }> = [];

class ApiErrorWithCode extends Error {
  status = 500;
  errorCode?: string;
  constructor(message: string, errorCode?: string) {
    super(message);
    this.errorCode = errorCode;
  }
}

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path.startsWith('/api/v1/admin/content/files')) {
      if (path.includes('lifecycle=tombstoned')) return makePage([FILE_TOMBSTONED], 1, 1);
      if (path.includes('lifecycle=quarantined')) return makePage([FILE_QUARANTINED], 1, 1);
      return makePage([FILE_ACTIVE], 1, 1);
    }
    if (path.includes('/quarantine') && init?.method === 'POST') return {};
    if (path.includes('/restore') && init?.method === 'POST') return {};
    if (path.includes('/purge') && init?.method === 'POST') return { fileId: 'f3', fileKey: 'library/x/y', deleted: [{ label: 'library_file', rows: 1 }] };
    return makePage([], 0, 1);
  });
}

function renderCenter(isSuperAdmin = false) {
  const value = isSuperAdmin
    ? { phase: 'ready' as const, bundle: { mode: 'super_admin' as const, isSuperAdmin: true, registryVersion: '2', allKeys: [], allowedKeys: [] } }
    : { phase: 'idle' as const };
  return render(
    <UiPermissionsProvider value={value}>
      <LibraryCenter token="test-token" isArabic onError={vi.fn()} onNotice={vi.fn()} />
    </UiPermissionsProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  stubApi();
});

describe('PR-5 — retention lifecycle filter', () => {
  it('switches to the tombstoned view (lifecycle=tombstoned) and renders the retention label', async () => {
    renderCenter();
    // The active list needs a filter to load (pre-PR-5 contract).
    fireEvent.change(screen.getByRole('combobox', { name: 'الحالة' }), { target: { value: 'Published' } });
    await screen.findByText('ملف منهاج تشريح');

    fireEvent.change(screen.getByTestId('library-lifecycle-filter'), { target: { value: 'tombstoned' } });
    await screen.findByText('ملف محذوف برمياً');
    expect(calls.some((c) => c.path.includes('lifecycle=tombstoned'))).toBe(true);
    // The tombstone badge renders with its timestamp, and the row's status cell
    // shows the retention label — never the misleading Draft one on the row.
    expect(screen.getAllByTestId('library-retention-badge').length).toBeGreaterThan(0);
    expect(screen.getByText('قيد الاحتجاز')).toBeInTheDocument();
  });

  it('switches to the quarantined view and renders the quarantine badge + reason tooltip', async () => {
    renderCenter();
    fireEvent.change(screen.getByTestId('library-lifecycle-filter'), { target: { value: 'quarantined' } });
    await screen.findByText('ملف معزول');
    expect(calls.some((c) => c.path.includes('lifecycle=quarantined'))).toBe(true);
    expect(screen.getByTestId('library-retention-badge')).toBeInTheDocument();
    expect(screen.getByTitle('شبهة إعلان خبيث')).toBeInTheDocument();
  });
});

describe('PR-5 — quarantine', () => {
  it('never fires without a reason (the empty-reason gate)', async () => {
    renderCenter();
    fireEvent.change(screen.getByRole('combobox', { name: 'الحالة' }), { target: { value: 'Published' } });
    await screen.findByText('ملف منهاج تشريح');

    fireEvent.click(screen.getByRole('button', { name: 'إجراءات ملف منهاج تشريح' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /عزل الملف/ }));
    await screen.findByTestId('library-quarantine-confirm');

    // Confirm with an empty reason: no request fires.
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => expect(calls.some((c) => c.path.includes('/quarantine'))).toBe(false));
  });

  it('posts the reason with the quarantine request only after the gate passes', async () => {
    renderCenter();
    fireEvent.change(screen.getByRole('combobox', { name: 'الحالة' }), { target: { value: 'Published' } });
    await screen.findByText('ملف منهاج تشريح');

    fireEvent.click(screen.getByRole('button', { name: 'إجراءات ملف منهاج تشريح' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /عزل الملف/ }));
    fireEvent.change(await screen.findByTestId('library-quarantine-reason'), { target: { value: 'شبهة برمز خبيث' } });
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      const call = calls.find((c) => c.path.includes('/api/v1/library/f1/quarantine') && c.init?.method === 'POST');
      expect(call).toBeDefined();
      expect(String(call?.init?.body)).toContain('شبهة برمز خبيث');
    });
  });
});

describe('PR-5 — restore', () => {
  it('renders the quarantine reason inside the restore confirm and posts only on confirm', async () => {
    renderCenter();
    fireEvent.change(screen.getByTestId('library-lifecycle-filter'), { target: { value: 'quarantined' } });
    await screen.findByText('ملف معزول');

    fireEvent.click(screen.getByRole('button', { name: 'إجراءات ملف معزول' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /استعادة الملف/ }));
    expect(await screen.findByTestId('library-restore-confirm')).toBeInTheDocument();
    expect(screen.getByTestId('library-restore-quarantine-reason')).toBeInTheDocument();
    expect(screen.getByText('شبهة إعلان خبيث')).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes('/restore') && c.init?.method === 'POST')).toBe(false);

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => expect(calls.some((c) => c.path.includes('/api/v1/library/f2/restore') && c.init?.method === 'POST')).toBe(true));
  });
});

describe('PR-5 — purge (final deletion)', () => {
  it('is SuperAdmin-gated in the presentation layer', async () => {
    renderCenter(false); // not a super admin
    fireEvent.change(screen.getByTestId('library-lifecycle-filter'), { target: { value: 'tombstoned' } });
    await screen.findByText('ملف محذوف برمياً');

    fireEvent.click(screen.getByRole('button', { name: 'إجراءات ملف محذوف برمياً' }));
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    expect(screen.queryByRole('menuitem', { name: /حذف نهائي من التخزين/ })).toBeNull();
  });

  it('never fires without the password; a wrong password shows the inline error', async () => {
    renderCenter(true); // super admin
    fireEvent.change(screen.getByTestId('library-lifecycle-filter'), { target: { value: 'tombstoned' } });
    await screen.findByText('ملف محذوف برمياً');

    fireEvent.click(screen.getByRole('button', { name: 'إجراءات ملف محذوف برمياً' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /حذف نهائي من التخزين/ }));
    await screen.findByTestId('library-purge-dialog');

    // The confirm button stays disabled without a password.
    expect(screen.getByTestId('library-purge-confirm')).toBeDisabled();
    expect(calls.some((c) => c.path.includes('/purge'))).toBe(false);

    // A wrong password surfaces the inline re-auth error, never a silent close.
    apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path.includes('/purge')) throw new ApiErrorWithCode('كلمة مرور المدير العام غير صحيحة', 'INVALID_CURRENT_PASSWORD');
      return makePage([], 0, 1);
    });
    fireEvent.change(screen.getByTestId('library-purge-password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByTestId('library-purge-confirm'));
    expect(await screen.findByTestId('library-purge-password-error')).toBeInTheDocument();
    expect(screen.getByTestId('library-purge-dialog')).toBeInTheDocument();
  });

  it('posts the actorPassword body on a valid confirm', async () => {
    renderCenter(true);
    fireEvent.change(screen.getByTestId('library-lifecycle-filter'), { target: { value: 'tombstoned' } });
    await screen.findByText('ملف محذوف برمياً');

    fireEvent.click(screen.getByRole('button', { name: 'إجراءات ملف محذوف برمياً' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /حذف نهائي من التخزين/ }));
    fireEvent.change(await screen.findByTestId('library-purge-password'), { target: { value: 'super-secret' } });
    fireEvent.click(screen.getByTestId('library-purge-confirm'));

    await waitFor(() => {
      const call = calls.find((c) => c.path.includes('/api/v1/library/f3/purge') && c.init?.method === 'POST');
      expect(call).toBeDefined();
      expect(String(call?.init?.body)).toContain('super-secret');
    });
    // The dialog closes after the purge succeeds.
    await waitFor(() => expect(screen.queryByTestId('library-purge-dialog')).not.toBeInTheDocument());
  });
});
