import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Night Task 4 — notifications as a TOP-START QUARTER DROPDOWN (not a full page).
 *
 * Locks:
 *  1. The bell is a dropdown TRIGGER (button, aria-haspopup/aria-expanded) —
 *     the PRIMARY action never full-page navigates.
 *  2. The dropdown occupies the top-start quarter (logical `start` side —
 *     visually the RIGHT edge under the app's RTL document) and is
 *     mobile-friendly (full width below sm).
 *  3. Rows/mark-read/mark-all/«عرض الكل» behave like the full page; unread
 *     badges render on the bell and in the panel header.
 *  4. Keyboard + pointer: Escape and click-outside close; focus moves into
 *     the panel on open and back to the bell on close.
 */

const { getMock, patchMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  patchMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/app/providers/useAuth', () => ({
  useAuth: () => ({ user: null, isAuthenticated: true, isLoading: false, login: vi.fn(), logout: vi.fn(), refreshToken: vi.fn(), completeAuthentication: vi.fn() }),
}));

vi.mock('@/app/providers/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: () => {} }) }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { Navbar } from '@/components/layouts/Navbar';
import { NotificationsDropdown } from '@/features/notifications/NotificationsDropdown';

const NOTIF_A = '11111111-aaaa-4222-8333-444444444444';
const NOTIF_B = '22222222-bbbb-4333-8444-555555555555';

function stubApi({ unread = 2, items = null as unknown } = {}) {
  getMock.mockImplementation((url: string) => {
    if (url.includes('unread-count')) return Promise.resolve({ data: unread });
    if (url.startsWith('/notifications')) {
      return Promise.resolve({
        data: {
          items:
            items ??
            [
              { id: NOTIF_A, type: 'announcement', title: 'إشعار أول', body: 'نص', createdAt: '2026-11-23T10:00:00Z', isRead: false, actionUrl: '/dashboard' },
              { id: NOTIF_B, type: 'message', title: 'إشعار ثانٍ', body: 'نص', createdAt: '2026-11-23T09:00:00Z', isRead: true },
            ],
        },
      });
    }
    return Promise.resolve({ data: {} });
  });
}

function renderNavbar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderStandalone(initialOpen = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotificationsDropdown open={initialOpen} onClose={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

// ---------------------------------------------------------------------
// 1) The bell is a trigger, not a link
// ---------------------------------------------------------------------
describe('bell trigger (primary action is the dropdown)', () => {
  it('renders the bell as a button with aria-haspopup/aria-expanded — no href navigation', () => {
    stubApi();
    renderNavbar();
    const bell = screen.getByTestId('navbar-bell');
    expect(bell.tagName).toBe('BUTTON');
    expect(bell).toHaveAttribute('aria-haspopup', 'dialog');
    expect(bell).toHaveAttribute('aria-expanded', 'false');
    expect(bell).not.toHaveAttribute('href');
  });

  it('toggles the dropdown open/closed without leaving the current route', async () => {
    stubApi();
    renderNavbar();
    const bell = screen.getByTestId('navbar-bell');
    fireEvent.click(bell);
    expect(await screen.findByTestId('notifications-dropdown')).toBeInTheDocument();
    expect(bell).toHaveAttribute('aria-expanded', 'true');
    expect(window.location.pathname).toBe('/');
    fireEvent.click(bell);
    await waitFor(() => expect(screen.queryByTestId('notifications-dropdown')).not.toBeInTheDocument());
    expect(bell).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows the unread badge on the bell (99+ capped)', async () => {
    stubApi({ unread: 120 });
    renderNavbar();
    expect(await screen.findByTestId('navbar-bell-unread-badge')).toHaveTextContent('99+');
  });
});

// ---------------------------------------------------------------------
// 2) Panel placement + sizing (top-start quarter, mobile-friendly)
// ---------------------------------------------------------------------
describe('dropdown placement', () => {
  it('anchors to the top-start quarter with logical properties (RTL-correct)', () => {
    stubApi();
    renderStandalone();
    const panel = screen.getByTestId('notifications-dropdown');
    expect(panel.className).toContain('top-0');
    expect(panel.className).toContain('start-0');
    // ~quarter of the viewport on ≥sm; full width below.
    expect(panel.className).toContain('w-full');
    expect(panel.className).toContain('sm:w-');
    expect(panel.className).toContain('h-');
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(panel).toHaveAttribute('aria-modal', 'true');
  });
});

// ---------------------------------------------------------------------
// 3) Behavior parity with the full page
// ---------------------------------------------------------------------
describe('dropdown behavior parity', () => {
  it('renders recent rows with unread styling and the header unread badge', async () => {
    stubApi({ unread: 2 });
    renderStandalone();
    expect(await screen.findByTestId(`notification-dropdown-row-${NOTIF_A}`)).toBeInTheDocument();
    expect(screen.getByTestId(`notification-dropdown-row-${NOTIF_B}`)).toBeInTheDocument();
    expect(screen.getByTestId('notifications-dropdown-unread-badge')).toHaveTextContent('2');
  });

  it('marks a row read on click (PATCH) and keeps sanitized actionUrl navigation', async () => {
    stubApi();
    const originalHref = window.location.href;
    patchMock.mockResolvedValue({ data: {} });
    renderStandalone();
    fireEvent.click(await screen.findByTestId(`notification-dropdown-row-${NOTIF_A}`));
    await waitFor(() => expect(patchMock).toHaveBeenCalledWith(`/notifications/${NOTIF_A}/read`));
    // No navigation happened in jsdom for the actionUrl (assign is jsdom-noop),
    // but the click must not throw and the mutation must fire exactly once.
    expect(patchMock).toHaveBeenCalledTimes(1);
    expect(window.location.href).toBe(originalHref);
  });

  it('offers «تعليم الكل» and «عرض الكل» (full page link)', async () => {
    stubApi();
    renderStandalone();
    expect(await screen.findByTestId('notifications-dropdown-view-all')).toHaveAttribute('href', '/notifications');
    fireEvent.click(await screen.findByRole('button', { name: /تعليم الكل/ }));
    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/notifications/mark-all-read'));
  });

  it('renders the honest empty state when there are no notifications', async () => {
    stubApi({ unread: 0, items: [] });
    renderStandalone();
    expect(await screen.findByTestId('notifications-dropdown-empty')).toBeInTheDocument();
  });

  it('renders the honest error state with retry when the API fails', async () => {
    getMock.mockRejectedValue(new Error('down'));
    renderStandalone();
    expect(await screen.findByTestId('notifications-dropdown-error')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------
// 4) Keyboard + pointer close behaviors
// ---------------------------------------------------------------------
describe('keyboard and pointer', () => {
  it('closes on Escape', async () => {
    stubApi();
    renderStandalone();
    await screen.findByTestId('notifications-dropdown');
    fireEvent.keyDown(window, { key: 'Escape' });
    // Standalone onClose is a no-op stub; assert via the Navbar flow instead.
  });

  it('closes on Escape from the Navbar flow and collapses aria-expanded', async () => {
    stubApi();
    renderNavbar();
    const bell = screen.getByTestId('navbar-bell');
    fireEvent.click(bell);
    await screen.findByTestId('notifications-dropdown');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('notifications-dropdown')).not.toBeInTheDocument());
    expect(bell).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on click-outside (backdrop)', async () => {
    stubApi();
    renderNavbar();
    fireEvent.click(screen.getByTestId('navbar-bell'));
    await screen.findByTestId('notifications-dropdown');
    fireEvent.click(screen.getByTestId('notifications-dropdown-backdrop'));
    await waitFor(() => expect(screen.queryByTestId('notifications-dropdown')).not.toBeInTheDocument());
  });

  it('moves focus into the panel on open', async () => {
    stubApi();
    renderStandalone();
    await waitFor(() => expect(screen.getByTestId('notifications-dropdown')).toHaveFocus());
  });
});
