import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditLogViewer } from '../components/AuditLogViewer';

// Mock the apiRequest dependency
vi.mock('../lib/api', () => ({
  apiRequest: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 }),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { vi } from 'vitest';

describe('AuditLogViewer', () => {
  it('renders the title', () => {
    render(<AuditLogViewer token="test" isArabic={false} onError={vi.fn()} />);
    expect(screen.getByText('Full Audit Log')).toBeInTheDocument();
  });

  it('renders Arabic title when isArabic=true', () => {
    render(<AuditLogViewer token="test" isArabic={true} onError={vi.fn()} />);
    expect(screen.getByText('سجل التدقيق الكامل')).toBeInTheDocument();
  });

  it('renders empty state when no logs', async () => {
    render(<AuditLogViewer token="test" isArabic={false} onError={vi.fn()} />);
    // Wait for the mock to resolve
    const emptyText = await screen.findByText('No audit log entries');
    expect(emptyText).toBeInTheDocument();
  });
});
