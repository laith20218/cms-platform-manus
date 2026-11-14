import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) ----
const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('@/features/entitlements/services/entitlement-api', async () => {
  const actual = await vi.importActual<typeof import('@/features/entitlements/services/entitlement-api')>(
    '@/features/entitlements/services/entitlement-api'
  );
  return { ...actual, entitlementRequestConfig: async () => ({}) };
});

// W15.3.1 — CascadeFilters rendered in ISOLATION with hideSubjectSelect: the
// page-level contract for SubjectsPage adoption (15.3.2): the four academic
// selects render, the 5th (subject) select does not, and the subjects query
// never fires even with a semester selected in `value` — subjectId /
// onSelectSubject / subjectLabel are accepted but unused.
import { CascadeFilters, type CascadeValue } from '@/features/exam-courses/components/CascadeFilters';
import { academicApi } from '@/features/subjects/services/academic-api';

// ---- fixtures (University → College → Year → Semester; subject level N/A) ----
const UNIVERSITIES = { items: [{ id: 'u1', nameAr: 'جامعة حمص', collegesCount: 1 }] };
const COLLEGES_U1 = [{ id: 'c1', nameAr: 'الطب البشري', yearsCount: 1 }];
const YEARS_C1 = [{ id: 'y1', nameAr: 'السنة الثالثة', semestersCount: 1 }];
const SEMESTERS_Y1 = [{ id: 'sem1', nameAr: 'الفصل الأول', subjectsCount: 2 }];

const FULL_CASCADE: CascadeValue = {
  universityId: 'u1',
  collegeId: 'c1',
  yearId: 'y1',
  semesterId: 'sem1',
};

function stubGet() {
  getMock.mockImplementation(async (url: string) => {
    if (url === '/universities') return { data: UNIVERSITIES };
    if (url === '/universities/u1/colleges') return { data: COLLEGES_U1 };
    if (url === '/colleges/c1/years') return { data: YEARS_C1 };
    if (url === '/years/y1/semesters') return { data: SEMESTERS_Y1 };
    return { data: [] };
  });
}

function renderCascade(value: CascadeValue) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CascadeFilters
        value={value}
        onChange={vi.fn()}
        subjectId="s1"
        onSelectSubject={vi.fn()}
        entitledSubjectIds={new Set(['s1'])}
        subjectLabel="الباطنة"
        hideSubjectSelect
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stubGet();
});

describe('W15.3.1 CascadeFilters — hideSubjectSelect', () => {
  it('renders the four academic selects without the subject level and never fetches subjects', async () => {
    const getSubjectsSpy = vi.spyOn(academicApi, 'getSubjects').mockResolvedValue([]);

    renderCascade(FULL_CASCADE);

    // 1. The semester trigger exists — the four-level cascade is intact.
    expect(screen.getByTestId('cascade-select-semester')).toBeTruthy();

    // 2. The 5th (subject) select is not rendered, despite subjectId / subjectLabel props.
    expect(screen.queryByTestId('cascade-select-subject')).toBeNull();

    // 3. academicApi.getSubjects is never called — even with a semester selected
    //    in value, the subjects query stays disabled under hideSubjectSelect.
    //    (Wait for the other cascade levels to resolve first so the assertion
    //    covers a fully-settled query pipeline, not just first paint.)
    await waitFor(() => {
      expect(screen.getByTestId('cascade-select-university').textContent).toContain('جامعة حمص');
    });
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/years/y1/semesters'));
    expect(getSubjectsSpy).not.toHaveBeenCalled();
    expect(getMock).not.toHaveBeenCalledWith('/semesters/sem1/subjects');
  });
});
