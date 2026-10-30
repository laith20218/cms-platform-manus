/** Style reminder — غرفة القيادة السريرية: production API calls stay explicit, fail visibly, and never persist credentials. */
import type { ProcessingStatus } from './mediaProcessing';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'https://cms-api-preview.onrender.com').replace(/\/$/, '');

// FIX-2: Backend UserDto returns { id, phone, fullName, role, avatarUrl, university, college }
// — no `email` field. AdminUser now matches the actual backend response.
export type AdminUser = {
  id: string;
  phone: string;
  fullName: string;
  role: string;
  avatarUrl?: string | null;
  university?: { id: string; nameAr: string } | null;
  college?: { id: string; nameAr: string } | null;
};

export type AdminRecord = {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  roleId: string;
  roleName: string;
  roleNameAr: string;
  scopeUniversityId?: string | null;
  scopeCollegeId?: string | null;
  scopeYearId?: string | null;
  scopeSubjectId?: string | null;
  // P1-04: resolved scope names (from backend AdminManagementDto)
  scopeUniversityName?: string | null;
  scopeCollegeName?: string | null;
  scopeYearName?: string | null;
  scopeSubjectName?: string | null;
  status: string;
  lastLogin?: string | null;
  createdAt: string;
};

export type RoleRecord = {
  id: string;
  name: string;
  nameAr: string;
  description?: string | null;
  isSystem: boolean;
  isActive: boolean;
  adminCount: number;
  permissionCount: number;
  createdAt: string;
};

export type PagedResult<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number };

export class ApiError extends Error {
  status: number;
  /** Arabic human sentence from the API's dual-language ProblemDetails
   * (media processing 422s carry `humanMessage` + `technicalDetails`). */
  humanMessage?: string;
  /** English technical payload (e.g. FFmpeg logs) — surfaced in the
   * collapsible section of the Push 10.4 error modal. */
  technicalDetails?: string;

  constructor(message: string, status: number, humanMessage?: string, technicalDetails?: string) {
    super(message);
    this.status = status;
    this.humanMessage = humanMessage;
    this.technicalDetails = technicalDetails;
  }
}

interface ProblemDetails {
  detail?: string;
  title?: string;
  message?: string;
  errors?: Record<string, string[]>;
  /** ProblemDetails extensions — the media-processing 422 shape. */
  humanMessage?: string;
  technicalDetails?: string;
}

function readProblem(payload: unknown): { message: string; humanMessage?: string; technicalDetails?: string } {
  if (payload && typeof payload === 'object') {
    const problem = payload as ProblemDetails;
    const message = problem.detail ?? problem.message ?? problem.title
      ?? Object.values(problem.errors ?? {}).flat()[0];
    return {
      message: message ?? 'تعذر إتمام الطلب. حاول مرة أخرى.',
      humanMessage: problem.humanMessage ?? problem.detail,
      technicalDetails: problem.technicalDetails,
    };
  }
  return { message: 'تعذر إتمام الطلب. حاول مرة أخرى.' };
}

export async function apiRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  // Only set Content-Type: application/json for non-FormData bodies.
  // FormData must NOT have a manual Content-Type — the browser sets
  // multipart/form-data; boundary=... automatically. Setting it manually
  // omits the boundary → 415 Unsupported Media Type.
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = readProblem(payload);
    throw new ApiError(problem.message, response.status, problem.humanMessage, problem.technicalDetails);
  }
  return payload as T;
}

// FIX-1 + FIX-3: Capture refreshToken + use per-browser installationId
const ADMIN_INSTALLATION_KEY = 'cms-admin-installation-id';

