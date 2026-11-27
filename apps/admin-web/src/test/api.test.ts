import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRequest, apiDownload, ApiError, login, NETWORK_ERROR_CODES } from '../lib/api';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('apiRequest', () => {
  it('sets Authorization header from token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' }),
    });
    await apiRequest('/test', 'my-token');
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/test');
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer my-token');
  });

  it('sets Content-Type: application/json for non-FormData bodies', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    await apiRequest('/test', 'token', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    const init = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('does NOT set Content-Type for FormData bodies', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const formData = new FormData();
    formData.append('file', new Blob(['test'], { type: 'text/plain' }), 'test.txt');
    await apiRequest('/upload', 'token', { method: 'POST', body: formData });
    const init = mockFetch.mock.calls[0][1];
    const headers = init.headers as Headers;
    expect(headers.get('Content-Type')).toBeNull();
  });

  it('returns undefined for 204 No Content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => null,
    });
    const result = await apiRequest('/delete', 'token', { method: 'DELETE' });
    expect(result).toBeUndefined();
  });

  it('throws ApiError with status on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: 'Forbidden' }),
    });
    await expect(apiRequest('/protected', 'token')).rejects.toThrow('Forbidden');
  });

  it('ApiError has correct status property', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not Found' }),
    });
    try {
      await apiRequest('/missing', 'token');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(404);
    }
  });

  it('uses fallback message when response is not JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not JSON'); },
    });
    await expect(apiRequest('/error', 'token')).rejects.toThrow();
  });
});

describe('bounded network calls (Phase 6 — login resilience)', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = mockFetch as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('login() rejects with NETWORK_TIMEOUT when the server stalls past the deadline', async () => {
    // Simulate real fetch abort semantics: the promise only rejects when the
    // AbortController signal fires — exactly what a stalled network does.
    mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));

    const pending = login('ops@example.edu', 'whatever-password');
    const assertion = expect(pending).rejects.toMatchObject({
      status: 0,
      errorCode: NETWORK_ERROR_CODES.timeout,
    });
    await vi.advanceTimersByTimeAsync(20_500);
    await assertion;
  });

  it('login() translates a network-layer failure into NETWORK_UNREACHABLE', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(login('ops@example.edu', 'whatever-password')).rejects.toMatchObject({
      status: 0,
      errorCode: NETWORK_ERROR_CODES.unreachable,
    });
  });

  it('login() timeout message is Arabic and leaks no infrastructure detail', async () => {
    mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));

    const pending = login('ops@example.edu', 'whatever-password');
    const assertion = expect(pending).rejects.toSatisfy((error: unknown) => {
      const apiError = error as ApiError;
      return apiError.message.includes('انتهت مهلة الاتصال') && !apiError.message.includes('http');
    });
    await vi.advanceTimersByTimeAsync(20_500);
    await assertion;
  });

  it('apiRequest() is bounded too (stalled data call recovers)', async () => {
    mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));

    const pending = apiRequest('/api/v1/admin/roles', 'token');
    const assertion = expect(pending).rejects.toMatchObject({ errorCode: NETWORK_ERROR_CODES.timeout });
    await vi.advanceTimersByTimeAsync(45_500);
    await assertion;
  });

  it('apiDownload() is bounded with a long download budget', async () => {
    mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));

    const pending = apiDownload('/api/v1/admin/questions/export', 'token');
    const assertion = expect(pending).rejects.toMatchObject({ errorCode: NETWORK_ERROR_CODES.timeout });
    // Still pending at the apiRequest deadline — downloads get a longer budget…
    await vi.advanceTimersByTimeAsync(45_500);
    // …but not an infinite one.
    await vi.advanceTimersByTimeAsync(300_000);
    await assertion;
  });
});
