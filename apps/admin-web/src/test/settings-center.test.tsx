import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock apiRequest for SettingsCenter
vi.mock('../lib/api', () => ({
  apiRequest: vi.fn().mockResolvedValue([
    { id: '1', key: 'platform_name', value: 'CMS', description: 'Platform name', category: 'platform', updatedBy: null, updatedAt: '2026-01-01', createdAt: '2026-01-01' },
    { id: '2', key: 'max_upload_size_mb', value: '10', description: 'Max upload', category: 'upload', updatedBy: null, updatedAt: '2026-01-01', createdAt: '2026-01-01' },
  ]),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { SettingsCenter } from '../components/SettingsCenter';
// Push 3: SettingsCenter reads useUiPermissions() — tests wrap it in the provider.
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

function renderWithProvider(ui: React.ReactElement) {
  return render(<UiPermissionsProvider value={{ phase: 'idle' }}>{ui}</UiPermissionsProvider>);
}

describe('SettingsCenter', () => {
  it('renders the page title', () => {
    renderWithProvider(<SettingsCenter token="test" isArabic={false} isSuperAdmin={true} onError={vi.fn()} onNotice={vi.fn()} />);
    expect(screen.getByText('System Settings')).toBeInTheDocument();
  });

  it('renders Arabic title when isArabic=true', () => {
    renderWithProvider(<SettingsCenter token="test" isArabic={true} isSuperAdmin={true} onError={vi.fn()} onNotice={vi.fn()} />);
    expect(screen.getByText('إعدادات النظام')).toBeInTheDocument();
  });
});
