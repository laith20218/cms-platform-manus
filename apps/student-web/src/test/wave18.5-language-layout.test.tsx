import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Wave 18.5 — Language & Layout Polish regression suite.
 * D-18 (Arabic exam-type labels), D-26 (glossary lock), D-37 (profile maps +
 * dir=ltr email), D-47 (trail «دراستي» link), D-48 (progress-tab honesty).
 */

const { getMock, postMock, putMock, deleteMock, patchMock } = vi.hoisted(() => ({
  getMock: vi.fn(), postMock: vi.fn(), putMock: vi.fn(), deleteMock: vi.fn(), patchMock: vi.fn(),
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
  return { ...actual, entitlementRequestConfig: async () => ({}) };
});

vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({ user: { fullName: 'طالب تجريبي' }, isAuthenticated: true, isLoading: false }),
}));

import { ExamsPage } from '@/features/exams/pages/ExamsPage';
import { StudyPage } from '@/features/study/pages/StudyPage';
import ProfilePage from '@/features/profile/ProfilePage';
import { buildTrail } from '@/components/layouts/PathTrail';

function renderWithProviders(ui: ReactElement, initialEntry = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-probe">{`${location.pathname}${location.search}`}</span>;
}

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockImplementation(async () => ({ data: {} }));
  postMock.mockImplementation(async () => ({ data: {} }));
  putMock.mockImplementation(async () => ({ data: {} }));
  deleteMock.mockResolvedValue({ status: 204 });
  patchMock.mockResolvedValue({ status: 204 });
});

// =====================================================================
// D-18 — Arabic exam-type labels
// =====================================================================
describe('Wave 18.5 — exam type labels (D-18)', () => {
  it('renders the Arabic label (نهائي), never the raw English enum', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) {
        return { data: [{ id: 's1', slug: 'تشريح', nameAr: 'التشريح', contentScopes: ['QuestionsExams'] }] };
      }
      if (url.includes('/exams/by-subject/s1')) {
        return {
          data: [{
            id: 'e1', titleAr: 'اختبار القلب النهائي', examType: 'final', totalQuestions: 30,
            durationMinutes: 45, status: 'Published', attemptsCount: 0, completedCount: 0, averageScore: null,
          }],
        };
      }
      return { data: [] };
    });
    renderWithProviders(
      <Routes>
        <Route path="/exams" element={<ExamsPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>,
      '/exams'
    );

    expect(await screen.findByText('نهائي', {}, { timeout: 5000 })).toBeInTheDocument();
    // The raw enum must not leak anywhere in the catalog body.
    expect(document.body.textContent).not.toMatch(/\bfinal\b/);
  });
});

// =====================================================================
// D-47 — trail «دراستي» linkable with subjectId-only
// =====================================================================
describe('Wave 18.5 — PathTrail subjectId parent link (D-47)', () => {
  it('a subjectId-only study URL links «دراستي» (was plain text)', () => {
    const client = new QueryClient();
    client.setQueryData(['my-subjects-entitled'], [{ id: 's1', slug: 'باطنة', nameAr: 'الباطنة' }]);
    const trail = buildTrail('/study', '?subjectId=s1', client);
    expect(trail.map((segment) => segment.label)).toEqual(['الرئيسية', 'دراستي', 'الباطنة']);
    expect(trail[1].to).toBe('/study');
  });

  it('a bare study URL keeps «دراستي» as the plain leaf (unchanged)', () => {
    const client = new QueryClient();
    expect(buildTrail('/study', '', client).map((segment) => segment.label)).toEqual(['الرئيسية', 'دراستي']);
    expect(buildTrail('/study', '', client)[1].to).toBeUndefined();
  });
});

// =====================================================================
// D-48 — progress-tab subjectId honesty
// =====================================================================
describe('Wave 18.5 — progress tab scope honesty (D-48)', () => {
  it('a riding ?subjectId on the progress tab shows the all-subjects hint + clear', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) {
        return { data: [{ id: 's1', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['QuestionsExams'] }] };
      }
      if (url.includes('/stats')) {
        return { data: { bySubject: [], byDifficulty: [] } };
      }
      return { data: {} };
    });
    renderWithProviders(
      <Routes>
        <Route path="/study" element={<><StudyPage /><LocationProbe /></>} />
      </Routes>,
      '/study?tab=progress&subjectId=s1'
    );

    const hint = await screen.findByTestId('study-progress-scope-hint', {}, { timeout: 5000 });
    expect(hint).toHaveTextContent('كل موادك');
    // One tap clears the dead filter param.
    fireEvent.click(screen.getByTestId('study-progress-scope-clear'));
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/study?tab=progress');
    });
    expect(screen.queryByTestId('study-progress-scope-hint')).not.toBeInTheDocument();
  });
});

