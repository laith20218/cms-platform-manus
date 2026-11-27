import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * PR-6 — StudentsCenter completion tests.
 *
 * Covers the new surfaces added by the Student Center rebuild:
 *   • contract B  — the overview-tab detail panel (lockout / must-change /
 *     archived / academic scope / subscriptions / identity);
 *   • contract A  — the password-reset dialog (typed confirm + actor
 *     re-auth + exact payload + never-echoed password);
 *   • contract C  — the Activity tab (rows, filters, pagination, empty);
 *   • contract D  — archive / restore confirm + refetch;
 *   • contract E  — the archived status filter option;
 *   • deep link   — ?student=<id> opens the drawer via the detail endpoint.
 *
 * All API helpers are mocked (the backend ships in a parallel PR).
 */

const {
  apiRequestMock,
  fetchStudentDetailMock,
  fetchStudentActivityMock,
  resetStudentPasswordMock,
  archiveStudentMock,
  restoreStudentMock,
} = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  fetchStudentDetailMock: vi.fn(),
  fetchStudentActivityMock: vi.fn(),
  resetStudentPasswordMock: vi.fn(),
  archiveStudentMock: vi.fn(),
  restoreStudentMock: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  fetchSecuritySummary: vi.fn(() => Promise.reject(new Error('security summary not stubbed for this test'))),
  ApiError: class ApiError extends Error {
    status = 500;
    errorCode?: string;
    constructor(message: string, status?: number, errorCode?: string) {
      super(message);
      this.status = status ?? 500;
      this.errorCode = errorCode;
    }
  },
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  fetchStudentDetail: (...args: unknown[]) => fetchStudentDetailMock(...args),
  fetchStudentActivity: (...args: unknown[]) => fetchStudentActivityMock(...args),
  resetStudentPassword: (...args: unknown[]) => resetStudentPasswordMock(...args),
  archiveStudent: (...args: unknown[]) => archiveStudentMock(...args),
  restoreStudent: (...args: unknown[]) => restoreStudentMock(...args),
}));

import { StudentsCenter } from '../components/StudentsCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

const STUDENT = {
  id: 's-1',
  fullName: 'طالب تجريبي',
  phone: '0999999999',
  status: 'Active',
  lastLogin: '2026-11-20T10:00:00Z',
  questionsAnswered: 40,
  accuracy: 75,
  createdAt: '2026-01-01T00:00:00Z',
  universityName: 'جامعة دمشق',
  collegeName: 'كلية الطب',
  archived: false,
};

const DETAIL = {
  id: 's-1',
  fullName: 'طالب تجريبي',
  phone: '0999999999',
  status: 'Active',
  banReason: null,
  banUntil: null,
  lockedOut: false,
  lockoutUntil: null,
  failedLoginCount: 2,
  phoneVerified: false,
  mustChangePassword: true,
  archived: false,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: null,
  lastLogin: '2026-11-20T10:00:00Z',
  loginCount: 5,
  lastActivityDate: null,
  questionsAnswered: 40,
  correctAnswers: 30,
  accuracy: 75,
  currentStreak: 0,
  longestStreak: 0,
  academic: {
    universityId: 'u-1',
    universityName: 'جامعة دمشق',
    collegeId: 'c-1',
    collegeName: 'كلية الطب',
    academicYearId: 'y-1',
    academicYearName: 'السنة الأولى',
  },
  subscriptionSummary: {
    activeCount: 1,
    latest: { id: 'sub-1', status: 'Active', scopeType: 'Year', startsAt: '2026-01-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z' },
  },
  activeDevice: null,
};

const ACTIVITY_ITEM = {
  id: 'a-1',
  eventType: 'LoginFailed',
  severity: 'warning',
  description: 'محاولة دخول فاشلة',
  ipAddress: '192.168.1.10',
  deviceFingerprint: 'fp-1234567890abcdef',
  correlationId: 'corr-1',
  createdAt: '2026-11-21T09:00:00Z',
  adminName: null,
  actorType: 'student',
};

