import { apiClient } from '@/services/api-client';
import type { User } from '@cms/types';
import { getOrCreateInstallationId } from '@/utils';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
}

interface RegisterResponse {
  studentId: string;
  phone: string;
  otpRequired: boolean;
  otpExpiresIn: number;
}

export const authApi = {
  me: async (): Promise<User> => {
    const res = await apiClient.get('/auth/me');
    return res.data;
  },

  register: async (data: {
    phone: string;
    password: string;
    fullName: string;
    universityId: string;
    collegeId: string;
    academicYearId: string;
    acceptTerms: boolean;
  }): Promise<RegisterResponse> => {
    const res = await apiClient.post('/auth/register', {
      ...data,
      installationId: getOrCreateInstallationId(),
    });
    return res.data;
  },

  verifyOtp: async (phone: string, otpCode: string): Promise<AuthResponse> => {
    const installationId = getOrCreateInstallationId();
    const res = await apiClient.post('/auth/verify-otp', { phone, otpCode, installationId });
    return res.data;
  },

  resendOtp: async (phone: string): Promise<void> => {
    await apiClient.post('/auth/resend-otp', { phone, installationId: getOrCreateInstallationId() });
  },

  login: async (phone: string, password: string): Promise<AuthResponse> => {
    const res = await apiClient.post('/auth/login', {
      phone,
      password,
      deviceFingerprint: getOrCreateInstallationId(),
      deviceName: navigator.userAgent,
    });
    return res.data;
  },

  refresh: async (refreshToken: string): Promise<AuthResponse> => {
    const res = await apiClient.post('/auth/refresh', { refreshToken });
    return res.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },

  forgotPassword: async (phone: string): Promise<void> => {
    await apiClient.post('/auth/forgot-password', { phone });
  },

  resetPassword: async (phone: string, otpCode: string, newPassword: string): Promise<void> => {
    await apiClient.post('/auth/reset-password', { phone, otpCode, newPassword });
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await apiClient.post('/auth/change-password', { currentPassword, newPassword });
  },
};
