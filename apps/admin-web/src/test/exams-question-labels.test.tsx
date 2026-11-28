import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * W22.1 — question-type & difficulty labels in ExamsCenter (recon R-01/R-02/R-06).
 *
 * Locks:
 *  1. The shared lib/questionLabels map covers every QuestionType member and
 *     Easy/Medium/Hard in BOTH locales, and unknown values render the explicit
 *     «نوع غير معروف»/«غير محدد» fallback — never the raw enum.
 *  2. The exam question picker (candidate rows) renders the Arabic labels
 *     «وصل»/«اختيار من متعدد»/«تحريري» and «صعب»/«سهل»/«متوسط» — the raw
 *     wire values (Mcq/Matching/Essay/Easy/Medium/Hard) never leak into the DOM.
 *  3. The attached-question rows (the selected column) carry the same Arabic
 *     type + difficulty meta line (the picker and the rows can never drift).
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  fetchSecuritySummary: vi.fn(() => Promise.reject(new Error('security summary not stubbed for this test'))),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { ExamsCenter } from '../components/ExamsCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';
import { questionDifficultyLabel, questionTypeLabel } from '../lib/questionLabels';

// One candidate per locked surface: Matching/Hard, Mcq/Easy, Essay/Medium.
const CANDIDATES = [
  { id: 'c-matching', text: 'سؤال عن المسببات المرضية', type: 'Matching', difficulty: 'Hard', lectureId: 'lec1', lectureName: 'محاضرة المناعة', tags: [] },
  { id: 'c-mcq', text: 'سؤال عن الخلية الحية', type: 'Mcq', difficulty: 'Easy', lectureId: null, lectureName: null, tags: [] },
  { id: 'c-essay', text: 'سؤال عن آلية الالتهاب', type: 'Essay', difficulty: 'Medium', lectureId: null, lectureName: null, tags: [] },
];

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string) => {
    if (path.startsWith('/api/v1/universities?')) return { items: [], page: 1, pageSize: 100, totalCount: 0 };
    if (path.startsWith('/api/v1/universities/u1/colleges')) return [];
    if (path.startsWith('/api/v1/colleges/c1/years')) return [];
    if (path.startsWith('/api/v1/years/y1/semesters')) return [];
    if (path.startsWith('/api/v1/semesters/s1/subjects')) return [{ id: 's1', nameAr: 'التشريح المرضي', nameEn: 'Pathology' }];
    if (path.startsWith('/api/v1/admin/content/academic/subjects/s1/lectures')) return [{ id: 'lec1', titleAr: 'محاضرة المناعة' }];
    if (path.startsWith('/api/v1/admin/exams?')) return { items: [], page: 1, pageSize: 100, totalCount: 0 };
    if (path.startsWith('/api/v1/admin/exams/question-candidates?')) {
      return { items: CANDIDATES, page: 1, pageSize: 100, totalCount: CANDIDATES.length };
    }
    return { items: [], page: 1, pageSize: 20, totalCount: 0 };
  });
}

function renderCenter() {
  // The shared academic URL context carries the whole chain → subjectId=s1 is
  // set on mount (the W14.3 D4 hydration path), so the editor can open directly.
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
  stubApi();
});

