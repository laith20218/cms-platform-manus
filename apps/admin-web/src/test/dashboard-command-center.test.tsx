/**
 * Command Center final pass — dashboard Command Header, Needs-Attention and
 * Security-status coverage (Phase 7 evidence).
 *
 * The tests pin the honesty contract: derived environment chip, truthful API
 * connectivity, real conditions only in Needs-Attention, and real contract-F
 * security metrics (never fabricated zeroes).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommandHeader } from '../components/dashboard/CommandHeader';
import { NeedsAttention } from '../components/dashboard/NeedsAttention';
import { SecurityStatus } from '../components/dashboard/SecurityStatus';

vi.mock('../lib/api', () => ({
  fetchSecuritySummary: vi.fn(),
}));

import { fetchSecuritySummary } from '../lib/api';

const securityMock = vi.mocked(fetchSecuritySummary);

const SUMMARY = {
  generatedAt: '2026-11-27T08:00:00Z',
  failedLogins24h: 3,
  failedLogins7d: 9,
  activeLockouts: 0,
  refreshReuse7d: 0,
  mfaEnabled7d: 1,
  mfaDisabled7d: 0,
  mfaFailed7d: 0,
  criticalEvents7d: 0,
  suspiciousAlerts7d: 0,
  passwordResets7d: 2,
  topFailedLoginIps24h: [{ ipAddress: '10.0.0.9', count: 3 }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CommandHeader', () => {
  it('renders the derived environment chip, API connectivity and last-updated', () => {
    render(
      <CommandHeader
        isArabic
        environmentLabel="بيئة المعاينة"
        apiStatus="healthy"
        updatedLabel="٢٠٢٦/١١/٢٧"
        onRefresh={() => {}}
        refreshing={false}
        statsFailed={false}
      />,
    );
    expect(screen.getByTestId('dashboard-env-chip')).toHaveTextContent('بيئة المعاينة');
    expect(screen.getByTestId('dashboard-api-chip')).toHaveTextContent('متصل');
    expect(screen.getByTestId('dashboard-updated')).toHaveTextContent('٢٠٢٦/١١/٢٧');
    expect(screen.queryByTestId('dashboard-command-stale')).not.toBeInTheDocument();
  });

  it('shows the degraded connectivity and the stale note when metrics failed', () => {
    render(
      <CommandHeader
        isArabic
        environmentLabel="بيئة الإنتاج"
        apiStatus="degraded"
        updatedLabel="—"
        onRefresh={() => {}}
        refreshing={false}
        statsFailed
      />,
    );
    expect(screen.getByTestId('dashboard-api-chip')).toHaveTextContent('متقطع');
    expect(screen.getByTestId('dashboard-command-stale')).toBeInTheDocument();
  });

  it('the single primary action (refresh) fires once and shows the busy label', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(
      <CommandHeader isArabic environmentLabel="بيئة" apiStatus="healthy" updatedLabel="—" onRefresh={onRefresh} refreshing={false} statsFailed={false} />,
    );
    fireEvent.click(screen.getByTestId('dashboard-refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);

    rerender(
      <CommandHeader isArabic environmentLabel="بيئة" apiStatus="healthy" updatedLabel="—" onRefresh={onRefresh} refreshing statsFailed={false} />,
    );
    expect(screen.getByTestId('dashboard-refresh')).toBeDisabled();
    expect(screen.getByTestId('dashboard-refresh')).toHaveTextContent('جارٍ التحديث…');
  });
});

describe('NeedsAttention', () => {
  it('renders real conditions with their navigation actions', () => {
    const onOpenReports = vi.fn();
    render(
      <NeedsAttention
        isArabic
        pendingReports={4}
        serviceHealth="unavailable"
        statsFailed={false}
        onOpenReports={onOpenReports}
        onOpenServers={() => {}}
        onRetryStats={() => {}}
      />,
    );
    expect(screen.getByTestId('needs-attention-reports')).toHaveTextContent('4');
    expect(screen.getByTestId('needs-attention-servers')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('needs-attention-reports-action'));
    expect(onOpenReports).toHaveBeenCalledTimes(1);
  });

  it('renders the failed-metrics condition with retry', () => {
    const onRetryStats = vi.fn();
    render(
      <NeedsAttention
        isArabic
        pendingReports={null}
        serviceHealth="ready"
        statsFailed
        onOpenReports={() => {}}
        onOpenServers={() => {}}
        onRetryStats={onRetryStats}
      />,
    );
    expect(screen.getByTestId('needs-attention-stats')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('needs-attention-stats-action'));
    expect(onRetryStats).toHaveBeenCalledTimes(1);
  });

  it('shows the calm clear state when nothing needs action (no alarms for normal empties)', () => {
    render(
      <NeedsAttention
        isArabic
        pendingReports={0}
        serviceHealth="ready"
        statsFailed={false}
        onOpenReports={() => {}}
        onOpenServers={() => {}}
        onRetryStats={() => {}}
      />,
    );
    expect(screen.getByTestId('needs-attention-clear')).toBeInTheDocument();
    expect(screen.queryByTestId('needs-attention-reports')).not.toBeInTheDocument();
    expect(screen.queryByTestId('needs-attention-servers')).not.toBeInTheDocument();
  });
});

describe('SecurityStatus', () => {
  it('renders the real contract-F metrics and the calm line when nothing is critical', async () => {
    securityMock.mockResolvedValue(SUMMARY);
    render(<SecurityStatus token="t" isArabic onOpenCenter={() => {}} />);
    const ready = await screen.findByTestId('dashboard-security-ready');
    expect(ready).toHaveTextContent('3');
    expect(screen.queryByTestId('dashboard-security-attention')).not.toBeInTheDocument();
  });

  it('flags attention when lockouts or critical events exist', async () => {
    securityMock.mockResolvedValue({ ...SUMMARY, activeLockouts: 2, criticalEvents7d: 1 });
    render(<SecurityStatus token="t" isArabic onOpenCenter={() => {}} />);
    expect(await screen.findByTestId('dashboard-security-attention')).toBeInTheDocument();
  });

  it('renders the honest unavailable state when the feed fails (never fabricated zeroes)', async () => {
    securityMock.mockRejectedValue(new Error('boom'));
    render(<SecurityStatus token="t" isArabic onOpenCenter={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('dashboard-security-unavailable')).toBeInTheDocument());
    expect(screen.queryByTestId('dashboard-security-ready')).not.toBeInTheDocument();
  });

  it('deep-links to the security center', () => {
    securityMock.mockRejectedValue(new Error('boom'));
    const onOpenCenter = vi.fn();
    render(<SecurityStatus token="t" isArabic onOpenCenter={onOpenCenter} />);
    fireEvent.click(screen.getByTestId('dashboard-security-open'));
    expect(onOpenCenter).toHaveBeenCalledTimes(1);
  });
});
