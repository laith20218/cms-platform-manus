import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * PR-6 — must-change-password banner (contract H).
 *
 * After an administrator resets a student's password, the login/profile
 * payloads carry mustChangePassword=true. The app shell shows a persistent,
 * dismissible-per-session amber banner linking to the existing change-password
 * screen (/settings).
 *
 * These tests exercise the banner component directly with a mocked auth
 * context (the flag comes from the login response and /auth/me payloads).
 */

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));

vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => useAuthMock(),
}));

import { MustChangePasswordBanner } from '@/components/common/MustChangePasswordBanner';

function authedWith(flag: boolean | undefined) {
  useAuthMock.mockReturnValue({
    user: {
      id: 'u-1',
      phone: '0999999999',
      fullName: 'طالب تجريبي',
      role: 'student',
      mustChangePassword: flag,
    },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
    completeAuthentication: vi.fn(),
  });
}

function renderBanner() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <MustChangePasswordBanner />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

describe('MustChangePasswordBanner (PR-6, contract H)', () => {
  it('renders the bilingual warning with role=alert and the change-password link when the flag is true', () => {
    authedWith(true);
    renderBanner();

    const banner = screen.getByTestId('must-change-password-banner');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveTextContent('لقد أُعيد تعيين كلمة مرورك من قبل الإدارة — يرجى تغييرها الآن');
    expect(banner).toHaveTextContent('Your password was reset by the administration');

    const cta = screen.getByTestId('must-change-password-cta');
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/settings');
  });

  it('stays hidden when the flag is false or absent', () => {
    authedWith(false);
    const { rerender } = renderBanner();
    expect(screen.queryByTestId('must-change-password-banner')).not.toBeInTheDocument();

    authedWith(undefined);
    rerender(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MustChangePasswordBanner />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('must-change-password-banner')).not.toBeInTheDocument();
  });

  it('dismisses per-session (hidden until the sessionStorage flag is cleared)', () => {
    authedWith(true);
    renderBanner();

    fireEvent.click(screen.getByTestId('must-change-password-dismiss'));
    expect(screen.queryByTestId('must-change-password-banner')).not.toBeInTheDocument();
    // The dismissal is recorded for this browser session only.
    expect(sessionStorage.getItem('cms-student-must-change-password-dismissed')).toBe('1');

    // A re-render in the SAME session stays hidden (per-session semantics).
    authedWith(true);
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MustChangePasswordBanner />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('must-change-password-banner')).not.toBeInTheDocument();
  });

  it('re-shows after the session storage is cleared (next sign-in/session)', () => {
    sessionStorage.setItem('cms-student-must-change-password-dismissed', '1');
    authedWith(true);
    renderBanner();
    expect(screen.queryByTestId('must-change-password-banner')).not.toBeInTheDocument();

    sessionStorage.clear();
    authedWith(true);
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <MustChangePasswordBanner />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('must-change-password-banner')).toBeInTheDocument();
  });
});
