/** Style reminder — غرفة القيادة السريرية: production API calls stay explicit, fail visibly, and never persist credentials. */
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

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function readMessage(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const problem = payload as { detail?: string; title?: string; message?: string; errors?: Record<string, string[]> };
    if (problem.detail) return problem.detail;
    if (problem.message) return problem.message;
    if (problem.title) return problem.title;
    const first = Object.values(problem.errors ?? {}).flat()[0];
    if (first) return first;
  }
  return 'تعذر إتمام الطلب. حاول مرة أخرى.';
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
  if (!response.ok) throw new ApiError(readMessage(payload), response.status);
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
  if (!response.ok) throw new ApiError(readMessage(payload), response.status);
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

export type InitiateUploadResponse = {
  episodeId: string;
  uploadId: string;
  fileKey: string;
  partSizeBytes: number;
  partCount: number;
  partUrls: string[];
};

export type MultipartStatus = {
  episodeId: string;
  uploadId: string;
  fileKey: string;
  partSizeBytes: number;
  partCount: number;
  uploadedParts: Array<{ partNumber: number; size: number; etag: string }>;
  pendingPartUrls: string[];
};
