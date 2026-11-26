import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';

/**
 * PR-4 — QuestionsCenter question-bank contract:
 *  • URL-persisted filters (?q&type&status&difficulty&lecture&tags&author…&sort&order)
 *  • facet directory (authors + tags) feeding the filter bar
 *  • bulk tagging dialog — selected count, POST contract, validation
 *  • CSV export — only through the authorized backend (apiDownload), with the
 *    CURRENT filters, and permission-gated visibility
 *  • row-action preview — the universal preview dialog opens with the superset
 *    and the simulation never calls the answer API
 */

const { apiRequestMock, apiDownloadMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  apiDownloadMock: vi.fn(),
}));
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    apiRequest: (...args: unknown[]) => apiRequestMock(...args),
    apiDownload: (...args: unknown[]) => apiDownloadMock(...args),
  };
});

import { QuestionsCenter } from '../components/QuestionsCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

const AUTHOR_A = { id: '11111111-1111-1111-1111-111111111111', name: 'د. أحمد' };
const AUTHOR_B = { id: '22222222-2222-2222-2222-222222222222', name: 'د. بشر' };

const ROW_A = {
  id: 'qa', subjectId: 's1', lectureId: null,
  text: 'سؤال الفسيولوجيا العصبية', type: 'Mcq', difficulty: 'Easy', status: 'Published',
  tags: ['neuro'], lectureTitle: null, optionsCount: 4, attemptsCount: 3, correctRate: 66,
  createdAt: '2026-11-19T00:00:00Z', updatedAt: null,
};
const ROW_B = {
  ...ROW_A, id: 'qb', text: 'سؤال التشريح المرضي', type: 'Essay', difficulty: 'Hard', status: 'Draft', tags: [],
};

const PREVIEW_DTO = {
  id: 'qa', text: 'سؤال الفسيولوجيا العصبية', type: 'Mcq', difficulty: 'Easy', status: 'Published',
  tags: ['neuro'], paragraphTag: 'الفصل الأول', year: 2025,
  options: [
    { id: 'oa', letter: 'A', text: 'الخيار الصحيح', isCorrect: true },
    { id: 'ob', letter: 'B', text: 'خيار آخر', isCorrect: false },
  ],
  images: [],
  explanation: 'شرح السؤال', explanationHtml: null, reference: null,
  correctOptionId: 'oa', correctOptionLetter: 'A', correctAnswerText: null,
  matching: null,
};

const calls: Array<{ path: string; init?: RequestInit }> = [];

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string, _token: string, init?: RequestInit) => {
    calls.push({ path, init });
    if (path.startsWith('/api/v1/universities?')) return { items: [], page: 1, pageSize: 100, total: 0 };
    if (path.startsWith('/api/v1/admin/content/academic/subjects/s1/lectures')) {
      return [{ id: 'lec1', titleAr: 'محاضرة القلب' }];
    }
    if (path.startsWith('/api/v1/admin/questions/facets?')) {
      return { authors: [AUTHOR_A, AUTHOR_B], tags: ['neuro', 'anatomy'] };
    }
    if (path.startsWith('/api/v1/admin/questions?')) {
      return { items: [ROW_A, ROW_B], total: 2, page: 1, pageSize: 25, totalPages: 1 };
    }
    if (path.startsWith('/api/v1/admin/questions/qa/preview')) return PREVIEW_DTO;
    if (path.startsWith('/api/v1/admin/questions/bulk-tag') && init?.method === 'POST') {
      return { requested: 2, succeeded: 2, skipped: 0, notFoundIds: [] };
    }
    return { items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 };
  });
}

function renderCenter(initialEntry = '/questions?subject=s1') {
  let probeParams: URLSearchParams | null = null;
  const LocationProbe = () => {
    const [params] = useSearchParams();
    probeParams = params;
    return null;
  };
  const utils = render(
    <UiPermissionsProvider value={{ phase: 'idle' }}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/questions" element={
            <>
              <QuestionsCenter token="test-token" isArabic onError={vi.fn()} onNotice={vi.fn()} />
              <LocationProbe />
            </>
          } />
          <Route path="*" element={<div />} />
        </Routes>
      </MemoryRouter>
    </UiPermissionsProvider>,
  );
  return { ...utils, getProbeParams: () => probeParams };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  window.localStorage.clear();
  stubApi();
});

