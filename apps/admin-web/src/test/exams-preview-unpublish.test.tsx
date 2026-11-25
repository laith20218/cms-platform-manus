import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * W-coverage (row 18) — exam unpublish + student-view preview.
 * Locks:
 *  1. Unpublish appears only for Published rows, opens the confirm dialog with
 *     the sessions-keep-snapshots consequence text, and fires POST
 *     /admin/exams/{id}/unpublish only on confirm.
 *  2. Preview fetches GET /admin/exams/{id}/preview and renders the student
 *     view: ordered questions + options, with NO correctness indicators.
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { ExamsCenter } from '../components/ExamsCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

const EXAM_PUBLISHED = {
  id: 'e1', subjectId: 's1', lectureId: null, titleAr: 'اختبار التشريح النهائي', slug: 'anatomy-final',
  examType: 'Final', year: 4, attemptsCount: 30, completedCount: 25, averageScore: 71,
  durationMinutes: 90, status: 'Published', createdAt: '2026-01-01T00:00:00Z',
};

const EXAM_DRAFT = { ...EXAM_PUBLISHED, id: 'e2', titleAr: 'اختبار مسودة', status: 'Draft' };

const PREVIEW = {
  id: 'e1', titleAr: 'اختبار التشريح النهائي', durationMinutes: 90, totalQuestions: 2, status: 'Published',
  questions: [
    {
      questionId: 'q1', order: 1, text: 'ما هي أصغر وحدة في الجسم؟', type: 'MCQ', difficulty: 'Easy',
      options: [
        { id: 'o1', letter: 'A', text: 'الخلية' },
        { id: 'o2', letter: 'B', text: 'النسيج' },
        { id: 'o3', letter: 'C', text: 'العضو' },
        { id: 'o4', letter: 'D', text: 'الجهاز' },
      ],
      images: [],
    },
    {
      questionId: 'q2', order: 2, text: 'أي مما يلي ليس من مكونات الدم؟', type: 'MCQ', difficulty: 'Medium',
      options: [
        { id: 'o5', letter: 'A', text: 'البلازما' },
        { id: 'o6', letter: 'B', text: 'الصفائح' },
        { id: 'o7', letter: 'C', text: 'الخلايا العصبية' },
        { id: 'o8', letter: 'D', text: 'كريات حمراء' },
      ],
      images: [],
    },
  ],
};

const calls: Array<{ path: string; init?: RequestInit }> = [];

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path.startsWith('/api/v1/universities?')) return { items: [], page: 1, pageSize: 100, totalCount: 0 };
    if (path.startsWith('/api/v1/universities/u1/colleges')) return [];
    if (path.startsWith('/api/v1/colleges/c1/years')) return [];
    if (path.startsWith('/api/v1/years/y1/semesters')) return [];
    if (path.startsWith('/api/v1/admin/exams?')) return { items: [EXAM_PUBLISHED, EXAM_DRAFT], page: 1, pageSize: 100, totalCount: 2 };
    if (path.startsWith('/api/v1/admin/exams/e1/preview')) return PREVIEW;
    if (path.startsWith('/api/v1/admin/exams/e1/unpublish') && init?.method === 'POST') return undefined;
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

describe('W-coverage — exam unpublish (row 18)', () => {
  it('shows unpublish only for Published exams and posts only after confirm', async () => {
    renderCenter();
    await screen.findByText('اختبار التشريح النهائي');

    // Published row has the unpublish action; the draft row does not.
    expect(document.querySelector('[data-testid="exam-unpublish-e1"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="exam-unpublish-e2"]')).toBeNull();

    fireEvent.click(document.querySelector('[data-testid="exam-unpublish-e1"]') as HTMLButtonElement);
    // Confirm gate: consequence text present, no request fired yet.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/الجلسات القائمة تحتفظ بلقطتها الحالية/)).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes('/unpublish'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'إلغاء النشر' }));
    await waitFor(() => expect(calls.some((c) => c.path.includes('/api/v1/admin/exams/e1/unpublish') && c.init?.method === 'POST')).toBe(true));
  });

  it('cancel in the unpublish confirm never posts', async () => {
    renderCenter();
    await screen.findByText('اختبار التشريح النهائي');
    fireEvent.click(document.querySelector('[data-testid="exam-unpublish-e1"]') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.some((c) => c.path.includes('/unpublish'))).toBe(false);
  });
});

describe('W-coverage — exam student-view preview (row 18)', () => {
  it('fetches the preview and renders ordered questions + options with no correctness flags', async () => {
    renderCenter();
    await screen.findByText('اختبار التشريح النهائي');

    fireEvent.click(document.querySelector('[data-testid="exam-preview-e1"]') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByTestId('exam-preview-dialog')).toBeInTheDocument());

    expect(calls.some((c) => c.path.includes('/api/v1/admin/exams/e1/preview'))).toBe(true);
    // Student view content: both questions, options, the student-view note.
    expect(screen.getByText('ما هي أصغر وحدة في الجسم؟')).toBeInTheDocument();
    expect(screen.getByText('أي مما يلي ليس من مكونات الدم؟')).toBeInTheDocument();
    expect(screen.getByText('الخلية')).toBeInTheDocument();
    expect(screen.getByText('الخلايا العصبية')).toBeInTheDocument();
    expect(screen.getByText(/دون أي مؤشر للإجابات الصحيحة/)).toBeInTheDocument();
    // No correctness markers anywhere in the preview dialog.
    const dialogText = screen.getByTestId('exam-preview-dialog').textContent ?? '';
    expect(dialogText).not.toContain('correct');
    expect(dialogText).not.toContain('الإجابة الصحيحة');

    fireEvent.click(screen.getByTestId('exam-preview-close'));
    await waitFor(() => expect(screen.queryByTestId('exam-preview-dialog')).not.toBeInTheDocument());
  });

  it('surfaces a preview failure honestly (no blank modal)', async () => {
    apiRequestMock.mockImplementation(async (path: string) => {
      calls.push({ path });
      if (path.startsWith('/api/v1/universities?')) return { items: [], page: 1, pageSize: 100, totalCount: 0 };
      if (path.startsWith('/api/v1/universities/u1/colleges')) return [];
      if (path.startsWith('/api/v1/colleges/c1/years')) return [];
      if (path.startsWith('/api/v1/years/y1/semesters')) return [];
      if (path.startsWith('/api/v1/admin/exams?')) return { items: [EXAM_PUBLISHED], page: 1, pageSize: 100, totalCount: 1 };
      if (path.startsWith('/api/v1/admin/exams/e1/preview')) throw new Error('ليست لديك صلاحية المعاينة');
      if (path.startsWith('/api/v1/semesters/s1/subjects')) return [{ id: 's1', nameAr: 'التشريح المرضي' }];
      if (path.startsWith('/api/v1/admin/content/academic/subjects/s1/lectures')) return [];
      return { items: [], page: 1, pageSize: 100, totalCount: 0 };
    });
    renderCenter();
    await screen.findByText('اختبار التشريح النهائي');
    fireEvent.click(document.querySelector('[data-testid="exam-preview-e1"]') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText('ليست لديك صلاحية المعاينة')).toBeInTheDocument());
  });
});
