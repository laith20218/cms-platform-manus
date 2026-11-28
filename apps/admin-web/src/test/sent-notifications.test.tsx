import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * W-coverage (row 26) — SentNotificationsDialog (sent list + delivery stats
 * endpoints existed with no UI). Locks: the ledger loads with pagination, the
 * stats panel expands per row with the five counters, and failures surface.
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  fetchSecuritySummary: vi.fn(() => Promise.reject(new Error('security summary not stubbed for this test'))),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { SentNotificationsDialog } from '../components/SentNotificationsDialog';

const ITEMS = [
  { id: 'n1', type: 'announcement', title: 'إعلان التحديث الشتوي', body: 'نص الإعلان الأول', createdAt: '2026-11-20T10:00:00Z', isRead: false },
  { id: 'n2', type: 'security', title: 'تنبيه أمني', body: 'نص التنبيه الثاني', createdAt: '2026-11-21T11:00:00Z', isRead: false },
];

const STATS = {
  notificationId: 'n1', title: 'إعلان التحديث الشتوي', totalRecipients: 120, sentCount: 120,
  deliveredCount: 118, readCount: 41, clickedCount: 12, failedCount: 2, sentAt: '2026-11-20T10:00:00Z',
};

const calls: string[] = [];

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string) => {
    calls.push(path);
    if (path.startsWith('/api/v1/notifications/sent')) {
      return { items: ITEMS, total: 2, page: 1, pageSize: 20, totalPages: 1 };
    }
    if (path.startsWith('/api/v1/notifications/n1/stats')) return STATS;
    throw new Error('unexpected path');
  });
}

function renderDialog() {
  return render(
    <SentNotificationsDialog token="test-token" isArabic onClose={vi.fn()} onError={vi.fn()} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  stubApi();
});

describe('W-coverage — sent notifications ledger (row 26)', () => {
  it('loads the sent feed and expands delivery stats per row', async () => {
    renderDialog();
    expect(await screen.findByRole('dialog', { name: 'سجل الإشعارات المرسلة' })).toBeInTheDocument();
    await screen.findByText('إعلان التحديث الشتوي');
    expect(screen.getByText('تنبيه أمني')).toBeInTheDocument();
    expect(screen.getByText('2 إشعارًا')).toBeInTheDocument();

    // Stats are lazy: nothing fetched until the row button is clicked.
    expect(calls.some((p) => p.includes('/n1/stats'))).toBe(false);
    fireEvent.click(screen.getByTestId('sent-notification-stats-n1'));

    await waitFor(() => expect(screen.getByTestId('notification-stats-panel')).toBeInTheDocument());
    expect(calls.some((p) => p.includes('/api/v1/notifications/n1/stats'))).toBe(true);
    // The five delivery counters render with their values.
    expect(screen.getByText('120')).toBeInTheDocument(); // recipients
    expect(screen.getByText('118')).toBeInTheDocument(); // delivered
    expect(screen.getByText('41')).toBeInTheDocument();  // read
    expect(screen.getByText('12')).toBeInTheDocument();  // clicked
    expect(screen.getByText('2')).toBeInTheDocument();   // failed
    expect(screen.getByText('فشلت')).toBeInTheDocument();

    // Toggle off collapses the panel.
    fireEvent.click(screen.getByTestId('sent-notification-stats-n1'));
    await waitFor(() => expect(screen.queryByTestId('notification-stats-panel')).not.toBeInTheDocument());
  });

  it('empty ledger renders an honest empty state, no fake rows', async () => {
    apiRequestMock.mockImplementation(async (path: string) => {
      calls.push(path);
      if (path.startsWith('/api/v1/notifications/sent')) return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
      throw new Error('unexpected');
    });
    renderDialog();
    await waitFor(() => expect(screen.getByText('لا توجد إشعارات مرسلة بعد')).toBeInTheDocument());
    expect(document.querySelectorAll('[data-testid="sent-notification-row"]').length).toBe(0);
  });

  it('a stats failure surfaces the API message and collapses the panel', async () => {
    const errors: string[] = [];
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/v1/notifications/sent')) return { items: ITEMS, total: 2, page: 1, pageSize: 20, totalPages: 1 };
      if (path.startsWith('/api/v1/notifications/n1/stats')) throw new Error('لا تملك صلاحية عرض الإحصائيات');
      throw new Error('unexpected');
    });
    render(
      <SentNotificationsDialog token="test-token" isArabic onClose={vi.fn()} onError={(m) => errors.push(m)} />,
    );
    await screen.findByText('إعلان التحديث الشتوي');
    fireEvent.click(screen.getByTestId('sent-notification-stats-n1'));
    await waitFor(() => expect(errors.some((m) => m.includes('لا تملك صلاحية'))).toBe(true));
    await waitFor(() => expect(screen.queryByTestId('notification-stats-panel')).not.toBeInTheDocument());
  });
});
