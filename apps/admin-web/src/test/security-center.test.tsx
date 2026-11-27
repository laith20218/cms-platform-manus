import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../lib/api';

/**
 * PR-6 — SecurityCenter tests.
 *
 * Covers the three surfaces of the new super-admin view:
 *   • contract F — the summary strip (honest numbers + top failed IPs) and the
 *     deterministic suspicious-activity indicators (present only when the
 *     recorded numbers warrant them);
 *   • contract G — the events table (rows, severity filter → refetch with the
 *     severity param, pagination → page param, row click → detail drawer with
 *     the description + correlationId + fixed redaction notice);
 *   • states — empty, error, and 403 (honest forbidden surface).
 *
 * All API helpers are mocked (the backend ships in a parallel PR).
 */

const { fetchSecuritySummaryMock, fetchSecurityEventsMock } = vi.hoisted(() => ({
  fetchSecuritySummaryMock: vi.fn(),
  fetchSecurityEventsMock: vi.fn(),
}));

vi.mock('../lib/api', () => ({
  ApiError: class ApiError extends Error {
    status = 500;
    errorCode?: string;
    constructor(message: string, status?: number, errorCode?: string) {
      super(message);
      this.status = status ?? 500;
      this.errorCode = errorCode;
    }
  },
  fetchSecuritySummary: (...args: unknown[]) => fetchSecuritySummaryMock(...args),
  fetchSecurityEvents: (...args: unknown[]) => fetchSecurityEventsMock(...args),
}));

import { SecurityCenter } from '../components/SecurityCenter';

const SUMMARY = {
  generatedAt: '2026-11-22T08:00:00Z',
  failedLogins24h: 12,
  failedLogins7d: 40,
  activeLockouts: 2,
  refreshReuse7d: 3,
  mfaEnabled7d: 5,
  mfaDisabled7d: 1,
  mfaFailed7d: 2,
  criticalEvents7d: 7,
  suspiciousAlerts7d: 4,
  passwordResets7d: 6,
  topFailedLoginIps24h: [
    { ipAddress: '10.0.0.9', count: 15 },
    { ipAddress: '10.0.0.2', count: 3 },
  ],
};

const QUIET_SUMMARY = {
  ...SUMMARY,
  failedLogins24h: 0,
  failedLogins7d: 0,
  activeLockouts: 0,
  refreshReuse7d: 0,
  mfaEnabled7d: 0,
  mfaDisabled7d: 0,
  mfaFailed7d: 0,
  criticalEvents7d: 0,
  suspiciousAlerts7d: 0,
  passwordResets7d: 0,
  topFailedLoginIps24h: [],
};

const EVENT_1 = {
  id: 'e-1',
  eventType: 'LoginFailed',
  severity: 'Warning',
  description: 'محاولة دخول فاشلة للطالب طالب تجريبي',
  ipAddress: '10.0.0.9',
  deviceFingerprint: 'abcdef1234567890',
  correlationId: 'corr-abc-123',
  createdAt: '2026-11-22T07:00:00Z',
  studentId: 's-1',
  studentName: 'طالب تجريبي',
  adminId: null,
  adminName: null,
};

const EVENT_2 = {
  id: 'e-2',
  eventType: 'RefreshReuse',
  severity: 'Critical',
  description: 'إعادة استخدام رمز تحديث',
  ipAddress: null,
  deviceFingerprint: null,
  correlationId: 'corr-def-456',
  createdAt: '2026-11-22T06:00:00Z',
  studentId: null,
  studentName: null,
  adminId: 'a-1',
  adminName: 'مدير دمشق',
};

const onError = vi.fn();
const onNotice = vi.fn();

function paged(items: unknown[], total = items.length, page = 1) {
  return { items, total, page, pageSize: 25, totalPages: Math.max(1, Math.ceil(total / 25)) };
}

function renderCenter(initialEntry = '/security') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <SecurityCenter token="test-token" isArabic onError={onError} onNotice={onNotice} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSecuritySummaryMock.mockResolvedValue(SUMMARY);
  fetchSecurityEventsMock.mockResolvedValue(paged([EVENT_1, EVENT_2]));
});

