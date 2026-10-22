import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock apiRequest for SettingsCenter
vi.mock('../lib/api', () => ({
  apiRequest: vi.fn().mockResolvedValue([
    { id: '1', key: 'platform_name', value: 'CMS', description: 'Platform name', category: 'platform', updatedBy: null, updatedAt: '2026-01-01', createdAt: '2026-01-01' },
    { id: '2', key: 'max_upload_size_mb', value: '10', description: 'Max upload size', category: 'upload', updatedBy: null, updatedAt: '2026-01-01', createdAt: '2026-01-01' },
  ]),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { SettingsCenter } from '../components/SettingsCenter';

describe('SettingsCenter', () => {
  it('renders the page title', () => {
    render(<SettingsCenter token="test" isArabic={false} isSuperAdmin={true} onError={vi.fn()} onNotice={vi.fn()} />);
    expect(screen.getByText('System Settings')).toBeInTheDocument();
  });

  it('renders Arabic title when isArabic=true', () => {
    render(<SettingsCenter token="test" isArabic={true} isSuperAdmin={true} onError={vi.fn()} onNotice={vi.fn()} />);
    expect(screen.getByText('إعدادات النظام')).toBeInTheDocument();
  });
});
