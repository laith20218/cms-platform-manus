import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// R69 §3 — scope filter + truthful denial cards: the no-subscription card must win
// for "no active grants" reasons (403 body or forced re-issue), the device card must
// stay for device/session reasons, and subjects without a VideoAudio grant must
// never be queried at all.

const { getMock, postMock, getEntitlementTokenMock, clearEntitlementTokenMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  getEntitlementTokenMock: vi.fn(),
  clearEntitlementTokenMock: vi.fn(),
}));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

vi.mock('@/features/entitlements/services/entitlement-api', () => ({
  entitlementRequestConfig: async () => ({}),
  getEntitlementToken: (...args: unknown[]) => getEntitlementTokenMock(...args),
  clearEntitlementToken: clearEntitlementTokenMock,
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

vi.mock('@/features/security/useContentProtection', () => ({
  useContentProtection: () => { /* jsdom: protection listeners disabled in tests */ },
}));

vi.mock('@/components/common/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/layouts/AppShell', () => ({
  AppShell: () => <></>,
}));

import MyStudiesPage from '@/features/my-studies/pages/MyStudiesPage';
import { variantForReason } from '@/features/my-studies/services/courses-api';

// ---- fixtures (mirroring the real /subjects/my-subjects payload) ----
const VIDEO_SUBJECT = { id: 's1', slug: 'مادة-فيديو', nameAr: 'مادة فيديو', contentScopes: ['VideoAudio'] };
const TEXT_ONLY_SUBJECT = { id: 's2', slug: 'مادة-نصية', nameAr: 'مادة نصية', contentScopes: ['LecturesText'] };

const COURSE_LIST = [{
  id: 'c1', subjectId: 's1', subjectNameAr: 'مادة فيديو', title: 'كورس التشريح',
  description: 'وصف تجريبي', coverImageUrl: null, episodesCount: 2,
  totalDurationSeconds: 3600, totalViewsCount: 12,
}];

/** axios-shaped 403 with an optional ProblemDetails body. */
const forbidden = (detail?: string) => Object.assign(new Error('Request failed with status code 403'), {
  isAxiosError: true,
  response: { status: 403, data: detail ? { detail } : {} },
});

function renderCatalog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/my-studies?tab=courses']}>
        <Routes><Route path="/my-studies" element={<MyStudiesPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getEntitlementTokenMock.mockResolvedValue('fresh-entitlement-token');
});

// ============ §2.D — the VideoAudio catalog filter ============

describe('CoursesCatalog — R69 VideoAudio filter', () => {
  it('renders the truthful locked state (spec text) and queries NOTHING when no subject has VideoAudio', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: [TEXT_ONLY_SUBJECT] };
      throw new Error(`/courses/subject must never be called for a non-video subject — got ${url}`);
    });

    renderCatalog();

    expect(await screen.findByText('لا توجد كورسات فيديو متاحة لحسابك. يرجى تفعيل اشتراك.')).toBeInTheDocument();
    expect(screen.getByTestId('locked-empty-state')).toBeInTheDocument();
    // No doomed /courses/subject call, no entitlement re-issue.
    expect(getMock).not.toHaveBeenCalledWith(expect.stringContaining('/courses/subject'), expect.anything());
    expect(getEntitlementTokenMock).not.toHaveBeenCalled();
  });

  it('mixed scopes: only the VideoAudio subject is queried', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: [VIDEO_SUBJECT, TEXT_ONLY_SUBJECT] };
      if (url.includes('/courses/subject/s1')) return { data: COURSE_LIST };
      if (url.includes('/courses/subject/s2')) throw forbidden('لا تملك صلاحية الوصول إلى كورسات هذه المادة');
      return { data: [] };
    });

    renderCatalog();

    expect(await screen.findByText('كورس التشريح')).toBeInTheDocument();
    const queried = getMock.mock.calls.map((call) => String(call[0]));
    expect(queried.some((url) => url.includes('/courses/subject/s1'))).toBe(true);
    expect(queried.some((url) => url.includes('/courses/subject/s2'))).toBe(false);
  });
});

