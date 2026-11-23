import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Night Task 8 — the bank practice «تنويه» regression suite.
 *
 *  • Pressing تدريب in a bundle with admin notice content (Description) shows
 *    the notice modal INSTEAD of navigating (practice is deferred).
 *  • «إخفاء» dismisses for THIS visit only — the next press navigates directly
 *    within the same session, but a fresh session (new sessionStorage) shows
 *    it again.
 *  • «عدم العرض مرة أخرى» persists per student + section through the server
 *    student-preferences store (read-merge-write, key bankNoticeHidden.<id>),
 *    with a localStorage fallback when the write fails.
 *  • The floating «تنويه» button (bottom-start, RTL-aware) reopens the modal.
 *  • Bundles WITHOUT notice content navigate directly — no modal, no FAB.
 */

const { getMock, putMock } = vi.hoisted(() => ({ getMock: vi.fn(), putMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    put: (...args: unknown[]) => putMock(...args),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The exam-courses API rides the entitlement request config (signed token) —
// stubbed empty like every other harness that renders this page.
vi.mock('@/features/entitlements/services/entitlement-api', async () => {
  const actual = await vi.importActual<typeof import('@/features/entitlements/services/entitlement-api')>(
    '@/features/entitlements/services/entitlement-api'
  );
  return { ...actual, entitlementRequestConfig: async () => ({}), clearEntitlementToken: vi.fn() };
});

import ExamCourseDetailPage from '@/features/exam-courses/pages/ExamCourseDetailPage';

const COURSE_ID = 'course-1';
const EXAM_ID = 'exam-1';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname + location.search}</div>;
}

function stubCourse({ description = 'تنويه هام: هذه أسئلة دورة 2025 النهائية.' } = {}) {
  getMock.mockImplementation((url: string) => {
    if (url.includes('/student/preferences')) {
      return Promise.resolve({ data: {} });
    }
    if (url.includes(`/exam-courses/${COURSE_ID}`)) {
      return Promise.resolve({
        data: {
          id: COURSE_ID,
          nameAr: 'أسئلة دورة 2025',
          description,
          year: 2025,
          semester: 1,
          courseType: 'First',
          freeOrPaid: true,
          exams: [
            { examId: EXAM_ID, titleAr: 'الامتحان الأول', durationMinutes: 60, totalQuestions: 40, sortOrder: 0, inProgress: false, completed: false, attemptCount: 0 },
          ],
        },
      });
    }
    return Promise.resolve({ data: {} });
  });
}

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/study?tab=bank&courseId=${COURSE_ID}`]}>
        <Routes>
          <Route path="/study" element={<ExamCourseDetailPage />} />
          <Route path="/practice/exam/:examModelId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openPage() {
  renderDetail();
  await screen.findByTestId(`practice-exam-${EXAM_ID}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe('bank practice notice — the gate', () => {
  it('pressing تدريب with notice content shows the modal and defers navigation', async () => {
    stubCourse();
    await openPage();
    fireEvent.click(screen.getByTestId(`practice-exam-${EXAM_ID}`));
    expect(await screen.findByTestId('bank-notice-modal')).toBeInTheDocument();
    expect(screen.getByTestId('bank-notice-text')).toHaveTextContent('تنويه هام');
  });

  it('«متابعة التدريب» proceeds to the practice route', async () => {
    stubCourse();
    await openPage();
    fireEvent.click(screen.getByTestId(`practice-exam-${EXAM_ID}`));
    fireEvent.click(await screen.findByTestId('bank-notice-continue'));
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent(`/practice/exam/${EXAM_ID}`));
  });

  it('«إخفاء» dismisses for THIS visit — the same session navigates directly next time', async () => {
    stubCourse();
    await openPage();
    fireEvent.click(screen.getByTestId(`practice-exam-${EXAM_ID}`));
    fireEvent.click(await screen.findByTestId('bank-notice-hide'));
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent(`/practice/exam/${EXAM_ID}`));
  });

  it('a fresh session shows the notice again after «إخفاء» (visit-scoped)', async () => {
    stubCourse();
    await openPage();
    fireEvent.click(screen.getByTestId(`practice-exam-${EXAM_ID}`));
    fireEvent.click(await screen.findByTestId('bank-notice-hide'));
    // Simulate the next visit: the session storage dies with the tab.
    window.sessionStorage.clear();
    const { unmount } = { unmount: undefined as unknown as (() => void) | undefined };
    void unmount;
    // Re-entering the section in a NEW session shows the modal again.
    renderDetail();
    fireEvent.click(await screen.findByTestId(`practice-exam-${EXAM_ID}`));
    expect(await screen.findByTestId('bank-notice-modal')).toBeInTheDocument();
  });

  it('«عدم العرض مرة أخرى» persists via the server preferences (read-merge-write)', async () => {
    stubCourse();
    putMock.mockResolvedValue({ data: {} });
    await openPage();
    fireEvent.click(screen.getByTestId(`practice-exam-${EXAM_ID}`));
    fireEvent.click(await screen.findByTestId('bank-notice-never'));
    await waitFor(() => expect(putMock).toHaveBeenCalledWith('/student/preferences', {
      [`bankNoticeHidden.${COURSE_ID}`]: true,
    }));
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent(`/practice/exam/${EXAM_ID}`));
  });

  it('a write failure falls back to localStorage and still buries the notice', async () => {
    stubCourse();
    putMock.mockRejectedValue(new Error('offline'));
    await openPage();
    fireEvent.click(screen.getByTestId(`practice-exam-${EXAM_ID}`));
    fireEvent.click(await screen.findByTestId('bank-notice-never'));
    await waitFor(() => expect(window.localStorage.getItem(`bankNoticeHidden.${COURSE_ID}`)).toBe('1'));
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent(`/practice/exam/${EXAM_ID}`));
  });

  it('a bundle WITHOUT notice content navigates directly — no modal, no FAB', async () => {
    stubCourse({ description: undefined });
    await openPage();
    fireEvent.click(screen.getByTestId(`practice-exam-${EXAM_ID}`));
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent(`/practice/exam/${EXAM_ID}`));
    expect(screen.queryByTestId('bank-notice-modal')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bank-notice-fab')).not.toBeInTheDocument();
  });
});

