import { apiClient } from '@/services/api-client';

/**
 * Wave 16.4 — the student settings feature's API surface.
 *
 * /student/preferences (W15.0 backend): a schema-free JSON object on the
 * student account (≤ 8 KB). PUT REPLACES the whole object, so every write
 * must be a read-merge-write to preserve keys owned by other features
 * (e.g. the exam-courses cascade filters).
 *
 * /system/version (Wave 16.4 backend, C3-limited): the dynamic platform
 * version shown in Settings → «حول».
 */
export type StudentPreferences = Record<string, unknown>;

export const FALLBACK_PLATFORM_VERSION = '1.0.0';

export async function getStudentPreferences(): Promise<StudentPreferences> {
  const { data } = await apiClient.get('/student/preferences');
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as StudentPreferences) : {};
}

export async function saveStudentPreferences(next: StudentPreferences): Promise<StudentPreferences> {
  const { data } = await apiClient.put('/student/preferences', next);
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as StudentPreferences) : {};
}

export async function getPlatformVersion(): Promise<string> {
  const { data } = await apiClient.get('/system/version');
  const version = (data as { version?: unknown } | undefined)?.version;
  return typeof version === 'string' && version.trim() ? version.trim() : FALLBACK_PLATFORM_VERSION;
}
