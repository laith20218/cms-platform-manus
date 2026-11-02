import { toast } from 'sonner';

/**
 * Wave 12.5.A (Group 5, supervisor Q3) — progress saves fire every few seconds
 * while playing; toasting EVERY failure would be noise. The first failed save in
 * a browser session surfaces ONE toast; the rest stay silent (the periodic save
 * loop retries on its own — the signal is about the session, not each request).
 */
let alreadyToasted = false;

export function notifyProgressSaveFailure(): void {
  if (alreadyToasted) return;
  alreadyToasted = true;
  toast.error('تعذّر حفظ موضع التشغيل. يمكنك متابعة المشاهدة الآن وسنعيد المحاولة تلقائياً.');
}

/** Test hook — resets the dedup flag (vitest isolation only). */
export function resetProgressToastFlagForTests(): void {
  alreadyToasted = false;
}
