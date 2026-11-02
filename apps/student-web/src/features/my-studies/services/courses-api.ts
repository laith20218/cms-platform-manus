import axios from 'axios';
import { apiClient } from '@/services/api-client';
import { entitlementRequestConfig } from '@/features/entitlements/services/entitlement-api';

/**
 * Student-facing course API (Push 4 Phase 5).
 * Mirrors the library contract: every course request carries the signed
 * entitlement token (X-Entitlement) validated against the course's subject.
 */

/** R62 §2.B — typed marker: every entitled subject was denied (HTTP 403) even after
 * one forced entitlement re-issue + retry, i.e. a genuine session/device denial. */
export class EntitlementDeniedError extends Error {
  constructor() {
    super('entitlement-denied');
    this.name = 'EntitlementDeniedError';
  }
}

/** R62 §2.B — true when the failure is an HTTP 403 from the API (works on plain
 * axios errors; callers use it to detect entitlement denials without coupling to
 * interceptor internals). */
export function isEntitlementDenied(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 403;
}

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
  /** Push 10.8 — rich episode metadata the API already returns (CourseEpisodeDto
   * since 10.5): drives the player-page metadata card and the processing gate.
   * Optional here so older payloads degrade gracefully. */
  description?: string | null;
  difficulty?: number | string | null;
  /** "Pending" | "Transcoding_360p/720p/1080p" | "Ready" | "Failed" — null on
   * audio/YouTube/legacy rows (never entered the transcoding pipeline). */
  processingStatus?: string | null;
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
