import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) — mirrors the deleted redirect test's harness ----
const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
    put: vi.fn(),
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

vi.mock('@/features/security/useContentProtection', () => ({
  useContentProtection: () => { /* jsdom: protection listeners disabled in tests */ },
}));

// Real AppRoutes render: neutralize the auth guard + shell (same trick the
// legacy-redirect suite in my-studies.test.tsx used).
vi.mock('@/components/common/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/layouts/AppShell', () => ({
  AppShell: () => <Outlet />,
}));

import { AppRoutes } from '@/app/router';

// ---- fixtures (mirror exam-courses.test.tsx) ----
const ENTITLED_SUBJECTS = [
  { id: 's1', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
];

const COURSES_S1 = [
  { id: 'ec1', nameAr: 'دورة 2025 الأولى', nameEn: null, description: null, coverUrl: null, year: 2025, semester: 1, courseType: 'First', freeOrPaid: true, examsCount: 3, sortOrder: 0 },
  { id: 'ec2', nameAr: 'دورة 2026 الأولى', nameEn: null, description: 'وصف قصير', coverUrl: null, year: 2026, semester: 1, courseType: 'First', freeOrPaid: false, examsCount: 2, sortOrder: 1 },
];

const TREE_S1 = {
  subjectId: 's1',
  subjectName: 'الباطنة',
  totalQuestions: 7,
  uncategorizedCount: 2,
  anchorExamModelId: 'ex1',
  lectures: [
    { lectureId: 'lec1', lectureTitle: 'محاضرة القلب', lectureNumber: 1, questionsCount: 5, groups: [
      { paragraphTag: 'الفصل الأول', questionsCount: 3 },
      { paragraphTag: null, questionsCount: 2 },
    ] },
  ],
};

const UNIVERSITIES = { items: [{ id: 'u1', nameAr: 'جامعة حمص', collegesCount: 1 }] };
const COLLEGES_U1 = [{ id: 'c1', nameAr: 'الطب البشري', yearsCount: 1 }];
const YEARS_C1 = [{ id: 'y1', nameAr: 'السنة الثالثة', semestersCount: 1 }];
const SEMESTERS_Y1 = [{ id: 'sem1', nameAr: 'الفصل الأول', subjectsCount: 1 }];

function stubGet() {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: ENTITLED_SUBJECTS };
    if (url.includes('/practice/categorized/s1')) return { data: TREE_S1 };
    if (url.includes('/exam-courses/subject/s1')) return { data: COURSES_S1 };
    if (url === '/universities') return { data: UNIVERSITIES };
    if (url === '/universities/u1/colleges') return { data: COLLEGES_U1 };
    if (url === '/colleges/c1/years') return { data: YEARS_C1 };
    if (url === '/years/y1/semesters') return { data: SEMESTERS_Y1 };
    return { data: [] };
  });
}

/** Renders the REAL AppRoutes at the given URL plus a location probe. */
function renderApp(initialEntry: string) {
  const LocationProbe = () => {
    const location = useLocation();
    return <div data-testid="location-probe" data-path={location.pathname} data-search={location.search} />;
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const FULL_CASCADE_PARAMS = 'universityId=u1&collegeId=c1&yearId=y1&semesterId=sem1&subjectId=s1';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  stubGet();
});

// ================= W15.4.2: the standalone /exam-courses page =================

describe('ExamCoursesPage — standalone /exam-courses route (15.4.2)', () => {
  it('renders the page directly at /exam-courses (no hub redirect)', async () => {
    renderApp(`/exam-courses?${FULL_CASCADE_PARAMS}`);

    // The page shell renders with its h1 header (lazy chunk + data resolve async).
    expect(await screen.findByTestId('exam-courses-page')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'الدورات الامتحانية' })).toBeInTheDocument();

    // The catalog renders its years lens (default) with the cascade applied.
    expect(await screen.findByTestId('exam-courses-list')).toBeInTheDocument();
    expect(screen.getByTestId('exam-courses-tab-years').getAttribute('aria-selected')).toBe('true');

    // KEY behavioral change: the URL stays on /exam-courses (was /my-studies).
    expect(screen.getByTestId('location-probe').getAttribute('data-path')).toBe('/exam-courses');
  });

  it('renders the categorized lens from ?examTab=categorized', async () => {
    renderApp(`/exam-courses?${FULL_CASCADE_PARAMS}&examTab=categorized`);

    expect(await screen.findByTestId('exam-courses-panel-categorized')).toBeInTheDocument();
    expect(await screen.findByTestId('categorized-tree')).toBeInTheDocument();
    expect(screen.getByTestId('exam-courses-tab-categorized').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('location-probe').getAttribute('data-path')).toBe('/exam-courses');
  });

  it('still renders the storefront inside the hub at /my-studies?tab=exam-courses (regression)', async () => {
    renderApp(`/my-studies?tab=exam-courses&universityId=u1&subjectId=s1`);

    expect(await screen.findByTestId('panel-exam-courses')).toBeInTheDocument();
    expect(screen.getByTestId('tab-exam-courses').getAttribute('aria-selected')).toBe('true');
    // The hub keeps the storefront's own section header inside the panel
    // (renders once the entitled subjects resolve).
    expect(await screen.findByText('الدورات الامتحانية', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByTestId('location-probe').getAttribute('data-path')).toBe('/my-studies');
  });
});
