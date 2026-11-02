import { describe, it, expect, vi, beforeEach } from 'vitest';

// R62 §2.C — the eviction listener lives in the REAL entitlement-api module, so this
// suite mocks only the transport (api-client) and exercises the module for real.

const { postMock, getMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  getMock: vi.fn(),
}));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    post: (...args: unknown[]) => postMock(...args),
    get: (...args: unknown[]) => getMock(...args),
  },
}));

import { getEntitlementToken } from '@/features/entitlements/services/entitlement-api';

const STORAGE_KEY = 'cms-signed-entitlement';

/** A signed-entitlement-shaped token whose payload expires `minutesFromNow` from now. */
function makeToken(minutesFromNow: number): string {
  const payload = btoa(JSON.stringify({ expiresAt: new Date(Date.now() + minutesFromNow * 60_000).toISOString() }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${payload}.signature`;
}

describe('entitlement cache — cms-entitlement-error eviction (R62 §2.C)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('evicts the cached token when the interceptor broadcasts cms-entitlement-error', () => {
    sessionStorage.setItem(STORAGE_KEY, makeToken(10));

    window.dispatchEvent(new CustomEvent('cms-entitlement-error', {
      detail: { url: '/courses/subject/abc', reason: 'Entitlement device mismatch.' },
    }));

    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('re-issues a fresh token on the next getEntitlementToken() after eviction', async () => {
    sessionStorage.setItem(STORAGE_KEY, makeToken(10));
    window.dispatchEvent(new CustomEvent('cms-entitlement-error', {
      detail: { url: '/courses/subject/abc', reason: 'denied' },
    }));

    const fresh = makeToken(20);
    postMock.mockResolvedValue({ data: { token: fresh } });

    const token = await getEntitlementToken();

    expect(token).toBe(fresh);
    expect(postMock).toHaveBeenCalledWith('/entitlements/issue');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe(fresh);
  });

  it('forceRenewal bypasses a still-valid cached token (the §2.C retry contract)', async () => {
    const stale = makeToken(10);
    sessionStorage.setItem(STORAGE_KEY, stale);
    const fresh = makeToken(30);
    postMock.mockResolvedValue({ data: { token: fresh } });

    const token = await getEntitlementToken(true);

    expect(token).toBe(fresh);
    expect(postMock).toHaveBeenCalledTimes(1);
  });
});