describe('W22.1 — lib/questionLabels shared map', () => {
  it('maps every question type in both locales', () => {
    expect(questionTypeLabel('Mcq', true)).toBe('اختيار من متعدد');
    expect(questionTypeLabel('TrueFalse', true)).toBe('صح أو خطأ');
    expect(questionTypeLabel('MultipleSelect', true)).toBe('اختيارات متعددة');
    expect(questionTypeLabel('Essay', true)).toBe('تحريري');
    expect(questionTypeLabel('Matching', true)).toBe('وصل');
    expect(questionTypeLabel('Mcq', false)).toBe('MCQ');
    expect(questionTypeLabel('TrueFalse', false)).toBe('True / False');
    expect(questionTypeLabel('MultipleSelect', false)).toBe('Multiple select');
    expect(questionTypeLabel('Essay', false)).toBe('Essay');
    expect(questionTypeLabel('Matching', false)).toBe('Matching');
  });

  it('maps Easy/Medium/Hard in both locales', () => {
    expect(questionDifficultyLabel('Easy', true)).toBe('سهل');
    expect(questionDifficultyLabel('Medium', true)).toBe('متوسط');
    expect(questionDifficultyLabel('Hard', true)).toBe('صعب');
    expect(questionDifficultyLabel('Easy', false)).toBe('Easy');
    expect(questionDifficultyLabel('Medium', false)).toBe('Medium');
    expect(questionDifficultyLabel('Hard', false)).toBe('Hard');
  });

  it('renders the explicit fallback for unknown values — never the raw enum', () => {
    expect(questionTypeLabel('SomethingNew', true)).toBe('نوع غير معروف');
    expect(questionTypeLabel('SomethingNew', false)).toBe('Unknown type');
    expect(questionDifficultyLabel('Weird', true)).toBe('غير محدد');
    expect(questionDifficultyLabel('Weird', false)).toBe('Unspecified');
  });
});

describe('W22.1 — ExamsCenter question picker & attached rows (Arabic)', () => {
  it('renders Arabic type + difficulty on candidate rows; raw enums never leak into the DOM', async () => {
    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: 'اختبار جديد' }));

    // The picker debounced fetch lands; each candidate row carries its meta line.
    const matchingRow = (await screen.findByText('سؤال عن المسببات المرضية')).closest('button') as HTMLElement;
    expect(matchingRow).toHaveTextContent('وصل');
    expect(matchingRow).toHaveTextContent('صعب');
    expect(matchingRow).not.toHaveTextContent('Matching');
    expect(matchingRow).not.toHaveTextContent('Hard');

    const mcqRow = screen.getByText('سؤال عن الخلية الحية').closest('button') as HTMLElement;
    expect(mcqRow).toHaveTextContent('اختيار من متعدد');
    expect(mcqRow).toHaveTextContent('سهل');
    expect(mcqRow).not.toHaveTextContent('Mcq');
    expect(mcqRow).not.toHaveTextContent('Easy');
    // Subject-wide fallback rides the null lecture.
    expect(within(mcqRow).getByText('اختيار من متعدد · سهل · على مستوى المادة')).toBeInTheDocument();

    const essayRow = screen.getByText('سؤال عن آلية الالتهاب').closest('button') as HTMLElement;
    expect(essayRow).toHaveTextContent('تحريري');
    expect(essayRow).toHaveTextContent('متوسط');
    expect(essayRow).not.toHaveTextContent('Essay');

    // Global lock: no raw wire value anywhere in the rendered surface.
    for (const raw of ['Mcq', 'TrueFalse', 'MultipleSelect', 'Essay', 'Matching', 'Easy', 'Medium', 'Hard']) {
      expect(document.body.textContent, `raw enum leak: ${raw}`).not.toContain(raw);
    }
  });

  it('carries the same Arabic type + difficulty meta line onto the attached-question rows', async () => {
    renderCenter();
    fireEvent.click(await screen.findByRole('button', { name: 'اختبار جديد' }));

    const matchingRow = (await screen.findByText('سؤال عن المسببات المرضية')).closest('button') as HTMLElement;
    fireEvent.click(matchingRow);

    // The selected column renders the SAME question text — assert on the article row.
    const attached = (await screen.findAllByText('سؤال عن المسببات المرضية'))
      .map(node => node.closest('article'))
      .find(article => article !== null) as HTMLElement;
    expect(attached).not.toBeNull();
    expect(attached).toHaveTextContent('وصل');
    expect(attached).toHaveTextContent('صعب');
    expect(attached).toHaveTextContent('محاضرة المناعة');
    expect(attached).not.toHaveTextContent('Matching');
    expect(attached).not.toHaveTextContent('Hard');
  });
});
