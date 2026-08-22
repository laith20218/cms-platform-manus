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
};