const onError = vi.fn();
const onNotice = vi.fn();

const PERMISSIONS = {
  phase: 'ready',
  bundle: { mode: 'super_admin', isSuperAdmin: true, registryVersion: 'v2', allKeys: [], allowedKeys: [] },
} as const;

function renderCenter(initialEntry = '/students') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <UiPermissionsProvider value={PERMISSIONS as never}>
        <StudentsCenter token="test-token" isArabic onError={onError} onNotice={onNotice} />
      </UiPermissionsProvider>
    </MemoryRouter>,
  );
}

async function openDrawer() {
  fireEvent.click(await screen.findByTestId(`student-open-${STUDENT.id}`));
}

/** openDrawer + wait for the detail panel (only valid when the detail fetch succeeds). */
async function openDrawerAndWaitForDetail() {
  fireEvent.click(await screen.findByTestId(`student-open-${STUDENT.id}`));
  await screen.findByTestId('student-detail-panel');
}

beforeEach(() => {
  vi.clearAllMocks();
  apiRequestMock.mockImplementation(async (path: string) => {
    if (typeof path === 'string' && path.startsWith('/api/v1/admin/students?')) {
      return { items: [STUDENT], total: 1, page: 1, pageSize: 20, totalPages: 1 };
    }
    if (typeof path === 'string' && path.startsWith('/api/v1/universities')) {
      return { items: [], total: 0, page: 1, pageSize: 100, totalPages: 1 };
    }
    if (typeof path === 'string' && path.includes('/logs')) return [];
    if (typeof path === 'string' && path.includes('/sessions')) return [];
    return { items: [] };
  });
  fetchStudentDetailMock.mockResolvedValue(DETAIL);
  fetchStudentActivityMock.mockResolvedValue({ items: [ACTIVITY_ITEM], total: 1, page: 1, pageSize: 10, totalPages: 1 });
  resetStudentPasswordMock.mockResolvedValue(undefined);
  archiveStudentMock.mockResolvedValue(undefined);
  restoreStudentMock.mockResolvedValue(undefined);
});