describe('PR-6 SecurityCenter — summary strip (contract F)', () => {
  it('renders the recorded numbers exactly (no invented values)', async () => {
    renderCenter();
    await screen.findByTestId('security-metric-failed-logins-24h');
    expect(screen.getByTestId('security-metric-failed-logins-24h')).toHaveTextContent('12');
    expect(screen.getByTestId('security-metric-failed-logins-7d')).toHaveTextContent('40');
    expect(screen.getByTestId('security-metric-active-lockouts')).toHaveTextContent('2');
    expect(screen.getByTestId('security-metric-refresh-reuse')).toHaveTextContent('3');
    expect(screen.getByTestId('security-metric-critical-events')).toHaveTextContent('7');
    expect(screen.getByTestId('security-metric-suspicious-alerts')).toHaveTextContent('4');
    expect(screen.getByTestId('security-metric-password-resets')).toHaveTextContent('6');
    // MFA combined card: enabled / disabled / failed.
    expect(screen.getByTestId('security-metric-mfa')).toHaveTextContent('5');
    expect(screen.getByTestId('security-metric-mfa')).toHaveTextContent('1');
    expect(screen.getByTestId('security-metric-mfa')).toHaveTextContent('2');
    // Top failed-login IPs honest list.
    const ips = screen.getByTestId('security-top-failed-ips');
    expect(ips).toHaveTextContent('10.0.0.9');
    expect(ips).toHaveTextContent('15');
  });

  it('renders zero honestly (0 — never a blank or an invented number)', async () => {
    fetchSecuritySummaryMock.mockResolvedValue(QUIET_SUMMARY);
    renderCenter();
    await screen.findByTestId('security-metric-failed-logins-24h');
    expect(screen.getByTestId('security-metric-failed-logins-24h')).toHaveTextContent('0');
    expect(screen.getByTestId('security-top-failed-ips')).toHaveTextContent('لا توجد محاولات دخول فاشلة مسجلة');
  });

  it('shows the honest error state with retry when the summary fails', async () => {
    fetchSecuritySummaryMock.mockRejectedValueOnce(new Error('network down'));
    renderCenter();
    expect(await screen.findByTestId('security-summary-error')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('security-summary-error-retry'));
    await waitFor(() => {
      expect(fetchSecuritySummaryMock).toHaveBeenCalledTimes(2);
    });
  });

  it('shows the honest forbidden (403) surface', async () => {
    fetchSecuritySummaryMock.mockRejectedValueOnce(new ApiError('لا تملك صلاحية عرض السجل الأمني', 403));
    renderCenter();
    expect(await screen.findByTestId('security-summary-forbidden')).toHaveTextContent('لا تملك صلاحية عرض السجل الأمني');
    expect(onError).toHaveBeenCalled();
  });
});

describe('PR-6 SecurityCenter — suspicious-activity indicators', () => {
  it('renders only the indicators the recorded numbers warrant', async () => {
    renderCenter();
    await screen.findByTestId('security-indicators');
    expect(screen.getByTestId('security-indicator-lockouts')).toHaveTextContent('حسابات مقفلة مؤقتاً (2)');
    expect(screen.getByTestId('security-indicator-refreshReuse')).toHaveTextContent('إعادة استخدام رموز التحديث (3)');
    expect(screen.getByTestId('security-indicator-suspicious')).toHaveTextContent('تنبيهات نشاط مشبوه (4)');
    // 15 failures from one IP ≥ 10 → concentration indicator.
    expect(screen.getByTestId('security-indicator-ipConcentration')).toHaveTextContent('تركّز محاولات فاشلة من عنوان واحد');
  });

  it('renders the honest empty indicator state when everything is quiet', async () => {
    fetchSecuritySummaryMock.mockResolvedValue(QUIET_SUMMARY);
    renderCenter();
    await screen.findByTestId('security-indicators');
    expect(screen.queryByTestId('security-indicator-lockouts')).not.toBeInTheDocument();
    expect(screen.queryByTestId('security-indicator-refreshReuse')).not.toBeInTheDocument();
    expect(screen.queryByTestId('security-indicator-suspicious')).not.toBeInTheDocument();
    expect(screen.queryByTestId('security-indicator-ipConcentration')).not.toBeInTheDocument();
    expect(screen.getByTestId('security-indicators')).toHaveTextContent('لا توجد مؤشرات نشاط مشبوه');
  });

  it('does NOT flag concentration below the 10-attempt threshold', async () => {
    fetchSecuritySummaryMock.mockResolvedValue({
      ...SUMMARY,
      activeLockouts: 0,
      refreshReuse7d: 0,
      suspiciousAlerts7d: 0,
      topFailedLoginIps24h: [{ ipAddress: '10.0.0.2', count: 3 }],
    });
    renderCenter();
    await screen.findByTestId('security-indicators');
    expect(screen.queryByTestId('security-indicator-ipConcentration')).not.toBeInTheDocument();
  });
});

