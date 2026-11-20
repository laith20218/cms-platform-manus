import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wave 19.5 — residual consistency sweep (D-38).
 *
 * Locks:
 *  1. (D-38) Per-row pending revoke: while ONE row's revoke is in flight, only
 *     THAT row's button disables — the other rows stay actionable (the shared
 *     mutation used to freeze every row at once).
 *  2. (D-38) The «تسجيل الخروج من بقية الأجهزة» confirm takes focus when it
 *     appears — the destructive action, not the toggle that opened it.
 */

const profileMocks = vi.hoisted(() => ({
  getSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
}));

vi.mock('@/features/profile/services/profile-api', () => ({
  profileApi: {
    getSessions: profileMocks.getSessions,
    revokeSession: profileMocks.revokeSession,
    revokeOtherSessions: profileMocks.revokeOtherSessions,
  },
}));

import { SessionsSection } from '@/features/profile/SessionsSection';

const CURRENT = { id: 'cur', deviceType: 'desktop', browser: 'Chrome', os: 'Windows', current: true, isActive: true, lastActivityAt: new Date().toISOString(), ipAddress: '1.1.1.1' };
const OTHER_A = { id: 'a', deviceType: 'mobile', browser: 'Safari', os: 'iOS', current: false, isActive: true, lastActivityAt: new Date().toISOString(), ipAddress: '2.2.2.2' };
const OTHER_B = { id: 'b', deviceType: 'desktop', browser: 'Firefox', os: 'Linux', current: false, isActive: true, lastActivityAt: new Date().toISOString(), ipAddress: '3.3.3.3' };

function renderSessions() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
      <SessionsSection />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  profileMocks.getSessions.mockResolvedValue([CURRENT, OTHER_A, OTHER_B]);
});

describe('W19.5 (D-38) — per-row pending revoke', () => {
  it('disables only the revoking row; other rows stay actionable', async () => {
    let resolveRevoke: (value: unknown) => void = () => {};
    profileMocks.revokeSession.mockImplementation(
      () => new Promise((resolve) => { resolveRevoke = resolve; })
    );

    renderSessions();

    const buttons = await screen.findAllByTestId('session-revoke');
    expect(buttons.length).toBe(2); // two other-device rows; the current device has none

    // Fire row A's revoke and leave it pending.
    fireEvent.click(buttons[0]);
    await waitFor(() => expect(buttons[0]).toBeDisabled());

    // Row B stays actionable — the pending state is per-row now.
    expect(buttons[1]).toBeEnabled();

    // Settle the promise (cleanup; success path toasts + invalidates).
    resolveRevoke({ ok: true });
    await waitFor(() => expect(buttons[0]).toBeEnabled());
  });
});

describe('W19.5 (D-38) — confirm dialog focus', () => {
  it('moves focus to the destructive confirm button when the confirm opens', async () => {
    renderSessions();

    fireEvent.click(await screen.findByTestId('revoke-others-toggle'));

    const confirm = await screen.findByTestId('revoke-others-confirm-button');
    expect(confirm).toBeInTheDocument();
    // The confirm takes focus — a keyboard user lands on the action.
    await waitFor(() => expect(document.activeElement).toBe(confirm));
  });
});
