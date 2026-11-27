import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * W4 (admin-ui) — ScopePicker D-18 regression.
 *
 * The old implementation loaded subjects from the FIRST semester only, which
 * made subjects that exist solely in semester 2+ unassignable as an admin
 * scope. The fix collects subjects from EVERY semester of the selected year.
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  fetchSecuritySummary: vi.fn(() => Promise.reject(new Error('security summary not stubbed for this test'))),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { ScopePicker, type ScopeState } from '../components/ScopePicker';

const UNIVERSITY = { id: 'u1', nameAr: 'جامعة حلب' };
const COLLEGE = { id: 'c1', nameAr: 'كلية الطب', universityId: 'u1' };
const YEAR = { id: 'y1', nameAr: 'السنة الأولى', collegeId: 'c1' };
const SEMESTER_1 = { id: 'sem1', nameAr: 'الفصل الأول', academicYearId: 'y1' };
const SEMESTER_2 = { id: 'sem2', nameAr: 'الفصل الثاني', academicYearId: 'y1' };
const SUBJECTS_S1 = [{ id: 'sub-anatomy', nameAr: 'التشريح', semesterId: 'sem1' }];
const SUBJECTS_S2 = [
  { id: 'sub-physio', nameAr: 'الفيسيولوجي', semesterId: 'sem2' },
  { id: 'sub-biochem', nameAr: 'الكيمياء الحيوية', semesterId: 'sem2' },
];

const subjectFetches: string[] = [];

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string) => {
    if (path.startsWith('/api/v1/universities?')) return { items: [UNIVERSITY] };
    if (path.startsWith('/api/v1/universities/u1/colleges')) return [COLLEGE];
    if (path.startsWith('/api/v1/colleges/c1/years')) return [YEAR];
    if (path.startsWith('/api/v1/years/y1/semesters')) return [SEMESTER_1, SEMESTER_2];
    if (path.startsWith('/api/v1/semesters/sem1/subjects')) {
      subjectFetches.push('sem1');
      return SUBJECTS_S1;
    }
    if (path.startsWith('/api/v1/semesters/sem2/subjects')) {
      subjectFetches.push('sem2');
      return SUBJECTS_S2;
    }
    return [];
  });
}

function renderPicker(value: ScopeState = { universityId: 'u1', collegeId: 'c1', yearId: 'y1', subjectId: '' }) {
  return render(
    <ScopePicker token="test-token" isArabic value={value} onChange={vi.fn()} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  subjectFetches.length = 0;
  stubApi();
});

describe('W4 — ScopePicker subject load across ALL semesters (D-18)', () => {
  it('collects subjects from every semester of the year, not only the first', async () => {
    renderPicker();
    const subjectSelect = await screen.findByRole('combobox', { name: 'المادة' });
    await waitFor(() => {
      // Both semesters were queried.
      expect(subjectFetches).toContain('sem1');
      expect(subjectFetches).toContain('sem2');
    });

    const options = Array.from(subjectSelect.querySelectorAll('option')).map((o) => o.textContent ?? '');
    // The semester-2-only subjects are now assignable — this is the regression lock.
    expect(options).toContain('التشريح');
    expect(options).toContain('الفيسيولوجي');
    expect(options).toContain('الكيمياء الحيوية');
  });

  it('keeps the cascade reset behavior: no year selected → no subjects requested', () => {
    renderPicker({ universityId: 'u1', collegeId: 'c1', yearId: '', subjectId: '' });
    expect(subjectFetches.length).toBe(0);
    expect(apiRequestMock).not.toHaveBeenCalledWith('/api/v1/years/y1/semesters', 'test-token');
  });
});
