/** Style reminder — غرفة القيادة السريرية: production API calls stay explicit, fail visibly, and never persist credentials. */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'https://cms-api-preview.onrender.com').replace(/\/$/, '');

export type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
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
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(readMessage(payload), response.status);
  return payload as T;
}

export async function login(email: string, password: string): Promise<{ accessToken: string; user: AdminUser }> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, twoFactorCode: null, installationId: 'cms-admin-web-production' }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(readMessage(payload), response.status);
  return payload as { accessToken: string; user: AdminUser };
}
