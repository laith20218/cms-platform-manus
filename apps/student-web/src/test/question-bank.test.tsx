import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) ----
const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

vi.mock('@/features/entitlements/services/entitlement-api', () => ({
  entitlementRequestConfig: async () => ({}),
}));

// W16.2b: the real hub mount — the bank panel renders QuestionBankTab (the
// training builder rides its header; the storefront lenses stay the catalog's).
import { StudyPage } from '@/features/study/pages/StudyPage';

// ---- fixtures ----
const ENTITLED_SUBJECTS = [
  { id: 's1', slug: 'باطنة', nameAr: 'الباطنة', contentScopes: ['QuestionsExams', 'LecturesText', 'VideoAudio'] },
];

const TREE_S1 = {
  subjectId: 's1',
  subjectName: 'الباطنة',
  totalQuestions: 7,
  uncategorizedCount: 2,
  anchorExamModelId: 'ex1',
  lectures: [
    {
      lectureId: 'lec1', lectureTitle: 'محاضرة القلب', lectureNumber: 1, questionsCount: 5, groups: [
        { paragraphTag: 'الفصل الأول', questionsCount: 3 },
        { paragraphTag: null, questionsCount: 2 },
      ],
    },
    { lectureId: null, lectureTitle: 'غير مصنف', lectureNumber: null, questionsCount: 2, groups: [{ paragraphTag: null, questionsCount: 2 }] },
  ],
};

const RANDOM_DRAW = [
  {
    id: 'q1', text: 'سؤال عشوائي 1', type: 'Mcq', difficulty: 'Medium', tags: [],
    options: [{ id: 'o1', letter: 'A', text: 'خيار 1', imageUrl: null }], images: [],
  },
  {
    id: 'q2', text: 'سؤال عشوائي 2', type: 'Mcq', difficulty: 'Medium', tags: [],
    options: [{ id: 'o2', letter: 'A', text: 'خيار 2', imageUrl: null }], images: [],
  },
];

function stubGet(opts?: { mySubjects?: unknown[]; tree?: unknown; random?: unknown[]; randomError?: unknown; courses?: unknown[] }) {
  const mySubjects = opts?.mySubjects ?? ENTITLED_SUBJECTS;
  getMock.mockImplementation(async (url: string) => {
    if (url.includes('/subjects/my-subjects')) return { data: mySubjects };
    if (url.includes('/practice/categorized/s1')) return { data: opts?.tree ?? TREE_S1 };
    if (url.startsWith('/questions/random')) {
      if (opts?.randomError) throw opts.randomError;
      return { data: opts?.random ?? [] };
    }
    if (url.includes('/exam-courses/subject/s1')) return { data: opts?.courses ?? [] };
    return { data: [] };
  });
}

function renderApp(initialEntry: string) {
  const LocationProbe = () => {
    const location = useLocation();
    return <div data-testid="location-probe" data-path={location.pathname} data-search={location.search} />;
  };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/study" element={<><StudyPage /><LocationProbe /></>} />
          {/* The training builder navigates here; the probe (not the player) catches it. */}
          <Route path="/practice/categorized/:subjectId" element={<LocationProbe />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  stubGet();
  postMock.mockReset();
});

// ================= W16.2b: the Question Bank tab =================

