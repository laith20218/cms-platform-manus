import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';
import type { PdfAnnotation, SaveAnnotationsBatch, SaveAnnotationsResult } from '@/features/media-player/pdf/pdf-types';

interface PagedLibraryFiles {
  items: LibraryFile[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface LibraryFile {
  id: string;
  /** API class enum name, PascalCase: Pdf | Html | Image | Video | Audio | Summary | Comprehensive | Paragraph. */
  type: string;
  title: string;
  description?: string;
  fileSize: number;
  durationSeconds?: number;
  pagesCount?: number;
  thumbnailUrl?: string;
  viewsCount: number;
  isFavorite: boolean;
  /** Curricular category (Curriculum / Lecture / Summary / GoldenIdeas) — null = uncategorized. */
  category?: string | null;
  createdAt?: string | null;
}

/** Full file detail (GET /library/{id}) — carries the physical MIME (fileFormat). */
export interface LibraryFileDetail extends LibraryFile {
  subjectId: string;
  lectureId?: string | null;
  /** The stored content type, e.g. "application/pdf" — null on legacy rows. */
  fileFormat?: string | null;
  youtubeVideoId?: string | null;
  tags?: string[];
  favoritesCount?: number;
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

  getLectureTextFiles: async (lectureId: string, page = 1, pageSize = 20) => {
    const res = await apiClient.get<PagedLibraryFiles>(`/library/lectures/${lectureId}/text-files`, { ...(await entitlementRequestConfig()), params: { page, pageSize } });
    return res.data;
  },

  getFile: async (id: string): Promise<LibraryFileDetail> => {
    const res = await apiClient.get(`/library/${id}`, await entitlementRequestConfig());
    return res.data;
  },

  getAccess: async (id: string): Promise<FileAccess> => {
    const res = await apiClient.post(`/library/${id}/access`, undefined, await entitlementRequestConfig());
    return res.data;
  },

  /**
   * Streams the file body through the API (Push 9): same-origin for the app,
   * so it works even though the storage bucket's presigned URLs carry no CORS
   * headers (direct fetch() of those is blocked by the browser). The API also
   * re-declares the charset for text documents — storage serves text/* without
   * one, which mangles Arabic.
   */
  getContentText: async (id: string): Promise<string> => {
    const res = await apiClient.get<string>(`/library/${id}/content`, {
      ...(await entitlementRequestConfig()),
      responseType: 'text',
      transformResponse: [(data: string) => data],
    });
    return res.data;
  },

  /** Blob variant of the content stream — powers real in-app downloads. */
  getContentBlob: async (id: string): Promise<Blob> => {
    const res = await apiClient.get<Blob>(`/library/${id}/content`, {
      ...(await entitlementRequestConfig()),
      responseType: 'blob',
    });
    return res.data;
  },

  recordView: async (id: string, durationSeconds: number, pagesViewed?: number, completionPercentage?: number) => {
    await apiClient.post(`/library/${id}/view`, { durationSeconds, pagesViewed, completionPercentage }, await entitlementRequestConfig());
  },

  // ===== Wave 11.8 / F2: PDF annotations =====

  /** The calling student's own annotations on one PDF (owner-scoped server-side). */
  getAnnotations: async (fileId: string): Promise<PdfAnnotation[]> => {
    const res = await apiClient.get<PdfAnnotation[]>(`/library/${fileId}/annotations`, await entitlementRequestConfig());
    return res.data;
  },

  /** Idempotent batch: client-id-keyed upserts + owner-scoped deletes, one commit. */
  saveAnnotations: async (fileId: string, batch: SaveAnnotationsBatch): Promise<SaveAnnotationsResult> => {
    const res = await apiClient.post<SaveAnnotationsResult>(`/library/${fileId}/annotations`, batch, await entitlementRequestConfig());
    return res.data;
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