// =====================================================================
// D-37 — profile status map + LTR email
// =====================================================================
describe('Wave 18.5 — profile status & email (D-37)', () => {
  it('maps the account status to Arabic — the raw enum never leaks', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/profile')) {
        return {
          data: {
            id: 'u1', fullName: 'طالب تجريبي', phone: '0999999999', email: 'student@example.com',
            status: 'Suspended', createdAt: '2026-01-01T00:00:00Z', lastLogin: '2026-02-01T00:00:00Z',
            universityName: 'جامعة', collegeName: 'الطب', academicYearName: 'السنة الأولى',
            subscriptions: [], avatarUrl: null,
          },
        };
      }
      return { data: {} };
    });
    renderWithProviders(<ProfilePage />);

    expect(await screen.findAllByText('موقوف', {}, { timeout: 5000 })).not.toHaveLength(0);
    expect(document.body.textContent).not.toMatch(/\bSuspended\b/);
    // The email renders LTR inside the RTL page.
    const email = await screen.findByText('student@example.com', {}, { timeout: 5000 });
    expect(email.closest('[dir]')?.getAttribute('dir')).toBe('ltr');
  });
});

// =====================================================================
// D-26 — glossary lock (banned spellings in user-facing source)
// =====================================================================
describe('Wave 18.5 — glossary lock (D-26)', () => {
  const SRC = resolve(__dirname, '..');

  // User-facing, non-C2 files that carry student-visible copy.
  const GLOSSARY_FILES = [
    'features/exams/pages/ExamPage.tsx',
    'features/exams/pages/ExamReviewPage.tsx',
    'features/practice/pages/PracticePage.tsx',
    'features/questions/QuestionPage.tsx',
    'features/notifications/pages/NotificationsPage.tsx',
    'features/settings/SettingsPage.tsx',
    'features/profile/ProfilePage.tsx',
    'components/ReportQuestionDialog.tsx',
    'components/ui/LoadingScreen.tsx',
    'features/favorites/components/FavoritesSkeleton.tsx',
  ];

  it.each(GLOSSARY_FILES)('%s carries the unified spellings (no bare تعذر, no جاري)', (rel) => {
    const content = readFileSync(resolve(SRC, rel), 'utf-8');
    // Bare تعذر (without the shadda تعذّر) is banned.
    expect(content.includes('تعذر'), `${rel} contains bare تعذر`).toBe(false);
    // جاري (wrong tanwin form) is banned — جارٍ is the rule.
    expect(content.includes('جاري'), `${rel} contains جاري`).toBe(false);
  });

  it('the answered counter reads مجاب (not مجابة/أجبت)', () => {
    const practice = readFileSync(resolve(SRC, 'features/practice/pages/PracticePage.tsx'), 'utf-8');
    expect(practice.includes('مجاب:')).toBe(true);
    const questions = readFileSync(resolve(SRC, 'features/questions/QuestionPage.tsx'), 'utf-8');
    expect(questions.includes('مجاب:')).toBe(true);
  });
});

// =====================================================================
// D-15 — legal pages public chrome (Wave 18.6)
// =====================================================================
describe('Wave 18.6 — legal pages public chrome (D-15)', () => {
  it('terms renders the brand + back-home link in every state', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/content/terms')) {
        return { data: { slug: 'terms', titleAr: 'شروط الاستخدام', bodyAr: '## عام\nنص تجريبي.', updatedAt: '2026-01-01T00:00:00Z' } };
      }
      return { data: {} };
    });
    const { TermsPage } = await import('@/features/legal/TermsPage');
    renderWithProviders(<TermsPage />);

    expect(await screen.findByTestId('content-page-terms', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByTestId('legal-back-home')).toHaveAttribute('href', '/dashboard');
    expect(screen.getByTestId('legal-back-home')).toHaveTextContent('العودة للرئيسية');
    expect(screen.getByText('CMS', { exact: false })).toBeInTheDocument();
  });

  it('the error state keeps the chrome too (no dead end)', async () => {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/content/privacy')) {
        throw Object.assign(new Error('Network Error'), { isAxiosError: true, response: undefined });
      }
      return { data: {} };
    });
    const { PrivacyPage } = await import('@/features/legal/PrivacyPage');
    renderWithProviders(<PrivacyPage />);

    expect(await screen.findByTestId('content-page-privacy-error', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByTestId('legal-back-home')).toBeInTheDocument();
  });
});
