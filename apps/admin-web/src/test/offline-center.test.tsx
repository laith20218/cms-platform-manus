import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

// Mock the API layer — the offline package ledger is served from static fixtures.
const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { OfflineCenter } from '../components/OfflineCenter';

const ACTIVE = {
  packageId: 'aaaaaaaa-0000-0000-0000-000000000001',
  studentId: 'bbbbbbbb-0000-0000-0000-000000000002',
  studentName: 'طالب تجريبي',
  installationId: 'cccccccc-0000-0000-0000-000000000003',
  contentVersion: 1,
  status: 'active',
  issuedAt: '2026-11-20T10:00:00Z',
  expiresAt: '2027-11-20T10:00:00Z',
  revokedAt: null,
  createdAt: '2026-11-20T10:00:00Z',
};

const REVOKED = { ...ACTIVE, packageId: 'aaaaaaaa-0000-0000-0000-000000000009', studentName: 'طالب ثانٍ', status: 'revoked', revokedAt: '2026-11-21T09:00:00Z' };

function stubApi(rows: unknown[] = [ACTIVE, REVOKED]) {
  apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    if (typeof path === 'string' && path.startsWith('/api/v1/admin/offline/packages?')) return rows;
    if (typeof path === 'string' && path.includes('/revoke') && init?.method === 'POST') return { packageId: ACTIVE.packageId, status: 'revoked' };
    return rows;
  });
}

function renderCenter() {
  return render(
    <OfflineCenter token="test-token" isArabic onError={vi.fn()} onNotice={vi.fn()} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stubApi();
});

describe('OfflineCenter (Wave 4)', () => {
  it('renders the ledger table with lifecycle-only columns and status badges', async () => {
    renderCenter();
    expect(await screen.findByTestId('offline-center-table')).toBeInTheDocument();
    expect(screen.getByText('طالب تجريبي')).toBeInTheDocument();
    expect(screen.getAllByTestId('offline-status-active').length).toBe(1);
    expect(screen.getAllByTestId('offline-status-revoked').length).toBe(1);
    // Honesty framing: visibility + revocation only.
    expect(screen.getByText(/رؤية وإبطال فقط/)).toBeInTheDocument();
  });

  it('revokes an active package only after an explicit confirm dialog', async () => {
    renderCenter();
    const revokeButton = await screen.findByTestId(`offline-revoke-${ACTIVE.packageId}`);
    fireEvent.click(revokeButton);
    expect(screen.getByTestId('offline-revoke-confirm')).toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/revoke'),
      'test-token',
      expect.objectContaining({ method: 'POST' }),
    );
    // Command Center final pass — the revoke confirm rides the shared
    // ConfirmDialog; its confirm button is the standard testId.
    fireEvent.click(within(screen.getByTestId('offline-revoke-confirm')).getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        `/api/v1/admin/offline/packages/${ACTIVE.packageId}/revoke`,
        'test-token',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows an honest empty state when no packages are recorded', async () => {
    stubApi([]);
    renderCenter();
    expect(await screen.findByTestId('offline-center-empty')).toBeInTheDocument();
  });
});
