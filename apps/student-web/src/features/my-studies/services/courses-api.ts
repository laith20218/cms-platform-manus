import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';

/**
 * Student-facing course API (Push 4 Phase 5).
 * Mirrors the library contract: every course request carries the signed
 * entitlement token (X-Entitlement) validated against the course's subject.
 */

export interface CourseListItem {
  id: string;
  subjectId: string;
  subjectNameAr: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  episodesCount: number;
  totalDurationSeconds: number;
  totalViewsCount: number;
}

export interface CourseEpisode {
  id: string;
  courseId: string;
  title: string;
  episodeNumber: number;
  durationSeconds?: number | null;
  sourceType: 'Upload' | 'YouTube' | string;
  fileSize?: number | null;
  contentType?: string | null;
  youtubeVideoId?: string | null;
  /** true once the multipart upload has completed and the blob is playable. */
  uploadCompleted: boolean;
  viewsCount: number;
}

export interface CourseDetail {
  id: string;
  subjectId: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  status: string;
  episodesCount: number;
  createdAt: string;
  episodes: CourseEpisode[];
}

export interface EpisodeAccess {
  accessUrl: string;
  expiresAt: string;
  watermark: {
    studentName: string;
    studentPhone: string;
    timestamp: string;
    siteName: string;
  };
}

export const coursesApi = {
  /** Courses of one subject — only VideoAudio-capable students receive entries. */
  getSubjectCourses: async (subjectId: string): Promise<CourseListItem[]> => {
    const res = await apiClient.get(`/courses/subject/${subjectId}`, await entitlementRequestConfig());
    const data = res.data?.items ?? res.data;
    return Array.isArray(data) ? data : [];
  },

  /** Course detail with its ordered episodes. */
  getCourse: async (courseId: string): Promise<CourseDetail> => {
    const res = await apiClient.get(`/courses/${courseId}`, await entitlementRequestConfig());
    return res.data;
  },

  /** Playback access for one episode: signed URL (or YouTube embed) + watermark envelope. */
  getEpisodeAccess: async (episodeId: string): Promise<EpisodeAccess> => {
    const res = await apiClient.post(`/courses/episodes/${episodeId}/access`, undefined, await entitlementRequestConfig());
    return res.data;
  },
};
