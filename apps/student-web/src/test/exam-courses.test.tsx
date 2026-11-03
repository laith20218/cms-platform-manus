import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) ----
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

import ExamCoursesPage from '@/features/exam-courses/pages/ExamCoursesPage';
import ExamCourseDetailPage from '@/features/exam-courses/pages/ExamCourseDetailPage';

// ---- fixtures ----
const ENTITLED_SUBJECTS = [
  { id: 's1', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
  { id: 's2', slug: 'تشريح', nameAr: 'التشريح', contentScopes: ['VideoAudio'] },
];

const COURSES_S1 = [
  { id: 'ec1', nameAr: 'دورة 2025 الأولى', nameEn: null, description: null, coverUrl: null, year: 2025, semester: 1, courseType: 'First', freeOrPaid: true, examsCount: 3, sortOrder: 0 },
  { id: 'ec2', nameAr: 'دورة 2026 الأولى', nameEn: null, description: 'وصف قصير', coverUrl: null, year: 2026, semester: 1, courseType: 'First', freeOrPaid: false, examsCount: 2, sortOrder: 1 },
  { id: 'ec3', nameAr: 'دورة 2026 الثانية', nameEn: null, description: null, coverUrl: null, year: 2026, semester: 2, courseType: 'Second', freeOrPaid: true, examsCount: 1, sortOrder: 2 },
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
    { lectureId: null, lectureTitle: 'غير مصنف', lectureNumber: null, questionsCount: 2, groups: [
      { paragraphTag: null, questionsCount: 2 },
    ] },
  ],
};

const DETAIL_EC1 = {
  id: 'ec1', nameAr: 'دورة 2025 الأولى', nameEn: null, description: null, coverUrl: null,
  year: 2025, semester: 1, courseType: 'First', freeOrPaid: true,
  exams: [
    { examId: 'ex1', titleAr: 'اختبار 1', durationMinutes: 45, totalQuestions: 30, sortOrder: 0, inProgress: true, completed: false, attemptCount: 1, bestScore: null },
    { examId: 'ex2', titleAr: 'اختبار 2', durationMinutes: 60, totalQuestions: 40, sortOrder: 1, inProgress: false, completed: true, attemptCount: 2, bestScore: 80 },
  ],
};

function stubGet(opts?: { mySubjects?: unknown[] }) {
  const mySubjects = opts?.mySubjects ?? ENTITLED_SUBJECTS;
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: mySubjects };
    if (url.includes('/practice/categorized/s1')) return { data: TREE_S1 };
    if (url.includes('/exam-courses/subject/s1')) return { data: COURSES_S1 };
    if (url.includes('/exam-courses/ec1')) return { data: DETAIL_EC1 };
    return { data: [] };
  });
}

function renderApp(initialEntry: string) {
  const LocationProbe = () => {
    const location = useLocation();
    return <div data-testid="location-probe" data-path={location.pathname} data-search={location.search} />;
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/exam-courses" element={<><ExamCoursesPage /><LocationProbe /></>} />
          <Route path="/exam-courses/:courseId" element={<><ExamCourseDetailPage /><LocationProbe /></>} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stubGet();
});

describe('W14.4 ExamCoursesPage — دورات سنوات', () => {
  it('defaults the year filter to the LATEST round year and narrows the list', async () => {
    renderApp('/exam-courses');

    // Default subject = first entitled subject; year defaults to 2026 (latest present).
    expect(await screen.findByTestId('exam-course-card-ec2')).toBeTruthy();
    expect(screen.getByTestId('exam-course-card-ec3')).toBeTruthy();
    expect(screen.queryByTestId('exam-course-card-ec1')).toBeNull(); // 2025 — filtered out

    // Year chips render with the latest pressed.
    expect(screen.getByTestId('year-chip-2026').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('year-chip-2025').getAttribute('aria-pressed')).toBe('false');
  });

  it('opens the bundle detail when a course card is clicked', async () => {
    renderApp('/exam-courses');
    fireEvent.click(await screen.findByTestId('exam-course-card-ec2'));

    await waitFor(() => {
      expect(screen.getByTestId('location-probe').getAttribute('data-path')).toBe('/exam-courses/ec2');
    });
  });

  it('renders the locked card for grant-less students (A.1 deep-link guard)', async () => {
    stubGet({ mySubjects: [] });
    renderApp('/exam-courses');

    expect(await screen.findByTestId('exam-courses-locked')).toBeTruthy();
    expect(screen.queryByTestId('subject-filter-row')).toBeNull();
  });
});

describe('W14.4 ExamCoursesPage — دورات مصنفة', () => {
  it('renders the Lecture → ParagraphTag tree and starts a filtered practice run', async () => {
    renderApp('/exam-courses?tab=categorized');

    // First lecture accordion is open by default; its tag groups render.
    expect(await screen.findByText('الفصل الأول')).toBeTruthy();
    // Two "غير مصنف" nodes: the untagged group inside lecture 1 + the lecture-less bucket.
    expect(screen.getAllByText('غير مصنف')).toHaveLength(2);

    // Untagged group inside lecture 1 → navigate with the untagged-tag lens.
    fireEvent.click(screen.getByTestId('start-practice-lec1-untagged'));

    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe.getAttribute('data-path')).toBe('/practice/categorized/s1');
      const search = probe.getAttribute('data-search') ?? '';
      expect(search).toContain('lectureId=lec1');
      expect(search).toContain('untaggedTag=true');
    });
  });

  it('navigates with the exact paragraphTag when a tagged group is chosen', async () => {
    renderApp('/exam-courses?tab=categorized');

    fireEvent.click(await screen.findByTestId('start-practice-lec1-الفصل الأول'));

    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe.getAttribute('data-path')).toBe('/practice/categorized/s1');
      expect(probe.getAttribute('data-search')).toContain('paragraphTag=');
    });
  });
});

describe('W14.4 ExamCourseDetailPage', () => {
  it('lists the bundle exams with attempt state and starts PRACTICE runs', async () => {
    renderApp('/exam-courses/ec1');

    expect(await screen.findByTestId('course-exam-ex1')).toBeTruthy();
    expect(screen.getByTestId('course-exam-ex2')).toBeTruthy();
    expect(screen.getByText('محاولة جارية')).toBeTruthy();
    expect(screen.getByText('مكتملة')).toBeTruthy();

    fireEvent.click(screen.getByTestId('practice-exam-ex1'));
    await waitFor(() => {
      expect(screen.getByTestId('location-probe').getAttribute('data-path')).toBe('/practice/exam/ex1');
    });
  });

  it('starts the real EXAM flow from a bundle row', async () => {
    renderApp('/exam-courses/ec1');

    fireEvent.click(await screen.findByTestId('sit-exam-ex2'));
    await waitFor(() => {
      expect(screen.getByTestId('location-probe').getAttribute('data-path')).toBe('/exams/ex2');
    });
  });
});
