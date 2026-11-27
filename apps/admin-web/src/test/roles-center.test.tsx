/**
 * PR-7 — RolesCenter conflict-messaging tests (Role Studio).
 *
 * Covers:
 *   • the inline delete-conflict banner (RoleDeleteConflictBanner — rendered
 *     by App.tsx inside the role-delete ConfirmDialog):
 *       – ROLE_HAS_ADMINS → the bilingual count message built from the live
 *         adminCount shown on the role card;
 *       – SYSTEM_ROLE_DELETE_FORBIDDEN → the mapped message from the shared
 *         errors.ts code map;
 *   • the high-impact system-role note on the role cards;
 *   • the disabled-role assignment mapping (ROLE_DISABLED) both locales.
 *
 * All API helpers are mocked (the backend ships in the parallel PR).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { RolesCenter, RoleDeleteConflictBanner } from '../components/RolesCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';
import { apiErrorHumanMessage } from '../lib/dictionary';

const COPY: Record<string, string> = {
  rolesTitle: 'الأدوار والصلاحيات',
  addRole: 'إنشاء دور',
  active: 'نشط',
  disabled: 'معطّل',
  system: 'نظامي',
  custom: 'مخصص',
  adminsCount: 'عدد المدراء',
  permissions: 'الصلاحيات',
  noRoles: 'لا توجد أدوار',
  delete: 'حذف',
  deactivate: 'تعطيل',
  activate: 'تفعيل',
};

const ROLES = [
  { id: 'r-1', name: 'super_admin', nameAr: 'مدير عام', description: null, isSystem: true, isActive: true, adminCount: 1, permissionCount: 19, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'r-2', name: 'content_reviewer', nameAr: 'مراجع محتوى', description: 'مراجعة المحتوى قبل النشر', isSystem: false, isActive: true, adminCount: 3, permissionCount: 4, createdAt: '2026-01-01T00:00:00Z' },
];

function renderCenter() {
  return render(
    <UiPermissionsProvider value={{ phase: 'idle' }}>
      <RolesCenter
        copy={COPY}
        isArabic
        token="test-token"
        roles={ROLES}
        busy={false}
        loading={false}
        onCreate={vi.fn()}
        onStatus={vi.fn()}
        onDelete={vi.fn()}
        onError={vi.fn()}
        onNotice={vi.fn()}
      />
    </UiPermissionsProvider>,
  );
}

describe('PR-7 RolesCenter — inline delete-conflict banner', () => {
  it('ROLE_HAS_ADMINS renders the bilingual count message from the card metric', () => {
    render(
      <RoleDeleteConflictBanner
        errorCode="ROLE_HAS_ADMINS"
        humanMessage="انقل المدراء إلى دور آخر قبل حذف هذا الدور"
        adminCount={3}
        isArabic
      />,
    );

    const banner = screen.getByTestId('role-delete-conflict');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveTextContent('الدور معيّن لـ 3 مديراً — انقلهم إلى دور آخر قبل الحذف');
  });

  it('ROLE_HAS_ADMINS renders the English count message in the EN locale', () => {
    render(
      <RoleDeleteConflictBanner
        errorCode="ROLE_HAS_ADMINS"
        humanMessage="Move the assigned administrators to another role before deleting this one."
        adminCount={3}
        isArabic={false}
      />,
    );

    expect(screen.getByTestId('role-delete-conflict')).toHaveTextContent(
      'The role is assigned to 3 administrators — move them to another role before deleting.',
    );
  });

  it('falls back to the mapped human message when no count is known', () => {
    render(
      <RoleDeleteConflictBanner
        errorCode="ROLE_HAS_ADMINS"
        humanMessage="انقل المدراء إلى دور آخر قبل حذف هذا الدور"
        adminCount={0}
        isArabic
      />,
    );

    expect(screen.getByTestId('role-delete-conflict')).toHaveTextContent('انقل المدراء إلى دور آخر قبل حذف هذا الدور');
  });

  it('SYSTEM_ROLE_DELETE_FORBIDDEN renders the mapped bilingual message', () => {
    const human = apiErrorHumanMessage({ message: 'x', errorCode: 'SYSTEM_ROLE_DELETE_FORBIDDEN' }, 'ar').human;
    render(
      <RoleDeleteConflictBanner
        errorCode="SYSTEM_ROLE_DELETE_FORBIDDEN"
        humanMessage={human}
        adminCount={0}
        isArabic
      />,
    );

    expect(screen.getByTestId('role-delete-conflict')).toHaveTextContent('أدوار نظامية لا تُحذف');
  });

  it('unmapped failures surface the resolved human message verbatim', () => {
    render(
      <RoleDeleteConflictBanner
        errorCode={undefined}
        humanMessage="تعذر الاتصال بالخادم"
        adminCount={2}
        isArabic
      />,
    );

    expect(screen.getByTestId('role-delete-conflict')).toHaveTextContent('تعذر الاتصال بالخادم');
  });
});

describe('PR-7 RolesCenter — high-impact system-role copy', () => {
  it('system role cards carry the impact note; custom role cards do not', () => {
    renderCenter();

    const notes = screen.getAllByTestId('role-system-impact-note');
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent('تغيير حالة دور نظامي يمسّ كل المدراء المعيّنين له فوراً');
  });

  it('renders the live admin count on every card (the banner derives from it)', () => {
    renderCenter();

    const cards = screen.getAllByText('3');
    expect(cards.length).toBeGreaterThan(0);
  });
});

describe('PR-7 — ROLE_DISABLED assignment conflict mapping', () => {
  it('maps the code bilingually (ar/en)', () => {
    expect(apiErrorHumanMessage({ message: 'x', errorCode: 'ROLE_DISABLED' }, 'ar').human).toBe('لا يمكن تعيين دور معطّل');
    expect(apiErrorHumanMessage({ message: 'x', errorCode: 'ROLE_DISABLED' }, 'en').human).toBe('A disabled role cannot be assigned.');
  });
});
