/**
 * Wave 1 (UX 1D) — feature-detected access to the HOSTED COURSE EPISODE
 * offline surface of `window.CmsNative`. The Kotlin methods do NOT exist yet
 * (Wave 5 adds them in apps/android); the names are the cross-wave CONTRACT
 * and must stay exact:
 *
 *   listOfflineCourseEpisodes(): string            -> JSON array of safe rows
 *   ensureCourseEpisodeLocal(episodeJson): string  -> async start -> status code
 *   courseEpisodeStatus(episodeId): string
 *   removeOfflineCourseEpisode(episodeId): string
 *   openOfflineCourseEpisode(episodeId): string
 *
 * Same honesty contract as native-cache.ts / native-packages.ts: in a plain
 * browser (or an older shell without the five methods) every helper returns
 * null/false and the UI explains itself instead of faking an empty list.
 */

import { hasNativeShell } from './native-bridge';

/** Typed shape of the course-episode surface — mirrors the future Kotlin @JavascriptInterface methods. */
interface CmsNativeCourseBridge {
  listOfflineCourseEpisodes(): string;
  ensureCourseEpisodeLocal(episodeJson: string): string;
  courseEpisodeStatus(episodeId: string): string;
  removeOfflineCourseEpisode(episodeId: string): string;
  openOfflineCourseEpisode(episodeId: string): string;
}

const NATIVE_BRIDGE_NAME = 'CmsNative';
const COURSE_METHODS: Array<keyof CmsNativeCourseBridge> = [
  'listOfflineCourseEpisodes',
  'ensureCourseEpisodeLocal',
  'courseEpisodeStatus',
  'removeOfflineCourseEpisode',
  'openOfflineCourseEpisode',
];

/** Mirror of native-cache.ts's defensive id guard. */
const MAX_EPISODE_ID_LENGTH = 256;
/** Title strings come from our own API rows; a generous cap keeps hostile payloads out of the UI. */
const MAX_EPISODE_TITLE_LENGTH = 256;
/** Hard ceiling on the rows the bridge may report (defensive, display only). */
const MAX_EPISODE_ROWS = 500;

/** One downloaded course-episode row exactly as the native side reports it (safe metadata only). */
export interface NativeOfflineCourseEpisodeRow {
  episodeId: string;
  courseId?: string;
  title?: string;
  type?: 'video' | 'audio';
  bytes?: number;
  status?: string;
  downloadedAt?: string;
  lastAccessAt?: string;
}

/** Request payload for ensureCourseEpisodeLocal — serialized by the wrapper itself. */
export interface NativeCourseEpisodeDownloadInput {
  episodeId: string;
  courseId?: string;
  title?: string;
  assetType?: string;
}

const EPISODE_TYPES: ReadonlyArray<NativeOfflineCourseEpisodeRow['type']> = ['video', 'audio'];

/**
 * Arabic honesty (Owner decision 5, tailored for the courses tab): YouTube
 * episodes never enter the offline cache — the web embed stays the only
 * viewer and needs connectivity.
 */
export const YOUTUBE_EPISODE_OFFLINE_NOTE =
  'حلقات يوتيوب تُشاهَد من الويب فقط عند توفر الاتصال — لا تُحمَّل للعرض دون اتصال.';

function readCourseBridge(): CmsNativeCourseBridge | null {
  const candidate = (globalThis as unknown as Record<string, unknown>)[NATIVE_BRIDGE_NAME];
  if (!candidate || typeof candidate !== 'object') return null;
  const bridge = candidate as unknown as Record<string, unknown>;
  if (COURSE_METHODS.some((method) => typeof bridge[method] !== 'function')) return null;
  return candidate as unknown as CmsNativeCourseBridge;
}

/** True only inside the shell AND when the bridge carries the course-episode surface (Wave 5+ builds). */
export function isNativeCoursesSurfaceActive(): boolean {
  if (!hasNativeShell()) return false;
  return readCourseBridge() !== null;
}

/** Validates one opaque id: non-blank, trimmed, length-capped. */
function validId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!id || id.length > MAX_EPISODE_ID_LENGTH) return null;
  return id;
}

/** Validates an optional safe-string field: trimmed, capped, undefined when junk. */
function validOptionalText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text.length > max) return undefined;
  return text;
}

/**
 * Lists every downloaded course episode (safe metadata rows). Returns null
 * outside the shell, on bridge errors, or on a malformed payload — callers
 * fall back to the honest unavailable/empty states.
 */
