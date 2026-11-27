/**
 * PR-7 — Settings Studio tests (SettingsCenter).
 *
 * Covers the PR-7 surfaces on top of the legacy title checks:
 *   • typed edit controls driven by the server valueType registry —
 *     int → bounded number input, enum → Select over allowedValues,
 *     bool → two-button segmented control (نعم/لا);
 *   • local bound-violation feedback (bilingual, save blocked — UX only,
 *     the server stays authoritative);
 *   • server 400 SETTING_VALUE_INVALID → apiErrorHumanMessage code mapping;
 *   • per-setting change-history drawer (rows, diff, pagination refetch, empty);
 *   • read-only feature-flags section: super admin sees the 5 flags with NO
 *     mutation affordance; non-super admin — the section is absent entirely
 *     and the endpoint is never called;
 *   • the security-category banner explaining the super-admin reservation.
 *
 * All API helpers are mocked (the backend ships in the parallel PR).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const { apiRequestMock, fetchFeatureFlagsMock, fetchSettingHistoryMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  fetchFeatureFlagsMock: vi.fn(),
  fetchSettingHistoryMock: vi.fn(),
}));

vi.mock('../lib/api', () => ({
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
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  fetchFeatureFlags: (...args: unknown[]) => fetchFeatureFlagsMock(...args),
  fetchSettingHistory: (...args: unknown[]) => fetchSettingHistoryMock(...args),
}));

import { SettingsCenter } from '../components/SettingsCenter';
import { ApiError } from '../lib/api';
// Push 3: SettingsCenter reads useUiPermissions() — tests wrap it in the provider.
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

const onError = vi.fn();
const onNotice = vi.fn();

const SETTINGS = [
  { id: 's1', key: 'max_login_attempts', value: '5', valueType: 'int', allowedValues: null, description: 'أقصى محاولات دخول فاشلة قبل القفل', category: 'platform', updatedBy: null, updatedAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
  { id: 's2', key: 'default_language', value: 'ar', valueType: 'enum', allowedValues: ['ar', 'en'], description: 'لغة المنصة الافتراضية', category: 'platform', updatedBy: null, updatedAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
  { id: 's3', key: 'maintenance_mode', value: 'false', valueType: 'bool', allowedValues: null, description: 'وضع الصيانة', category: 'platform', updatedBy: null, updatedAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
  { id: 's4', key: 'session_timeout_minutes', value: '15', valueType: 'int', allowedValues: null, description: 'انتهاء الجلسة', category: 'security', updatedBy: null, updatedAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
];

const FLAGS = [
  { key: 'Features:OtpEnabled', rawEnvName: 'Features__OtpEnabled', value: 'false', valueType: 'bool', source: 'default', editable: false },
  { key: 'Features:OfflineEnabled', rawEnvName: 'Features__OfflineEnabled', value: 'true', valueType: 'bool', source: 'environment', editable: false },
  { key: 'Features:HardDeleteEnabled', rawEnvName: 'Features__HardDeleteEnabled', value: 'false', valueType: 'bool', source: 'default', editable: false },
  { key: 'Security:PlayIntegrity:Enabled', rawEnvName: 'Security__PlayIntegrity__Enabled', value: 'false', valueType: 'bool', source: 'default', editable: false },
  { key: 'Library:RetentionDays', rawEnvName: 'Library__RetentionDays', value: '30', valueType: 'int', source: 'default', editable: false },
];

const historyRow = (id: string, reason = 'update') => ({
  id,
  key: 'max_login_attempts',
  oldValue: '5',
  newValue: '4',
  changedBy: 'admin-1',
  changedByName: 'ليث',
  changedAt: '2026-11-20T10:00:00Z',
  reason,
});

function renderCenter({ isArabic = true, isSuperAdmin = true }: { isArabic?: boolean; isSuperAdmin?: boolean } = {}) {
  return render(
    <UiPermissionsProvider value={{ phase: 'idle' }}>
      <SettingsCenter token="test-token" isArabic={isArabic} isSuperAdmin={isSuperAdmin} onError={onError} onNotice={onNotice} />
    </UiPermissionsProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockImplementation(async (path: string) => {
    if (typeof path === 'string' && path.startsWith('/api/v1/admin/settings')) return SETTINGS;
    return SETTINGS;
  });
  fetchFeatureFlagsMock.mockResolvedValue(FLAGS);
  fetchSettingHistoryMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
});

describe('SettingsCenter — page titles (regression)', () => {
  it('renders the English title', () => {
    renderCenter({ isArabic: false });
    expect(screen.getByText('System Settings')).toBeInTheDocument();
  });

  it('renders the Arabic title', () => {
    renderCenter();
    expect(screen.getByText('إعدادات النظام')).toBeInTheDocument();
  });
});

describe('PR-7 SettingsCenter — typed edit controls', () => {
  it('int keys edit through a bounded number input', async () => {
    renderCenter();
    // First row of the platform group is the int setting.
    fireEvent.click((await screen.findAllByText('تعديل'))[0]);

    const input = screen.getByTestId('setting-edit-input');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('min', '3');
    expect(input).toHaveAttribute('max', '10');
  });

  it('enum keys edit through a Select exposing exactly the allowed values', async () => {
    renderCenter();
    fireEvent.click((await screen.findAllByText('تعديل'))[1]);

    const select = screen.getByTestId('setting-edit-enum');
    const options = within(select).getAllByRole('option') as HTMLOptionElement[];
    expect(options.map(option => option.value)).toEqual(['ar', 'en']);
  });

  it('bool keys edit through the نعم/لا segmented control and submit the wire value', async () => {
    renderCenter();
    fireEvent.click((await screen.findAllByText('تعديل'))[2]);

    const group = screen.getByTestId('setting-edit-bool');
    const yes = within(group).getByText('نعم');
    const no = within(group).getByText('لا');
    expect(yes).toHaveAttribute('aria-pressed', 'false');
    expect(no).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(yes);
    expect(yes).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByText('حفظ'));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/v1/admin/settings/maintenance_mode',
        'test-token',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ value: 'true', description: 'وضع الصيانة' }),
        }),
      );
    });
  });
});

describe('PR-7 SettingsCenter — local bound-violation feedback', () => {
  it('shows the bilingual bounds message, flags the input invalid and blocks the save', async () => {
    renderCenter();
    fireEvent.click((await screen.findAllByText('تعديل'))[0]);

    const input = screen.getByTestId('setting-edit-input');
    fireEvent.change(input, { target: { value: '99' } });

    const error = await screen.findByTestId('setting-edit-error');
    expect(error).toHaveTextContent('أدخل رقماً صحيحاً بين 3 و 10');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    const save = screen.getByText('حفظ');
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(apiRequestMock).not.toHaveBeenCalledWith(
      '/api/v1/admin/settings/max_login_attempts',
      'test-token',
      expect.anything(),
    );
  });

  it('renders the English bounds message in the EN locale', async () => {
    renderCenter({ isArabic: false });
    fireEvent.click((await screen.findAllByText('Edit'))[0]);
    fireEvent.change(screen.getByTestId('setting-edit-input'), { target: { value: '1' } });

    expect(await screen.findByTestId('setting-edit-error')).toHaveTextContent('Enter a whole number between 3 and 10');
  });
});

describe('PR-7 SettingsCenter — server 400 SETTING_VALUE_INVALID mapping', () => {
  it('surfaces the mapped bilingual message via apiErrorHumanMessage (not the raw text)', async () => {
    apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
      if (init?.method === 'PUT' && path === '/api/v1/admin/settings/maintenance_mode') {
        throw new ApiError('قيمة الإعداد غير صالحة', 400, 'SETTING_VALUE_INVALID');
      }
      return SETTINGS;
    });

    renderCenter();
    fireEvent.click((await screen.findAllByText('تعديل'))[2]);
    fireEvent.click(within(screen.getByTestId('setting-edit-bool')).getByText('نعم'));
    fireEvent.click(screen.getByText('حفظ'));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('قيمة الإعداد غير صالحة');
    });
  });
});

describe('PR-7 SettingsCenter — per-setting history drawer', () => {
  it('opens from the per-row affordance and renders diff rows with actor + reason badge', async () => {
    fetchSettingHistoryMock.mockResolvedValue({ items: [historyRow('h1'), historyRow('h2', 'reset')], total: 2, page: 1, pageSize: 10, totalPages: 1 });

    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: 'سجل تغييرات max_login_attempts' }));

    expect(await screen.findByTestId('setting-history-drawer')).toBeInTheDocument();
    const rows = await screen.findAllByTestId('setting-history-row');
    expect(rows).toHaveLength(2);

    // Diff emphasis: old (struck) → new (bold) + actor + reason badges.
    expect(rows[0]).toHaveTextContent('5');
    expect(rows[0]).toHaveTextContent('4');
    expect(rows[0]).toHaveTextContent('ليث');
    expect(within(rows[0]).getByTestId('setting-history-reason-update')).toHaveTextContent('تعديل');
    expect(within(rows[1]).getByTestId('setting-history-reason-reset')).toHaveTextContent('إعادة تعيين');
  });

  it('refetches with the next page number on pagination (page size 10)', async () => {
    fetchSettingHistoryMock.mockImplementation(async (_key: string, _token: string, page: number) => ({
      items: page === 1
        ? Array.from({ length: 10 }, (_, i) => historyRow(`p1-${i}`))
        : [historyRow('p2-0')],
      total: 11,
      page,
      pageSize: 10,
      totalPages: 2,
    }));

    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: 'سجل تغييرات max_login_attempts' }));

    expect(await screen.findAllByTestId('setting-history-row')).toHaveLength(10);
    expect(fetchSettingHistoryMock).toHaveBeenCalledWith('max_login_attempts', 'test-token', 1, 10);

    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    await waitFor(() => {
      expect(fetchSettingHistoryMock).toHaveBeenCalledWith('max_login_attempts', 'test-token', 2, 10);
    });
    expect(await screen.findAllByTestId('setting-history-row')).toHaveLength(1);
  });

  it('renders the empty state when nothing was ever recorded', async () => {
    fetchSettingHistoryMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });

    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: 'سجل تغييرات max_login_attempts' }));

    expect(await screen.findByTestId('setting-history-empty')).toHaveTextContent('لم يُسجَّل أي تغيير على هذا الإعداد بعد.');
  });
});

describe('PR-7 SettingsCenter — read-only feature-flags inventory', () => {
  it('super admin: renders the 5 flags, read-only notice, env names and NO mutation affordance', async () => {
    renderCenter();

    const section = await screen.findByTestId('settings-feature-flags');
    expect(section).toBeInTheDocument();
    expect(screen.getByTestId('settings-feature-flags-readonly')).toHaveTextContent('للعرض فقط');

    const rows = await screen.findAllByTestId('settings-feature-flag-row');
    expect(rows).toHaveLength(5);

    // Bilingual per-flag labels + notes (scoped — DangerZone also renders for
    // the super admin and shares some module vocabulary).
    expect(within(section).getByText('رمز التحقق للطلاب (OTP)')).toBeInTheDocument();
    expect(within(section).getByText('الحزم دون اتصال')).toBeInTheDocument();
    expect(within(section).getByText('الحذف النهائي من الواجهة')).toBeInTheDocument();
    expect(within(section).getByText('فحص Play Integrity')).toBeInTheDocument();
    expect(within(section).getByText('مدة الاستبقاء قبل الحذف')).toBeInTheDocument();
    const hardDeleteNote = within(section)
      .getAllByTestId('settings-feature-flag-note')
      .find(note => note.textContent?.includes('fail-closed'));
    expect(hardDeleteNote).toBeDefined();

    // Raw env names (mono) + source badges (scoped to the section).
    expect(within(section).getByText('Features__HardDeleteEnabled')).toBeInTheDocument();
    expect(within(section).getAllByTestId('settings-feature-flag-source')).toHaveLength(5);

    // FORBIDDEN: no toggle/checkbox/switch anywhere in the section.
    expect(within(section).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(section).queryAllByRole('switch')).toHaveLength(0);
    // The int flag renders its value, not an enabled/disabled toggle state.
    expect(within(section)
      .getAllByTestId('settings-feature-flag-state')
      .map(badge => badge.textContent)).toContain('القيمة: 30');
  });

  it('non-super admin: the section is absent entirely and the endpoint is never called', () => {
    renderCenter({ isSuperAdmin: false });

    expect(screen.queryByTestId('settings-feature-flags')).not.toBeInTheDocument();
    expect(fetchFeatureFlagsMock).not.toHaveBeenCalled();
  });
});

describe('PR-7 SettingsCenter — security-category banner', () => {
  it('explains (bilingually) why the security category is super-admin-only', async () => {
    renderCenter();

    const note = await screen.findByTestId('settings-security-note');
    expect(note).toHaveTextContent('إعدادات فئة الأمان مخصصة للمدير العام فقط');
  });
});