function getOrCreateInstallationId(): string {
  try {
    let id = sessionStorage.getItem(ADMIN_INSTALLATION_KEY);
    if (!id) {
      id = `admin-web-${crypto.randomUUID()}`;
      sessionStorage.setItem(ADMIN_INSTALLATION_KEY, id);
    }
    return id;
  } catch {
    return `admin-web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export async function login(email: string, password: string): Promise<{ accessToken: string; refreshToken: string; user: AdminUser }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, twoFactorCode: null, installationId: getOrCreateInstallationId() }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = readProblem(payload);
    throw new ApiError(problem.message, response.status, problem.humanMessage, problem.technicalDetails);
  }
  // FIX-1: Backend returns { accessToken, refreshToken, tokenType, expiresIn, user }
  const result = payload as { accessToken: string; refreshToken: string; tokenType: string; expiresIn: number; user: AdminUser };
  return { accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user };
}

// FIX-1: Refresh token mechanism — calls /auth/refresh to get new accessToken
export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken, installationId: getOrCreateInstallationId() }),
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    return payload?.accessToken ?? null;
  } catch {
    return null;
  }
}

// ===== Library (ADMIN-02) =====
export type LibraryFileType = 'Pdf' | 'Html' | 'Image' | 'Video' | 'Audio' | 'Summary' | 'Comprehensive' | 'Paragraph';
export type LibraryStatus = 'Draft' | 'Published' | 'Archived';
export type VirusScanStatus = 'Pending' | 'Clean' | 'Infected' | 'Error';

export type AdminLibraryFileListItem = {
  id: string;
  subjectId: string;
  lectureId?: string | null;
  subjectNameAr: string;
  title: string;
  type: string;
  category?: string | null; // Curriculum | Lecture | Summary | GoldenIdeas (null = legacy)
  fileSize: number;
  durationSeconds?: number | null;
  status: string;
  virusScanStatus: string;
  createdAt: string;
  /** Wave 11.9 — Ghostscript font pipeline (additive server keys; absent on
   *  legacy API responses → undefined, which the poller treats as in-flight). */
  pdfProcessingStatus?: 'Pending' | 'Normalizing' | 'Ready' | 'Failed' | null;
  /** English technical failure details — rides only while pdfProcessingStatus === 'Failed'. */
  processingError?: string | null;
  /** True only when the server actually produced the "{key}-fixed" object. */
  fontPipelineFixed?: boolean;
  /** R22.2 — human-readable Ghostscript font diagnostics (Arabic substitution
   *  report on Ready rows; the raw GS stderr tail on Failed rows). */
  diagnosticReport?: string | null;
  /** R22.5.1 — the derived health badge classification
   *  ("Healthy" = سليم البنية | "BrokenArabic" = يحتاج معالجة بصرية | null). */
  healthStatus?: string | null;
};

export type UploadUrlResponse = {
  uploadUrl: string;
  fileKey: string;
  fileId: string;
};

export type LibraryFileDetail = {
  id: string;
  subjectId: string;
  lectureId?: string | null;
  type: string;
  title: string;
  description?: string | null;
  fileSize: number;
  fileFormat?: string | null;
  durationSeconds?: number | null;
  pagesCount?: number | null;
  thumbnailUrl?: string | null;
  youtubeVideoId?: string | null;
  tags: string[];
  viewsCount: number;
  favoritesCount: number;
  createdAt: string;
  /** Wave 11.9 — additive Ghostscript pipeline keys (same contract as the list item). */
  pdfProcessingStatus?: 'Pending' | 'Normalizing' | 'Ready' | 'Failed' | null;
  processingError?: string | null;
  fontPipelineFixed?: boolean;
  /** R22.2 — see AdminLibraryFileListItem.diagnosticReport. */
  diagnosticReport?: string | null;
  /** R22.5.1 — see AdminLibraryFileListItem.healthStatus. */
  healthStatus?: string | null;
};

// ===== Push 3 / Track 3: advanced UI permissions =====

/** Wire shape of GET /api/v1/auth/admin/me/ui-permissions (drift-detection envelope). */
export type MyUiPermissions = {
  mode: 'super_admin' | 'unconfigured' | 'custom';
  isSuperAdmin: boolean;
  registryVersion: string;
  allKeys: string[];
  allowedKeys: string[];
};

/** Wire shape of GET /api/v1/admin/roles/{id}/ui-permissions. */
export type RoleUiPermissions = {
  configured: boolean;
  allowedKeys: string[] | null;
  registryVersion: string;
  allKeys: string[];
};

/** Resolves the current admin's UI-permission envelope. */
export async function fetchMyUiPermissions(token: string): Promise<MyUiPermissions> {
  return apiRequest<MyUiPermissions>('/api/v1/auth/admin/me/ui-permissions', token);
}

/** Reads the UI-permission configuration of one role (system or custom). */
export async function fetchRoleUiPermissions(token: string, roleId: string): Promise<RoleUiPermissions> {
  return apiRequest<RoleUiPermissions>(`/api/v1/admin/roles/${roleId}/ui-permissions`, token);
}

/** Replaces the UI-permission key set of a custom role (registry-validated server-side). */
export async function replaceRoleUiPermissions(token: string, roleId: string, allowedKeys: string[]): Promise<void> {
  await apiRequest<void>(
    `/api/v1/admin/roles/${roleId}/ui-permissions`,
    token,
    { method: 'PUT', body: JSON.stringify({ allowedKeys }) },
  );
}

/** Resets a custom role to unconfigured (NULL = full admin-web access). */
export async function clearRoleUiPermissions(token: string, roleId: string): Promise<void> {
  await apiRequest<void>(`/api/v1/admin/roles/${roleId}/ui-permissions`, token, { method: 'DELETE' });
}


// ===== Push 4 / Track 4: courses & multipart episodes =====

export type AdminCourseListItem = {
  id: string;
  subjectId: string;
  subjectName: string;
  title: string;
  status: string; // Draft | Published | Archived
  episodesCount: number;
  viewsCount: number;
  createdAt: string;
};

export type CourseEpisode = {
  id: string;
  courseId: string;
  title: string;
  episodeNumber: number;
  durationSeconds?: number | null;
  sourceType: 'Upload' | 'YouTube';
  fileSize?: number | null;
  contentType?: string | null;
  youtubeVideoId?: string | null;
  uploadCompleted: boolean;
  viewsCount: number;
  /** Push 10.4 media-metadata fields. Optional: the API does not expose them
   * yet (entities + migration shipped in 10.3; DTO wiring is future backend
   * work) — every reader degrades gracefully on absence. `difficulty`
   * accepts both the numeric value this UI sends (0|1|2) and the API's enum
   * strings; `processingStatus`/`processingError` mirror the transcoding
   * pipeline's state machine. */
  description?: string | null;
  difficulty?: number | string | null;
  processingStatus?: ProcessingStatus | null;
  /** English technical failure details (FFmpeg logs) — future field; feeds
   * the collapsible section of the processing error modal. */
  processingError?: string | null;
  /** Push 10.7 — admin-selected transcoding target ("Auto"|"P360"|"P720"|"P1080").
   * Absent on legacy rows → treat as Auto. */
  targetQuality?: string | null;
};

export type CourseDetail = {
  id: string;
  subjectId: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  status: string;
  episodesCount: number;
  createdAt: string;
  episodes: CourseEpisode[];
};

/**
 * Hotfix 10.8f — single-PUT upload: the API returns ONE presigned PUT URL for the
 * whole file (content type + declared size bound into the signature). The browser
 * PUTs the entire File against `uploadUrl` in a single XHR, then calls
 * complete-upload. No uploadId, no parts.
 */
export type InitiateUploadResponse = {
  episodeId: string;
  uploadUrl: string;
  fileKey: string;
};

/**
 * Legacy multipart resume status (pre-10.8f rows only). Hotfix 10.8f: new uploads
 * are single-PUT and never poll this — retained for the API surface only.
 */
export type MultipartStatus = {
  episodeId: string;
  uploadId: string;
  fileKey: string;
  partSizeBytes: number;
  partCount: number;
  uploadedParts: Array<{ partNumber: number; size: number; etag: string }>;
  pendingPartUrls: string[];
  /** Hotfix 10.6: false = no live multipart session (completed, aborted, or gone
   * upstream) — the upload panel resets gracefully instead of parsing a 400.
   * Absent (older API) = treat as active. */
  hasActiveUpload?: boolean;
};