describe('PR-6 SecurityCenter — events table (contract G)', () => {
  it('renders rows with the bilingual label, actor and description', async () => {
    renderCenter();
    const row = await screen.findByTestId('security-event-row-e-1');
    expect(row).toHaveTextContent('فشل تسجيل الدخول');
    expect(row).toHaveTextContent('محاولة دخول فاشلة للطالب طالب تجريبي');
    expect(row).toHaveTextContent('طالب · طالب تجريبي');
    expect(row).toHaveTextContent('10.0.0.9');
  });

  it('refetches with the severity param when a severity chip is clicked', async () => {
    renderCenter();
    await screen.findByTestId('security-event-row-e-1');
    fireEvent.click(screen.getByTestId('security-severity-critical'));
    await waitFor(() => {
      expect(fetchSecurityEventsMock).toHaveBeenCalledWith('test-token', expect.objectContaining({ severity: 'Critical' }));
    });
  });

  it('refetches with the page param when the pager advances', async () => {
    fetchSecurityEventsMock.mockResolvedValue(paged([EVENT_1, EVENT_2], 60));
    renderCenter();
    await screen.findByTestId('security-event-row-e-1');
    const pager = screen.getByTestId('security-events-pagination');
    fireEvent.click(within(pager).getByRole('button', { name: 'التالي' }));
    await waitFor(() => {
      expect(fetchSecurityEventsMock).toHaveBeenCalledWith('test-token', expect.objectContaining({ page: 2 }));
    });
  });

  it('row click opens the detail drawer with description, correlationId and the redaction notice', async () => {
    renderCenter();
    fireEvent.click(await screen.findByTestId('security-event-row-e-1'));
    const body = await screen.findByTestId('security-event-detail-body');
    expect(body).toHaveTextContent('محاولة دخول فاشلة للطالب طالب تجريبي');
    expect(screen.getByTestId('security-event-correlation')).toHaveTextContent('corr-abc-123');
    expect(screen.getByTestId('security-event-redaction')).toHaveTextContent('يحجب النظام تلقائياً');
    // Plain-language explanation per event category.
    expect(screen.getByTestId('security-event-explanation')).toHaveTextContent('محاولة دخول فاشلة');
  });

  it('passes the ?student=<id> deep link as the studentId filter', async () => {
    renderCenter('/security?student=s-1');
    await screen.findByTestId('security-event-row-e-1');
    expect(fetchSecurityEventsMock).toHaveBeenCalledWith('test-token', expect.objectContaining({ studentId: 's-1' }));
    expect(screen.getByTestId('security-student-filter')).toBeInTheDocument();
    // Clearing the filter removes the URL parameter and refetches unfiltered.
    fireEvent.click(screen.getByTestId('security-student-filter-clear'));
    await waitFor(() => {
      expect(fetchSecurityEventsMock).toHaveBeenCalledWith('test-token', expect.objectContaining({ studentId: undefined }));
    });
  });

  it('shows the honest empty state when no events match', async () => {
    fetchSecurityEventsMock.mockResolvedValue(paged([]));
    renderCenter();
    expect(await screen.findByTestId('security-events-empty')).toHaveTextContent('لا توجد أحداث مطابقة للتصفية');
  });

  it('shows the honest error state with retry when the events fetch fails', async () => {
    fetchSecurityEventsMock.mockRejectedValueOnce(new Error('network down'));
    renderCenter();
    expect(await screen.findByTestId('security-events-error')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('security-events-error-retry'));
    await waitFor(() => {
      expect(fetchSecurityEventsMock).toHaveBeenCalledTimes(2);
    });
  });

  it('shows the honest forbidden (403) surface for the events table', async () => {
    fetchSecurityEventsMock.mockRejectedValueOnce(new ApiError('لا تملك صلاحية عرض السجل الأمني', 403));
    renderCenter();
    expect(await screen.findByTestId('security-events-forbidden')).toHaveTextContent('لا تملك صلاحية عرض السجل الأمني');
  });
});

describe('PR-6 SecurityCenter — dictionary integrity', () => {
  it('resolves every new security-center key in BOTH locales (no raw paths)', async () => {
    const { t, hasDictKey } = await import('../lib/dictionary');
    const keys = [
      'security.title',
      'security.description',
      'security.summary.failedLogins24h.label',
      'security.summary.failedLogins24h.caption',
      'security.summary.activeLockouts.label',
      'security.summary.refreshReuse7d.label',
      'security.summary.mfa.title',
      'security.summary.topFailedIpsTitle',
      'security.summary.sourceNote',
      'security.indicators.heading',
      'security.indicators.lockouts.title',
      'security.indicators.refreshReuse.explanation',
      'security.indicators.ipConcentration.technical',
      'security.events.emptyTitle',
      'security.detail.redaction',
      'security.detail.correlationId',
      'security.filters.severityAll',
      'security.filters.refresh',
      'security.eventsExplained.loginFailed',
      'security.eventsExplained.refreshReuse',
      'security.eventsExplained.suspiciousActivity',
    ];
    for (const key of keys) {
      expect(hasDictKey(key), `missing bilingual entry for ${key}`).toBe(true);
      expect(t('ar', key)).not.toBe(key);
      expect(t('en', key)).not.toBe(key);
    }
    // nav.security exists for the sidebar + palette label.
    expect(t('ar', 'nav.security')).toBe('مركز الأمان');
    expect(t('en', 'nav.security')).toBe('Security Center');
  });
});
