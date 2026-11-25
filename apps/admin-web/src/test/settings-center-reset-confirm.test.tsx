import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock the API layer — the settings list and the reset endpoint.
const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
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
