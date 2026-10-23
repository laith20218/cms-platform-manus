import { apiClient } from '@/services/api-client';

export interface StudentProfileSubscription {
  id: string;
  maskedCode?: string | null;
  scopeType: string;
  status: string;
  startsAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  scopeSubjectId?: string | null;
}

export interface StudentProfile {
  fullName: string;
  phone: string;
  email?: string | null;
  avatarUrl?: string | null;
  gender?: string | null;
  status: string;
  createdAt: string;
  lastLogin?: string | null;
  universityName?: string | null;
  collegeName?: string | null;
  academicYearName?: string | null;
  subscriptions: StudentProfileSubscription[];
}

export const profileApi = {
  get: async (): Promise<StudentProfile> => {
    const response = await apiClient.get('/profile');
    return response.data;
  },

  updateEmail: async (email: string | null): Promise<{ email: string | null }> => {
    const response = await apiClient.put('/profile', { email });
    return response.data;
  },

  uploadAvatar: async (file: File): Promise<{ avatarUrl: string; previewUrl: string | null }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post('/profile/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};