// ============ §2.D — variant-aware denial cards ============

describe('CoursesCatalog — truthful denial cards (R69)', () => {
  it('persistent 403 with a "No active grants" reason → the No-subscription card (no login button)', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: [VIDEO_SUBJECT] };
      if (url.includes('/courses/subject/')) throw forbidden('No active grants for this student.');
      return { data: [] };
    });
    getEntitlementTokenMock.mockRejectedValue(forbidden('No active grants for this student.'));

    renderCatalog();

    const card = await screen.findByTestId('courses-entitlement-error');
    expect(card).toHaveAttribute('data-variant', 'no-grants');
    expect(card).toHaveAttribute('role', 'alert'); // WCAG 2.2 AA
    expect(screen.getByText('لا يوجد اشتراك فعّال يتيح الكورسات')).toBeInTheDocument();
    expect(screen.queryByTestId('entitlement-login-link')).not.toBeInTheDocument();
    expect(screen.getByTestId('entitlement-activate-link')).toHaveAttribute('href', '/activate-code');
    expect(screen.getByTestId('entitlement-retry-button')).toBeInTheDocument();
  });

  it('persistent 403 with a device-mismatch reason → the session/device card (login kept)', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: [VIDEO_SUBJECT] };
      if (url.includes('/courses/subject/')) throw forbidden('Entitlement device mismatch.');
      return { data: [] };
    });

    renderCatalog();

    const card = await screen.findByTestId('courses-entitlement-error');
    expect(card).toHaveAttribute('data-variant', 'device');
    expect(screen.getByText('انتهت صلاحية الجلسة أو الجهاز غير مصرح له')).toBeInTheDocument();
    expect(screen.getByTestId('entitlement-login-link')).toHaveAttribute('href', '/login');
    expect(screen.queryByTestId('entitlement-activate-link')).not.toBeInTheDocument();
  });

  it('empty 403 body (Forbid()) → generic device card fallback, never a false subscription claim', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: [VIDEO_SUBJECT] };
      if (url.includes('/courses/subject/')) throw forbidden();
      return { data: [] };
    });

    renderCatalog();

    const card = await screen.findByTestId('courses-entitlement-error');
    expect(card).toHaveAttribute('data-variant', 'device');
  });

  it('idle-time /entitlements/issue 403 (post-§2.B guard) → the No-subscription card', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: [VIDEO_SUBJECT] };
      if (url.includes('/courses/subject/')) return { data: COURSE_LIST };
      return { data: [] };
    });

    renderCatalog();
    expect(await screen.findByText('كورس التشريح')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent('cms-entitlement-error', {
        detail: { url: '/entitlements/issue', reason: 'No active grants for this student.' },
      }));
    });
    const card = await screen.findByTestId('courses-entitlement-error');
    expect(card).toHaveAttribute('data-variant', 'no-grants');

    // A successful load clears the stale denial flag (§2.C contract preserved).
    fireEvent.click(screen.getByTestId('entitlement-retry-button'));
    expect(await screen.findByText('كورس التشريح')).toBeInTheDocument();
    expect(screen.queryByTestId('courses-entitlement-error')).not.toBeInTheDocument();
  });
});

// ============ §2.E — the reason classifier ============

describe('variantForReason (R69 §2.E)', () => {
  it('maps no-grants / scope / subscription reasons to no-grants', () => {
    expect(variantForReason('No active grants for this student.')).toBe('no-grants');
    expect(variantForReason('Subject is outside the entitlement scope.')).toBe('no-grants');
    expect(variantForReason('يرجى تفعيل اشتراك')).toBe('no-grants');
  });

  it('maps device reasons and unknown/empty reasons to the device fallback', () => {
    expect(variantForReason('Entitlement device mismatch.')).toBe('device');
    expect(variantForReason('Device binding is no longer active.')).toBe('device');
    expect(variantForReason('unknown')).toBe('device');
    expect(variantForReason('')).toBe('device');
    expect(variantForReason(undefined)).toBe('device');
  });
});
