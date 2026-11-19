import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 18.2 — Account & Activation Integrity regression suite.
 * D-03/04 (activation parity), D-05 (zero badge), D-06 (fake remember-me),
 * D-07/08 (settings honesty + theme single source), D-09 (OTP route guard),
 * D-17 (login ?next= resume), D-41 (accurate reset fallbacks).
 */

const { getMock, postMock, putMock, deleteMock, patchMock, clearEntitlementTokenMock, loginMock, completeAuthMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  deleteMock: vi.fn(),
  patchMock: vi.fn(),
  clearEntitlementTokenMock: vi.fn(),
  loginMock: vi.fn(),
  completeAuthMock: vi.fn(),
}));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    put: (...args: unknown[]) => putMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
  },
}));

vi.mock('@/features/entitlements/services/entitlement-api', async () => {
  const actual = await vi.importActual<typeof import('@/features/entitlements/services/entitlement-api')>(
    '@/features/entitlements/services/entitlement-api'
  );
  return {
    ...actual,
    entitlementRequestConfig: async () => ({}),
    clearEntitlementToken: clearEntitlementTokenMock,
  };
});

vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    login: loginMock,
    logout: vi.fn(),
    refreshToken: vi.fn(),
    completeAuthentication: completeAuthMock,
  }),
}));

import ActivateCodePage from '@/features/subscriptions/ActivateCodePage';
import { ActivationCodeModal } from '@/features/subjects/ActivationCodeModal';
import NotificationsPage from '@/features/notifications/pages/NotificationsPage';
import LoginPage from '@/features/auth/pages/LoginPage';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import SettingsPage from '@/features/settings/SettingsPage';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import VerifyOtpPage from '@/features/auth/pages/VerifyOtpPage';

const networkError = () =>
  Object.assign(new Error('Network Error'), { isAxiosError: true, response: undefined });

