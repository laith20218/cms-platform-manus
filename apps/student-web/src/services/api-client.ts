import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { getOrCreateInstallationId } from '@/utils';

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
      const refreshToken = sessionStorage.getItem('cms-refresh-token');
      if (!refreshToken) throw new Error('لا يوجد رمز تحديث للجلسة');

      const installationId = getOrCreateInstallationId();
      const response = await axios.post(
        `${API_BASE_URL}/auth/refresh`,
        { refreshToken },
        { headers: { 'X-Installation-Id': installationId, 'X-Device-Fingerprint': installationId } },
      );
      const { accessToken, refreshToken: newRefresh } = response.data;
      if (!accessToken || !newRefresh) throw new Error('رموز الجلسة الجديدة غير صالحة');

      sessionStorage.setItem('cms-access-token', accessToken);
      sessionStorage.setItem('cms-refresh-token', newRefresh);
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
    const token = sessionStorage.getItem('cms-access-token');
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
      } catch {
        sessionStorage.removeItem('cms-access-token');
        sessionStorage.removeItem('cms-refresh-token');
        if (window.location.pathname !== '/login') window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  }
);
