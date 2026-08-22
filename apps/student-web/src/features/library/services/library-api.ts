import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';

export interface LibraryFile {
  id: string;
  type: string; // pdf, html, image, video, summary, comprehensive, paragraph
  title: string;
  description?: string;
  fileSize: number;
  durationSeconds?: number;
  pagesCount?: number;
  thumbnailUrl?: string;
  viewsCount: number;
  isFavorite: boolean;
}

export interface FileAccess {
  accessUrl: string;
  expiresAt: string;
  watermark: {
    studentName: string;
    studentPhone: string;
    timestamp: string;
    siteName: string;
  };
}

export const libraryApi = {
  getFiles: async (subjectId: string, type?: string, page = 1, pageSize = 20) => {
    const config = await entitlementRequestConfig();
    const res = await apiClient.get(`/library/subject/${subjectId}`, { ...config, params: { type, page, pageSize } });
    return res.data;
  },

  getFile: async (id: string) => {
    const res = await apiClient.get(`/library/${id}`, await entitlementRequestConfig());
    return res.data;
  },

  getAccess: async (id: string): Promise<FileAccess> => {
    const res = await apiClient.post(`/library/${id}/access`, undefined, await entitlementRequestConfig());
    return res.data;
  },

  recordView: async (id: string, durationSeconds: number, pagesViewed?: number, completionPercentage?: number) => {
    await apiClient.post(`/library/${id}/view`, { durationSeconds, pagesViewed, completionPercentage }, await entitlementRequestConfig());
  },

  toggleFavorite: async (fileId: string, isFavorite: boolean) => {
    const config = await entitlementRequestConfig();
    if (isFavorite) {
      await apiClient.delete(`/favorites/files/${fileId}`, config);
    } else {
      await apiClient.post('/favorites', { libraryFileId: fileId }, config);
    }
  },
};
