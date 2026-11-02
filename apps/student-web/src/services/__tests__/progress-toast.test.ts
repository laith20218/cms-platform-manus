import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args), success: vi.fn(), info: vi.fn() },
}));

import { notifyProgressSaveFailure, resetProgressToastFlagForTests } from '../progress-toast';

/** Wave 12.5.A (Group 5, Q3) — progress saves fire every ~10s; only the FIRST
 *  failure in a session toasts (the loop keeps retrying silently). */
describe('notifyProgressSaveFailure (once-per-session toast)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProgressToastFlagForTests();
  });

  it('toasts on the first failure only (the every-10s save loop)', () => {
    notifyProgressSaveFailure();
    notifyProgressSaveFailure();
    notifyProgressSaveFailure();
    notifyProgressSaveFailure();
    notifyProgressSaveFailure();

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith(
      'تعذّر حفظ موضع التشغيل. يمكنك متابعة المشاهدة الآن وسنعيد المحاولة تلقائياً.',
    );
  });
});
