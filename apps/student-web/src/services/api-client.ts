import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { getOrCreateInstallationId } from '@/utils';
import { notifySessionExpired } from '@/services/session-expiry';
// Task 2 (Night) — «تذكّرني»: rotations must write back to whichever store
// holds the active session (sessionStorage default / localStorage opt-in).
import { readSession, writeRotatedTokens, clearSession } from '@/services/session-store';
// Wave 18.1 — the 403 reason extraction lives in one place (utils/api-error) so
// the broadcast here and the feature denial cards can never drift apart.
// Wave A (remember-me hardening) — isSessionEndingFailure is the single
// classifier deciding when a refresh failure may end a remembered session.
import { getEntitlementReason, isSessionEndingFailure } from '@/utils/api-error';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
type RetriableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };
let refreshInFlight: Promise<string> | null = null;

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept-Language': 'ar',
  },
});

async function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = readSession()?.refreshToken;
      if (!refreshToken) throw new Error('لا يوجد رمز تحديث للجلسة');

      const installationId = getOrCreateInstallationId();
      const response = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken },
        { headers: { 'X-Installation-Id': installationId, 'X-Device-Fingerprint': installationId } },
      );
      const { accessToken, refreshToken: newRefresh } = response.data;
      if (!accessToken || !newRefresh) throw new Error('رموز الجلسة الجديدة غير صالحة');

      writeRotatedTokens({ accessToken, refreshToken: newRefresh });
      return accessToken;
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = readSession()?.accessToken;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Use one stable installation identity for session/device binding across all requests.
    const installationId = getOrCreateInstallationId();
    if (config.headers) {
      config.headers['X-Installation-Id'] = installationId;
      // Kept for existing auth endpoints while Backend transitions to X-Installation-Id.
      config.headers['X-Device-Fingerprint'] = installationId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors + refresh token
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetriableRequestConfig | undefined;

    // Multiple protected requests can fail together. They must share one refresh operation,
    // because a refresh token is single-use and concurrent rotations revoke its session family.
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !originalRequest.url?.includes('/auth/refresh')) {
      originalRequest._retry = true;

      try {
        const accessToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Wave A (remember-me hardening) — only a definitive server verdict may
        // end the session. The refresh call can fail two very different ways:
        //
        //  • 401 (rejected/expired/reused token) → the server ruled the session
        //    dead: fail closed exactly like before — wipe, single honest toast,
        //    hard redirect to /login (no zombie session survives).
        //  • transport fault (offline, DNS, timeout, Render cold start, 429,
        //    5xx) → the single-use refresh token was NOT consumed and the
        //    server never ruled anything: keep the session and surface the
        //    transport error (NOT the stale 401) so callers — including the
        //    AuthProvider restore path — see a retryable fault, not a verdict.
        //    This mirrors NativeSessionManager.restore on the Android side:
        //    transient failures keep the stored pair; the next authenticated
        //    call resolves the question honestly.
        if (isSessionEndingFailure(refreshError)) {
          clearSession();
          // Wave 12.5.A (Group 3) — the forced logout stays fail-closed, but it is no
          // longer SILENT: one shared toast explains why the student landed on /login
          // (a transient refresh-network failure used to log the student out invisibly).
          notifySessionExpired();
          if (window.location.pathname !== '/login') window.location.assign('/login');
        } else {
          return Promise.reject(refreshError);
        }
      }
    }

    // R62 §2.B.1 — a 403 is an entitlement/access denial, NOT a connection error.
    // Broadcast a typed event so feature UIs can render the specific state
    // (CoursesCatalog: no-subscription vs session/device) and the entitlement cache
    // can self-heal (the eviction listener in entitlement-api.ts). R69 §2.E — the
    // reason is taken from the ProblemDetails body, then the X-Entitlement-Error
    // header (if the API opts in), then defaults to 'unknown' so the UI can fall
    // back to a generic access-denied message. The error still rejects below.
    if (error.response?.status === 403) {
      window.dispatchEvent(
        new CustomEvent('cms-entitlement-error', {
          detail: {
            url: typeof originalRequest?.url === 'string' ? originalRequest.url : '',
            reason: getEntitlementReason(error),
          },
        })
      );
    }

    return Promise.reject(error);
  }
);
