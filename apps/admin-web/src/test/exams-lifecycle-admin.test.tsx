import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * PR-5 — exam lifecycle completion (duplicate / restore / pre-flight composition
 * validation).
 * Locks:
 *  1. Duplicate appears on every row, opens the confirm dialog with the
 *     sessions-are-never-copied consequence text, and fires POST
 *     /admin/exams/{id}/duplicate only on confirm.
 *  2. Restore appears only for Archived rows and fires POST /{id}/restore.
 *  3. The editor's pre-flight check fetches GET /{id}/composition-validation and
 *     renders the collected per-question issues (missing/invalid question
 *     warnings) BEFORE the publish attempt — no throw, no blank panel.
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  fetchSecuritySummary: vi.fn(() => Promise.reject(new Error('security summary not stubbed for this test'))),
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
const EXAM_ARCHIVED = { ...EXAM_PUBLISHED, id: 'e2', titleAr: 'اختبار مؤرشف', status: 'Archived' };
const EXAM_DRAFT = { ...EXAM_PUBLISHED, id: 'e3', titleAr: 'اختبار مسودة', status: 'Draft' };

const EXAM_DETAIL = {
  exam: {
    id: 'e3', subjectId: 's1', lectureId: null,
    titleAr: 'اختبار مسودة', titleEn: null, slug: 'draft-exam', description: null,
    examType: 'Final', year: 4, durationMinutes: 60, passingScore: 60, sortOrder: 0,
    availableFrom: null, availableUntil: null, maxAttempts: null,
    shuffleQuestions: true, shuffleOptions: true, showResultsImmediately: true,
    allowReview: true, showCorrectAnswers: true, showExplanations: true,
    status: 'Draft',
  },
  questions: [
    { questionId: 'q1', sortOrder: 0, text: 'ما هي أصغر وحدة في الجسم؟', type: 'Mcq', difficulty: 'Easy', lectureName: null, tags: [] },
    { questionId: 'q2', sortOrder: 1, text: 'سؤال غير منشور', type: 'Mcq', difficulty: 'Easy', lectureName: null, tags: [] },
  ],
};

const COMPOSITION_VALIDATION = {
  examId: 'e3', isValid: false, totalQuestions: 2, validQuestions: 1, invalidQuestions: 1,
  issues: [
    { questionId: 'q2', questionText: 'سؤال غير منشور', sortOrder: 1, issueCode: 'QUESTION_NOT_AVAILABLE', issueMessageAr: 'يمكن استخدام الأسئلة المنشورة وغير المحذوفة فقط' },
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
    if (path.startsWith('/api/v1/admin/exams?')) return { items: [EXAM_PUBLISHED, EXAM_ARCHIVED, EXAM_DRAFT], page: 1, pageSize: 100, totalCount: 3 };
    if (path.startsWith('/api/v1/admin/exams/e1/duplicate') && init?.method === 'POST') return EXAM_DETAIL;
    if (path.startsWith('/api/v1/admin/exams/e2/restore') && init?.method === 'POST') return undefined;
    if (path.startsWith('/api/v1/admin/exams/e3/composition-validation')) return COMPOSITION_VALIDATION;
    if (path.startsWith('/api/v1/admin/exams/e3')) return EXAM_DETAIL;
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

describe('PR-5 — exam duplicate', () => {
  it('shows duplicate on every row, gates it behind the confirm and posts only on confirm', async () => {
    renderCenter();
    await screen.findByText('اختبار التشريح النهائي');

    fireEvent.click(screen.getByRole('button', { name: 'إجراءات اختبار التشريح النهائي' }));
    expect(await screen.findByRole('menuitem', { name: /نسخ كمسودة جديدة/ })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);

    fireEvent.click(screen.getByRole('button', { name: 'إجراءات اختبار مؤرشف' }));
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    expect(screen.getByRole('menuitem', { name: /نسخ كمسودة جديدة/ })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);

    // Confirm gate: consequence text + no request before confirm.
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات اختبار التشريح النهائي' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /نسخ كمسودة جديدة/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/دون الجلسات والنتائج القائمة/)).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes('/duplicate'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'إنشاء النسخة' }));
    await waitFor(() => expect(calls.some((c) => c.path.includes('/api/v1/admin/exams/e1/duplicate') && c.init?.method === 'POST')).toBe(true));
  });

  it('cancel in the duplicate confirm never posts', async () => {
    renderCenter();
    await screen.findByText('اختبار التشريح النهائي');
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات اختبار التشريح النهائي' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /نسخ كمسودة جديدة/ }));
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(calls.some((c) => c.path.includes('/duplicate'))).toBe(false);
  });
});

describe('PR-5 — exam restore from archive', () => {
  it('shows restore only for Archived rows and posts only after confirm', async () => {
    renderCenter();
    await screen.findByText('اختبار التشريح النهائي');

    // Published row: no restore.
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات اختبار التشريح النهائي' }));
    expect(await screen.findByRole('menuitem', { name: /نسخ كمسودة جديدة/ })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /استعادة من الأرشفة/ })).toBeNull();
    fireEvent.pointerDown(document.body);

    // Archived row: restore with the confirm consequence text.
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات اختبار مؤرشف' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /استعادة من الأرشفة/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/إعادة النشر خطوة منفصلة/)).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes('/restore'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'استعادة' }));
    await waitFor(() => expect(calls.some((c) => c.path.includes('/api/v1/admin/exams/e2/restore') && c.init?.method === 'POST')).toBe(true));
  });
});

