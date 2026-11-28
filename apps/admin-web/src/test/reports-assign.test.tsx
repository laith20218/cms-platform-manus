import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * W5 (admin-ui) — ReportsModeration assign (matrix row 16: endpoint existed,
 * no UI). Non-destructive action: pick an administrator → PUT assign →
 * notice + list refresh. No confirm gate (per wave plan).
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  fetchSecuritySummary: vi.fn(() => Promise.reject(new Error('security summary not stubbed for this test'))),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { ReportsModeration } from '../components/ReportsModeration';

const REPORT = {
  id: 'rep1', questionId: 'q1', questionText: 'سؤال عن المناعة', studentId: 'st1',
  studentName: 'طالبة مبلّغة', reasonType: 'Typo', description: 'خطأ إملائي',
  status: 'Pending', createdAt: '2026-01-01T00:00:00Z', resolvedAt: null,
  resolutionNotes: null, assignedTo: null, assignedToName: null, updatedAt: '2026-01-01T00:00:00Z',
};

const ADMINS = [
  { id: 'a1', fullName: 'مدير المراجعة الأولى' },
  { id: 'a2', fullName: 'مدير المراجعة الثانية' },
];

const calls: Array<{ path: string; init?: RequestInit }> = [];
const notices: string[] = [];

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path.startsWith('/api/v1/admin/reports?')) {
      return { items: [REPORT], total: 1, page: 1, pageSize: 20, totalPages: 1 };
    }
    if (path.startsWith('/api/v1/admin/admins?')) return { items: ADMINS, total: 2, page: 1, pageSize: 100, totalPages: 1 };
    if (path.includes('/api/v1/admin/reports/rep1/assign') && init?.method === 'PUT') {
      return { id: 'rep1', assignedTo: 'a1' };
    }
    return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
  });
}

function renderModeration() {
  return render(
    <ReportsModeration token="test-token" isArabic onError={vi.fn()} onNotice={(m) => notices.push(m)} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  notices.length = 0;
  stubApi();
});

describe('W5 — ReportsModeration assign', () => {
  it('assigns a report to an administrator and refreshes the list', async () => {
    renderModeration();
    await screen.findByText('سؤال عن المناعة');

    fireEvent.click(screen.getByTestId('report-assign-rep1'));
    const dialog = await screen.findByTestId('report-assign-dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'تعيين البلاغ لمدير' })).toBeInTheDocument();

    // The administrator directory loads into the shared Select.
    const adminSelect = await screen.findByTestId('report-assign-admin');
    await waitFor(() => expect((adminSelect as HTMLSelectElement).options.length).toBe(2));
    expect(screen.getByRole('option', { name: 'مدير المراجعة الأولى' })).toBeInTheDocument();

    // Save is disabled until an administrator is chosen.
    expect(screen.getByTestId('report-assign-save')).toBeDisabled();
    fireEvent.change(adminSelect, { target: { value: 'a1' } });
    expect(screen.getByTestId('report-assign-save')).toBeEnabled();

    const before = calls.length;
    fireEvent.click(screen.getByTestId('report-assign-save'));
    await waitFor(() => {
      expect(calls.some((c) => c.path.includes('/api/v1/admin/reports/rep1/assign') && c.init?.method === 'PUT')).toBe(true);
    });
    expect(JSON.parse(String(calls.find((c) => c.path.includes('/assign'))?.init?.body))).toEqual({ adminId: 'a1' });
    expect(notices.some((m) => m.includes('تم تعيين المسؤول'))).toBe(true);
    // List refresh fires after the assign.
    await waitFor(() => expect(calls.length).toBeGreaterThan(before + 1));
    await waitFor(() => expect(screen.queryByTestId('report-assign-dialog')).not.toBeInTheDocument());
  });

  it('cancel never sends the assign request', async () => {
    renderModeration();
    await screen.findByText('سؤال عن المناعة');
    fireEvent.click(screen.getByTestId('report-assign-rep1'));
    await screen.findByTestId('report-assign-dialog');
    fireEvent.click(screen.getByText('إلغاء'));
    await waitFor(() => expect(screen.queryByTestId('report-assign-dialog')).not.toBeInTheDocument());
    expect(calls.some((c) => c.path.includes('/assign'))).toBe(false);
  });
});
