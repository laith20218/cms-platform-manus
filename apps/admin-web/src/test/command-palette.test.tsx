import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * PR-2 — command palette accessibility + behavior:
 *  - dialog + combobox + listbox ARIA wiring (aria-activedescendant)
 *  - ArrowDown/ArrowUp/Enter keyboard navigation
 *  - Escape closes and restores focus to the invoker
 *  - query filtering with an honest no-results state
 *  - permission-aware results (super-only items hidden for non-superadmins)
 */

const { apiRequestMock, loginMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  loginMock: vi.fn(),
}));
vi.mock('../lib/api', () => ({
  API_BASE_URL: 'http://e2e.test',
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
  login: (...args: unknown[]) => loginMock(...args),
  refreshAccessToken: vi.fn(async () => null),
  ApiError: class ApiError extends Error { status = 500; },
}));

import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../App';

const SESSION_KEYS = ['cms-admin-user', 'cms-admin-token', 'cms-admin-refresh'];

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="harness-location">{location.pathname + location.search}</span>;
}

function stubApiData() {
  apiRequestMock.mockImplementation(async (path: string) => {
    if (path.startsWith('/api/v1/notifications/unread-count')) return { count: 0 };
    if (path.startsWith('/api/v1/admin/roles')) return [];
    return { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 };
  });
}

function seedSession(role: 'super_admin' | 'admin') {
  sessionStorage.setItem(
    'cms-admin-user',
    JSON.stringify({ id: 'a-1', fullName: 'مدير الاختبار', role, email: 'admin@university.edu' }),
  );
  sessionStorage.setItem('cms-admin-token', 'token-1');
}

function renderAppAt(initialPath = '/') {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
}

async function openPalette() {
  const trigger = await screen.findByTestId('command-palette-trigger');
  trigger.focus(); // fireEvent.click does not focus in jsdom — do it explicitly.
  fireEvent.click(trigger);
  const input = await screen.findByTestId('command-input');
  expect(document.activeElement).toBe(input);
  return { trigger, input };
}

async function awaitLocation(expected: string) {
  await waitFor(() => {
    expect(screen.getByTestId('harness-location')).toHaveTextContent(expected);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubApiData();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  vi.stubGlobal('scrollTo', vi.fn());
  for (const key of SESSION_KEYS) sessionStorage.removeItem(key);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CommandPalette — ARIA structure', () => {
  it('renders as a labelled modal dialog with a combobox controlling a listbox of options', async () => {
    seedSession('super_admin');
    renderAppAt('/');
    await openPalette();

    expect(screen.getByRole('dialog', { name: 'لوحة الأوامر' })).toBeInTheDocument();
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    // All navigable views appear as options (superadmin sees everything).
    expect(screen.getAllByRole('option').length).toBeGreaterThanOrEqual(15);
  });
});

describe('CommandPalette — keyboard navigation', () => {
  it('ArrowDown moves the active option and updates aria-activedescendant', async () => {
    seedSession('super_admin');
    renderAppAt('/');
    const { input } = await openPalette();

    const firstOption = screen.getByTestId('command-option-overview');
    expect(firstOption).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const secondOption = screen.getByTestId('command-option-academic');
    expect(secondOption).toHaveAttribute('aria-selected', 'true');
    expect(input.getAttribute('aria-activedescendant')).toBe(secondOption.id);
    expect(firstOption).toHaveAttribute('aria-selected', 'false');
  });

  it('ArrowUp wraps from the first option to the last', async () => {
    seedSession('super_admin');
    renderAppAt('/');
    const { input } = await openPalette();

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    const lastOption = screen.getByTestId('command-option-content');
    expect(lastOption).toHaveAttribute('aria-selected', 'true');
  });

  it('Enter selects the active option: the palette closes and the view navigates', async () => {
    seedSession('super_admin');
    renderAppAt('/');
    const { input } = await openPalette();

    // overview → academic → questions (third item is the Enter target).
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
    });
    await awaitLocation('/questions');
    await waitFor(() => {
      expect(screen.getByTestId('topbar-breadcrumbs')).toHaveTextContent('بنك الأسئلة');
    });
  });
});

describe('CommandPalette — dismissal and focus', () => {
  it('Escape closes the palette and restores focus to the invoker', async () => {
    seedSession('super_admin');
    renderAppAt('/');
    const { trigger, input } = await openPalette();

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it('Tab is trapped inside the palette (never leaks focus to the page)', async () => {
    seedSession('super_admin');
    renderAppAt('/');
    const { input } = await openPalette();

    fireEvent.keyDown(input, { key: 'Tab' });
    expect(document.activeElement).toBe(input);
  });
});

describe('CommandPalette — filtering', () => {
  it('typing filters results and shows the honest no-results state', async () => {
    seedSession('super_admin');
    renderAppAt('/');
    const { input } = await openPalette();

    fireEvent.change(input, { target: { value: 'بنك' } });
    expect(screen.getByTestId('command-option-questions')).toBeInTheDocument();
    expect(screen.queryByTestId('command-option-exams')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'zzzz-لا-شيء' } });
    expect(await screen.findByText('لا توجد نتائج مطابقة')).toBeInTheDocument();
    expect(screen.queryByTestId('command-option-questions')).not.toBeInTheDocument();
  });
});

describe('CommandPalette — permission-aware results', () => {
  it('super-only views never appear for a non-superadmin operator', async () => {
    seedSession('admin');
    renderAppAt('/');
    await openPalette();

    // Daily + academic + users groups remain visible…
    expect(screen.getByTestId('command-option-questions')).toBeInTheDocument();
    expect(screen.getByTestId('command-option-students')).toBeInTheDocument();
    // …while every super-only view is filtered out of the results.
    for (const key of ['admins', 'roles', 'audit', 'reports', 'settings', 'offline', 'content']) {
      expect(screen.queryByTestId(`command-option-${key}`)).not.toBeInTheDocument();
    }
  });
});