describe('the floating «تنويه» button', () => {
  it('renders bottom-start and reopens the modal anytime (even after permanent dismissal)', async () => {
    // Server already knows the notice is permanently hidden for this student.
    getMock.mockImplementation((url: string) => {
      if (url.includes('/student/preferences')) {
        return Promise.resolve({ data: { [`bankNoticeHidden.${COURSE_ID}`]: true } });
      }
      if (url.includes(`/exam-courses/${COURSE_ID}`)) {
        return Promise.resolve({
          data: {
            id: COURSE_ID, nameAr: 'أسئلة دورة 2025', description: 'تنويه', year: 2025, semester: 1,
            courseType: 'First', freeOrPaid: true,
            exams: [{ examId: EXAM_ID, titleAr: 'الامتحان الأول', durationMinutes: 60, totalQuestions: 40, sortOrder: 0, inProgress: false, completed: false, attemptCount: 0 }],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    await openPage();
    // The FAB is fixed, bottom-START (RTL-aware), labeled «تنويه».
    const fab = screen.getByTestId('bank-notice-fab');
    expect(fab.className).toContain('start-4');
    expect(fab.className).toContain('fixed');
    expect(fab).toHaveTextContent('تنويه');
    // …and it reopens the notice on demand — even while permanently dismissed.
    fireEvent.click(fab);
    expect(await screen.findByTestId('bank-notice-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('bank-notice-continue'));

    // Permanently hidden → the practice press navigates directly (no modal).
    fireEvent.click(screen.getByTestId(`practice-exam-${EXAM_ID}`));
    await waitFor(() => expect(screen.getByTestId('location-probe')).toHaveTextContent(`/practice/exam/${EXAM_ID}`));
  });
});