describe('PR-6 StudentsCenter — overview detail panel (contract B)', () => {
  it('renders the account-state fields: lockout, failed attempts, phone verification, must-change-password', async () => {
    renderCenter();
    await openDrawerAndWaitForDetail();
    expect(screen.getByTestId('student-detail-lockout')).toHaveTextContent('قفل مؤقت بعد محاولات فاشلة');
    expect(screen.getByTestId('student-detail-failed-logins')).toHaveTextContent('2');
    expect(screen.getByTestId('student-detail-phone-verified')).toHaveTextContent('الهاتف غير موثّق');
    expect(screen.getByTestId('student-detail-must-change')).toHaveTextContent('يلزم تغيير كلمة المرور عند الدخول التالي');
  });

  it('renders the academic scope card, subscription summary and identity card', async () => {
    renderCenter();
    await openDrawerAndWaitForDetail();

    const scope = screen.getByTestId('student-detail-academic');
    expect(scope).toHaveTextContent('جامعة دمشق');
    expect(scope).toHaveTextContent('كلية الطب');
    expect(scope).toHaveTextContent('السنة الأولى');

    const subscriptions = screen.getByTestId('student-detail-subscriptions');
    expect(subscriptions).toHaveTextContent('1');

    const identity = screen.getByTestId('student-detail-identity');
    expect(identity).toHaveTextContent('5');
  });

  it('shows the amber archived banner + restore action when the student is archived', async () => {
    fetchStudentDetailMock.mockResolvedValue({ ...DETAIL, archived: true, archivedAt: '2026-11-21T00:00:00Z' });
    renderCenter();
    await openDrawerAndWaitForDetail();

    const banner = screen.getByTestId('student-detail-archived');
    expect(banner).toHaveTextContent('مؤرشف — خارج الخدمة');
    expect(banner).toHaveTextContent('استعادة الحساب');
    expect(screen.getByTestId('student-detail-restore')).toBeInTheDocument();
  });

  it('offers an honest error state + retry when the detail endpoint fails', async () => {
    fetchStudentDetailMock.mockRejectedValueOnce(new Error('network down'));
    renderCenter();
    await openDrawer();

    expect(await screen.findByTestId('student-detail-error')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('student-detail-retry'));
    await waitFor(() => {
      expect(fetchStudentDetailMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe('PR-6 StudentsCenter — password reset dialog (contract A)', () => {
  it('requires the typed phone confirmation before enabling submit, then submits the exact payload', async () => {
    renderCenter();
    await openDrawerAndWaitForDetail();

    fireEvent.click(screen.getByTestId('student-password-reset-open'));
    const form = await screen.findByTestId('student-password-reset-form');
    expect(form).toBeInTheDocument();

    const submit = screen.getByTestId('reset-submit');
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByTestId('reset-actor-password'), { target: { value: 'admin-secret-pass' } });
    fireEvent.change(screen.getByTestId('reset-new-password'), { target: { value: 'new-pass-123' } });
    fireEvent.change(screen.getByTestId('reset-confirm-password'), { target: { value: 'new-pass-123' } });
    fireEvent.change(screen.getByTestId('reset-typed-confirm'), { target: { value: 'wrong-phone' } });
    expect(screen.getByTestId('reset-submit')).toBeDisabled();

    fireEvent.change(screen.getByTestId('reset-typed-confirm'), { target: { value: STUDENT.phone } });
    expect(screen.getByTestId('reset-submit')).toBeEnabled();

    fireEvent.submit(form);

    await waitFor(() => {
      expect(resetStudentPasswordMock).toHaveBeenCalledWith('s-1', 'test-token', {
        actorPassword: 'admin-secret-pass',
        newPassword: 'new-pass-123',
        forceChangeOnNextLogin: true,
      });
    });
    await waitFor(() => {
      expect(onNotice).toHaveBeenCalledWith('تمت إعادة تعيين كلمة المرور وإنهاء الجلسات.');
    });
    // Dialog closed after the 204.
    await waitFor(() => {
      expect(screen.queryByTestId('student-password-reset-form')).not.toBeInTheDocument();
    });
    // The new password is NEVER echoed in the DOM after submit.
    expect(screen.queryByDisplayValue('new-pass-123')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('admin-secret-pass')).not.toBeInTheDocument();
  });

  it('surfaces INVALID_CURRENT_PASSWORD as the Arabic error (toast + inline)', async () => {
    resetStudentPasswordMock.mockRejectedValueOnce(
      Object.assign(new Error('كلمة مرور المدير العام غير صحيحة'), { status: 400, errorCode: 'INVALID_CURRENT_PASSWORD' }),
    );
    renderCenter();
    await openDrawerAndWaitForDetail();

    fireEvent.click(screen.getByTestId('student-password-reset-open'));
    await screen.findByTestId('student-password-reset-form');
    fireEvent.change(screen.getByTestId('reset-actor-password'), { target: { value: 'wrong-admin-pass' } });
    fireEvent.change(screen.getByTestId('reset-new-password'), { target: { value: 'new-pass-123' } });
    fireEvent.change(screen.getByTestId('reset-confirm-password'), { target: { value: 'new-pass-123' } });
    fireEvent.change(screen.getByTestId('reset-typed-confirm'), { target: { value: STUDENT.phone } });
    fireEvent.submit(screen.getByTestId('student-password-reset-form'));

    expect(await screen.findByTestId('reset-error')).toHaveTextContent('كلمة مرور المدير العام غير صحيحة');
    expect(onError).toHaveBeenCalledWith('كلمة مرور المدير العام غير صحيحة');
    // The dialog stays open so the operator can correct the password.
    expect(screen.getByTestId('student-password-reset-form')).toBeInTheDocument();
  });
});

describe('PR-6 StudentsCenter — archive / restore (contract D)', () => {
  it('archives via the row-actions menu after an explicit confirm, then refreshes the list', async () => {
    renderCenter();
    await screen.findByText('طالب تجريبي');

    // Row actions ⋮ menu.
    const rowMenu = screen.getAllByRole('button', { name: 'إجراءات طالب تجريبي' })[0];
    fireEvent.click(rowMenu);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'أرشفة حساب الطالب' }));

    const confirm = await screen.findByTestId('student-lifecycle-confirm');
    expect(confirm).toHaveTextContent('الأرشفة حذف منطقي');
    // Nothing fired before the explicit confirm.
    expect(archiveStudentMock).not.toHaveBeenCalled();

    fireEvent.click(within(confirm).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(archiveStudentMock).toHaveBeenCalledWith('s-1', 'test-token');
    });
    await waitFor(() => {
      expect(onNotice).toHaveBeenCalledWith('تمت أرشفة حساب الطالب.');
    });
    // The list refetch happens after the lifecycle action.
    await waitFor(() => {
      const listCalls = apiRequestMock.mock.calls.filter(
        ([path]) => typeof path === 'string' && path.startsWith('/api/v1/admin/students?'),
      );
      expect(listCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('restores an archived student from the detail panel banner', async () => {
    fetchStudentDetailMock.mockResolvedValue({ ...DETAIL, archived: true });
    renderCenter();
    await openDrawerAndWaitForDetail();

    fireEvent.click(screen.getByTestId('student-detail-restore'));
    const confirm = await screen.findByTestId('student-lifecycle-confirm');
    expect(confirm).toHaveTextContent('استعادة حساب مؤرشف');
    fireEvent.click(within(confirm).getByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      expect(restoreStudentMock).toHaveBeenCalledWith('s-1', 'test-token');
    });
    await waitFor(() => {
      expect(onNotice).toHaveBeenCalledWith('تمت استعادة حساب الطالب.');
    });
  });
});

describe('PR-6 StudentsCenter — activity tab (contract C)', () => {
  it('renders paged activity rows with the actor, IP and truncated fingerprint', async () => {
    renderCenter();
    await openDrawer();

    fireEvent.click(screen.getByRole('tab', { name: 'سجل النشاط' }));
    const row = await screen.findByTestId('student-activity-row');
    expect(row).toHaveTextContent('فشل تسجيل الدخول');
    expect(row).toHaveTextContent('محاولة دخول فاشلة');
    expect(row).toHaveTextContent('الطالب');
    expect(row).toHaveTextContent('192.168.1.10');
    // Truncated fingerprint display (8 chars + …).
    expect(row).toHaveTextContent('fp-12345…');
    expect(screen.getByTestId('student-activity-pagination')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchStudentActivityMock).toHaveBeenCalledWith('s-1', 'test-token', { page: 1, pageSize: 10 });
    });
  });

  it('shows the honest empty state when no events match', async () => {
    fetchStudentActivityMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
    renderCenter();
    await openDrawer();
    fireEvent.click(screen.getByRole('tab', { name: 'سجل النشاط' }));

    expect(await screen.findByTestId('student-activity-empty')).toHaveTextContent('لا توجد أحداث مطابقة للتصفية');
  });
});

describe('PR-6 StudentsCenter — deep link (?student=<id>)', () => {
  it('opens the drawer from the detail endpoint when the row is not on the loaded page', async () => {
    renderCenter('/students?student=s-1');
    await waitFor(() => {
      expect(fetchStudentDetailMock).toHaveBeenCalledWith('s-1', 'test-token');
    });
    expect(await screen.findByTestId('student-detail-panel')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'تفاصيل الطالب' })).toBeInTheDocument();
  });
});
