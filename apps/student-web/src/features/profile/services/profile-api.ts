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
  /** Push 9: raw academic ids — drive the profile-edit cascading selects. */
  universityId?: string | null;
  collegeId?: string | null;
  academicYearId?: string | null;
  subscriptions: StudentProfileSubscription[];
}

/** A device/session row from GET /security/my-sessions. */
export interface StudentSession {
  id: string;
  current: boolean;
  status: string;
  isActive: boolean;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  installationId: string;
  browser?: string | null;
  os?: string | null;
  deviceType?: string | null;
  ipAddress?: string | null;
}

export interface ProfileUpdateResult {
  email?: string | null;
  fullName?: string;
  universityName?: string | null;
  collegeName?: string | null;
  academicYearName?: string | null;
  adminNotified?: boolean;
}

export const profileApi = {
  get: async (): Promise<StudentProfile> => {
    const response = await apiClient.get('/profile');
    return response.data;
  },

  /** Legacy email-only edit (kept for the inline email row). */
  updateEmail: async (email: string | null): Promise<{ email: string | null }> => {
    const response = await apiClient.put('/profile', { email });
    return response.data;
  },

  /** Push 9: full self-service edit (name / college / year / email) —
   *  the backend validates the hierarchy, blocks mid-exam edits (409) and
   *  notifies the admin inside the same DB transaction. */
  updateProfile: async (payload: {
    fullName?: string;
    email?: string | null;
    collegeId?: string;
    academicYearId?: string;
  }): Promise<ProfileUpdateResult> => {
    const response = await apiClient.put('/profile', payload);
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

  // ===== Sessions & devices (Push 9 Task 3) =====
  getSessions: async (): Promise<StudentSession[]> => {
    const response = await apiClient.get('/security/my-sessions');
    const list = response.data?.items ?? response.data ?? [];
    return Array.isArray(list) ? list : [];
  },

  revokeSession: async (sessionId: string): Promise<void> => {
    await apiClient.post(`/security/my-sessions/${sessionId}/revoke`, undefined);
  },

  revokeOtherSessions: async (): Promise<{ revokedCount: number }> => {
    const response = await apiClient.post('/security/my-sessions/revoke-others', undefined);
    return response.data;
  },
};
