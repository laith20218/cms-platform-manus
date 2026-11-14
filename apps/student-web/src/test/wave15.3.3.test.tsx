import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) — same harness pattern as push6.test.tsx ----
const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

vi.mock('@/features/entitlements/services/entitlement-api', async () => {
  const actual = await vi.importActual<typeof import('@/features/entitlements/services/entitlement-api')>(
    '@/features/entitlements/services/entitlement-api'
  );
  return { ...actual, entitlementRequestConfig: async () => ({}) };
});

import SubjectsPage from '@/features/subjects/SubjectsPage';
import { SubjectModalProvider } from '@/features/subjects/SubjectModalContext';
import { SubjectModal } from '@/features/subjects/SubjectModal';

// ---- fixtures ----
// s1: every scope → full card. s2: QuestionsExams only → scope-gated card.
const MY_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', color: '#0ea5e9', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
  { id: 's2', slug: 'باطنة', nameAr: 'الباطنة', color: null, contentScopes: ['QuestionsExams'] },
];

const SEMESTER_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', totalQuestions: 62, totalLectures: 2, totalFiles: 4, contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
  { id: 's9', slug: 'جراحة', nameAr: 'الجراحة', totalQuestions: 5, totalLectures: 1, totalFiles: 0, contentScopes: null },
];

const FULL_CASCADE_PARAMS = 'universityId=u1&collegeId=c1&yearId=y1&semesterId=sem1';

function stubGet(opts?: { mySubjects?: unknown[] }) {
  const mySubjects = opts?.mySubjects ?? MY_SUBJECTS;
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: mySubjects };
    if (url === '/universities' || url.startsWith('/universities?')) {
      return { data: { items: [{ id: 'u1', nameAr: 'جامعة حمص', collegesCount: 1 }] } };
    }
    if (url.endsWith('/colleges')) return { data: [{ id: 'c1', nameAr: 'كلية الطب البشري', yearsCount: 1 }] };
    if (url.endsWith('/years')) return { data: [{ id: 'y1', nameAr: 'السنة الخامسة', semestersCount: 1 }] };
    if (url.endsWith('/semesters')) return { data: [{ id: 'sem1', nameAr: 'الفصل الأول', subjectsCount: 2 }] };
    if (url.endsWith('/subjects')) return { data: SEMESTER_SUBJECTS };
    return { data: [] };
  });
}

/** Renders /subjects the way App.tsx composes it: page + global subject sheet,
 *  both inside SubjectModalProvider (Wave 14.3 PR #1 mounting contract), plus
 *  a location probe for the URL-state assertions. */
function renderSubjects(initialEntry: string) {
  const LocationProbe = () => {
    const location = useLocation();
    return <div data-testid="location-probe" data-path={location.pathname} data-search={location.search} />;
  };
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SubjectModalProvider>
          <Routes>
            <Route path="/subjects" element={<><SubjectsPage /><SubjectModal /><LocationProbe /></>} />
            <Route path="*" element={<div data-testid="unmatched-route" />} />
          </Routes>
        </SubjectModalProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  postMock.mockReset();
  stubGet();
});

// ============ W15.3.3: الهيكل الأكاديمي / موادي tabs ============

describe('W15.3.3 SubjectsPage — الهيكل/موادي tabs', () => {
  it('defaults to the الهيكل الأكاديمي tab (no ?tab param) with the strip visible', async () => {
    renderSubjects(`/subjects?${FULL_CASCADE_PARAMS}`);

    expect(screen.getByTestId('subjects-tab-structure').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('subjects-tab-muwadi').getAttribute('aria-selected')).toBe('false');
    // Structure content renders as before (W15.3.2 layout intact).
    expect(await screen.findByTestId('my-subjects-strip')).toBeInTheDocument();
  });

  it('switching to موادي renders the entitled cards and hides the strip', async () => {
    renderSubjects('/subjects');

    fireEvent.click(screen.getByTestId('subjects-tab-muwadi'));

    expect(await screen.findByTestId('muwadi-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('my-subjects-strip')).not.toBeInTheDocument();
    expect(await screen.findByTestId('muwadi-card-s1')).toBeInTheDocument();
    expect(screen.getByTestId('muwadi-card-s2')).toBeInTheDocument();
  });

  it('honours the ?tab=muwadi deep link', async () => {
    renderSubjects('/subjects?tab=muwadi');

    expect(await screen.findByTestId('muwadi-tab')).toBeInTheDocument();
    expect(screen.getByTestId('subjects-tab-muwadi').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('subjects-tab-structure').getAttribute('aria-selected')).toBe('false');
    expect(screen.queryByTestId('my-subjects-strip')).not.toBeInTheDocument();
  });

  it('opens the scope-gated subject sheet from a موادي card (QuestionsExams-only → content + exams)', async () => {
    renderSubjects('/subjects?tab=muwadi');

    fireEvent.click(await screen.findByTestId('muwadi-card-s2'));

    const sheet = await screen.findByTestId('subject-actions-sheet');
    expect(sheet).toBeInTheDocument();
    expect(sheet).toHaveTextContent('الباطنة');
    expect(screen.getByTestId('subject-action-content')).toBeInTheDocument();
    expect(screen.getByTestId('subject-action-exams')).toBeInTheDocument();
    expect(screen.queryByTestId('subject-action-library')).not.toBeInTheDocument();
    expect(screen.queryByTestId('subject-action-courses')).not.toBeInTheDocument();
  });

  it('switching back to الهيكل removes the tab param and restores the strip', async () => {
    renderSubjects('/subjects?tab=muwadi');

    fireEvent.click(screen.getByTestId('subjects-tab-structure'));

    expect(await screen.findByTestId('my-subjects-strip')).toBeInTheDocument();
    const search = screen.getByTestId('location-probe').getAttribute('data-search') ?? '';
    expect(search).not.toContain('tab=muwadi');
  });

  it('shows the empty state when the student has no entitled subjects', async () => {
    stubGet({ mySubjects: [] });
    renderSubjects('/subjects?tab=muwadi');

    expect(await screen.findByTestId('muwadi-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('muwadi-card-s1')).not.toBeInTheDocument();
  });
});