function renderWithProviders(ui: ReactElement, initialEntry = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderRoute(initialEntry: string, path: string, element: ReactElement) {
  return renderWithProviders(
    <Routes>
      <Route path={path} element={element} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    initialEntry
  );
}

/** Prints the current location (pathname + search) so navigations are assertable. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  getMock.mockImplementation(async () => ({ data: {} }));
  postMock.mockImplementation(async () => ({ data: {} }));
  putMock.mockImplementation(async () => ({ data: {} }));
  patchMock.mockResolvedValue({ status: 204 });
  deleteMock.mockResolvedValue({ status: 204 });
  // jsdom lacks matchMedia — ThemeProvider probes the color scheme on boot.
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// =====================================================================
// D-03 + D-04 — ActivateCodePage ↔ ActivationCodeModal parity
// =====================================================================
describe('Wave 18.2 — Activation code parity (D-03/D-04)', () => {
  it('page: rejects codes shorter than the real format with an inline error, no API call', async () => {
    renderRoute('/activate-code', '/activate-code', <ActivateCodePage />);
    const input = await screen.findByTestId('activate-code-input');
    fireEvent.change(input, { target: { value: 'ABCD12' } });
    fireEvent.submit(input.closest('form')!);
    expect(await screen.findByTestId('activate-code-format-error')).toHaveTextContent('أقصر من الصيغة المقبولة');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('page: accepts a standard 16-char code and sends the normalized value', async () => {
    renderRoute('/activate-code', '/activate-code', <ActivateCodePage />);
    const input = await screen.findByTestId('activate-code-input');
    fireEvent.change(input, { target: { value: 'ABCD1234EFGH5678' } });
    fireEvent.click(screen.getByTestId('activate-code-submit'));
    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith('/subscriptions/redeem', { code: 'ABCD-1234-EFGH-5678' });
    });
  });

  it('page: accepts prefixed admin codes (22+ chars) — the old 4×4 boxes truncated them', async () => {
    renderRoute('/activate-code', '/activate-code', <ActivateCodePage />);
    const input = await screen.findByTestId('activate-code-input');
    fireEvent.change(input, { target: { value: 'ADMIN-PREFIX-CODE-XXXX-YYYY' } });
    const submit = screen.getByTestId('activate-code-submit');
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    const significant = 'ADMINPREFIXCODEXXXXYYYY'.length;
    await waitFor(() => {
      expect(postMock).toHaveBeenCalledTimes(1);
      expect((postMock.mock.calls[0][1] as { code: string }).code.replace(/-/g, '').length).toBe(significant);
    });
  });

  it('modal: same rule — 10 significant chars keep submit disabled, 16 enable it', async () => {
    renderWithProviders(<ActivationCodeModal subject={{ id: 's1', nameAr: 'الباطنة' }} onClose={() => undefined} />);
    const input = await screen.findByTestId('activation-code-input');
    fireEvent.change(input, { target: { value: 'ABCD12345' } });
    expect(screen.getByTestId('activation-modal-submit')).toBeDisabled();
    fireEvent.change(input, { target: { value: 'ABCD1234EFGH5678' } });
    expect(screen.getByTestId('activation-modal-submit')).not.toBeDisabled();
  });

  it('page success (D-04): clears the entitlement token + invalidates the real keys, never the dead [subscriptions]', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/activate-code']}>
          <ActivateCodePage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const input = await screen.findByTestId('activate-code-input');
    fireEvent.change(input, { target: { value: 'ABCD-1234-EFGH-5678' } });
    fireEvent.click(screen.getByTestId('activate-code-submit'));
    await waitFor(() => expect(clearEntitlementTokenMock).toHaveBeenCalled());
    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));
    expect(invalidatedKeys).toContain(JSON.stringify(['my-subjects-entitled']));
    expect(invalidatedKeys).toContain(JSON.stringify(['subjects']));
    expect(invalidatedKeys).toContain(JSON.stringify(['stats']));
    expect(invalidatedKeys).not.toContain(JSON.stringify(['subscriptions']));
  });
});

// =====================================================================
// D-05 — Notifications zero badge
// =====================================================================
describe('Wave 18.2 — Notifications zero badge (D-05)', () => {
  it('unread === 0 renders NO literal «0» chip and no mark-all button', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/notifications/unread-count')) return { data: 0 };
      if (url.includes('/notifications')) return { data: { items: [] } };
      return { data: {} };
    });
    renderWithProviders(<NotificationsPage />);
    await screen.findByText('غير مقروء');
    // The zero renders as a stray text node «0» next to the filter chip —
    // after the Boolean() guard, no chip and no standalone zero may exist.
    expect(document.body.textContent).not.toMatch(/غير مقروء\s*0/);
    expect(screen.queryByText('تعليم الكل كمقروء')).not.toBeInTheDocument();
  });

  it('unread === 3 renders the count chip and the mark-all button', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/notifications/unread-count')) return { data: 3 };
      if (url.includes('/notifications')) return { data: { items: [] } };
      return { data: {} };
    });
    renderWithProviders(<NotificationsPage />);
    expect(await screen.findByText('تعليم الكل كمقروء')).toBeInTheDocument();
    expect(await screen.findByText('3')).toBeInTheDocument();
  });
});

// =====================================================================
// D-06 — Login: no fake remember-me
// =====================================================================
describe('Wave 18.2 — Login honesty (D-06)', () => {
  it('renders no «تذكّرني» control (no persistent-login contract exists)', async () => {
    renderWithProviders(<LoginPage />);
    expect(screen.queryByText('تذكّرني')).not.toBeInTheDocument();
    expect(screen.getByText('نسيت كلمة المرور؟')).toBeInTheDocument();
  });
});

// =====================================================================
// D-17 — destination preservation
// =====================================================================
describe('Wave 18.2 — ProtectedRoute ?next= (D-17)', () => {
  it('parks the intended destination (path + query) in ?next=', async () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/notifications"
          element={<ProtectedRoute><div>secret</div></ProtectedRoute>}
        />
        <Route path="/login" element={<LocationProbe />} />
      </Routes>,
      '/notifications?filter=unread'
    );
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/login?next=%2Fnotifications%3Ffilter%3Dunread');
    });
  });

  it('login resumes the parked destination after success', async () => {
    loginMock.mockResolvedValue(undefined);
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/study" element={<LocationProbe />} />
        <Route path="/dashboard" element={<LocationProbe />} />
      </Routes>,
      '/login?next=%2Fstudy%3Ftab%3Dbank'
    );
    fireEvent.change(screen.getByPlaceholderText('0999999999'), { target: { value: '0999999999' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /تسجيل الدخول/i }));
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/study?tab=bank');
    });
  });

  it('login ignores an unsafe (protocol-relative) next value', async () => {
    loginMock.mockResolvedValue(undefined);
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<LocationProbe />} />
      </Routes>,
      '/login?next=%2F%2Fevil.example.com'
    );
    fireEvent.change(screen.getByPlaceholderText('0999999999'), { target: { value: '0999999999' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /تسجيل الدخول/i }));
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/dashboard');
    });
  });
});

// =====================================================================
// D-09 — Register → verify-otp only when the route exists
// =====================================================================
describe('Wave 18.2 — Register OTP navigation guard (D-09)', () => {
  async function fillAndSubmitRegister() {
    const mod = await import('@/features/auth/pages/RegisterPage');
    const RegisterPage = mod.default;
    renderWithProviders(
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-otp" element={<LocationProbe />} />
        <Route path="/login" element={<LocationProbe />} />
      </Routes>,
      '/register'
    );
    fireEvent.change(await screen.findByPlaceholderText('أحمد العبد الله'), { target: { value: 'أحمد التجريبي' } });
    fireEvent.change(screen.getByPlaceholderText('0991234567'), { target: { value: '0991234567' } });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[0], { target: { value: 'Password123!' } });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[1], { target: { value: 'Password123!' } });
    // Academic selects (universities → colleges → years).
    await screen.findByText('اختر الجامعة');
    const selects = document.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: 'u1' } });
    await screen.findByText('كلية الطب');
    fireEvent.change(document.querySelectorAll('select')[1], { target: { value: 'c1' } });
    await screen.findByText('السنة الأولى');
    fireEvent.change(document.querySelectorAll('select')[2], { target: { value: 'y1' } });
    // The terms checkbox lives inside its <label> (custom check square).
    fireEvent.click(document.querySelector('input[type="checkbox"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'إنشاء الحساب' }));
  }

  beforeEach(() => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/universities/')) return { data: [{ id: 'c1', nameAr: 'كلية الطب' }] };
      if (url.includes('/colleges/')) return { data: [{ id: 'y1', nameAr: 'السنة الأولى' }] };
      if (url.includes('/universities')) return { data: { items: [{ id: 'u1', nameAr: 'جامعة تجريبية' }] } };
      return { data: {} };
    });
  });

  it('otpRequired=true but the OTP route flag is OFF → lands on /login, never the missing /verify-otp route', async () => {
    postMock.mockImplementation(async (url: string) => {
      if (url.includes('/auth/register')) return { data: { otpRequired: true } };
      return { data: {} };
    });
    await fillAndSubmitRegister();
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/login');
    });
  });

  it('otpRequired=false → /login (unchanged safe path)', async () => {
    postMock.mockImplementation(async (url: string) => {
      if (url.includes('/auth/register')) return { data: { otpRequired: false } };
      return { data: {} };
    });
    await fillAndSubmitRegister();
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/login');
    });
  });
});

// =====================================================================
// D-07 + D-08 — Settings honesty + theme single source
// =====================================================================
describe('Wave 18.2 — Settings honesty (D-07/D-08)', () => {
  it('renders NO notifications toggle (no consuming API exists)', async () => {
    renderWithProviders(
      <ThemeProvider>
        <SettingsPage />
      </ThemeProvider>
    );
    expect(screen.queryByText('تلقّي الإشعارات')).not.toBeInTheDocument();
  });

  it('theme toggle drives the ThemeProvider (data-theme + storage stay in sync)', async () => {
    renderWithProviders(
      <ThemeProvider>
        <SettingsPage />
      </ThemeProvider>
    );
    const toggle = await screen.findByTestId('settings-theme-toggle');
    expect(toggle).toHaveAttribute('role', 'switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(localStorage.getItem('cms-theme')).toBe('dark');
      expect(toggle).toHaveAttribute('aria-checked', 'true');
    });
  });
});

// =====================================================================
// D-41 — accurate OTP fallbacks
// =====================================================================
describe('Wave 18.2 — VerifyOtp accurate fallbacks (D-41/D-19)', () => {
  it('a network failure shows connection copy, never a wrong-code claim', async () => {
    postMock.mockImplementation(async (url: string) => {
      if (url.includes('/verify-otp') || url.includes('/otp')) throw networkError();
      return { data: {} };
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[{ pathname: '/verify-otp', state: { phone: '0991234567' } }]}>
          <VerifyOtpPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const first = await screen.findByLabelText('الرقم 1 من 6');
    '123456'.split('').forEach((digit, index) => {
      fireEvent.change(screen.getByLabelText(`الرقم ${index + 1} من 6`), { target: { value: digit } });
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('تعذّر التحقق من الرمز');
    });
    expect(document.body.textContent).not.toContain('رمز التحقق غير صحيح');
    expect(first).toBeInTheDocument();
  });
});
