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

import { StudyPage } from '@/features/study/pages/StudyPage';
import MyStudiesPage from '@/features/my-studies/pages/MyStudiesPage';

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

/** Renders the /study hub directly at `path`. */
function renderStudyAt(path: string) {
  return renderAt(path, '/study', <StudyPage />);
}

/** Renders the legacy /my-studies hub directly at `path`. */
function renderMyStudiesAt(path: string) {
  return renderAt(path, '/my-studies', <MyStudiesPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
  postMock.mockReset();
  stubGet();
});

// ================= W15.4.3: exams sub-tabs on /study =================

describe('StudyPage exams tab — اختبارات/تدريب sub-tabs (15.4.3)', () => {
  it('defaults to the exams sub-tab when no ?subtab= is present', () => {
    renderStudyAt('/study?tab=exams');

    expect(screen.getByTestId('study-exams-tab')).toBeInTheDocument();
    expect(screen.getByTestId('study-exams-subtab-exams').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('study-exams-subtab-practice').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('study-exams-panel-exams')).toBeInTheDocument();
    expect(screen.queryByTestId('study-exams-panel-practice')).not.toBeInTheDocument();
  });

  it('switches to the practice sub-tab when التدريب is clicked', () => {
    renderStudyAt('/study?tab=exams');

    fireEvent.click(screen.getByTestId('study-exams-subtab-practice'));

    expect(screen.getByTestId('study-exams-subtab-practice').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('study-exams-subtab-exams').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('study-exams-panel-practice')).toBeInTheDocument();
    expect(screen.queryByTestId('study-exams-panel-exams')).not.toBeInTheDocument();
  });

  it('renders the practice sub-tab directly from a ?subtab=practice deep link', () => {
    renderStudyAt('/study?tab=exams&subtab=practice');

    expect(screen.getByTestId('study-exams-subtab-practice').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('study-exams-subtab-exams').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('study-exams-panel-practice')).toBeInTheDocument();
    expect(screen.queryByTestId('study-exams-panel-exams')).not.toBeInTheDocument();
  });

  it('keeps /my-studies a 5-tab hub with no /study sub-tab bar (regression)', async () => {
    renderMyStudiesAt('/my-studies?tab=exams');

    // The 5-tab hub is intact: every legacy tab is still a top-level tab.
    expect(screen.getByTestId('tab-exams').getAttribute('aria-selected')).toBe('true');
    for (const key of ['practice', 'exam-courses', 'exams', 'library', 'courses']) {
      expect(screen.getByTestId(`tab-${key}`)).toBeInTheDocument();
    }
    expect(await screen.findByTestId('panel-exams')).toBeInTheDocument();

    // /study's sub-tab structure must NOT leak into the legacy hub.
    expect(screen.queryByTestId('study-exams-subtab-exams')).not.toBeInTheDocument();
    expect(screen.queryByTestId('study-exams-subtab-practice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('study-exams-panel-exams')).not.toBeInTheDocument();
  });
});
