import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args), success: vi.fn(), info: vi.fn() },
}));

import { notifySessionExpired, resetSessionExpiredFlagForTests } from '../session-expiry';

/** Wave 12.5.A (Group 3, Q4) — N parallel failures collapse into ONE toast. */
describe('notifySessionExpired (module-level dedup guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSessionExpiredFlagForTests();
  });

  it('toasts exactly once across many calls (the parallel-401 storm)', () => {
    notifySessionExpired();
    notifySessionExpired();
    notifySessionExpired();
    notifySessionExpired();

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith('انتهت الجلسة، يُرجى تسجيل الدخول مجددًا', { duration: 6000 });
  });

  it('does not fire at all until the first failure', () => {
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
