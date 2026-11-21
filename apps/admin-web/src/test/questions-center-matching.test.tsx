import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * W21.1 — the admin Matching (وصل) editor inside QuestionsCenter.
 *
 * Locks:
 *  1. «وصل» rides the type selector; choosing it renders the 2×2 board
 *     (prompts + targets + a per-prompt target select) INSTEAD of the options editor.
 *  2. A target already claimed by another prompt is disabled in the select —
 *     bijection enforced at input time.
 *  3. Save-time validation: an unpaired prompt or unequal counts block the
 *     POST with the Arabic reason; nothing reaches the network.
 *  4. A valid board reaches POST /api/v1/questions with the exact W20.5 wire
 *     shape: type 'Matching', options [], matching { prompts, targets, pairs }.
 *  5. The edit path hydrates the board from AdminQuestionDetailDto.matching
 *     (texts + pair values) — R1 read/edit.
 *  6. The row duplicate action calls POST /api/v1/admin/questions/{id}/duplicate
 *     (the endpoint the API fixed in W20.5 to carry the وصل payload) — R4 verify.
 */

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));
vi.mock('../lib/api', () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { QuestionsCenter } from '../components/QuestionsCenter';
import { UiPermissionsProvider } from '../hooks/useUiPermissions';

const MATCHING_DETAIL = {
  id: 'qm1', subjectId: 's1', lectureId: null,
  text: 'سؤال وصل عن المسببات', type: 'Matching', difficulty: 'Medium', status: 'Draft',
  tags: [], lectureTitle: null, optionsCount: 0, attemptsCount: 0, correctRate: 0,
  createdAt: '2026-11-20T00:00:00Z', updatedAt: null,
  reference: null, year: null, paragraphTag: null,
  explanation: 'شرح السؤال', correctAnswer: '', options: [],
  matching: {
    prompts: [
      { id: 'p1', text: 'الجرثومة', sortOrder: 0 },
      { id: 'p2', text: 'الفيروس', sortOrder: 1 },
    ],
    targets: [
      { id: 't1', text: 'خلية حية', sortOrder: 0 },
      { id: 't2', text: 'خلية مضيفة', sortOrder: 1 },
    ],
    pairs: [
      { promptId: 'p1', targetId: 't2' },
      { promptId: 'p2', targetId: 't1' },
    ],
  },
};

const MCQ_ROW = {
  id: 'q1', subjectId: 's1', lectureId: null,
  text: 'سؤال اختيار من متعدد', type: 'Mcq', difficulty: 'Easy', status: 'Published',
  tags: [], lectureTitle: null, optionsCount: 4, attemptsCount: 3, correctRate: 66,
  createdAt: '2026-11-19T00:00:00Z', updatedAt: null,
};

function stubApi() {
  apiRequestMock.mockImplementation(async (path: string) => {
    if (path.startsWith('/api/v1/universities')) return { items: [] };
    if (path.startsWith('/api/v1/admin/content/academic/subjects/s1/lectures')) return [];
    if (path.startsWith('/api/v1/admin/questions?')) {
      return { items: [MATCHING_DETAIL, MCQ_ROW], total: 2, page: 1, pageSize: 100, totalPages: 1 };
    }
    if (path === '/api/v1/admin/questions/qm1') return MATCHING_DETAIL;
    return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
  });
}

function renderCenter(onError: (message: string) => void = vi.fn()) {
  return render(
    <UiPermissionsProvider value={{ phase: 'idle' }}>
      <MemoryRouter initialEntries={['/questions?subject=s1']}>
        <Routes>
          <Route path="/questions" element={<QuestionsCenter token="test-token" isArabic onError={onError} onNotice={vi.fn()} />} />
          <Route path="*" element={<div />} />
        </Routes>
      </MemoryRouter>
    </UiPermissionsProvider>,
  );
}

async function openNewQuestionEditor() {
  fireEvent.click(await screen.findByRole('button', { name: 'سؤال جديد' }));
  await screen.findByText('نص السؤال');
}

async function chooseMatchingType() {
  fireEvent.change(screen.getByLabelText('النوع'), { target: { value: 'Matching' } });
  await screen.findByTestId('matching-editor');
}

/** Fills the 2×2 board texts: prompts أ/ب, targets 1/2 (pairing is test-specific). */
function fillBoardTexts() {
  const prompts = screen.getAllByPlaceholderText('نص العنصر');
  fireEvent.change(prompts[0], { target: { value: 'الجرثومة' } });
  fireEvent.change(prompts[1], { target: { value: 'الفيروس' } });
  const targets = screen.getAllByPlaceholderText('نص الإجابة');
  fireEvent.change(targets[0], { target: { value: 'خلية حية' } });
  fireEvent.change(targets[1], { target: { value: 'خلية مضيفة' } });
}

/** Target ids in board order, read from prompt أ's select option values. */
function targetIdsFromSelect(): string[] {
  const select = screen.getByLabelText('الإجابة الصحيحة للعنصر أ') as HTMLSelectElement;
  return Array.from(select.options).filter(option => option.value).map(option => option.value);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  stubApi();
});

