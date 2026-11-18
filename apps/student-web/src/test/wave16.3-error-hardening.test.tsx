import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 16.3 — leaderboard standalone + settings/profile error hardening.
 *
 * Covers the W16.3 contract:
 *  1. getApiProblemDetail extracts ONLY student-safe Arabic payload text
 *     (detail / validation errors) and never leaks English framework titles.
 *  2. LeaderboardSharingToggle explains a failed PUT instead of silently
 *     reverting (was: no feedback at all).
 *  3. LeaderboardPage's generic error card surfaces the backend detail.
 *  4. SettingsPage password change toast prefers the backend detail over
 *     the generic Arabic fallback.
 */

// ---- shared mocks (hoisted) ----
const { getMock, postMock, putMock, toastErrorMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    put: (...args: unknown[]) => putMock(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}));

vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({
    user: { fullName: 'طالب تجريبي', phone: '0999000111' },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
  }),
}));

import { getApiProblemDetail } from '@/utils/api-problem-detail';
import LeaderboardSharingToggle from '@/features/stats/components/LeaderboardSharingToggle';
import LeaderboardPage from '@/features/stats/pages/LeaderboardPage';
import SettingsPage from '@/features/settings/SettingsPage';

/** Minimal axios-shaped error — matches axios's own isAxiosError() check. */
function axiosError(status: number, data: unknown) {
  return {
    isAxiosError: true,
    name: 'AxiosError',
    message: 'Request failed with status code ' + status,
    config: {},
    response: { status, statusText: '', headers: {}, data, config: {} },
  } as unknown as import('axios').AxiosError;
}

function renderWithProviders(ui: React.ReactNode, path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/leaderboard" element={ui} />
          <Route path="/settings" element={ui} />
          <Route path="*" element={<div data-testid="route-fallback" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();
  toastErrorMock.mockReset();
});

// ================= 1. strict detail extraction =================

describe('getApiProblemDetail (W16.3)', () => {
  it('returns the Arabic ProblemDetails detail when present', () => {
    const error = axiosError(400, { title: 'Bad Request', detail: 'كلمة المرور الحالية غير صحيحة.' });
    expect(getApiProblemDetail(error)).toBe('كلمة المرور الحالية غير صحيحة.');
  });

  it('falls back to the first validation message, never the English title', () => {
    const error = axiosError(400, {
      title: 'One or more validation errors occurred.',
      errors: { newPassword: ['كلمة المرور قصيرة جداً'] },
    });
    expect(getApiProblemDetail(error)).toBe('كلمة المرور قصيرة جداً');
  });

  it('returns empty string (renders nothing) for English-only framework payloads', () => {
    const error = axiosError(404, { title: 'Not Found' });
    expect(getApiProblemDetail(error)).toBe('');
  });

  it('returns empty string for non-axios / network errors', () => {
    expect(getApiProblemDetail(new Error('Network Error'))).toBe('');
    expect(getApiProblemDetail(axiosError(500, undefined))).toBe('');
  });
});

// ================= 2. sharing toggle PUT failure =================

describe('LeaderboardSharingToggle PUT failure (W16.3)', () => {
  it('explains the failure with the backend detail instead of reverting silently', async () => {
    getMock.mockResolvedValue({ data: { sharesLeaderboard: false } });
    putMock.mockRejectedValue(axiosError(500, { detail: 'تعذّر حفظ إعدادات المشاركة من الخادم.' }));

    renderWithProviders(<LeaderboardSharingToggle />, '/settings');

    const switchBtn = await screen.findByRole('switch');
    expect(switchBtn.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(switchBtn);

    const errorCard = await screen.findByTestId('leaderboard-sharing-toggle-error');
    expect(errorCard).toHaveTextContent('تعذّر حفظ إعدادات المشاركة. حاول مجدداً.');
    expect(errorCard).toHaveTextContent('تعذّر حفظ إعدادات المشاركة من الخادم.');
    // No raw axios text anywhere.
    expect(document.body.textContent).not.toContain('Request failed with status code');
  });
});

// ================= 3. leaderboard generic error card =================

describe('LeaderboardPage error card (W16.3)', () => {
  it('surfaces the backend Arabic detail under the generic heading', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/profile/leaderboard-sharing')) return { data: { sharesLeaderboard: true } };
      if (url.includes('/stats/leaderboard')) {
        throw axiosError(500, { title: 'Internal Server Error', detail: 'حدث خطأ في الخادم أثناء جلب المتصدرين.' });
      }
      return { data: [] };
    });

    renderWithProviders(<LeaderboardPage />, '/leaderboard?subjectId=s1');

    const errorCard = await screen.findByTestId('leaderboard-error');
    expect(errorCard).toHaveTextContent('تعذر تحميل قائمة المتصدرين');
    const detail = await screen.findByTestId('api-error-detail');
    expect(detail).toHaveTextContent('حدث خطأ في الخادم أثناء جلب المتصدرين.');
    expect(document.body.textContent).not.toContain('Request failed with status code');
  });
});

// ================= 4. settings password toast =================

describe('SettingsPage password change failure (W16.3)', () => {
  it('toast prefers the backend Arabic detail over the generic fallback', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/profile/leaderboard-sharing')) return { data: { sharesLeaderboard: false } };
      return { data: [] };
    });
    postMock.mockRejectedValue(
      axiosError(400, { title: 'Bad Request', detail: 'كلمة المرور الحالية غير صحيحة.' })
    );

    renderWithProviders(<SettingsPage />, '/settings');

    const [current, next, confirm] = await Promise.all([
      screen.findByPlaceholderText('كلمة المرور الحالية'),
      screen.findByPlaceholderText('كلمة المرور الجديدة (8 أحرف)'),
      screen.findByPlaceholderText('تأكيد كلمة المرور'),
    ]);
    fireEvent.change(current, { target: { value: 'wrong-password' } });
    fireEvent.change(next, { target: { value: 'new-password-123' } });
    fireEvent.change(confirm, { target: { value: 'new-password-123' } });
    fireEvent.submit(current.closest('form')!);

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('كلمة المرور الحالية غير صحيحة.');
    });
    expect(toastErrorMock).not.toHaveBeenCalledWith('فشل');
  });

  it('falls back to the actionable Arabic sentence when the backend sends no detail', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/profile/leaderboard-sharing')) return { data: { sharesLeaderboard: false } };
      return { data: [] };
    });
    postMock.mockRejectedValue(axiosError(503, undefined));

    renderWithProviders(<SettingsPage />, '/settings');

    const [current, next, confirm] = await Promise.all([
      screen.findByPlaceholderText('كلمة المرور الحالية'),
      screen.findByPlaceholderText('كلمة المرور الجديدة (8 أحرف)'),
      screen.findByPlaceholderText('تأكيد كلمة المرور'),
    ]);
    fireEvent.change(current, { target: { value: 'wrong-password' } });
    fireEvent.change(next, { target: { value: 'new-password-123' } });
    fireEvent.change(confirm, { target: { value: 'new-password-123' } });
    fireEvent.submit(current.closest('form')!);

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'تعذر تغيير كلمة المرور. تحقق من كلمة المرور الحالية ثم حاول مجدداً.'
      );
    });
  });
});