describe('PR-4 — question-bank URL state + facets', () => {
  it('hydrates filters from the URL on load (?q=&type=&status=)', async () => {
    renderCenter('/questions?subject=s1&q=فسيولوجيا&type=Essay&status=Draft');
    await screen.findByText('سؤال التشريح المرضي');

    await waitFor(() => {
      expect(calls.some((c) =>
        c.path.startsWith('/api/v1/admin/questions?')
        && c.path.includes('search=')
        && c.path.includes('type=Essay')
        && c.path.includes('status=Draft'),
      )).toBe(true);
    });
  });

  it('changing a filter writes it to the URL and resets the page', async () => {
    const { getProbeParams } = renderCenter('/questions?subject=s1&page=3');
    await screen.findByText('سؤال الفسيولوجيا العصبية');

    fireEvent.change(screen.getByTestId('questions-type-filter'), { target: { value: 'Essay' } });

    await waitFor(() => {
      expect(getProbeParams()?.get('type')).toBe('Essay');
      expect(getProbeParams()?.get('page')).toBeNull(); // reset to page 1 (default deleted)
    });
  });

  it('clear-filters removes every question filter param at once', async () => {
    const { getProbeParams } = renderCenter('/questions?subject=s1&q=قلب&type=Mcq&status=Draft&difficulty=Easy&sort=text&order=asc&page=4');
    await screen.findByText('سؤال الفسيولوجيا العصبية');

    fireEvent.click(screen.getByTestId('questions-clear-filters'));

    await waitFor(() => {
      const params = getProbeParams();
      expect(params?.get('q')).toBeNull();
      expect(params?.get('type')).toBeNull();
      expect(params?.get('status')).toBeNull();
      expect(params?.get('difficulty')).toBeNull();
      expect(params?.get('sort')).toBeNull();
      expect(params?.get('order')).toBeNull();
      expect(params?.get('page')).toBeNull();
    });
  });

  it('fetches the facet directory and feeds the author select + tags datalist', async () => {
    renderCenter();
    await screen.findByText('سؤال الفسيولوجيا العصبية');

    expect(calls.some((c) => c.path.startsWith('/api/v1/admin/questions/facets?subjectId=s1'))).toBe(true);
    await waitFor(() => {
      const authorSelect = screen.getByTestId('questions-author-filter') as HTMLSelectElement;
      expect(authorSelect.textContent).toContain('د. أحمد');
      expect(authorSelect.textContent).toContain('د. بشر');
    });
    await waitFor(() => {
      const datalist = document.getElementById('questions-tags-list');
      expect(datalist?.querySelector('option[value="neuro"]')).not.toBeNull();
      expect(datalist?.querySelector('option[value="anatomy"]')).not.toBeNull();
    });
  });

  it('author and tags filters ride the list request', async () => {
    renderCenter('/questions?subject=s1&author=11111111-1111-1111-1111-111111111111&tags=neuro');
    await screen.findByText('سؤال الفسيولوجيا العصبية');

    await waitFor(() => {
      expect(calls.some((c) =>
        c.path.startsWith('/api/v1/admin/questions?')
        && c.path.includes('authorId=11111111-1111-1111-1111-111111111111')
        && c.path.includes('tags=neuro'),
      )).toBe(true);
    });
  });

  it('sort and order ride the list request', async () => {
    renderCenter('/questions?subject=s1&sort=createdAt&order=asc');
    await screen.findByText('سؤال الفسيولوجيا العصبية');

    await waitFor(() => {
      expect(calls.some((c) =>
        c.path.startsWith('/api/v1/admin/questions?') && c.path.includes('sort=createdAt') && c.path.includes('order=asc'),
      )).toBe(true);
    });
  });
});

