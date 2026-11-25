import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * W-coverage (row 4) — DashboardFeeds: the three SuperAdmin dashboard read
 * feeds (recent-activity / top-subjects / reports/summary) had no UI. Locks:
 * all three cards render their payloads, and one failing feed shows its own
 * error state without blanking the others.
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { DashboardFeeds } from '../components/DashboardFeeds';

const ACTIVITY = [
  { id: 'a1', type: 'registration', description: 'تسجيل طالبة جديدة في كلية الطب', actorName: 'نظام القبول', createdAt: '2026-11-24T09:00:00Z' },
  { id: 'a2', type: 'report', description: 'بلاغ جديد عن سؤال في الفيسيولوجي', actorName: null, createdAt: '2026-11-24T10:30:00Z' },
];

const SUBJECTS = [
  { subjectId: 's1', subjectName: 'التشريح', questionsAnswered: 1420, averageAccuracy: 0.74, activeStudents: 88 },
  { subjectId: 's2', subjectName: 'الفيسيولوجي', questionsAnswered: 980, averageAccuracy: 0.61, activeStudents: 54 },
];

const REPORTS = { totalReports: 27, pendingReports: 9, resolvedReports: 15, rejectedReports: 3 };

const calls: string[] = [];

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string) => {
    calls.push(path);
    if (path.startsWith('/api/v1/admin/dashboard/recent-activity')) return ACTIVITY;
    if (path.startsWith('/api/v1/admin/dashboard/top-subjects')) return SUBJECTS;
    if (path.startsWith('/api/v1/admin/dashboard/reports/summary')) return REPORTS;
    throw new Error('unexpected path');
  });
}

function renderFeeds() {
  return render(<DashboardFeeds token="test-token" isArabic />);
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  stubApi();
});

describe('W-coverage — DashboardFeeds (row 4)', () => {
  it('renders all three feeds from their endpoints', async () => {
    renderFeeds();
    await waitFor(() => expect(screen.getByTestId('dashboard-feed-reports')).toHaveTextContent('27'));

    expect(calls.some((p) => p.includes('/api/v1/admin/dashboard/recent-activity?count=6'))).toBe(true);
    expect(calls.some((p) => p.includes('/api/v1/admin/dashboard/top-subjects?count=5'))).toBe(true);
    expect(calls.some((p) => p.includes('/api/v1/admin/dashboard/reports/summary'))).toBe(true);

    // Activity feed: entries with type chips and actor + timestamp.
    expect(screen.getByText('تسجيل طالبة جديدة في كلية الطب')).toBeInTheDocument();
    expect(screen.getByText('بلاغ جديد عن سؤال في الفيسيولوجي')).toBeInTheDocument();
    expect(screen.getByText('تسجيل')).toBeInTheDocument();
    expect(screen.getByText('بلاغ')).toBeInTheDocument();

    // Top subjects: ranked names with answered + accuracy.
    expect(screen.getByText('التشريح')).toBeInTheDocument();
    expect(screen.getByText('الفيسيولوجي')).toBeInTheDocument();
    expect(screen.getByText(/1420 إجابة/)).toBeInTheDocument();
    expect(screen.getByText(/74% الدقة/)).toBeInTheDocument();

    // Reports summary: the four counters.
    expect(screen.getByText('قيد المراجعة')).toBeInTheDocument();
    expect(screen.getByText('محلولة')).toBeInTheDocument();
    expect(screen.getByText('مرفوضة')).toBeInTheDocument();
  });

  it('a failing feed shows its own error card while the others still render', async () => {
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/v1/admin/dashboard/recent-activity')) throw new Error('feed down');
      if (path.startsWith('/api/v1/admin/dashboard/top-subjects')) return SUBJECTS;
      if (path.startsWith('/api/v1/admin/dashboard/reports/summary')) return REPORTS;
      throw new Error('unexpected');
    });
    renderFeeds();
    await waitFor(() => expect(screen.getByTestId('dashboard-feed-activity')).toHaveTextContent('تعذر تحميل هذا البطاقة'));
    await waitFor(() => expect(screen.getByTestId('dashboard-feed-subjects')).toHaveTextContent('التشريح'));
    await waitFor(() => expect(screen.getByTestId('dashboard-feed-reports')).toHaveTextContent('27'));
  });

  it('empty feeds render honest empty states', async () => {
    apiRequestMock.mockImplementation(async () => []);
    renderFeeds();
    await waitFor(() => expect(screen.getByText('لا يوجد نشاط حديث')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('لا توجد بيانات نشاط للمواد')).toBeInTheDocument());
  });
});
