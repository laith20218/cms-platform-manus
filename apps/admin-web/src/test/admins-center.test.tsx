/**
 * PR-7 — AdminsCenter effective-access tests (Role Studio inspector).
 *
 * Covers the per-admin "الوصول الفعّال / Effective access" drawer over
 * GET /api/v1/admin/admins/{id}/effective-permissions:
 *   • super-admin target → the bypass explanation, the empty-grants note and
 *     the full UI-permission envelope;
 *   • custom-admin target → the role-grants explanation, the grants table
 *     (resource × actions × scope) and the academic-scope card;
 *   • honest error state + retry;
 *   • LAST_SUPER_ADMIN bilingual mapping (the code map surfaces the backend's
 *     Arabic sentence in AR and a localized explanation in EN — the same
 *     resolver App's admin-lifecycle toasts now use).
 *
 * All API helpers are mocked (the backend ships in the parallel PR).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { fetchAdminEffectivePermissionsMock } = vi.hoisted(() => ({
  fetchAdminEffectivePermissionsMock: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchSecuritySummary: vi.fn(() => Promise.reject(new Error('security summary not stubbed for this test'))),
  ApiError: class ApiError extends Error {
    status: number;
    errorCode?: string;
    humanMessage?: string;
    constructor(message: string, status?: number, errorCode?: string, humanMessage?: string) {
      super(message);
      this.status = status ?? 500;
      this.errorCode = errorCode;
      this.humanMessage = humanMessage;
    }
  },
  fetchAdminEffectivePermissions: (...args: unknown[]) => fetchAdminEffectivePermissionsMock(...args),
}));

import { AdminsCenter } from '../components/AdminsCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';
import { apiErrorHumanMessage } from '../lib/dictionary';

const COPY: Record<string, string> = {
  adminList: 'المدراء',
  addAdmin: 'إضافة مدير',
  search: 'بحث',
  role: 'الدور',
  all: 'الكل',
  status: 'الحالة',
  active: 'نشط',
  disabled: 'معطّل',
  clear: 'مسح',
  actions: 'إجراءات',
  view: 'عرض',
  edit: 'تعديل',
  reset: 'إعادة تعيين',
  delete: 'حذف',
  deactivate: 'تعطيل',
  activate: 'تفعيل',
  noAdmins: 'لا يوجد مدراء',
  scope: 'النطاق',
};

const ADMIN_SUPER = {
  id: 'a-1',
  fullName: 'مدير عام',
  email: 'root@cms.test',
  phone: null,
  roleId: 'r-1',
  roleName: 'super_admin',
  roleNameAr: 'مدير عام',
  status: 'active',
  lastLogin: null,
  createdAt: '2026-01-01T00:00:00Z',
};

const ADMIN_CUSTOM = {
  id: 'a-2',
  fullName: 'مشرف محتوى',
  email: 'content@cms.test',
  phone: null,
  roleId: 'r-2',
  roleName: 'content_manager',
  roleNameAr: 'مدير محتوى',
  status: 'active',
  lastLogin: null,
  createdAt: '2026-01-01T00:00:00Z',
  scopeUniversityId: 'u-1',
  scopeUniversityName: 'جامعة دمشق',
};

const EFFECTIVE_SUPER = {
  adminId: 'a-1',
  email: 'root@cms.test',
  fullName: 'مدير عام',
  isActive: true,
  role: { id: 'r-1', name: 'super_admin', nameAr: 'مدير عام', isActive: true },
  isSuperAdmin: true,
  accessSource: 'super_admin_bypass',
  grants: [],
  uiPermissions: { mode: 'full', allowedKeysCount: 70, registryVersion: 'v2' },
  academicScope: {
    universityId: null, universityName: null,
    collegeId: null, collegeName: null,
    yearId: null, yearName: null,
    subjectId: null, subjectName: null,
  },
};

const EFFECTIVE_CUSTOM = {
  adminId: 'a-2',
  email: 'content@cms.test',
  fullName: 'مشرف محتوى',
  isActive: true,
  role: { id: 'r-2', name: 'content_manager', nameAr: 'مدير محتوى', isActive: true },
  isSuperAdmin: false,
  accessSource: 'role_grants',
  grants: [
    { resource: 'questions', actions: ['view', 'create'], scope: 'own' },
    { resource: 'library', actions: ['view'], scope: 'all' },
  ],
  uiPermissions: { mode: 'custom', allowedKeysCount: 12, registryVersion: 'v2' },
  academicScope: {
    universityId: 'u-1', universityName: 'جامعة دمشق',
    collegeId: 'c-1', collegeName: 'كلية الطب',
    yearId: null, yearName: null,
    subjectId: null, subjectName: null,
  },
};

const ROLES = [
  { id: 'r-1', name: 'super_admin', nameAr: 'مدير عام', description: null, isSystem: true, isActive: true, adminCount: 1, permissionCount: 19, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'r-2', name: 'content_manager', nameAr: 'مدير محتوى', description: null, isSystem: false, isActive: true, adminCount: 1, permissionCount: 2, createdAt: '2026-01-01T00:00:00Z' },
];

function renderCenter() {
  return render(
    <UiPermissionsProvider value={{ phase: 'idle' }}>
      <AdminsCenter
        copy={COPY}
        isArabic
        token="test-token"
        admins={[ADMIN_SUPER, ADMIN_CUSTOM]}
        roles={ROLES}
        total={2}
        query=""
        roleFilter=""
        statusFilter="all"
        busy={false}
        loading={false}
        scopeText={(admin) => admin.scopeUniversityName ?? '—'}
        setQuery={vi.fn()}
        setRoleFilter={vi.fn()}
        setStatusFilter={vi.fn()}
        clearFilters={vi.fn()}
        onCreate={vi.fn()}
        onEdit={vi.fn()}
        onReset={vi.fn()}
        onDelete={vi.fn()}
        onStatus={vi.fn()}
      />
    </UiPermissionsProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchAdminEffectivePermissionsMock.mockResolvedValue(EFFECTIVE_SUPER);
});

describe('PR-7 AdminsCenter — effective-access drawer', () => {
  it('renders the per-row action affordance with the bilingual label', () => {
    renderCenter();
    const button = screen.getByTestId('admin-effective-a-1');
    expect(button).toHaveAttribute('aria-label', 'الوصول الفعّال — مدير عام');
  });

  it('super-admin target: bypass explanation, empty-grants note and full UI envelope', async () => {
    renderCenter();
    fireEvent.click(screen.getByTestId('admin-effective-a-1'));

    const drawer = await screen.findByTestId('admin-effective-drawer');
    expect(drawer).toBeInTheDocument();

    // Access source explanation (exact backend-contract copy).
    expect(await screen.findByTestId('admin-effective-source-explanation'))
      .toHaveTextContent('يتجاوز هذا الحساب فحوصات الصلاحيات لكونه مديراً عاماً — الحماية الحقيقية تبقى في الخادم.');
    expect(screen.getByTestId('admin-effective-source-badge')).toHaveTextContent('تجاوز المدير العام');

    // Grants list is empty for the bypass — the honest empty note renders.
    const grants = screen.getByTestId('admin-effective-grants');
    expect(grants).toHaveTextContent('لا توجد صلاحيات ممنوحة لهذا الدور');
    expect(screen.queryAllByTestId('admin-effective-grant-row')).toHaveLength(0);

    // UI-permission envelope: full mode + allowed-key count + registry version.
    const envelope = screen.getByTestId('admin-effective-ui-envelope');
    expect(envelope).toHaveTextContent('كامل');
    expect(envelope).toHaveTextContent('70');
    expect(envelope).toHaveTextContent('v2');

    // Academic scope: unassigned → the platform-wide note.
    expect(screen.getByTestId('admin-effective-scope')).toHaveTextContent('غير محدد — المنصة بالكامل');
  });

  it('custom-admin target: grants table + academic scope card + custom UI envelope', async () => {
    fetchAdminEffectivePermissionsMock.mockResolvedValue(EFFECTIVE_CUSTOM);
    renderCenter();

    fireEvent.click(screen.getByTestId('admin-effective-a-2'));
    await screen.findByTestId('admin-effective-drawer');

    // Role-grants explanation.
    expect(screen.getByTestId('admin-effective-source-explanation'))
      .toHaveTextContent('الصلاحيات تُفرض في الخادم من دور هذا الحساب.');
    expect(screen.getByTestId('admin-effective-source-badge')).toHaveTextContent('صلاحيات الدور');

    // Grants table: resource × actions × scope.
    const rows = screen.getAllByTestId('admin-effective-grant-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('questions');
    expect(rows[0]).toHaveTextContent('view');
    expect(rows[0]).toHaveTextContent('create');
    expect(rows[0]).toHaveTextContent('own');

    // Academic scope card with resolved names.
    const scope = screen.getByTestId('admin-effective-scope');
    expect(scope).toHaveTextContent('جامعة دمشق');
    expect(scope).toHaveTextContent('كلية الطب');

    // UI envelope: custom mode + 12 keys.
    const envelope = screen.getByTestId('admin-effective-ui-envelope');
    expect(envelope).toHaveTextContent('مخصص');
    expect(envelope).toHaveTextContent('12');
  });

  it('renders an honest error state and retries the fetch', async () => {
    fetchAdminEffectivePermissionsMock.mockRejectedValueOnce(new Error('network down'));
    renderCenter();

    fireEvent.click(screen.getByTestId('admin-effective-a-1'));
    expect(await screen.findByTestId('admin-effective-error')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('admin-effective-error-retry'));
    await waitFor(() => {
      expect(fetchAdminEffectivePermissionsMock).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByTestId('admin-effective-identity')).toBeInTheDocument();
  });
});

describe('PR-7 — LAST_SUPER_ADMIN bilingual surfacing (admin lifecycle toasts)', () => {
  it('maps the code to the backend Arabic sentence and an English explanation', () => {
    const arabicSentence = 'لا يمكن تنفيذ هذا الإجراء على آخر مدير عام فعّال — يحمي النظام من فقدان الوصول الكامل';
    expect(apiErrorHumanMessage({ message: 'x', errorCode: 'LAST_SUPER_ADMIN' }, 'ar').human).toBe(arabicSentence);
    expect(apiErrorHumanMessage({ message: 'x', errorCode: 'LAST_SUPER_ADMIN' }, 'en').human)
      .toContain('last effective super administrator');
  });

  it('prefers the backend humanMessage extension (Arabic domain detail) in either locale', () => {
    const arabicSentence = 'لا يمكن تنفيذ هذا الإجراء على آخر مدير عام فعّال — يحمي النظام من فقدان الوصول الكامل';
    const out = apiErrorHumanMessage(
      { message: 'technical', humanMessage: arabicSentence, errorCode: 'LAST_SUPER_ADMIN' },
      'en',
    );
    expect(out.human).toBe(arabicSentence);
  });

  it('keeps the drawer row rendering when a rejection lacks a code (generic fallback)', () => {
    const out = apiErrorHumanMessage(null, 'ar');
    expect(out.human).toBeTruthy();
  });
});