export function nativeListOfflineCourseEpisodes(): NativeOfflineCourseEpisodeRow[] | null {
  const bridge = readCourseBridge();
  if (!bridge) return null;
  try {
    const raw = bridge.listOfflineCourseEpisodes();
    if (typeof raw !== 'string' || raw.length === 0) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const rows: NativeOfflineCourseEpisodeRow[] = [];
    for (const entry of parsed) {
      if (rows.length >= MAX_EPISODE_ROWS) break;
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const episodeId = validId(row.episodeId);
      if (!episodeId) continue; // malformed row — dropped, fail closed
      rows.push({
        episodeId,
        courseId: validId(row.courseId) ?? undefined,
        title: validOptionalText(row.title, MAX_EPISODE_TITLE_LENGTH),
        type: EPISODE_TYPES.includes(row.type as NativeOfflineCourseEpisodeRow['type'])
          ? (row.type as NativeOfflineCourseEpisodeRow['type'])
          : undefined,
        bytes: typeof row.bytes === 'number' && Number.isFinite(row.bytes) && row.bytes > 0 ? row.bytes : undefined,
        status: validOptionalText(row.status, 64),
        downloadedAt: typeof row.downloadedAt === 'string' ? row.downloadedAt : undefined,
        lastAccessAt: typeof row.lastAccessAt === 'string' ? row.lastAccessAt : undefined,
      });
    }
    return rows;
  } catch {
    return null;
  }
}

/**
 * Starts an async hosted-episode download. Serializes the episode JSON itself
 * ({episodeId, courseId?, title?, assetType?}) and returns the native status
 * code, or null outside the shell / on a call failure / on an invalid episode id.
 */
export function nativeEnsureCourseEpisodeLocal(input: NativeCourseEpisodeDownloadInput): string | null {
  const bridge = readCourseBridge();
  if (!bridge) return null;
  const episodeId = input.episodeId?.trim();
  if (!episodeId || episodeId.length > MAX_EPISODE_ID_LENGTH) return null;
  const request: Record<string, string> = { episodeId };
  const courseId = input.courseId?.trim();
  if (courseId) request.courseId = courseId;
  const title = input.title?.trim();
  if (title) request.title = title.slice(0, MAX_EPISODE_TITLE_LENGTH);
  const assetType = input.assetType?.trim();
  if (assetType) request.assetType = assetType;
  try {
    const code = bridge.ensureCourseEpisodeLocal(JSON.stringify(request));
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/** Reads courseEpisodeStatus(episodeId); null outside the shell / on failure. */
export function nativeCourseEpisodeStatus(episodeId: string): string | null {
  const bridge = readCourseBridge();
  if (!bridge) return null;
  const id = episodeId.trim();
  if (!id || id.length > MAX_EPISODE_ID_LENGTH) return null;
  try {
    const code = bridge.courseEpisodeStatus(id);
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/** Deletes one downloaded episode; returns the native code or null outside the shell. */
export function nativeRemoveOfflineCourseEpisode(episodeId: string): string | null {
  const bridge = readCourseBridge();
  if (!bridge) return null;
  const id = episodeId.trim();
  if (!id || id.length > MAX_EPISODE_ID_LENGTH) return null;
  try {
    const code = bridge.removeOfflineCourseEpisode(id);
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/** Opens one downloaded episode in the native player; native code or null. */
export function nativeOpenOfflineCourseEpisode(episodeId: string): string | null {
  const bridge = readCourseBridge();
  if (!bridge) return null;
  const id = episodeId.trim();
  if (!id || id.length > MAX_EPISODE_ID_LENGTH) return null;
  try {
    const code = bridge.openOfflineCourseEpisode(id);
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/** Arabic denial/error messages — same code map as packages, texts tailored to course episodes. */
export function nativeCourseDenyMessage(code: string): string | null {
  switch (code) {
    case 'denied_native_session':
      return 'لتخزين حلقات الكورس دون اتصال سجّل الدخول أولاً ثم أعد المحاولة.';
    case 'denied_auth':
      return 'لم تعد هذه الحلقة متاحة لحسابك.';
    case 'denied_offline':
      return 'لا يوجد اتصال — تحميل حلقات الكورس يحتاج اتصالاً مرة واحدة.';
    case 'denied_stale':
      return 'انتهت صلاحية النسخة المحفوظة من هذه الحلقة.';
    case 'denied_disabled':
      return 'تحميل حلقات الكورس دون اتصال غير مفعّل في هذا الإصدار من التطبيق.';
    case 'quota':
    case 'error:quota':
      return 'مساحة التخزين دون اتصال ممتلئة — احذف بعض الحلقات أو الملفات من «وضع بدون إنترنت».';
    case 'invalid_args':
      return null; // our own request shape is at fault — silent fallback, no user-facing noise
    default:
      if (code.startsWith('error')) return 'حدث خطأ أثناء تجهيز الحلقة دون اتصال.';
      return null;
  }
}

/** Toast copy for an ensureCourseEpisodeLocal start result (W1 CTA contract — no polling). */
export function nativeCourseDownloadToast(code: string | null): { kind: 'info' | 'error'; message: string } {
  if (code === null) return { kind: 'error', message: 'تعذّر بدء تحميل الحلقة دون اتصال — أعد المحاولة.' };
  if (code === 'started' || code === 'queued' || code.startsWith('downloading')) {
    return { kind: 'info', message: 'بدأ تحميل الحلقة… تابع التقدم من لوحة «وضع بدون إنترنت».' };
  }
  if (code === 'ready') return { kind: 'info', message: 'الحلقة محفوظة مسبقاً.' };
  const deny = nativeCourseDenyMessage(code);
  return { kind: 'error', message: deny ?? 'تعذّر بدء تحميل الحلقة دون اتصال — أعد المحاولة.' };
}
