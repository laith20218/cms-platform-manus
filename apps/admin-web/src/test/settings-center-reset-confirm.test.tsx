import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the API layer — the settings list, the reset endpoint and the PR-7
// helpers (feature-flags inventory + setting history) the center now fetches.
const { apiRequestMock, fetchFeatureFlagsMock, fetchSettingHistoryMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  fetchFeatureFlagsMock: vi.fn(),
  fetchSettingHistoryMock: vi.fn(),
}));
vi.mock('../lib/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  fetchFeatureFlags: (...args: unknown[]) => fetchFeatureFlagsMock(...args),
  fetchSettingHistory: (...args: unknown[]) => fetchSettingHistoryMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { SettingsCenter } from '../components/SettingsCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

const SETTING = {
  id: '1',
  key: 'max_upload_size_mb',
  value: '25',
  // The default value is embedded after the last ':' (existing backend contract).
  description: 'الحد الأقصى للرفع بالميغابايت. الافتراضي: 10',
  category: 'upload',
  updatedBy: null,
  updatedAt: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
};

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    if (typeof path === 'string' && path.startsWith('/api/v1/admin/settings?')) return [SETTING];
    if (typeof path === 'string' && path.endsWith('/reset') && init?.method === 'POST') {
      return { ...SETTING, value: '10' };
    }
    return [SETTING];
  });
  // PR-7 fetches — feature flags render for the super admin, history on open.
  fetchFeatureFlagsMock.mockResolvedValue([]);
  fetchSettingHistoryMock.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
}

function renderCenter(isArabic = true) {
  return render(
    <UiPermissionsProvider value={{ phase: 'idle' }}>
      <SettingsCenter token="test-token" isArabic={isArabic} isSuperAdmin onNotice={vi.fn()} onError={vi.fn()} />
    </UiPermissionsProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stubApi();
});

describe('SettingsCenter reset — W1 ConfirmDialog adoption', () => {
  it('gates the reset behind an explicit confirm dialog before any request', async () => {
    renderCenter();
    fireEvent.click(await screen.findByText('إعادة تعيين'));

    // The confirm dialog is open, named by its Arabic title, and no POST fired yet.
    expect(screen.getByTestId('settings-reset-confirm')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'إعادة تعيين الإعداد' })).toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/reset'),
      'test-token',
      expect.anything(),
    );

    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));
    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/v1/admin/settings/max_upload_size_mb/reset',
        'test-token',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('PR-7: the reset body NEVER carries a client-supplied DefaultValue', async () => {
    renderCenter();
    fireEvent.click(await screen.findByText('إعادة تعيين'));
    fireEvent.click(screen.getByTestId('confirm-dialog-confirm'));

    await waitFor(() => {
      expect(apiRequestMock).toHaveBeenCalledWith(
        '/api/v1/admin/settings/max_upload_size_mb/reset',
        'test-token',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const resetCall = apiRequestMock.mock.calls.find(
      ([path]) => typeof path === 'string' && path.endsWith('/reset'),
    );
    const body = JSON.parse(String(resetCall?.[2]?.body ?? '{}'));
    expect(body).not.toHaveProperty('defaultValue');
    expect(body).not.toHaveProperty('DefaultValue');
  });

  it('PR-7: the confirm copy explains the restored value is the REGISTERED server-side default', async () => {
    renderCenter();
    fireEvent.click(await screen.findByText('إعادة تعيين'));

    const dialog = screen.getByTestId('settings-reset-confirm');
    expect(dialog).toHaveTextContent('القيمة الافتراضية المسجّلة في سجلّ الخادم');
    expect(dialog).not.toHaveTextContent('الافتراضي: 10');
  });

  it('cancel closes the dialog and never sends the reset request', async () => {
    renderCenter();
    fireEvent.click(await screen.findByText('إعادة تعيين'));
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(apiRequestMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/reset'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('Escape dismisses the confirm dialog without resetting', async () => {
    renderCenter();
    fireEvent.click(await screen.findByText('إعادة تعيين'));
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(apiRequestMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/reset'),
      expect.anything(),
      expect.anything(),
    );
  });

  it('renders the English confirm copy in the EN locale', async () => {
    renderCenter(false);
    fireEvent.click(await screen.findByText('Reset'));
    expect(screen.getByRole('dialog', { name: 'Reset setting' })).toBeInTheDocument();
    expect(screen.getByTestId('confirm-dialog-confirm')).toHaveTextContent('Confirm reset');
    fireEvent.click(screen.getByTestId('confirm-dialog-cancel'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
