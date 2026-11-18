import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 17.0 — legal surfaces + SubjectModal destination + terminology.
 *
 * Locks three product decisions:
 *  1. Terms / Privacy / Contact are reachable from BOTH the login footer and
 *     Settings (one tap in — admin-managed content pages, no hardcoded copy).
 *  2. The study bank lens labels read as QUESTIONS (أسئلة السنوات / أسئلة
 *     مصنّفة), not «دورات» — the Owner's terminology ruling.
 *  3. The SubjectModal exams action is «بنك الأسئلة» pointing at the study
 *     bank (covered in wave15.4.4b.test.tsx; asserted here via the hub render).
 */

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({
    login: vi.fn().mockResolvedValue(undefined),
    user: null,
    isAuthenticated: false,
    isLoading: false,
    logout: vi.fn(),
    refreshToken: vi.fn(),
  }),
}));

import LoginPage from '@/features/auth/pages/LoginPage';
import SettingsPage from '@/features/settings/SettingsPage';
import { StudyPage } from '@/features/study/pages/StudyPage';

function withQueryClient(ui: React.ReactNode, initialEntry = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

// ================= 1. Legal links — LoginPage footer =================

describe('W17.0 — LoginPage legal footer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('links Terms, Privacy and Contact under the card', () => {
    withQueryClient(<LoginPage />);

    expect(screen.getByTestId('login-legal-terms')).toHaveAttribute('href', '/terms');
    expect(screen.getByTestId('login-legal-privacy')).toHaveAttribute('href', '/privacy');
    expect(screen.getByTestId('login-legal-contact')).toHaveAttribute('href', '/contact');
    expect(screen.getByTestId('login-legal-terms')).toHaveTextContent('الشروط والأحكام');
    expect(screen.getByTestId('login-legal-privacy')).toHaveTextContent('سياسة الخصوصية');
    expect(screen.getByTestId('login-legal-contact')).toHaveTextContent('تواصل معنا');
  });
});

// ================= 2. Legal links — SettingsPage section =================

describe('W17.0 — SettingsPage legal section', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/student/preferences')) return { data: { fontSize: 'md' } };
      if (url.includes('/system/version')) return { data: { version: '17.0.0' } };
      if (url.includes('/profile/leaderboard-sharing')) return { data: { sharesLeaderboard: false } };
      return { data: [] };
    });
  });

  it('exposes the three legal pages one tap from Settings', () => {
    withQueryClient(<SettingsPage />);

    expect(screen.getByTestId('settings-legal-terms')).toHaveAttribute('href', '/terms');
    expect(screen.getByTestId('settings-legal-privacy')).toHaveAttribute('href', '/privacy');
    expect(screen.getByTestId('settings-legal-contact')).toHaveAttribute('href', '/contact');
    // The section is labeled so the links are discoverable, not buried.
    expect(screen.getByRole('heading', { name: /قانوني/ })).toBeInTheDocument();
  });
});

// ================= 3. Bank lens terminology =================

describe('W17.0 — study bank lenses read as questions, not courses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) {
        return {
          data: [
            { id: 's1', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
          ],
        };
      }
      if (url.includes('/exam-courses/subject/s1')) {
        return {
          data: [
            { id: 'ec1', nameAr: 'أسئلة 2025 — الدورة الأولى', year: 2025, semester: 1, courseType: 'First', freeOrPaid: false, examsCount: 3 },
          ],
        };
      }
      return { data: [] };
    });
  });

  it('labels the two lenses أسئلة السنوات / أسئلة مصنّفة', async () => {
    withQueryClient(<StudyPage />, '/study?tab=bank');

    expect(await screen.findByTestId('exam-courses-tab-years')).toHaveTextContent('أسئلة السنوات');
    expect(screen.getByTestId('exam-courses-tab-categorized')).toHaveTextContent('أسئلة مصنّفة');
    // The retired «دورات» lens labels must not resurface.
    expect(screen.queryByText('دورات سنوات')).toBeNull();
    expect(screen.queryByText('دورات مصنفة')).toBeNull();
  });
});
