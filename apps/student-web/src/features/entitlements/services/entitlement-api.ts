import { apiClient } from '@/services/api-client';

const STORAGE_KEY = 'cms-signed-entitlement';
const RENEWAL_SKEW_MS = 60_000;

interface EntitlementPayload {
  expiresAt?: string;
}

function readExpiry(token: string): number | null {
  try {
    const [encodedPayload] = token.split('.');
    if (!encodedPayload) return null;
    const padded = encodedPayload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encodedPayload.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as EntitlementPayload;
    const expiry = payload.expiresAt ? Date.parse(payload.expiresAt) : Number.NaN;
    return Number.isFinite(expiry) ? expiry : null;
  } catch {
    return null;
  }
}

function getCachedToken(): string | null {
  const token = sessionStorage.getItem(STORAGE_KEY);
  if (!token) return null;
  const expiry = readExpiry(token);
  if (expiry === null || expiry <= Date.now() + RENEWAL_SKEW_MS) {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
  return token;
}

export async function getEntitlementToken(forceRenewal = false): Promise<string> {
  if (!forceRenewal) {
    const cached = getCachedToken();
    if (cached) return cached;
  }

  const response = await apiClient.post<{ token: string }>('/entitlements/issue');
  const token = response.data.token;
  if (!token || readExpiry(token) === null) {
    throw new Error('لم يُصدر الخادم استحقاقاً صالحاً للمحتوى');
  }

  sessionStorage.setItem(STORAGE_KEY, token);
  return token;
}

export async function entitlementRequestConfig() {
  return { headers: { 'X-Entitlement': await getEntitlementToken() } };
}

export function clearEntitlementToken(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
