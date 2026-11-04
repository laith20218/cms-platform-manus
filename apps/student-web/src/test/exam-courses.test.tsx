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

// W15.1 (A): the storefront catalog lives in the My Studies hub — tests render
// ExamCoursesCatalog at /my-studies exactly like the hub panel does (the internal
// lens is now ?examTab=; the /exam-courses route is a redirect, covered in
// my-studies.test.tsx).
import { ExamCoursesCatalog } from '@/features/exam-courses/components/ExamCoursesCatalog';
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

// W15.0 — cascade fixtures (University → College → Year → Semester → Subject).
const UNIVERSITIES = { items: [{ id: 'u1', nameAr: 'جامعة حمص', collegesCount: 1 }] };
const COLLEGES_U1 = [{ id: 'c1', nameAr: 'الطب البشري', yearsCount: 1 }];
const YEARS_C1 = [{ id: 'y1', nameAr: 'السنة الثالثة', semestersCount: 1 }];
const SEMESTERS_Y1 = [{ id: 'sem1', nameAr: 'الفصل الأول', subjectsCount: 2 }];
const SUBJECTS_SEM1 = [
  { id: 's1', slug: 'باطنة', nameAr: 'الباطنة', totalQuestions: 10, totalLectures: 2, totalFiles: 0 },
  { id: 's9', slug: 'جراحة', nameAr: 'الجراحة', totalQuestions: 5, totalLectures: 1, totalFiles: 0 }, // NOT entitled
];

function stubGet(opts?: { mySubjects?: unknown[] }) {
  const mySubjects = opts?.mySubjects ?? ENTITLED_SUBJECTS;
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: mySubjects };
    if (url.includes('/practice/categorized/s1')) return { data: TREE_S1 };
    if (url.includes('/exam-courses/subject/s1')) return { data: COURSES_S1 };
    if (url.includes('/exam-courses/ec1')) return { data: DETAIL_EC1 };
    if (url === '/universities') return { data: UNIVERSITIES };
    if (url === '/universities/u1/colleges') return { data: COLLEGES_U1 };
    if (url === '/colleges/c1/years') return { data: YEARS_C1 };
    if (url === '/years/y1/semesters') return { data: SEMESTERS_Y1 };
    if (url === '/semesters/sem1/subjects') return { data: SUBJECTS_SEM1 };
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
          <Route path="/my-studies" element={<><ExamCoursesCatalog /><LocationProbe /></>} />
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

describe('W14.4 ExamCourses catalog — دورات سنوات', () => {
  it('defaults the year filter to the LATEST round year and narrows the list', async () => {
    renderApp('/my-studies');

    // Default subject = first entitled subject; year defaults to 2026 (latest present).
    expect(await screen.findByTestId('exam-course-card-ec2')).toBeTruthy();
    expect(screen.getByTestId('exam-course-card-ec3')).toBeTruthy();
    expect(screen.queryByTestId('exam-course-card-ec1')).toBeNull(); // 2025 — filtered out

    // Year chips render with the latest pressed.
    expect(screen.getByTestId('year-chip-2026').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('year-chip-2025').getAttribute('aria-pressed')).toBe('false');
  });

  it('opens the bundle detail when a course card is clicked', async () => {
    renderApp('/my-studies');
    fireEvent.click(await screen.findByTestId('exam-course-card-ec2'));

    await waitFor(() => {
      expect(screen.getByTestId('location-probe').getAttribute('data-path')).toBe('/exam-courses/ec2');
    });
  });

  it('renders the locked card for grant-less students (A.1 deep-link guard)', async () => {
    stubGet({ mySubjects: [] });
    renderApp('/my-studies');

    expect(await screen.findByTestId('exam-courses-locked')).toBeTruthy();
    expect(screen.queryByTestId('subject-filter-row')).toBeNull();
  });
});

describe('W14.4 ExamCourses catalog — دورات مصنفة', () => {
  it('renders the Lecture → ParagraphTag tree and starts a filtered practice run', async () => {
    renderApp('/my-studies?examTab=categorized');

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
    renderApp('/my-studies?examTab=categorized');

    fireEvent.click(await screen.findByTestId('start-practice-lec1-الفصل الأول'));

    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe.getAttribute('data-path')).toBe('/practice/categorized/s1');
      expect(probe.getAttribute('data-search')).toContain('paragraphTag=');
    });
  });
});

describe('W15.0 ExamCourses catalog — cascading filters', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('deep-link: renders the cascade from URL params and fetches each child level', async () => {
    renderApp('/my-studies?universityId=u1&collegeId=c1&yearId=y1&semesterId=sem1&subjectId=s1');

    // The university select displays the deep-linked university name.
    expect(await screen.findByTestId('cascade-select-university')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('cascade-select-university').textContent).toContain('جامعة حمص');
    });

    // Child-level queries fired with the deep-linked ids.
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/universities/u1/colleges'));
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/colleges/c1/years'));
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/years/y1/semesters'));
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/semesters/sem1/subjects'));
  });

  it('persists the last filter to localStorage and restores it on a fresh mount', async () => {
    // First visit: deep link carries the cascade; the catalog persists it.
    const first = renderApp('/my-studies?universityId=u1&subjectId=s1');
    await screen.findByTestId('cascade-select-university');
    await waitFor(() => {
      expect(window.localStorage.getItem('cms-exam-courses-filters-v1')).toContain('"universityId":"u1"');
      expect(window.localStorage.getItem('cms-exam-courses-filters-v1')).toContain('"subjectId":"s1"');
    });
    first.unmount();

    // Fresh mount WITHOUT URL params: the persisted state seeds the URL (replace),
    // and the child-level query fires again.
    renderApp('/my-studies');
    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe.getAttribute('data-search')).toContain('universityId=u1');
      expect(probe.getAttribute('data-search')).toContain('subjectId=s1');
    });
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/universities/u1/colleges'));
  });

  it('locks non-entitled subjects in the cascade subject level (A.1 ruling)', async () => {
    renderApp('/my-studies?universityId=u1&collegeId=c1&yearId=y1&semesterId=sem1&subjectId=s1');

    // Subject select enabled (semester chosen) and shows the selected entitled subject.
    const subjectSelect = await screen.findByTestId('cascade-select-subject');
    await waitFor(() => expect(subjectSelect.textContent).toContain('الباطنة'));
    expect(subjectSelect.hasAttribute('disabled')).toBe(false);

    // Opening the subject list: s9 (الجراحة — not entitled) renders disabled + locked.
    fireEvent.click(subjectSelect);
    const locked = await screen.findByTestId('cascade-select-subject-s9');
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    expect(locked.querySelector('svg')).toBeTruthy(); // Lock icon
  });

  it('changing the university level via the select writes the deep-linkable URL', async () => {
    renderApp('/my-studies');

    const trigger = await screen.findByTestId('cascade-select-university');
    fireEvent.click(trigger);
    const option = await screen.findByTestId('cascade-select-university-u1');
    // Radix Select items activate on pointerup; click is the cross-version fallback.
    fireEvent.pointerUp(option);
    fireEvent.click(option);

    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe.getAttribute('data-search')).toContain('universityId=u1');
    });
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/universities/u1/colleges'));
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