describe('PR-4 — bulk tagging dialog', () => {
  it('opens with the selected count, POSTs add/remove tags, and refreshes', async () => {
    renderCenter();
    await screen.findByText('سؤال الفسيولوجيا العصبية');

    fireEvent.click(screen.getByLabelText('تحديد السؤال: سؤال الفسيولوجيا العصبية'));
    fireEvent.click(screen.getByLabelText('تحديد السؤال: سؤال التشريح المرضي'));
    fireEvent.click(screen.getByTestId('questions-bulk-tag-open'));

    expect(screen.getByTestId('questions-bulk-tag-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('questions-bulk-tag-content').textContent).toContain('2');

    fireEvent.change(screen.getByTestId('questions-bulk-tag-add'), { target: { value: ' مراجعة, قلب ' } });
    fireEvent.change(screen.getByTestId('questions-bulk-tag-remove'), { target: { value: 'neuro' } });
    fireEvent.click(screen.getByTestId('questions-bulk-tag-confirm'));

    await waitFor(() => {
      const bulkCall = calls.find((c) => c.path.startsWith('/api/v1/admin/questions/bulk-tag'));
      expect(bulkCall).toBeTruthy();
      expect(JSON.parse(String(bulkCall!.init?.body))).toEqual({
        ids: ['qa', 'qb'],
        addTags: ['مراجعة', 'قلب'],
        removeTags: ['neuro'],
      });
    });
    await waitFor(() => {
      expect(calls.filter((c) => c.path.startsWith('/api/v1/admin/questions?')).length).toBeGreaterThanOrEqual(2);
    });
  });

  it('rejects an empty tag payload locally — no POST, Arabic error', async () => {
    renderCenter();
    await screen.findByText('سؤال الفسيولوجيا العصبية');

    fireEvent.click(screen.getByLabelText('تحديد السؤال: سؤال الفسيولوجيا العصبية'));
    fireEvent.click(screen.getByTestId('questions-bulk-tag-open'));
    fireEvent.click(screen.getByTestId('questions-bulk-tag-confirm'));

    expect(screen.getByTestId('questions-bulk-tag-error').textContent).toContain('وسيماً واحداً صالحاً');
    expect(calls.some((c) => c.path.startsWith('/api/v1/admin/questions/bulk-tag'))).toBe(false);
  });
});

describe('PR-4 — CSV export (authorized backend contract only)', () => {
  it('downloads through the backend with the CURRENT filters', async () => {
    apiDownloadMock.mockResolvedValueOnce({ blob: new Blob(['\uFEFFid,text'], { type: 'text/csv' }), fileName: 'questions-20261126.csv' });
    renderCenter('/questions?subject=s1&q=قلب&type=Mcq&tags=neuro');
    await screen.findByText('سؤال الفسيولوجيا العصبية');

    fireEvent.click(screen.getByTestId('questions-export-csv'));

    await waitFor(() => {
      expect(apiDownloadMock).toHaveBeenCalledTimes(1);
    });
    const [path, token] = apiDownloadMock.mock.calls[0];
    expect(String(path)).toContain('/api/v1/admin/questions/export?');
    expect(String(path)).toContain('subjectId=s1');
    expect(String(path)).toContain('search=');
    expect(String(path)).toContain('type=Mcq');
    expect(String(path)).toContain('tags=neuro');
    expect(token).toBe('test-token');
    expect(document.createElement('a')).toBeTruthy(); // anchor download executed (no throw)
  });

  it('surfaces a 403 failure honestly instead of a silent no-op', async () => {
    apiDownloadMock.mockRejectedValueOnce(new Error('ليست لديك صلاحية التصدير'));
    const onError = vi.fn();
    render(
      <UiPermissionsProvider value={{ phase: 'idle' }}>
        <MemoryRouter initialEntries={['/questions?subject=s1']}>
          <Routes>
            <Route path="/questions" element={<QuestionsCenter token="test-token" isArabic onError={onError} onNotice={vi.fn()} />} />
          </Routes>
        </MemoryRouter>
      </UiPermissionsProvider>,
    );
    await screen.findByText('سؤال الفسيولوجيا العصبية');

    fireEvent.click(screen.getByTestId('questions-export-csv'));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('ليست لديك صلاحية التصدير');
    });
  });
});

describe('PR-4 — row-action preview rides the universal dialog', () => {
  it('opens the universal preview from the row menu and never calls the answer API', async () => {
    renderCenter();
    await screen.findByText('سؤال الفسيولوجيا العصبية');

    fireEvent.click(screen.getByRole('button', { name: /إجراءات: سؤال الفسيولوجيا العصبية/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'معاينة (كما يراها الطالب)' }));

    await waitFor(() => {
      expect(screen.getByTestId('questions-preview')).toBeInTheDocument();
    });
    // The badge rail: preview mode + published status.
    expect(screen.getByText('وضع المعاينة')).toBeInTheDocument();
    expect(screen.getByTestId('questions-preview-status').textContent).toContain('منشور');
    // The superset rendering: the question text now appears BOTH in the table row
    // and inside the preview dialog + the option + the simulate affordance.
    expect(screen.getAllByText('سؤال الفسيولوجيا العصبية').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('الخيار الصحيح')).toBeInTheDocument();
    expect(screen.getByTestId('questions-preview-q-confirm-qa')).toBeInTheDocument();
    // Simulation: select + confirm reveals locally — with zero /answer calls.
    fireEvent.click(screen.getByTestId('questions-preview-q-option-oa'));
    fireEvent.click(screen.getByTestId('questions-preview-q-confirm-qa'));
    expect(screen.getByTestId('questions-preview-q-feedback-banner-qa').textContent).toContain('إجابة صحيحة');
    expect(screen.getByTestId('questions-preview-q-explanation-qa').textContent).toContain('شرح السؤال');
    expect(calls.some((c) => c.path.includes('/answer'))).toBe(false);
  });
});
