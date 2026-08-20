import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from '@/features/auth/pages/LoginPage';

// Mock the auth context
vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({
    login: vi.fn().mockResolvedValue(undefined),
    user: null,
    isAuthenticated: false,
    isLoading: false,
    logout: vi.fn(),
    refreshToken: vi.fn(),
  }),
}));

vi.mock('@/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
  generateDeviceFingerprint: () => 'test-fingerprint',
  formatRelativeTime: () => 'الآن',
  formatNumber: (n: number) => n.toString(),
  formatDate: () => '2026-07-31',
  debounce: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
}));

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders login form with phone and password fields', () => {
    render(<LoginPage />, { wrapper: TestWrapper });
    expect(screen.getByRole('heading', { name: 'تسجيل الدخول' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('0999999999')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('renders login button', () => {
    render(<LoginPage />, { wrapper: TestWrapper });
    expect(screen.getByRole('button', { name: /تسجيل الدخول/i })).toBeInTheDocument();
  });

  it('renders register link', () => {
    render(<LoginPage />, { wrapper: TestWrapper });
    expect(screen.getByText(/أنشئ حساباً جديداً/i)).toBeInTheDocument();
  });
});

describe('UI Components', () => {
  it('Button renders with children', async () => {
    const { Button } = await import('@cms/ui');
    render(<Button>Test Button</Button>, { wrapper: TestWrapper });
    expect(screen.getByText('Test Button')).toBeInTheDocument();
  });

  it('Input renders with placeholder', async () => {
    const { Input } = await import('@cms/ui');
    render(<Input placeholder="Test" />, { wrapper: TestWrapper });
    expect(screen.getByPlaceholderText('Test')).toBeInTheDocument();
  });

  it('Badge renders with text', async () => {
    const { Badge } = await import('@cms/ui');
    render(<Badge>Active</Badge>, { wrapper: TestWrapper });
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});

describe('Utility Functions', () => {
  it('formats file sizes correctly', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });
});

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
