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
  /** PR-2 — machine-readable ProblemDetails extension emitted by every
   * DomainException (e.g. TWO_FACTOR_REQUIRED / TWO_FACTOR_INVALID on the
   * admin login challenge). Lets callers branch on the contract instead of
   * parsing localized sentences. */
  errorCode?: string;

  constructor(message: string, status: number, humanMessage?: string, technicalDetails?: string, errorCode?: string) {
    super(message);
    this.status = status;
    this.humanMessage = humanMessage;
    this.technicalDetails = technicalDetails;
    this.errorCode = errorCode;
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
  /** ProblemDetails extension carried by every DomainException response
   * (ExceptionHandlingMiddleware writes it as `errorCode`). */
  errorCode?: string;
}

function readProblem(payload: unknown): { message: string; humanMessage?: string; technicalDetails?: string; errorCode?: string } {
  if (payload && typeof payload === 'object') {
    const problem = payload as ProblemDetails;
    const message = problem.detail ?? problem.message ?? problem.title
      ?? Object.values(problem.errors ?? {}).flat()[0];
    return {
      message: message ?? 'تعذر إتمام الطلب. حاول مرة أخرى.',
      humanMessage: problem.humanMessage ?? problem.detail,
      technicalDetails: problem.technicalDetails,
      errorCode: problem.errorCode,
    };
  }
  return { message: 'تعذر إتمام الطلب. حاول مرة أخرى.' };
}

/**
 * Phase 6 (login resilience) — bounded network calls. A stalled request can
 * never leave the UI in an endless loading state: every fetch is wrapped with
 * an AbortController deadline and network-level failures are translated into
 * Arabic ApiErrors with stable errorCodes so callers can branch without
 * parsing sentences and without leaking infrastructure details.
 */
export const NETWORK_ERROR_CODES = {
  timeout: 'NETWORK_TIMEOUT',
  unreachable: 'NETWORK_UNREACHABLE',
} as const;

const NETWORK_TIMEOUTS_MS = {
  // Login gets the longest budget: the API's hosting tier cold-starts (observed
  // 26–71s), and a login attempt that outlasts a cold start is far better UX
  // than a false "connection failed" on the first attempt of the day. The
  // bound stays finite — the button can never hang forever — and the visible
  // progress label keeps the operator informed while it waits.
  login: 75_000,
  refresh: 30_000,
  request: 45_000,
  download: 300_000,
} as const;

function isAbortError(error: unknown): boolean {
  // Deliberately NOT `instanceof Error`: DOMException does not inherit from
  // Error in every runtime (Node/jsdom), and the abort signal is identified
  // by its `name` per the fetch specification.
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) {
      // Bounded timeout tripped — recoverable, no infrastructure detail leaked.
      throw new ApiError(
        'انتهت مهلة الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.',
        0,
        'انتهت مهلة الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.',
        undefined,
        NETWORK_ERROR_CODES.timeout,
      );
    }
    if (error instanceof TypeError) {
      // fetch() rejects with TypeError on network-layer failure (DNS, refused, offline).
      throw new ApiError(
        'تعذر الوصول إلى الخادم. تحقق من الاتصال بالشبكة ثم أعد المحاولة.',
        0,
        'تعذر الوصول إلى الخادم. تحقق من الاتصال بالشبكة ثم أعد المحاولة.',
        undefined,
        NETWORK_ERROR_CODES.unreachable,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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

  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, { ...init, headers }, NETWORK_TIMEOUTS_MS.request);
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = readProblem(payload);
    throw new ApiError(problem.message, response.status, problem.humanMessage, problem.technicalDetails, problem.errorCode);
  }
  return payload as T;
}

/**
 * PR-4 — authenticated FILE download (the authorized question-bank CSV export).
 * Unlike apiRequest, this returns the raw Blob (no JSON parsing) and triggers a
 * browser download with the server's Content-Disposition filename. Errors still
 * surface as ApiError (the backend rejects with ProblemDetails JSON, which the
 * catch branch parses).
 */
export async function apiDownload(path: string, token: string, init?: RequestInit): Promise<{ blob: Blob; fileName: string }> {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, { ...init, headers }, NETWORK_TIMEOUTS_MS.download);
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const problem = readProblem(payload);
    throw new ApiError(problem.message, response.status, problem.humanMessage, problem.technicalDetails, problem.errorCode);
  }
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const fileName = match?.[1] ?? 'export.csv';
  const blob = await response.blob();
  return { blob, fileName };
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

