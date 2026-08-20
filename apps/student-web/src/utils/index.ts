import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with conflict resolution.
 * Combines clsx + tailwind-merge.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns a stable, opaque browser-installation identifier for server-side device binding.
 * It is intentionally random rather than a browser fingerprint: browser traits are not a
 * reliable identity, while this value must survive refreshes and be sent consistently.
 */
const INSTALLATION_ID_KEY = 'cms-device-fingerprint';

export function getOrCreateInstallationId(storage: Storage = window.localStorage): string {
  const existing = storage.getItem(INSTALLATION_ID_KEY);
  if (existing && /^web-[a-f0-9]{32}$/i.test(existing)) return existing;

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const installationId = `web-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
  storage.setItem(INSTALLATION_ID_KEY, installationId);
  return installationId;
}

/**
 * Compatibility alias used by existing login callers. It now returns the stable installation ID.
 */
export function generateDeviceFingerprint(): string {
  return getOrCreateInstallationId();
}

/**
 * Format date in Arabic.
 */
export function formatDate(date: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('ar-SY', options || {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format relative time (e.g., "منذ 5 دقائق").
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  if (days < 30) return `منذ ${days} يوم`;
  return formatDate(d);
}

/**
 * Format number with Arabic locale.
 */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('ar-SY').format(n);
}

/**
 * Debounce function.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number
): (...args: Args) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Sleep helper.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
