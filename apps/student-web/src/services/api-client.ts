import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { getOrCreateInstallationId } from '@/utils';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept-Language': 'ar',
  },
});

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
    const originalRequest = error.config;

    // 401 - try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = sessionStorage.getItem('cms-refresh-token');
      if (refreshToken) {
        try {
          const installationId = getOrCreateInstallationId();
          const response = await axios.post(
            `${API_BASE_URL}/auth/refresh`,
            { refreshToken },
            { headers: { 'X-Installation-Id': installationId, 'X-Device-Fingerprint': installationId } }
          );
          const { accessToken, refreshToken: newRefresh } = response.data;

          sessionStorage.setItem('cms-access-token', accessToken);
          sessionStorage.setItem('cms-refresh-token', newRefresh);

          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        } catch {
          sessionStorage.removeItem('cms-access-token');
          sessionStorage.removeItem('cms-refresh-token');
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  }
);