/**
 * PR-2 — admin login with the backend's optional 2FA challenge.
 * `twoFactorCode` is omitted on the first attempt; when the backend answers
 * TWO_FACTOR_REQUIRED (password already verified), the caller re-submits
 * with the code from the operator's authenticator. The backend defines the
 * contract: TWO_FACTOR_REQUIRED / TWO_FACTOR_INVALID / TWO_FACTOR_REPLAY
 * arrive as ProblemDetails `errorCode` extensions (DomainException 400s).
 */
export async function login(
  email: string,
  password: string,
  twoFactorCode?: string,
): Promise<{ accessToken: string; refreshToken: string; user: AdminUser }> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      twoFactorCode: twoFactorCode?.trim() || null,
      installationId: getOrCreateInstallationId(),
    }),
  }, NETWORK_TIMEOUTS_MS.login);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = readProblem(payload);
    throw new ApiError(problem.message, response.status, problem.humanMessage, problem.technicalDetails, problem.errorCode);
  }
  // FIX-1: Backend returns { accessToken, refreshToken, tokenType, expiresIn, user }
  const result = payload as { accessToken: string; refreshToken: string; tokenType: string; expiresIn: number; user: AdminUser };
  return { accessToken: result.accessToken, refreshToken: result.refreshToken, user: result.user };
}

// FIX-1: Refresh token mechanism — calls /auth/refresh to get new accessToken
export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken, installationId: getOrCreateInstallationId() }),
    }, NETWORK_TIMEOUTS_MS.refresh);
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
  /** Wave 13 (F3) — HTML player pipeline (additive server keys; absent on legacy
   *  API responses → undefined). contentProcessingStatus is null for non-HTML rows. */
  contentProcessingStatus?: 'Pending' | 'Sanitized' | 'CSPApplied' | 'Ready' | 'Failed' | null;
  /** Trusted interactive-lesson flag (text/html only) — drives the student sandbox. */
  enableScripts?: boolean;
  /** PR-5 — provider-neutral object-retention lifecycle (additive server keys;
   *  absent on legacy/active rows → undefined = Active). */
  viewsCount?: number;
  favoritesCount?: number;
  retentionState?: 'RetentionPending' | 'Quarantined' | null;
  quarantinedAt?: string | null;
  quarantinedBy?: string | null;
  quarantineReason?: string | null;
  tombstonedAt?: string | null;
  tombstonedBy?: string | null;
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
  /** Wave 13 (F3) — see AdminLibraryFileListItem.contentProcessingStatus. */
  contentProcessingStatus?: 'Pending' | 'Sanitized' | 'CSPApplied' | 'Ready' | 'Failed' | null;
  /** Wave 13 (F3) — see AdminLibraryFileListItem.enableScripts. */
  enableScripts?: boolean;
};

// ===== Push 3 / Track 3: advanced UI permissions =====
// (W23.4/B6-2: the dead MyUiPermissions type + fetchMyUiPermissions helper were
// removed — the live fetch path is hooks/useUiPermissionsBundle.ts, which reads
// /api/v1/auth/admin/me/ui-permissions directly with the UiPermissionsBundle shape
// from lib/uiPermissions.ts.)

/** Wire shape of GET /api/v1/admin/roles/{id}/ui-permissions. */
export type RoleUiPermissions = {
  configured: boolean;
  allowedKeys: string[] | null;
  registryVersion: string;
  allKeys: string[];
};

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

// ===== Command Center P1 — system maintenance (SuperAdmin only, re-auth'd) =====

/** One wiped/hard-deleted table with its affected row count (machine label; the UI translates). */
export type WipeTableCount = { table: string; rows: number };

/** POST /api/v1/admin/system/wipe result — dryRun previews counts, real runs return deletions. */
export type WipeResult = { module: string; dryRun: boolean; tables: WipeTableCount[] };

/** POST /api/v1/admin/system/hard-delete result. */
export type HardDeleteResult = { module: string; targetId: string; deleted: WipeTableCount[] };

