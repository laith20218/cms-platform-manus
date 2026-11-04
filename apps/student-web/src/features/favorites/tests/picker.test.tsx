import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- shared mocks (hoisted) — same surface as hooks.test.tsx ----
const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    delete: vi.fn(),
  },
}));

vi.mock('@/features/entitlements/services/entitlement-api', () => ({
  entitlementRequestConfig: async () => ({}),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { FavoriteListPicker } from '../components/FavoriteListPicker';
import type { FavoriteListSummary } from '../types';

function makeList(overrides: Partial<FavoriteListSummary>): FavoriteListSummary {
  return {
    id: 'list-1',
    name: 'التشريح — صعبة',
    description: null,
    color: '#e11d48',
    questionsCount: 3,
    containsQuestion: false,
    createdAt: '2026-11-01T10:00:00Z',
    updatedAt: '2026-11-01T10:00:00Z',
    ...overrides,
  } as FavoriteListSummary;
}

function renderPicker(props: Partial<Parameters<typeof FavoriteListPicker>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FavoriteListPicker
        questionId="q-1"
        isFavorite={false}
        onToggleFlatFavorite={vi.fn()}
        flatPending={false}
        {...props}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FavoriteListPicker (W15.0)', () => {
  it('renders the trigger (testid preserved for the QuestionPage contract) and opens the popover', async () => {
    getMock.mockResolvedValue({ data: [makeList({})] });
    renderPicker();

    const trigger = screen.getByTestId('question-favorite-button');
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    // Popover content absent before open.
    expect(screen.queryByTestId('favorite-list-picker')).not.toBeInTheDocument();

    fireEvent.click(trigger);

    // The membership query fired WITH the questionId and the popover rendered the list.
    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith('/favorites/lists', expect.objectContaining({
        params: { questionId: 'q-1' },
      })));
    expect(await screen.findByTestId('favorite-list-picker')).toBeInTheDocument();
    expect(screen.getByTestId('favorite-list-picker-item-list-1')).toBeInTheDocument();
  });

  it('reflects server membership + flat favorite on the checkboxes', async () => {
    getMock.mockResolvedValue({
      data: [
        makeList({ id: 'list-1', containsQuestion: true }),
        makeList({ id: 'list-2', name: 'أخرى', containsQuestion: false }),
      ],
    });
    const onToggleFlat = vi.fn();
    renderPicker({ isFavorite: true, onToggleFlatFavorite: onToggleFlat });

    fireEvent.click(screen.getByTestId('question-favorite-button'));

    expect(await screen.findByTestId('favorite-list-picker-flat-checkbox')).toBeChecked();
    expect(await screen.findByTestId('favorite-list-picker-checkbox-list-1')).toBeChecked();
    expect(screen.getByTestId('favorite-list-picker-checkbox-list-2')).not.toBeChecked();
  });

  it('adds the question to a list on checkbox toggle (POST membership)', async () => {
    getMock.mockResolvedValue({ data: [makeList({ containsQuestion: false })] });
    postMock.mockResolvedValue({ data: { listId: 'list-1', questionId: 'q-1', isNew: true } });
    renderPicker();

    fireEvent.click(screen.getByTestId('question-favorite-button'));
    fireEvent.click(await screen.findByTestId('favorite-list-picker-checkbox-list-1'));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/favorites/lists/list-1/questions/q-1', undefined, expect.anything()));
  });

  it('create-and-add: creates the list then immediately adds the question to it', async () => {
    getMock.mockResolvedValue({ data: [] });
    postMock.mockImplementation((url: string) => {
      if (url === '/favorites/lists') return Promise.resolve({ data: { id: 'list-new', name: 'مراجعة' } });
      if (url === '/favorites/lists/list-new/questions/q-1') return Promise.resolve({ data: { isNew: true } });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    renderPicker();

    fireEvent.click(screen.getByTestId('question-favorite-button'));
    fireEvent.change(await screen.findByTestId('favorite-list-picker-new-name'), {
      target: { value: '  مراجعة  ' },
    });
    fireEvent.click(screen.getByTestId('favorite-list-picker-new-submit'));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/favorites/lists', {
        name: 'مراجعة',
        description: null,
        color: null,
      }));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/favorites/lists/list-new/questions/q-1', undefined, expect.anything()));
  });

  it('toggling the flat checkbox keeps the original QuestionPage semantics (callback only)', async () => {
    getMock.mockResolvedValue({ data: [] });
    const onToggleFlat = vi.fn();
    renderPicker({ isFavorite: false, onToggleFlatFavorite: onToggleFlat });

    fireEvent.click(screen.getByTestId('question-favorite-button'));
    fireEvent.click(await screen.findByTestId('favorite-list-picker-flat-checkbox'));

    expect(onToggleFlat).toHaveBeenCalledTimes(1);
    // The flat toggle must NOT hit the lists endpoints — it is the existing mutation.
    expect(postMock).not.toHaveBeenCalled();
  });
});