describe('QuestionBankTab — W16.2b', () => {
  it('renders the bank tab: own cascade + training builder entry + the storefront lenses', async () => {
    renderApp('/study?tab=bank');

    // The tab mounts with its bank header (training button) and the cascade the
    // tab itself owns — no duplicated catalog cascade (hideCascade).
    expect(await screen.findByTestId('question-bank-tab')).toBeTruthy();
    expect(screen.getByTestId('bank-build-training')).toBeTruthy();
    expect(screen.getByTestId('cascade-filters')).toBeTruthy();
    expect(screen.getByTestId('bank-build-training').textContent).toContain('بناء اختبار تدريبي');

    // The embedded storefront keeps its own two lenses (years + categorized).
    expect(await screen.findByTestId('exam-courses-tab-years')).toBeTruthy();
    expect(screen.getByTestId('exam-courses-tab-categorized')).toBeTruthy();
  });

  it('deep-linked inactive subject shows the activation gate and disables the builder', async () => {
    renderApp('/study?tab=bank&subjectId=s9');

    // The gate: activation message + shared activate-code CTA.
    expect(await screen.findByTestId('bank-activation-gate')).toBeTruthy();
    expect(screen.getByText('هذه المادة غير مفعلة')).toBeTruthy();
    // W17.0 — the gate hint names the lenses in questions terminology.
    expect(screen.getByText(/قم بتفعيلها للوصول إلى بنك الأسئلة — أسئلة السنوات/)).toBeTruthy();
    expect(screen.getByTestId('activate-code-cta').getAttribute('href')).toBe('/activate-code');

    // The storefront lenses do NOT mount for an inactive subject…
    expect(screen.queryByTestId('exam-courses-tab-years')).toBeNull();
    // …and the training builder is disabled (no entitled bank to draw from).
    const build = screen.getByTestId('bank-build-training') as HTMLButtonElement;
    expect(build.disabled).toBe(true);

    // The cascade stays browsable — the pick itself stays possible (W16.2b).
    expect(screen.getByTestId('cascade-filters')).toBeTruthy();
  });

  it('opens the builder, draws random questions, and starts the exact-id session', async () => {
    stubGet({ random: RANDOM_DRAW });
    renderApp('/study?tab=bank&subjectId=s1');

    // Active subject → the builder is enabled and opens the modal.
    const build = await screen.findByTestId('bank-build-training') as HTMLButtonElement;
    expect(build.disabled).toBe(false);
    fireEvent.click(build);
    expect(await screen.findByTestId('training-builder-modal')).toBeTruthy();

    // The lecture list renders from the categorized tree (real lectures only).
    expect(await screen.findByTestId('training-lectures-list')).toBeTruthy();
    expect(screen.getByTestId('training-lecture-lec1')).toBeTruthy();
    // The optional paragraph-tag chip row renders the tree's tags.
    expect(screen.getByTestId('training-tag-all')).toBeTruthy();
    expect(screen.getByTestId('training-tag-الفصل الأول')).toBeTruthy();

    // N = 5 (quick chip), lecture lec1 checked, tag «الفصل الأول» selected.
    fireEvent.click(screen.getByTestId('training-count-chip-5'));
    fireEvent.click(screen.getByTestId('training-lecture-lec1'));
    fireEvent.click(screen.getByTestId('training-tag-الفصل الأول'));

    fireEvent.click(screen.getByTestId('training-submit'));

    // The draw: GET /questions/random with the selected narrowings (explicit
    // repeated-key serialization — lectureIds=lec1, paragraphTags=«الفصل الأول»;
    // the entitlement config rides as the second call argument).
    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/questions\/random\?subjectId=s1&count=5&lectureIds=lec1&paragraphTags=/),
        expect.anything()
      );
    });

    // The session start: navigate to the player with the EXACT-ID lens (C3) —
    // the drawn ids ride the URL so the player pins the session to them.
    await waitFor(() => {
      const probe = screen.getByTestId('location-probe');
      expect(probe.getAttribute('data-path')).toBe('/practice/categorized/s1');
      expect(probe.getAttribute('data-search')).toBe('?questionIds=q1,q2');
    });
  });

  it('surfaces the empty-draw error without navigating', async () => {
    stubGet({ random: [] });
    renderApp('/study?tab=bank&subjectId=s1');

    fireEvent.click(await screen.findByTestId('bank-build-training'));
    await screen.findByTestId('training-builder-modal');
    fireEvent.click(screen.getByTestId('training-submit'));

    expect(await screen.findByTestId('training-error')).toBeTruthy();
    expect(screen.getByTestId('training-error').textContent).toContain('لا توجد أسئلة مطابقة');
    // Still on the bank tab — no session navigation happened.
    expect(screen.getByTestId('location-probe').getAttribute('data-path')).toBe('/study');
  });

  it('surfaces the entitlement denial inside the modal', async () => {
    stubGet({
      randomError: Object.assign(new Error('entitlement-denied'), {
        isAxiosError: true,
        response: { status: 403, data: { detail: 'الاشتراك لا يغطي محتوى هذه المادة' } },
      }),
    });
    renderApp('/study?tab=bank&subjectId=s1');

    fireEvent.click(await screen.findByTestId('bank-build-training'));
    await screen.findByTestId('training-builder-modal');
    fireEvent.click(screen.getByTestId('training-submit'));

    expect(await screen.findByTestId('training-error')).toBeTruthy();
    expect(screen.getByTestId('training-error').textContent).toContain('اشتراكك لا يغطي بنك أسئلة هذه المادة');
  });

  it('grant-less students see the storefront locked card — no cascade, no builder entry', async () => {
    stubGet({ mySubjects: [] });
    renderApp('/study?tab=bank');

    expect(await screen.findByTestId('exam-courses-locked')).toBeTruthy();
    expect(screen.queryByTestId('cascade-filters')).toBeNull();
    expect(screen.queryByTestId('question-bank-tab')).toBeNull();
  });
});
