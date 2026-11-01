import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useHtmlDocument } from '@/features/media-player/html/useHtmlDocument';

// ---- shared mocks (hoisted) — push6.test.tsx pattern ----
const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock('@/services/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

vi.mock('@/features/entitlements/services/entitlement-api', async () => {
  const actual = await vi.importActual<typeof import('@/features/entitlements/services/entitlement-api')>(
    '@/features/entitlements/services/entitlement-api',
  );
  return { ...actual, entitlementRequestConfig: async () => ({}) };
});

/**
 * R51 §3.B — the client no longer fetches or transforms lesson HTML: the hook
 * only orchestrates the single-use /html-access token issue. These tests pin
 * that contract: the grant url is exposed verbatim (the iframe will join the
 * API origin), failures surface as the G-5 error state, and retry issues a
 * FRESH token (the previous one may already be consumed).
 */
describe('useHtmlDocument — R51 single-use html-view token flow', () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it('issues the token and exposes the grant url (ready)', async () => {
    postMock.mockResolvedValueOnce({
      data: { url: '/api/v1/library/f1/html-view?t=tok-1', expiresAt: '2026-01-01T00:05:00Z' },
    });
    const { result } = renderHook(() => useHtmlDocument('f1', true));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.url).toBe('/api/v1/library/f1/html-view?t=tok-1');
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith('/library/f1/html-access', undefined, {});
  });

  it('stays idle and never calls the API when disabled', () => {
    const { result } = renderHook(() => useHtmlDocument('f1', false));
    expect(result.current.url).toBeNull();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('surfaces the error state when the issue call fails (non-200 / network)', async () => {
    postMock.mockRejectedValueOnce(new Error('500 storage outage'));
    const { result } = renderHook(() => useHtmlDocument('f1', true));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.url).toBeNull();
  });

  it('rejects an empty grant as an error (defensive — no url, no iframe)', async () => {
    postMock.mockResolvedValueOnce({ data: {} });
    const { result } = renderHook(() => useHtmlDocument('f1', true));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.url).toBeNull();
  });

  it('retry() issues a FRESH token after a failure (single-use contract)', async () => {
    postMock.mockRejectedValueOnce(new Error('500 storage outage'));
    const { result } = renderHook(() => useHtmlDocument('f1', true));
    await waitFor(() => expect(result.current.status).toBe('error'));

    postMock.mockResolvedValueOnce({
      data: { url: '/api/v1/library/f1/html-view?t=tok-2', expiresAt: '2026-01-01T00:05:00Z' },
    });
    result.current.retry();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.url).toBe('/api/v1/library/f1/html-view?t=tok-2');
    expect(postMock).toHaveBeenCalledTimes(2);
  });
});
