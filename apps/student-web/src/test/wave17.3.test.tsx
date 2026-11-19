import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 17.3 — subjects activation UX: locked subjects stay visible AND
 * actionable; one coherent activation flow; explicit labels on the dashboard.
 *
 * Locks:
 *  1. A locked SubjectCard renders a dedicated «تفعيل كود» CTA that opens the
 *     SAME inline ActivationCodeModal (no dead locked card).
 *  2. The activation modal carries the Owner-mandated «الذهاب لتفعيل كود»
 *     escape to /activate-code alongside the inline (primary) code field.
 *  3. A successful redeem lands on the SUBJECT page (scope-aware), not an
 *     assumptions-based exams deep link.
 *  4. The dashboard «موادي» section is explicitly labeled «موادي المفعّلة»
 *     with a discovery row to /subjects (locked subjects browse there).
 */

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    put: vi.fn(),
  },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SubjectCard } from '@/features/subjects/SubjectCard';
import { ActivationCodeModal } from '@/features/subjects/ActivationCodeModal';
import { MySubjectsSection } from '@/features/dashboard/MySubjectsSection';
import { SubjectModalProvider } from '@/features/subjects/SubjectModalProvider';

const LOCKED_SUBJECT = {
  id: 's9',
  slug: 'جراحة',
  nameAr: 'الجراحة',
  totalQuestions: 5,
  totalLectures: 1,
  totalFiles: 0,
  contentScopes: ['QuestionsExams'],
};

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-probe" data-path={location.pathname} data-search={location.search} />;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('W17.3 — locked subject card is actionable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders a «تفعيل كود» CTA that opens the inline activation modal', () => {
    const onLocked = vi.fn();
    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SubjectModalProvider>
            <SubjectCard subject={LOCKED_SUBJECT as never} index={0} entitled={false} onLocked={onLocked} />
          </SubjectModalProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const cta = screen.getByTestId('subject-card-activate');
    expect(cta).toHaveTextContent('تفعيل كود');
    // The entitled «فتح» action never renders on a locked card.
    expect(screen.queryByTestId('subject-card-action')).toBeNull();
    fireEvent.click(cta);
    expect(onLocked).toHaveBeenCalledWith({ id: 's9', nameAr: 'الجراحة' });
  });
});

describe('W17.3 — activation modal: escape + scope-aware landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockImplementation(async () => ({ data: [] }));
  });

  it('offers «الذهاب لتفعيل كود» to the full activation page', () => {
    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ActivationCodeModal subject={{ id: 's9', nameAr: 'الجراحة' }} onClose={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const goto = screen.getByTestId('activation-modal-goto-page');
    expect(goto).toHaveAttribute('href', '/activate-code');
    expect(goto).toHaveTextContent('الذهاب لتفعيل كود');
    // The inline field stays present (the primary, fastest flow).
    expect(screen.getByTestId('activation-code-input')).toBeInTheDocument();
  });

  it('lands on the subject page after a successful redeem (not /exams)', async () => {
    postMock.mockResolvedValue({ data: { ok: true } });
    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/subjects']}>
          <Routes>
            <Route path="/subjects" element={<ActivationCodeModal subject={{ id: 's9', nameAr: 'الجراحة' }} onClose={() => {}} />} />
            <Route path="/subjects/:subjectSlug" element={<LocationProbe />} />
            <Route path="/exams" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.change(screen.getByTestId('activation-code-input'), { target: { value: 'ABCD1234EFGH5678' } });
    fireEvent.click(screen.getByTestId('activation-modal-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('location-probe').getAttribute('data-path')).toBe('/subjects/s9');
    }, { timeout: 2500 });
  });
});

describe('W17.3 — dashboard «موادي المفعّلة» explicit labels + discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderSection(mySubjects: unknown[]) {
    getMock.mockImplementation(async (url: string) => {
      if (url.includes('/subjects/my-subjects')) return { data: mySubjects };
      return { data: [] };
    });
    const client = makeClient();
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SubjectModalProvider>
            <MySubjectsSection bySubject={[]} />
          </SubjectModalProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it('titles the section «موادي المفعّلة» and routes discovery to /subjects', async () => {
    renderSection([{ id: 's1', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['QuestionsExams'] }]);

    expect(await screen.findByRole('heading', { name: 'موادي المفعّلة' })).toBeInTheDocument();
    const discover = await screen.findByTestId('my-subjects-discover');
    expect(discover.textContent).toContain('تبحث عن مواد أخرى؟');
    expect(discover.querySelector('a')).toHaveAttribute('href', '/subjects');
  });

  it('empty state offers BOTH browse and activate (no dead end)', async () => {
    renderSection([]);

    expect(await screen.findByText('لم تفعّل أي مادة بعد')).toBeInTheDocument();
    expect(screen.getByTestId('my-subjects-browse')).toHaveAttribute('href', '/subjects');
    expect(screen.getByRole('link', { name: 'تفعيل كود' })).toHaveAttribute('href', '/activate-code');
  });
});
