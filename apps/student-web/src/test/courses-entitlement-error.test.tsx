import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) ----
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

// ---- fixtures ----
const SUBJECTS = [
  { id: 's1', slug: 'مادة-أ', nameAr: 'مادة أ' },
  { id: 's2', slug: 'مادة-ب', nameAr: 'مادة ب' },
];

const COURSE_LIST = [{
  id: 'c1', subjectId: 's1', subjectNameAr: 'مادة أ', title: 'كورس التشريح',
  description: 'وصف تجريبي', coverImageUrl: null, episodesCount: 2,
  totalDurationSeconds: 3600, totalViewsCount: 12,
}];

/** An axios-shaped 403 rejection — isEntitlementDenied() keys on isAxiosError + status. */
const forbidden = () => Object.assign(new Error('Request failed with status code 403'), {
  isAxiosError: true,
  response: { status: 403, data: { detail: 'Entitlement validation denied access' } },
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

function stubSubjects(subjects = SUBJECTS) {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: subjects };
    if (url.includes('/courses/subject/s1')) return { data: COURSE_LIST };
    if (url.includes('/courses/subject/')) return { data: [] };
    return { data: [] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getEntitlementTokenMock.mockResolvedValue('fresh-entitlement-token');
  stubSubjects();
});

// ============ R62 §2.C — the H1 self-heal path ============

describe('CoursesCatalog — entitlement self-heal on 403', () => {
  it('recovers silently: first pass 403 → forced re-issue → retry succeeds → grid renders', async () => {
    stubSubjects([SUBJECTS[0]]);
    let coursesCalls = 0;
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: [SUBJECTS[0]] };
      if (url.includes('/courses/subject/')) {
        coursesCalls += 1;
        if (coursesCalls === 1) throw forbidden();
        return { data: COURSE_LIST };
      }
      return { data: [] };
    });

    renderCatalog();

    // The self-heal ends in a normal grid, NOT the denial card.
    expect(await screen.findByText('كورس التشريح')).toBeInTheDocument();
    expect(screen.queryByTestId('courses-entitlement-error')).not.toBeInTheDocument();
    // §2.C: the retry forced a fresh entitlement (forceRenewal = true).
    expect(getEntitlementTokenMock).toHaveBeenCalledWith(true);
  });

  it('shows the denial card when 403 persists even after the forced re-issue + retry', async () => {
    stubSubjects([SUBJECTS[0]]);
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: [SUBJECTS[0]] };
      if (url.includes('/courses/subject/')) throw forbidden();
      return { data: [] };
    });

    renderCatalog();

    const card = await screen.findByTestId('courses-entitlement-error');
    expect(card).toHaveAttribute('role', 'alert'); // WCAG 2.2 AA — announced to AT
    expect(screen.getByText('انتهت صلاحية الجلسة أو الجهاز غير مصرح له')).toBeInTheDocument();
    expect(screen.getByText('يرجى إعادة تسجيل الدخول للوصول إلى كورساتك.')).toBeInTheDocument();
    const login = screen.getByTestId('entitlement-login-link');
    expect(login.getAttribute('href')).toBe('/login');
    expect(screen.getByTestId('entitlement-retry-button')).toBeInTheDocument();
  });

  it('partial denial keeps the loaded grid (Push-8 semantics) — no false denial card', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: SUBJECTS };
      if (url.includes('/courses/subject/s1')) return { data: COURSE_LIST };
      if (url.includes('/courses/subject/s2')) throw forbidden();
      return { data: [] };
    });

    renderCatalog();

    expect(await screen.findByText('كورس التشريح')).toBeInTheDocument();
    expect(screen.queryByTestId('courses-entitlement-error')).not.toBeInTheDocument();
  });
});

// ============ R62 §2.B.2 — the cms-entitlement-error listener ============

describe('CoursesCatalog — cms-entitlement-error event', () => {
  it('renders the denial card when the interceptor broadcasts a /courses/ 403, and retry recovers', async () => {
    renderCatalog();
    expect(await screen.findByText('كورس التشريح')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent('cms-entitlement-error', {
        detail: { url: '/courses/subject/s1', reason: 'denied' },
      }));
    });
    expect(await screen.findByTestId('courses-entitlement-error')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('entitlement-retry-button'));
    expect(await screen.findByText('كورس التشريح')).toBeInTheDocument();
    expect(screen.queryByTestId('courses-entitlement-error')).not.toBeInTheDocument();
  });

  it('ignores 403 broadcasts from non-course endpoints', async () => {
    renderCatalog();
    expect(await screen.findByText('كورس التشريح')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new CustomEvent('cms-entitlement-error', {
        detail: { url: '/library/abc/content', reason: 'denied' },
      }));
    });
    expect(screen.queryByTestId('courses-entitlement-error')).not.toBeInTheDocument();
    expect(screen.getByText('كورس التشريح')).toBeInTheDocument();
  });
});
