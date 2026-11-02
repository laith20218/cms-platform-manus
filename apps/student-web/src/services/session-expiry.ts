import { toast } from 'sonner';

/**
 * Wave 12.5.A (Group 3, supervisor Q4) — ONE session-expired toast, no matter how
 * many parallel requests fail at once. Every forced-logout path (AuthProvider's
 * /me failure and refresh failure, api-client's refresh-retry failure) funnels
 * through here; the module-level flag collapses them into a single message.
 * The fail-closed logout itself is UNCHANGED — this only adds the missing signal.
 */
let alreadyToasted = false;

export function notifySessionExpired(): void {
  if (alreadyToasted) return;
  alreadyToasted = true;
  toast.error('انتهت الجلسة، يُرجى تسجيل الدخول مجددًا', { duration: 6000 });
}

/** Test hook — resets the dedup flag (vitest isolation only). */
export function resetSessionExpiredFlagForTests(): void {
  alreadyToasted = false;
}