export type WipeRequest = {
  module: string;
  /** Typed confirmation — "DELETE" or "حذف" (the backend accepts both). */
  confirmText: string;
  /** The acting super admin's password (re-auth, mirrors admin deletion). */
  actorPassword: string;
  /** true = per-table row counts only, nothing is deleted. */
  dryRun: boolean;
};

export type HardDeleteRequest = {
  module: string;
  targetId: string;
  actorPassword: string;
  /** Explicit opt-in to delete cross-domain children (otherwise the API fails loudly with counts). */
  cascade: boolean;
};

/** Wipe a data module (SuperAdmin + re-auth + typed confirmation). */
export function adminWipe(token: string, request: WipeRequest): Promise<WipeResult> {
  return apiRequest<WipeResult>('/api/v1/admin/system/wipe', token, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/** Hard-delete one entity, bypassing soft-delete (SuperAdmin + re-auth). */
export function adminHardDelete(token: string, request: HardDeleteRequest): Promise<HardDeleteResult> {
  return apiRequest<HardDeleteResult>('/api/v1/admin/system/hard-delete', token, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * PR-1: backend hard-delete flag state (GET /api/v1/admin/system/hard-delete/status).
 * Read-only mirror for the UI — the flag is enforced server-side in the handler, so
 * this only lets the Danger Zone show an honest "disabled in this environment" state.
 */
export type HardDeleteStatus = { enabled: boolean };

export function adminHardDeleteStatus(token: string): Promise<HardDeleteStatus> {
  return apiRequest<HardDeleteStatus>('/api/v1/admin/system/hard-delete/status', token);
}

// ===== PR-6 — Student Center completion + Security Center =====

/** Contract B — GET /api/v1/admin/students/{id} (student detail). */
export type StudentDetailDto = {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  gender?: string | null;
  avatarUrl?: string | null;
  status: string;
  banReason?: string | null;
  banUntil?: string | null;
  lockedOut?: boolean;
  lockoutUntil?: string | null;
  failedLoginCount?: number;
  phoneVerified?: boolean;
  mustChangePassword?: boolean;
  archived?: boolean;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  lastLogin?: string | null;
  loginCount?: number;
  lastActivityDate?: string | null;
  questionsAnswered: number;
  correctAnswers?: number;
  accuracy: number;
  currentStreak?: number;
  longestStreak?: number;
  academic?: {
    universityId: string;
    universityName: string;
    collegeId: string;
    collegeName: string;
    academicYearId: string;
    academicYearName: string;
  } | null;
  subscriptionSummary?: {
    activeCount: number;
    latest?: { id: string; status: string; scopeType: string; startsAt: string; expiresAt: string } | null;
  } | null;
  activeDevice?: { deviceName: string; deviceType: string; os: string; browser: string; boundAt: string; lastUsed?: string | null } | null;
};

/** Contract C — one row of GET /api/v1/admin/students/{id}/activity. */
export type StudentActivityItem = {
  id: string;
  eventType: string;
  severity: string;
  description: string;
  ipAddress?: string | null;
  deviceFingerprint?: string | null;
  correlationId?: string | null;
  createdAt: string;
  adminName?: string | null;
  actorType?: string | null;
};

export type StudentActivityParams = {
  page?: number;
  pageSize?: number;
  type?: string;
  severity?: string;
  dateFrom?: string;
  dateTo?: string;
};

/** Contract A — POST /api/v1/admin/students/{id}/password-reset body. */
export type StudentPasswordResetRequest = {
  actorPassword: string;
  newPassword: string;
  forceChangeOnNextLogin: boolean;
};

/** Contract F — GET /api/v1/security/summary. */
export type SecuritySummaryDto = {
  generatedAt: string;
  failedLogins24h: number;
  failedLogins7d: number;
  activeLockouts: number;
  refreshReuse7d: number;
  mfaEnabled7d: number;
  mfaDisabled7d: number;
  mfaFailed7d: number;
  criticalEvents7d: number;
  suspiciousAlerts7d: number;
  passwordResets7d: number;
  topFailedLoginIps24h: Array<{ ipAddress: string; count: number }>;
};

/** Contract G — one row of GET /api/v1/security/audit-logs. */
export type SecurityEventItem = {
  id: string;
  eventType: string;
  severity: string;
  description: string;
  ipAddress?: string | null;
  deviceFingerprint?: string | null;
  correlationId?: string | null;
  createdAt: string;
  studentId?: string | null;
  studentName?: string | null;
  adminId?: string | null;
  adminName?: string | null;
};

export type SecurityEventParams = {
  page?: number;
  pageSize?: number;
  studentId?: string;
  adminId?: string;
  eventType?: string;
  severity?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
};

/** Reads one student's detail (contract B). */
export function fetchStudentDetail(id: string, token: string): Promise<StudentDetailDto> {
  return apiRequest<StudentDetailDto>(`/api/v1/admin/students/${id}`, token);
}

/** Password reset with actor re-auth (contract A). 204 on success. */
export function resetStudentPassword(id: string, token: string, body: StudentPasswordResetRequest): Promise<void> {
  return apiRequest<void>(`/api/v1/admin/students/${id}/password-reset`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Soft delete (contract D). 204, idempotent. */
export function archiveStudent(id: string, token: string): Promise<void> {
  return apiRequest<void>(`/api/v1/admin/students/${id}/archive`, token, { method: 'POST' });
}

/** Undo soft delete (contract D). 204, idempotent. */
export function restoreStudent(id: string, token: string): Promise<void> {
  return apiRequest<void>(`/api/v1/admin/students/${id}/restore`, token, { method: 'POST' });
}

/** Paged student activity (contract C). */
export function fetchStudentActivity(id: string, token: string, params: StudentActivityParams = {}): Promise<PagedResult<StudentActivityItem>> {
  const search = new URLSearchParams({
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 20),
  });
  if (params.type) search.set('type', params.type);
  if (params.severity) search.set('severity', params.severity);
  if (params.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params.dateTo) search.set('dateTo', params.dateTo);
  return apiRequest<PagedResult<StudentActivityItem>>(`/api/v1/admin/students/${id}/activity?${search.toString()}`, token);
}

/** Security-center metrics (contract F). */
export function fetchSecuritySummary(token: string): Promise<SecuritySummaryDto> {
  return apiRequest<SecuritySummaryDto>('/api/v1/security/summary', token);
}

/** Full audit-log events (contract G — existing endpoint, reused here). */
export function fetchSecurityEvents(token: string, params: SecurityEventParams = {}): Promise<PagedResult<SecurityEventItem>> {
  const search = new URLSearchParams({
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 25),
  });
  if (params.studentId) search.set('studentId', params.studentId);
  if (params.adminId) search.set('adminId', params.adminId);
  if (params.eventType) search.set('eventType', params.eventType);
  if (params.severity) search.set('severity', params.severity);
  if (params.dateFrom) search.set('dateFrom', params.dateFrom);
  if (params.dateTo) search.set('dateTo', params.dateTo);
  if (params.search) search.set('search', params.search);
  return apiRequest<PagedResult<SecurityEventItem>>(`/api/v1/security/audit-logs?${search.toString()}`, token);
}

// ===== PR-7 — Settings Studio + Role Studio =====

/** Value-type discriminators carried by the settings list/get DTO (server registry). */
export type SettingValueType = 'bool' | 'int' | 'enum' | 'string';

/**
 * System settings list/get DTO. PR-7: the server registry now sends `valueType`
 * ("bool"|"int"|"enum"|"string") and, for enum keys, the `allowedValues` list —
 * the UI renders typed controls from these instead of guessing. Unregistered
 * keys arrive as "string" (server fills SystemSettingSchema.StringType).
 */
export type SystemSettingDto = {
  id: string;
  key: string;
  value: string;
  valueType: SettingValueType;
  allowedValues?: string[] | null;
  description?: string | null;
  category?: string | null;
  updatedBy?: string | null;
  updatedAt: string;
  createdAt: string;
};

/** One row of GET /api/v1/admin/settings/{key}/history (append-only audit trail). */
export type SystemSettingHistoryItem = {
  id: string;
  key: string;
  oldValue?: string | null;
  newValue?: string | null;
  changedBy?: string | null;
  changedByName?: string | null;
  changedAt: string;
  /** "update" | "reset" (server writes exactly these two). */
  reason: string;
};

/** Paged setting change history (Settings.View permission; page size 10 in the drawer). */
export function fetchSettingHistory(
  key: string,
  token: string,
  page = 1,
  pageSize = 10,
): Promise<PagedResult<SystemSettingHistoryItem>> {
  const search = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return apiRequest<PagedResult<SystemSettingHistoryItem>>(
    `/api/v1/admin/settings/${encodeURIComponent(key)}/history?${search.toString()}`,
    token,
  );
}

/** GET /api/v1/admin/settings/feature-flags row — read-only by contract (editable is always false). */
export type FeatureFlagItem = {
  key: string;
  rawEnvName: string;
  value: string;
  valueType: 'bool' | 'int';
  source: 'environment' | 'default';
  editable: false;
};

/** Read-only environment feature-flag inventory (super-admin only; non-super → 403). */
export function fetchFeatureFlags(token: string): Promise<FeatureFlagItem[]> {
  return apiRequest<FeatureFlagItem[]>('/api/v1/admin/settings/feature-flags', token);
}

/**
 * GET /api/v1/admin/admins/{id}/effective-permissions — the Role Studio
 * effective-access inspector DTO. AccessSource: "super_admin_bypass" (grants
 * list empty — the role-name bypass, not grant rows) or "role_grants" (the
 * role's classic permission rows). UiPermissions Mode: "full" (super admin or
 * NULL/unconfigured role) or "custom" (a configured key list).
 */
export type AdminEffectivePermissionsDto = {
  adminId: string;
  email: string;
  fullName: string;
  isActive: boolean;
  role: { id: string; name: string; nameAr: string; isActive: boolean };
  isSuperAdmin: boolean;
  accessSource: 'super_admin_bypass' | 'role_grants';
  grants: Array<{ resource: string; actions: string[]; scope: string }>;
  uiPermissions: { mode: 'full' | 'custom'; allowedKeysCount: number; registryVersion: string };
  academicScope: {
    universityId?: string | null;
    universityName?: string | null;
    collegeId?: string | null;
    collegeName?: string | null;
    yearId?: string | null;
    yearName?: string | null;
    subjectId?: string | null;
    subjectName?: string | null;
  };
};

/** Reads one administrator's effective access (SuperAdmin-gated endpoint). */
export function fetchAdminEffectivePermissions(token: string, adminId: string): Promise<AdminEffectivePermissionsDto> {
  return apiRequest<AdminEffectivePermissionsDto>(
    `/api/v1/admin/admins/${encodeURIComponent(adminId)}/effective-permissions`,
    token,
  );
}

// ===== PR-9 — Servers Dashboard (read-only provider monitoring, PR-8 backend) =====

/**
 * Wire contract: apps/api/src/CMS.Application/DTOs/Monitoring/MonitoringDtos.cs
 * (camelCase on the wire). The DTO surface is STABLE; raw provider JSON never
 * passes through, and no tokens/headers/connection material ever appear in any
 * envelope — the client mirrors exactly the mapped fields below.
 */

/** The four monitored provider names (also the URL segment). */
export type ServersProviderName = 'render' | 'vercel' | 'neon' | 'github';

/** Whether an envelope came from the 60s provider cache + age of the original check. */
export type ProviderFreshness = {
  cached: boolean;
  ageSeconds: number;
};

/**
 * Stable provider envelope. `responseTimeMs` is -1 when NO upstream call was
 * attempted at all (missing_credentials / circuit-open) — the UI renders
 * «غير متاح» for that value and never invents a number.
 */
export type ProviderEnvelope<TData> = {
  provider: string;
  status: string;
  checkedAt: string;
  responseTimeMs: number;
  unavailableReason?: string | null;
  freshness: ProviderFreshness;
  data?: TData | null;
};

// ===== Render payload =====

export type RenderServiceInfo = {
  id: string;
  name: string;
  suspended: boolean;
  autoDeploy: boolean;
  plan: string;
  region?: string | null;
};

export type RenderDeployInfo = {
  id: string;
  status: string;
  commitSha: string;
  commitMessage?: string | null;
  createdAt?: string | null;
  finishedAt?: string | null;
};

/** Render provider payload (metrics are not exposed on the free plan). */
export type RenderServersData = {
  service: RenderServiceInfo | null;
  lastDeploy: RenderDeployInfo | null;
  metricsAvailable: boolean;
  metricsUnavailableReason: string;
};

// ===== Vercel payload =====

export type VercelDeploymentInfo = {
  id: string;
  state: string;
  target?: string | null;
  commitSha?: string | null;
  commitRef?: string | null;
  createdAt?: string | null;
  readyAt?: string | null;
};

export type VercelProjectInfo = {
  id: string;
  name: string;
  latestDeployment?: VercelDeploymentInfo | null;
  url?: string | null;
};

/** Vercel provider payload: BOTH the admin and the student projects. */
export type VercelServersData = {
  projects: VercelProjectInfo[];
};

// ===== Neon payload =====

export type NeonProjectInfo = {
  id: string;
  name: string;
  regionId?: string | null;
};

export type NeonBranchInfo = {
  id: string;
  name: string;
  isDefault?: boolean | null;
  protected?: boolean | null;
  state?: string | null;
};

/**
 * Neon provider payload. Deliberately contains NO connection material of any
 * kind — the client never requests or renders it.
 */
export type NeonServersData = {
  project: NeonProjectInfo | null;
  branch: NeonBranchInfo | null;
  usage: unknown;
  usageUnavailableReason: string;
};

// ===== GitHub payload =====

export type GithubRepositoryInfo = {
  name: string;
  fullName: string;
  visibility: string;
  defaultBranch: string;
  pushedAt?: string | null;
  openIssuesCount?: number | null;
};

export type GithubWorkflowRunInfo = {
  id: number;
  name: string;
  headSha: string;
  status?: string | null;
  conclusion?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type GithubServersData = {
  repository: GithubRepositoryInfo | null;
  recentWorkflows: GithubWorkflowRunInfo[];
};

// ===== Summary + history =====

/** Lightweight per-provider head row of the summary strip. */
export type ServersProviderHead = {
  provider: string;
  status: string;
  checkedAt: string;
  responseTimeMs: number;
  unavailableReason?: string | null;
  freshness: ProviderFreshness;
  note: string;
};

export type ServersSummary = {
  overallStatus: string;
  checkedAt: string;
  providers: ServersProviderHead[];
};

/** One recorded check outcome in the bounded in-memory history ring. */
export type ProviderHistoryItem = {
  checkedAt: string;
  status: string;
  responseTimeMs: number;
  reason?: string | null;
};

export type ProviderHistory = {
  provider: string;
  capacity: number;
  windowNote: string;
  items: ProviderHistoryItem[];
};

/** GET /api/v1/admin/servers/summary (+ ?fresh=true to bypass the 60s cache read). */
export function fetchServersSummary(token: string, fresh?: boolean): Promise<ServersSummary> {
  const query = fresh ? '?fresh=true' : '';
  return apiRequest<ServersSummary>(`/api/v1/admin/servers/summary${query}`, token);
}

/**
 * GET /api/v1/admin/servers/{render|vercel|neon|github} (+ ?fresh=true).
 * Literal-typed overloads below; the generic tail covers loop-driven callers.
 */
export function fetchServersProvider(token: string, provider: 'render', fresh?: boolean): Promise<ProviderEnvelope<RenderServersData>>;
export function fetchServersProvider(token: string, provider: 'vercel', fresh?: boolean): Promise<ProviderEnvelope<VercelServersData>>;
export function fetchServersProvider(token: string, provider: 'neon', fresh?: boolean): Promise<ProviderEnvelope<NeonServersData>>;
export function fetchServersProvider(token: string, provider: 'github', fresh?: boolean): Promise<ProviderEnvelope<GithubServersData>>;
export function fetchServersProvider<TData>(token: string, provider: ServersProviderName, fresh?: boolean): Promise<ProviderEnvelope<TData>>;
export function fetchServersProvider<TData>(token: string, provider: ServersProviderName, fresh?: boolean): Promise<ProviderEnvelope<TData>> {
  const query = fresh ? '?fresh=true' : '';
  return apiRequest<ProviderEnvelope<TData>>(`/api/v1/admin/servers/${provider}${query}`, token);
}

/** GET /api/v1/admin/servers/{provider}/history — bounded in-memory check history. */
export function fetchServersHistory(token: string, provider: ServersProviderName): Promise<ProviderHistory> {
  return apiRequest<ProviderHistory>(`/api/v1/admin/servers/${provider}/history`, token);
}
