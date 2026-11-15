import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) — mirrors wave15.4.3.test.tsx ----
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

// ---- fixtures (same shape as wave15.4.3) ----
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

beforeEach(() => {
  vi.clearAllMocks();
  postMock.mockReset();
  stubGet();
});

// ============ W15.5b (DEBT-LEADERBOARD-FALLBACK-01): unknown ?subtab= falls back ============

describe('StudyPage exams tab — nonsense subtab fallback (15.5b)', () => {
  it('/study?tab=exams&subtab=nonsense falls back to exams', () => {
    renderStudyAt('/study?tab=exams&subtab=nonsense');

    expect(screen.getByTestId('study-exams-tab')).toBeInTheDocument();
    expect(screen.getByTestId('study-exams-subtab-exams').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('study-exams-panel-exams')).toBeInTheDocument();
    expect(screen.queryByTestId('study-exams-panel-practice')).toBeNull();
  });
});
