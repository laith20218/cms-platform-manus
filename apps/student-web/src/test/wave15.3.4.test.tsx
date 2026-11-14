import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
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
// s1: every scope, entitled. s2: QuestionsExams only, entitled.
// s9: no scopes, NOT entitled (absent from my-subjects).
const MY_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', color: '#0ea5e9', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
  { id: 's2', slug: 'باطنة', nameAr: 'الباطنة', color: null, contentScopes: ['QuestionsExams'] },
];

const SEMESTER_SUBJECTS = [
  { id: 's1', slug: 'تشريح-مرضي', nameAr: 'تشريح مرضي', totalQuestions: 62, totalLectures: 2, totalFiles: 4, contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
  { id: 's2', slug: 'باطنة', nameAr: 'الباطنة', totalQuestions: 12, totalLectures: 1, totalFiles: 0, contentScopes: ['QuestionsExams'] },
  { id: 's9', slug: 'جراحة', nameAr: 'الجراحة', totalQuestions: 5, totalLectures: 1, totalFiles: 0, contentScopes: null },
];

const FULL_CASCADE_PARAMS = 'universityId=u1&collegeId=c1&yearId=y1&semesterId=sem1';

function stubGet() {
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: MY_SUBJECTS };
    if (url === '/universities' || url.startsWith('/universities?')) {
      return { data: { items: [{ id: 'u1', nameAr: 'جامعة حمص', collegesCount: 1 }] } };
    }
    if (url.endsWith('/colleges')) return { data: [{ id: 'c1', nameAr: 'كلية الطب البشري', yearsCount: 1 }] };
    if (url.endsWith('/years')) return { data: [{ id: 'y1', nameAr: 'السنة الخامسة', semestersCount: 1 }] };
    if (url.endsWith('/semesters')) return { data: [{ id: 'sem1', nameAr: 'الفصل الأول', subjectsCount: 3 }] };
    if (url.endsWith('/subjects')) return { data: SEMESTER_SUBJECTS };
    return { data: [] };
  });
}

/** Renders /subjects the way App.tsx composes it: page + global subject sheet,
 *  both inside SubjectModalProvider (Wave 14.3 PR #1 mounting contract). */
function renderSubjects() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/subjects?${FULL_CASCADE_PARAMS}`]}>
        <SubjectModalProvider>
          <Routes>
            <Route path="/subjects" element={<><SubjectsPage /><SubjectModal /></>} />
          </Routes>
        </SubjectModalProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** The subject-card whose title text is `nameAr` (cards are scoped by name —
 *  the strip chips share names but live outside any subject-card). */
function findCardByName(name: string): HTMLElement {
  const card = screen.getAllByTestId('subject-card').find((c) => within(c).queryByText(name));
  if (!card) throw new Error(`subject-card for "${name}" not found`);
  return card;
}

beforeEach(() => {
  vi.clearAllMocks();
  postMock.mockReset();
  stubGet();
});

// ============ W15.3.4: SubjectCard «فتح» consolidation ============

describe('W15.3.4 SubjectCard — فتح button', () => {
  it('entitled card shows فتح button that opens scope-gated modal (all scopes)', async () => {
    renderSubjects();

    const s1Card = await screen.findAllByTestId('subject-card').then(() => findCardByName('تشريح مرضي'));
    const action = within(s1Card).getByTestId('subject-card-action');
    expect(action.textContent).toContain('فتح');

    fireEvent.click(action);

    const sheet = await screen.findByTestId('subject-actions-sheet');
    expect(sheet).toBeInTheDocument();
    expect(sheet).toHaveTextContent('تشريح مرضي');
    // s1 holds every scope → the sheet lists all four actions.
    expect(within(sheet).getByTestId('subject-action-content')).toBeInTheDocument();
    expect(within(sheet).getByTestId('subject-action-exams')).toBeInTheDocument();
    expect(within(sheet).getByTestId('subject-action-library')).toBeInTheDocument();
    expect(within(sheet).getByTestId('subject-action-courses')).toBeInTheDocument();
  });

  it('فتح on QuestionsExams-only card shows only 2 actions', async () => {
    renderSubjects();

    const s2Card = await screen.findAllByTestId('subject-card').then(() => findCardByName('الباطنة'));
    fireEvent.click(within(s2Card).getByTestId('subject-card-action'));

    const sheet = await screen.findByTestId('subject-actions-sheet');
    expect(sheet).toBeInTheDocument();
    expect(sheet).toHaveTextContent('الباطنة');
    expect(within(sheet).getByTestId('subject-action-content')).toBeInTheDocument();
    expect(within(sheet).getByTestId('subject-action-exams')).toBeInTheDocument();
    expect(within(sheet).queryByTestId('subject-action-library')).not.toBeInTheDocument();
    expect(within(sheet).queryByTestId('subject-action-courses')).not.toBeInTheDocument();
  });

  it('unentitled card has NO فتح button', async () => {
    renderSubjects();

    const s9Card = await screen.findAllByTestId('subject-card').then(() => findCardByName('الجراحة'));
    expect(within(s9Card).queryByTestId('subject-card-action')).not.toBeInTheDocument();
    expect(within(s9Card).getByTestId('subject-card-locked-badge')).toBeInTheDocument();
    // Primary click on s9 still opens the activation modal (covered by push6).
  });
});
