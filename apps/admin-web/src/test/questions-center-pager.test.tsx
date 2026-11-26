import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';

/**
 * W2 (admin-ui) + PR-4 — QuestionsCenter shared pager. PR-4 moved the pager to
 * REAL pages (pageSize 25 — the historic fixed 100-row fetch is gone) and the
 * page number now lives in the URL (?page=) so refresh/deep links restore it.
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { QuestionsCenter } from '../components/QuestionsCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

const ROW = {
  id: 'q1', subjectId: 's1', lectureId: null,
  text: 'سؤال عن الفسيولوجيا العصبية', type: 'Mcq', difficulty: 'Easy', status: 'Published',
  tags: [], lectureTitle: null, optionsCount: 4, attemptsCount: 3, correctRate: 66,
  createdAt: '2026-11-19T00:00:00Z', updatedAt: null,
};

const calls: string[] = [];

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string) => {
    calls.push(path);
    if (path.startsWith('/api/v1/universities')) return { items: [] };
    if (path.startsWith('/api/v1/admin/content/academic/subjects/s1/lectures')) return [];
    if (path.startsWith('/api/v1/admin/questions?')) {
      return { items: [ROW], total: 205, page: 1, pageSize: 25, totalPages: 9 };
    }
    return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
  });
}

function renderCenter() {
  return render(
    <UiPermissionsProvider value={{ phase: 'idle' }}>
      <MemoryRouter initialEntries={['/questions?subject=s1']}>
        <Routes>
          <Route path="/questions" element={<QuestionsCenter token="test-token" isArabic onError={vi.fn()} onNotice={vi.fn()} />} />
          <Route path="*" element={<div />} />
        </Routes>
      </MemoryRouter>
    </UiPermissionsProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  stubApi();
});

describe('W2 + PR-4 — QuestionsCenter list pager', () => {
  it('renders the shared pager (205 questions → 9 pages of 25) and fetches the requested page', async () => {
    renderCenter();
    await screen.findByText('سؤال عن الفسيولوجيا العصبية');

    expect(screen.getByTestId('questions-list-pagination')).toBeInTheDocument();
    expect(screen.getByText('صفحة 1 من 9')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'السابق' })).toBeDisabled();
    // PR-4 — the request uses real page sizes now.
    expect(calls.some((path) => path.includes('/api/v1/admin/questions?') && path.includes('pageSize=25'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    await waitFor(() => {
      expect(calls.some((path) => path.includes('/api/v1/admin/questions?') && path.includes('page=2'))).toBe(true);
    });
  });

  it('persists the requested page in the URL (?page=2) so refresh restores it', async () => {
    let probeSearch = '';
    const LocationProbe = () => {
      const [params] = useSearchParams();
      probeSearch = params.toString();
      return null;
    };
    render(
      <UiPermissionsProvider value={{ phase: 'idle' }}>
        <MemoryRouter initialEntries={['/questions?subject=s1']}>
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
    await screen.findByText('سؤال عن الفسيولوجيا العصبية');

    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    await waitFor(() => {
      expect(calls.some((path) => path.includes('/api/v1/admin/questions?') && path.includes('page=2'))).toBe(true);
    });
    // The router search params carry the page after the click (refresh restores it).
    await waitFor(() => {
      expect(probeSearch).toContain('page=2');
    });
  });
});
