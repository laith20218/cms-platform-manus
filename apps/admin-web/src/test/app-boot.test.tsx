import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Push 11.5 / PART D — boot-level smoke tests for the admin-web ROOT application.
 * The existing src/test/ suite covers the API client, pure utilities, and individual
 * centers; these three cover what D.3 asks on top: the App itself boots to the login
 * screen, a failed sign-in surfaces its error, and a successful sign-in fires the
 * sonner Toaster (welcome toast) — i.e. "something actually runs" end-to-end in CI.
 */

// Mock the API layer — hermetic: no network, no production API_BASE_URL.
const { apiRequestMock, loginMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  loginMock: vi.fn(),
}));
vi.mock('../lib/api', () => ({
  API_BASE_URL: 'http://e2e.test',
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  login: (...args: unknown[]) => loginMock(...args),
  refreshAccessToken: vi.fn(async () => null),
  ApiError: class ApiError extends Error { status = 500; },
}));

import App from '../App';

const SESSION_KEYS = ['cms-admin-user', 'cms-admin-token', 'cms-admin-refresh'];

function stubApiData() {
  apiRequestMock.mockImplementation(async (path: string) => {
    if (path.startsWith('/api/v1/notifications/unread-count')) return { count: 0 };
    if (path.startsWith('/api/v1/admin/roles')) return [];
    // Generic paged shape for every list surface (admins, centers, …).
    return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubApiData();
  // App's health probe + the ui-permissions bundle use raw fetch() — keep them offline-safe.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  for (const key of SESSION_KEYS) sessionStorage.removeItem(key);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App boot smoke (login shell)', () => {
  it('mounts unauthenticated to the login screen with email + password fields', () => {
    render(<App />);

    // Locale-independent placeholders from the production login form.
    expect(screen.getByPlaceholderText('admin@university.edu')).toBeTruthy();
    expect(screen.getByPlaceholderText('••••••••••••')).toBeTruthy();
    // Arabic-default UI: the secure sign-in button + console title.
    expect(screen.getByRole('button', { name: /دخول آمن/ })).toBeTruthy();
    expect(screen.getByText('دخول إلى لوحة الإدارة')).toBeTruthy();
  });

  it('a failed sign-in surfaces the error message without crashing', async () => {
    loginMock.mockRejectedValueOnce(new Error('بيانات الدخول غير صحيحة'));
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText('admin@university.edu'), {
      target: { value: 'admin@university.edu' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.submit(screen.getByPlaceholderText('admin@university.edu').closest('form')!);

    expect(await screen.findByText('بيانات الدخول غير صحيحة')).toBeTruthy();
    // Still on the login screen — no session was created.
    expect(sessionStorage.getItem('cms-admin-token')).toBeNull();
    expect(loginMock).toHaveBeenCalledTimes(1);
  });

  it('a successful sign-in stores the session; a data failure surfaces through the Toaster', async () => {
    loginMock.mockResolvedValueOnce({
      user: { id: 'a-1', fullName: 'مدير عام', role: 'super_admin', email: 'admin@university.edu' },
      accessToken: 'token-1',
      refreshToken: 'refresh-1',
    });
    // The management-data effect (admins list) fails ~250ms after sign-in while the
    // authenticated tree — with its <Toaster/> — is mounted.
    apiRequestMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/v1/notifications/unread-count')) return { count: 0 };
      if (path.startsWith('/api/v1/admin/roles')) return [];
      if (path.startsWith('/api/v1/admin/admins?')) throw new Error('بيانات الإدارة غير متاحة حاليًا');
      return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
    });
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText('admin@university.edu'), {
      target: { value: 'admin@university.edu' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••••••'), {
      target: { value: 'correct-password' },
    });
    fireEvent.submit(screen.getByPlaceholderText('admin@university.edu').closest('form')!);

    // Session persisted before any authenticated rendering.
    await waitFor(() => {
      expect(sessionStorage.getItem('cms-admin-token')).toBe('token-1');
      expect(sessionStorage.getItem('cms-admin-refresh')).toBe('refresh-1');
    });

    // The failure lands in a real sonner toast node (Toaster is wired in the app shell).
    const toastText = await screen.findByText('بيانات الإدارة غير متاحة حاليًا');
    expect(toastText.closest('[data-sonner-toast]')).toBeTruthy();
    // Authenticated shell is rendered (sidebar navigation present).
    expect(document.querySelector('.admin-shell')).toBeTruthy();
  });
});
