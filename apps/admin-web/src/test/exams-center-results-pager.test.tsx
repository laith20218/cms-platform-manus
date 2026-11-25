import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * W2 (admin-ui) — ExamsCenter attempt-result statuses + list pager.
 *
 * Locks:
 *  1. Result session statuses render through the Arabic glossary
 *     («مكتمل»/«انتهى وقته»/«قيد الأداء»/«ملغى») — the raw enum wire values
 *     (Completed/TimedOut/InProgress/Cancelled) never leak into the DOM (D-23).
 *  2. The exam list renders the shared pager when totalCount spans pages and
 *     fetches the requested page (D-20).
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { ExamsCenter } from '../components/ExamsCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

const EXAM = {
  id: 'e1', subjectId: 's1', lectureId: null, titleAr: 'اختبار التشريح النهائي', slug: 'anatomy-final',
  examType: 'Final', year: 4, attemptsCount: 30, completedCount: 25, averageScore: 71,
  durationMinutes: 90, status: 'Published', createdAt: '2026-01-01T00:00:00Z',
};

const RESULTS = [
  {
    sessionId: 'r1', studentId: 'st1', studentName: 'طالبة أولى', status: 'Completed',
    startedAt: '2026-01-02T09:00:00Z', completedAt: '2026-01-02T10:20:00Z',
    answeredQuestions: 40, correctAnswers: 33, score: 82, passed: true, isFirstAttempt: true,
  },
  {
    sessionId: 'r2', studentId: 'st2', studentName: 'طالب ثانٍ', status: 'TimedOut',
    startedAt: '2026-01-02T09:00:00Z', completedAt: '2026-01-02T10:30:00Z',
    answeredQuestions: 31, correctAnswers: 12, score: 30, passed: false, isFirstAttempt: false,
  },
];

const calls: string[] = [];

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string) => {
    calls.push(path);
    if (path.startsWith('/api/v1/universities?')) return { items: [], page: 1, pageSize: 100, totalCount: 0 };
    if (path.startsWith('/api/v1/universities/u1/colleges')) return [];
    if (path.startsWith('/api/v1/colleges/c1/years')) return [];
    if (path.startsWith('/api/v1/years/y1/semesters')) return [];
    if (path.startsWith('/api/v1/admin/exams?')) return { items: [EXAM], page: 1, pageSize: 100, totalCount: 250 };
    if (path.startsWith(`/api/v1/admin/exams/${EXAM.id}/results`)) {
      return { items: RESULTS, page: 1, pageSize: 100, totalCount: RESULTS.length };
    }
    if (path.startsWith('/api/v1/semesters/s1/subjects')) return [{ id: 's1', nameAr: 'التشريح المرضي' }];
    if (path.startsWith('/api/v1/admin/content/academic/subjects/s1/lectures')) return [];
    return { items: [], page: 1, pageSize: 100, totalCount: 0 };
  });
}

function renderCenter() {
  return render(
    <UiPermissionsProvider value={{ phase: 'idle' }}>
      <MemoryRouter initialEntries={['/exams?univ=u1&college=c1&year=y1&semester=s1&subject=s1']}>
        <Routes>
          <Route path="/exams" element={<ExamsCenter token="test-token" isArabic onError={vi.fn()} onNotice={vi.fn()} />} />
          <Route path="*" element={<div />} />
        </Routes>
      </MemoryRouter>
    </UiPermissionsProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  calls.length = 0;
  stubApi();
});

describe('W2 — ExamsCenter result statuses (Arabic glossary)', () => {
  it('renders Arabic session statuses in the results table; raw enums never leak', async () => {
    renderCenter();
    await screen.findByText('اختبار التشريح النهائي');

    fireEvent.click(document.querySelector('[title="النتائج"]') as HTMLButtonElement);
    await screen.findByText('طالبة أولى');

    expect(screen.getByText('مكتمل')).toBeInTheDocument();
    expect(screen.getByText('انتهى وقته')).toBeInTheDocument();
    for (const raw of ['Completed', 'TimedOut', 'InProgress', 'Cancelled']) {
      expect(document.body.textContent, `raw enum leak: ${raw}`).not.toContain(raw);
    }
  });
});

describe('W2 — ExamsCenter list pager', () => {
  it('renders the shared pager (250 exams → 3 pages) and fetches the requested page', async () => {
    renderCenter();
    await screen.findByText('اختبار التشريح النهائي');

    expect(screen.getByTestId('exams-list-pagination')).toBeInTheDocument();
    expect(screen.getByText('صفحة 1 من 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    await waitFor(() => {
      expect(calls.some((path) => path.includes('/api/v1/admin/exams?') && path.includes('page=2'))).toBe(true);
    });
  });
});
