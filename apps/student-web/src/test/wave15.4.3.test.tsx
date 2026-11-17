import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) — mirrors wave15.4.1.test.tsx ----
const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

vi.mock('@/features/entitlements/services/entitlement-api', async () => {
  const actual = await vi.importActual<typeof import('@/features/entitlements/services/entitlement-api')>(
    '@/features/entitlements/services/entitlement-api'
  );
  return { ...actual, entitlementRequestConfig: async () => ({}) };
});

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

import { ExamsPage } from '@/features/exams/pages/ExamsPage';

// ---- fixtures (same shape as wave15.4.1) ----
const MY_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
  { id: 's2', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['QuestionsExams', 'VideoAudio'] },
];

function stubGet() {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
    if (url.includes('/exams/by-subject/')) return { data: [] };
    return { data: [] };
  });
}

function renderAt(path: string, routePath: string, element: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
          <Route path="*" element={<div data-testid="route-fallback" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Renders the standalone /exams page directly at `path` (W16.1a). */
function renderExamsAt(path: string) {
  return renderAt(path, '/exams', <ExamsPage />);
}

// 15.4.4b: the former 'keeps /my-studies a 5-tab hub' regression test was
// retired with MyStudiesPage — /study is the only hub now, and its sub-tab
// structure is covered by the three tests below + wave15.4.1.test.tsx.

beforeEach(() => {
  vi.clearAllMocks();
  postMock.mockReset();
  stubGet();
});

// ================= W15.4.3 → W16.1a: exams sub-tabs on the /exams page =================

describe('ExamsPage — اختبارات/تدريب sub-tabs (15.4.3 → 16.1a)', () => {
  it('defaults to the exams sub-tab when no ?subtab= is present', () => {
    renderExamsAt('/exams');

    expect(screen.getByTestId('study-exams-tab')).toBeInTheDocument();
    expect(screen.getByTestId('study-exams-subtab-exams').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('study-exams-subtab-practice').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('study-exams-panel-exams')).toBeInTheDocument();
    expect(screen.queryByTestId('study-exams-panel-practice')).not.toBeInTheDocument();
  });

  it('switches to the practice sub-tab when التدريب is clicked', () => {
    renderExamsAt('/exams');

    fireEvent.click(screen.getByTestId('study-exams-subtab-practice'));

    expect(screen.getByTestId('study-exams-subtab-practice').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('study-exams-subtab-exams').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('study-exams-panel-practice')).toBeInTheDocument();
    expect(screen.queryByTestId('study-exams-panel-exams')).not.toBeInTheDocument();
  });

  it('renders the practice sub-tab directly from a ?subtab=practice deep link', () => {
    renderExamsAt('/exams?subtab=practice');

    expect(screen.getByTestId('study-exams-subtab-practice').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('study-exams-subtab-exams').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('study-exams-panel-practice')).toBeInTheDocument();
    expect(screen.queryByTestId('study-exams-panel-exams')).not.toBeInTheDocument();
  });
});