describe('W21.1 — Matching (وصل) in the admin question editor', () => {
  it('shows وصل in the type selector; choosing it swaps the options editor for the board', async () => {
    renderCenter();
    await openNewQuestionEditor();

    const typeSelect = screen.getByLabelText('النوع');
    expect(within(typeSelect).getByRole('option', { name: 'وصل' })).toBeInTheDocument();

    await chooseMatchingType();
    // The board replaces the options editor: 2 prompts + 2 targets + the counts badge.
    expect(screen.getAllByPlaceholderText('نص العنصر')).toHaveLength(2);
    expect(screen.getAllByPlaceholderText('نص الإجابة')).toHaveLength(2);
    expect(screen.getByTestId('matching-counts')).toHaveTextContent('2 / 2');
    // Options editor is gone — no A/B/C option rows.
    expect(screen.queryByText('حدد خياراً صحيحاً واحداً على الأقل.')).toBeNull();
  });

  it('disables a target option already claimed by another prompt (bijection at input time)', async () => {
    renderCenter();
    await openNewQuestionEditor();
    await chooseMatchingType();
    const [firstTarget, secondTarget] = targetIdsFromSelect();

    fireEvent.change(screen.getByLabelText('الإجابة الصحيحة للعنصر أ'), { target: { value: firstTarget } });

    const promptBSelect = screen.getByLabelText('الإجابة الصحيحة للعنصر ب');
    const claimedOption = within(promptBSelect).getByRole('option', { name: new RegExp(`1\\. .* — مستخدم لعنصر آخر`) }) as HTMLOptionElement;
    expect(claimedOption.disabled).toBe(true);
    expect(claimedOption.value).toBe(firstTarget);
    const freeOption = within(promptBSelect).getByRole('option', { name: new RegExp(`2\\.`) }) as HTMLOptionElement;
    expect(freeOption.disabled).toBe(false);
    expect(freeOption.value).toBe(secondTarget);
  });

  it('blocks save on an unpaired prompt — Arabic reason, no POST', async () => {
    const onError = vi.fn();
    renderCenter(onError);
    await openNewQuestionEditor();
    await chooseMatchingType();

    fillBoardTexts();
    const targetIds = targetIdsFromSelect();
    // Pair ONLY prompt أ — prompt ب stays unpaired.
    fireEvent.change(screen.getByLabelText('الإجابة الصحيحة للعنصر أ'), { target: { value: targetIds[0] } });
    fireEvent.change(screen.getByLabelText('نص السؤال'), { target: { value: 'صِلْ المسبب بالخلية' } });

    fireEvent.click(screen.getByRole('button', { name: 'حفظ كمسودة' }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining('اربط كل عنصر')));
    const posted = apiRequestMock.mock.calls.filter(([path]) => path === '/api/v1/questions');
    expect(posted).toHaveLength(0);
  });

  it('blocks save on unequal list counts with the live numbers', async () => {
    const onError = vi.fn();
    renderCenter(onError);
    await openNewQuestionEditor();
    await chooseMatchingType();

    // Fill every text first (emptyText would otherwise fire before unequalCounts).
    fillBoardTexts();
    fireEvent.click(screen.getByTestId('matching-add-target'));
    const targets = await screen.findAllByPlaceholderText('نص الإجابة');
    fireEvent.change(targets[2], { target: { value: 'الفطر' } });
    await waitFor(() => expect(screen.getByTestId('matching-counts')).toHaveTextContent('2 / 3'));

    fireEvent.change(screen.getByLabelText('نص السؤال'), { target: { value: 'صِلْ المسبب بالخلية' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ كمسودة' }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining('3')));
    expect(apiRequestMock.mock.calls.some(([path]) => path === '/api/v1/questions')).toBe(false);
  });

  it('POSTs a valid board with the W20.5 wire shape (options [], matching with pairs)', async () => {
    renderCenter();
    await openNewQuestionEditor();
    await chooseMatchingType();
    const targetIds = targetIdsFromSelect();

    fireEvent.change(screen.getByLabelText('نص السؤال'), { target: { value: 'صِلْ المسبب بالخلية' } });
    const prompts = screen.getAllByPlaceholderText('نص العنصر');
    fireEvent.change(prompts[0], { target: { value: '  الجرثومة  ' } });
    fireEvent.change(prompts[1], { target: { value: 'الفيروس' } });
    const targets = screen.getAllByPlaceholderText('نص الإجابة');
    fireEvent.change(targets[0], { target: { value: 'خلية حية' } });
    fireEvent.change(targets[1], { target: { value: 'خلية مضيفة' } });
    fireEvent.change(screen.getByLabelText('الإجابة الصحيحة للعنصر أ'), { target: { value: targetIds[1] } });
    fireEvent.change(screen.getByLabelText('الإجابة الصحيحة للعنصر ب'), { target: { value: targetIds[0] } });

    // Explanation lives on its own tab (D5) — fill it, then save.
    fireEvent.click(screen.getByRole('tab', { name: 'الشرح والمراجع' }));
    fireEvent.change(screen.getByPlaceholderText('اكتب التوضيح العلمي للسؤال وإجابته.'), { target: { value: 'الجرثومة تستضيفها الخلية الحية.' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ كمسودة' }));

    await waitFor(() => {
      expect(apiRequestMock.mock.calls.some(([path]) => path === '/api/v1/questions')).toBe(true);
    });
    const createCall = apiRequestMock.mock.calls.find(([path]) => path === '/api/v1/questions');
    const body = JSON.parse(String(createCall?.[2]?.body));
    expect(body.type).toBe('Matching');
    expect(body.options).toEqual([]);
    expect(body.correctAnswer).toBeNull();
    // Structural lock: the emitted ids are distinct, the texts trimmed, and the
    // pairs cross exactly as paired in the UI (أ → target 2, ب → target 1).
    const emittedPromptIds = body.matching.prompts.map((prompt: { id: string }) => prompt.id);
    expect(new Set(emittedPromptIds).size).toBe(2);
    expect(body.matching.prompts).toEqual([
      { id: emittedPromptIds[0], text: 'الجرثومة', sortOrder: 0 },
      { id: emittedPromptIds[1], text: 'الفيروس', sortOrder: 1 },
    ]);
    expect(body.matching.targets.map((target: { text: string }) => target.text)).toEqual(['خلية حية', 'خلية مضيفة']);
    expect(body.matching.pairs).toEqual([
      { promptId: emittedPromptIds[0], targetId: body.matching.targets[1].id },
      { promptId: emittedPromptIds[1], targetId: body.matching.targets[0].id },
    ]);
    expect(body.matching.targets.map((target: { id: string }) => target.id)).toEqual(targetIds);
  });

  it('hydrates the board when editing an existing وصل question (texts + pair values)', async () => {
    renderCenter();
    const row = (await screen.findByText('سؤال وصل عن المسببات')).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByTitle('تعديل'));

    await screen.findByTestId('matching-editor');
    // Prompts + targets arrive sorted with their texts…
    expect(screen.getByDisplayValue('الجرثومة')).toBeInTheDocument();
    expect(screen.getByDisplayValue('الفيروس')).toBeInTheDocument();
    expect(screen.getByDisplayValue('خلية حية')).toBeInTheDocument();
    expect(screen.getByDisplayValue('خلية مضيفة')).toBeInTheDocument();
    // …and the pair map: أ → t2 (خلية مضيفة), ب → t1 (خلية حية).
    expect((screen.getByLabelText('الإجابة الصحيحة للعنصر أ') as HTMLSelectElement).value).toBe('t2');
    expect((screen.getByLabelText('الإجابة الصحيحة للعنصر ب') as HTMLSelectElement).value).toBe('t1');
  });

  it('sends the وصل payload on UPDATE too (PUT /api/v1/questions/{id})', async () => {
    renderCenter();
    const row = (await screen.findByText('سؤال وصل عن المسببات')).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByTitle('تعديل'));
    await screen.findByTestId('matching-editor');

    // Change one prompt's text, then save — the PUT carries the full matching payload.
    fireEvent.change(screen.getByDisplayValue('الفيروس'), { target: { value: 'الفيروس المُعدْي' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ التعديل' }));

    await waitFor(() => {
      expect(apiRequestMock.mock.calls.some(([path]) => path === '/api/v1/questions/qm1')).toBe(true);
    });
    const updateCall = apiRequestMock.mock.calls.find(([path]) => path === '/api/v1/questions/qm1');
    const body = JSON.parse(String(updateCall?.[2]?.body));
    expect(body.matching.prompts.map((prompt: { text: string }) => prompt.text)).toEqual(['الجرثومة', 'الفيروس المُعدْي']);
    expect(body.matching.pairs).toEqual([
      { promptId: 'p1', targetId: 't2' },
      { promptId: 'p2', targetId: 't1' },
    ]);
    expect(body.options).toEqual([]);
  });

  it('duplicate calls the admin duplicate endpoint for the وصل row (W20.5 API fix)', async () => {
    renderCenter();
    const row = (await screen.findByText('سؤال وصل عن المسببات')).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByTitle('تكرار'));

    await waitFor(() => {
      expect(apiRequestMock.mock.calls.some(
        ([path, , init]) => path === '/api/v1/admin/questions/qm1/duplicate' && (init as RequestInit | undefined)?.method === 'POST',
      )).toBe(true);
    });
  });
});