describe('PR-5 — pre-flight composition validation (editor warnings)', () => {
  it('fetches the report on demand and renders the collected per-question issues', async () => {
    renderCenter();
    await screen.findByText('اختبار مسودة');

    // Open the editor for the draft exam (GET /{id} → editor with form.id set).
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات اختبار مسودة' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'تعديل' }));
    // The editor's question-builder section renders (the check button lives there).
    await waitFor(() => expect(screen.getByText('أسئلة مختارة')).toBeInTheDocument());

    // The check button appears only for a saved exam (form.id set).
    const checkButton = await screen.findByRole('button', { name: /فحص الأسئلة قبل النشر/ });
    expect(calls.some((c) => c.path.includes('/composition-validation'))).toBe(false);

    fireEvent.click(checkButton);
    await waitFor(() => expect(calls.some((c) => c.path.includes('/api/v1/admin/exams/e3/composition-validation'))).toBe(true));

    // The collected issue renders with the byte-identical server message — a
    // warning BEFORE publish fails, never a thrown blank.
    expect(await screen.findByTestId('exam-composition-validation')).toBeInTheDocument();
    expect(screen.getByText(/1 من 2 أسئلة غير صالحة للنشر/)).toBeInTheDocument();
    expect(screen.getByTestId('exam-composition-issue')).toBeInTheDocument();
    expect(screen.getByText('يمكن استخدام الأسئلة المنشورة وغير المحذوفة فقط')).toBeInTheDocument();
  });

  it('renders the valid summary when the composition passes', async () => {
    apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
      calls.push({ path, init });
      if (path.startsWith('/api/v1/universities?')) return { items: [], page: 1, pageSize: 100, totalCount: 0 };
      if (path.startsWith('/api/v1/universities/u1/colleges')) return [];
      if (path.startsWith('/api/v1/colleges/c1/years')) return [];
      if (path.startsWith('/api/v1/years/y1/semesters')) return [];
      if (path.startsWith('/api/v1/admin/exams?')) return { items: [EXAM_DRAFT], page: 1, pageSize: 100, totalCount: 1 };
      if (path.startsWith('/api/v1/admin/exams/e3/composition-validation'))
        return { examId: 'e3', isValid: true, totalQuestions: 2, validQuestions: 2, invalidQuestions: 0, issues: [] };
      if (path.startsWith('/api/v1/admin/exams/e3')) return EXAM_DETAIL;
      if (path.startsWith('/api/v1/semesters/s1/subjects')) return [{ id: 's1', nameAr: 'التشريح المرضي' }];
      if (path.startsWith('/api/v1/admin/content/academic/subjects/s1/lectures')) return [];
      return { items: [], page: 1, pageSize: 100, totalCount: 0 };
    });
    renderCenter();
    await screen.findByText('اختبار مسودة');
    fireEvent.click(screen.getByRole('button', { name: 'إجراءات اختبار مسودة' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'تعديل' }));

    fireEvent.click(await screen.findByRole('button', { name: /فحص الأسئلة قبل النشر/ }));
    expect(await screen.findByText(/التكوين سليم: 2 من 2 سؤالاً صالحاً للنشر/)).toBeInTheDocument();
    expect(screen.queryByTestId('exam-composition-issue')).toBeNull();
  });
});
