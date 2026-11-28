/**
 * Batch 4 — native encrypted media cache helpers for `window.CmsNative`'s cache
 * surface (the seven methods the Android shell added on top of the four Batch-3
 * identity methods). Everything is feature-detected: in a plain browser every
 * helper returns null/false and callers keep the existing web behavior.
 *
 * The native side re-checks the HTTPS origin allowlist per call; outside the
 * allowlisted origin the bridge returns safe deny/absent codes, which the
 * helpers surface as-is so the caller can fall back to the web path.
 */

import { hasNativeShell } from './native-bridge';

/** Cacheable library-file kinds the native side can store and open. */
export type NativeCacheType = 'pdf' | 'txt' | 'html' | 'image' | 'video' | 'audio';

/** Typed shape of the cache surface — mirrors the Kotlin @JavascriptInterface methods. */
interface CmsNativeCacheBridge {
  ensureLocal(contentId: string, type: string, hintsJson?: string): string;
  openLocal(contentId: string): string;
  cacheStatus(contentId: string): string;
  cancelDownload?(contentId: string): string;
}

/** Owner decision 2026-11-28 — the shared per-type storage summary surface. */
interface CmsNativeStorageSummaryBridge {
  getOfflineStorageSummary(): string;
}

/** Night Task 3 — the catalog surface (listCached/removeCached) the Batch-4
 *  bridge also carries; feature-detected independently so older shells that
 *  expose only the trio above keep working. */
interface CmsNativeCatalogBridge {
  listCached(): string;
  removeCached(contentId: string): string;
}

const NATIVE_BRIDGE_NAME = 'CmsNative';
const CACHE_METHODS: Array<keyof CmsNativeCacheBridge> = ['ensureLocal', 'openLocal', 'cacheStatus'];
const CATALOG_METHODS: Array<keyof CmsNativeCatalogBridge> = ['listCached', 'removeCached'];

/** One cached-object row exactly as the native side reports it (safe metadata only). */
export interface NativeCachedItem {
  contentId: string;
  type: string;
  title?: string;
  bytes?: number;
  createdAt?: string;
  lastAccessAt?: string;
}

function readCatalogBridge(): CmsNativeCatalogBridge | null {
  const candidate = (globalThis as unknown as Record<string, unknown>)[NATIVE_BRIDGE_NAME];
  if (!candidate || typeof candidate !== 'object') return null;
  const bridge = candidate as unknown as Record<string, unknown>;
  if (CATALOG_METHODS.some((method) => typeof bridge[method] !== 'function')) return null;
  return candidate as unknown as CmsNativeCatalogBridge;
}

/** Viewer kinds that map onto a native cache type. */
const CACHEABLE_KINDS: Record<string, NativeCacheType> = {
  pdf: 'pdf',
  txt: 'txt',
  text: 'txt',
  html: 'html',
  image: 'image',
  video: 'video',
  audio: 'audio',
};

/** Max length guard for ids coming from our own API rows (defensive). */
const MAX_CONTENT_ID_LENGTH = 256;

function readCacheBridge(): CmsNativeCacheBridge | null {
  const candidate = (globalThis as unknown as Record<string, unknown>)[NATIVE_BRIDGE_NAME];
  if (!candidate || typeof candidate !== 'object') return null;
  const bridge = candidate as unknown as Record<string, unknown>;
  if (CACHE_METHODS.some((method) => typeof bridge[method] !== 'function')) return null;
  return candidate as unknown as CmsNativeCacheBridge;
}

/**
 * True only inside the shell AND when the bridge carries the Batch-4 cache surface.
 * Older shell builds (Batch 3) expose only the four identity methods — they
 * degrade to the plain web path via this check.
 */
export function isNativeMediaCacheActive(): boolean {
  if (!hasNativeShell()) return false;
  return readCacheBridge() !== null;
}

/** Maps a DocumentViewer kind onto the native cache type; null when not cacheable. */
export function nativeCacheTypeFor(kind: string | null | undefined, youtubeVideoId?: string | null): NativeCacheType | null {
  const key = (kind ?? '').trim().toLowerCase();
  if (!(key in CACHEABLE_KINDS)) return null;
  // YouTube-hosted rows have no API bytes to cache — the web iframe stays the only viewer.
  if (key === 'video' && youtubeVideoId) return null;
  return CACHEABLE_KINDS[key];
}

export interface NativeCacheHints {
  title?: string;
  subjectId?: string;
}

/**
 * Calls ensureLocal(contentId, type, hints) and returns the native status code
 * ("started" | "ready" | "downloading" | deny codes…), or null outside the shell.
 */
export function nativeEnsureLocal(contentId: string, type: NativeCacheType, hints?: NativeCacheHints): string | null {
  const bridge = readCacheBridge();
  if (!bridge) return null;
  const id = contentId.trim();
  if (!id || id.length > MAX_CONTENT_ID_LENGTH) return null;
  try {
    const hintsJson = hints && (hints.title || hints.subjectId) ? JSON.stringify(hints) : undefined;
    const code = bridge.ensureLocal(id, type, hintsJson);
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/** Calls openLocal(contentId); returns the native code or null outside the shell. */
export function nativeOpenLocal(contentId: string): string | null {
  const bridge = readCacheBridge();
  if (!bridge) return null;
  const id = contentId.trim();
  if (!id || id.length > MAX_CONTENT_ID_LENGTH) return null;
  try {
    const code = bridge.openLocal(id);
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/** Reads cacheStatus(contentId): "queued | downloading:<pct> | ready | …". */
export function nativeCacheStatus(contentId: string): string | null {
  const bridge = readCacheBridge();
  if (!bridge) return null;
  const id = contentId.trim();
  if (!id || id.length > MAX_CONTENT_ID_LENGTH) return null;
  try {
    const code = bridge.cacheStatus(id);
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/** Extracts the integer percent out of a "downloading:<pct>" status. */
export function nativeCachePercent(status: string): number | null {
  const match = /^downloading:(\d{1,3})$/.exec(status);
  return match ? Number(match[1]) : null;
}

// ===== Night Task 3 — offline catalog surface (feature-detected) =====

/**
 * On-device encrypted offline-content cap, mirrored from the Kotlin
 * `CachePolicy.MAX_CACHE_BYTES` (Owner decision 2026-11-28: 10 GiB SHARED
 * across library media, question packages and course episodes; no automatic
 * eviction — a full cache blocks new downloads). Display-only — the native
 * side enforces the real quota.
 */
export const NATIVE_MEDIA_CACHE_MAX_BYTES = 10 * 1024 * 1024 * 1024;

/**
 * Arabic honesty (Owner decision 5): YouTube-hosted videos and course episodes
 * have no downloadable API bytes, so they can never enter the encrypted offline
 * cache — the web player stays the only viewer and needs connectivity.
 */
export const UNCACHEABLE_OFFLINE_NOTE =
  'ملاحظة: فيديوهات يوتيوب وحلقات الكورسات لا تُخزَّن للعرض دون اتصال — تُشاهَد من الويب عند توفر الاتصال.';

/** True when the shell can enumerate + delete cached objects (Batch-4 catalog). */
export function isNativeCatalogActive(): boolean {
  if (!hasNativeShell()) return false;
  return readCatalogBridge() !== null;
}

// ===== Owner decision 2026-11-28 — shared storage summary + cancellation =====

/** Per-type offline byte totals as the native side reports them (numbers only). */
export interface NativeStorageSummary {
  mediaBytes: number;
  episodeBytes: number;
  packageBytes: number;
  capBytes: number;
}

/** True when the shell exposes the storage-summary surface. */
export function isNativeStorageSummaryActive(): boolean {
  if (!hasNativeShell()) return false;
  const candidate = (globalThis as unknown as Record<string, unknown>)[NATIVE_BRIDGE_NAME];
  if (!candidate || typeof candidate !== 'object') return false;
  return typeof (candidate as Record<string, unknown>).getOfflineStorageSummary === 'function';
}

/**
 * Reads the truthful shared-storage summary (media / episodes / packages bytes +
 * the 10 GiB cap). Returns null outside the shell, on bridge errors, or when the
 * payload is malformed — callers fall back to computing display totals from rows.
 */
export function nativeStorageSummary(): NativeStorageSummary | null {
  if (!isNativeStorageSummaryActive()) return null;
  const candidate = (globalThis as unknown as Record<string, unknown>)[NATIVE_BRIDGE_NAME] as CmsNativeStorageSummaryBridge;
  try {
    const raw = candidate.getOfflineStorageSummary();
    if (typeof raw !== 'string' || raw.length === 0) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const row = parsed as Record<string, unknown>;
    const mediaBytes = typeof row.mediaBytes === 'number' ? row.mediaBytes : null;
    const episodeBytes = typeof row.episodeBytes === 'number' ? row.episodeBytes : null;
    const packageBytes = typeof row.packageBytes === 'number' ? row.packageBytes : null;
    const capBytes = typeof row.capBytes === 'number' ? row.capBytes : null;
    if (mediaBytes === null || episodeBytes === null || packageBytes === null || capBytes === null) return null;
    return { mediaBytes, episodeBytes, packageBytes, capBytes };
  } catch {
    return null;
  }
}

/**
 * Cancels one in-flight library-file download. Returns the native code
 * ("canceled" | "not_downloading" | "absent"), or null outside the shell /
 * when the shell predates the cancel surface.
 */
export function nativeCancelDownload(contentId: string): string | null {
  const bridge = readCacheBridge();
  if (!bridge || typeof bridge.cancelDownload !== 'function') return null;
  const id = contentId.trim();
  if (!id || id.length > MAX_CONTENT_ID_LENGTH) return null;
  try {
    const code = bridge.cancelDownload(id);
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/**
 * Lists every cached object (safe metadata rows). Returns null outside the
 * shell, on bridge errors, or on a malformed payload — callers fall back to
 * the honest browser empty state.
 */
export function nativeListCached(): NativeCachedItem[] | null {
  const bridge = readCatalogBridge();
  if (!bridge) return null;
  try {
    const raw = bridge.listCached();
    if (typeof raw !== 'string' || raw.length === 0) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const rows: NativeCachedItem[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const contentId = typeof row.contentId === 'string' ? row.contentId.trim() : '';
      const type = typeof row.type === 'string' ? row.type.trim() : '';
      if (!contentId || contentId.length > MAX_CONTENT_ID_LENGTH || !type) continue;
      rows.push({
        contentId,
        type,
        title: typeof row.title === 'string' ? row.title : undefined,
        bytes: typeof row.bytes === 'number' ? row.bytes : undefined,
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : undefined,
        lastAccessAt: typeof row.lastAccessAt === 'string' ? row.lastAccessAt : undefined,
      });
    }
    return rows;
  } catch {
    return null;
  }
}

/** Deletes one cached object; returns the native code or null outside the shell. */
export function nativeRemoveCached(contentId: string): string | null {
  const bridge = readCatalogBridge();
  if (!bridge) return null;
  const id = contentId.trim();
  if (!id || id.length > MAX_CONTENT_ID_LENGTH) return null;
  try {
    const code = bridge.removeCached(id);
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/**
 * Owner-approved base wording (offline-experience implementation, 2026-11-28) for
 * content that is unavailable offline. The suffix adapts by content type without
 * changing the meaning; callers pass the type-appropriate suffix.
 */
export const OFFLINE_NOT_DOWNLOADED_BASE =
  'محتوى غير محمّل. تحقّق من الاتصال بالإنترنت وأضِف المحتوى إلى وضع اللاإنترنت.';

/** Type-adapted variants: same base meaning, actionable suffix per content type. */
export const OFFLINE_NOT_DOWNLOADED_MESSAGES = {
  file: 'محتوى غير محمّل. تحقّق من الاتصال بالإنترنت وأضِف الملف إلى وضع اللاإنترنت من زر «تحميل دون اتصال».',
  package: 'محتوى غير محمّل. تحقّق من الاتصال بالإنترنت وأضِف حزمة أسئلة المادة إلى وضع اللاإنترنت من صفحة المادة.',
  episode: 'محتوى غير محمّل. تحقّق من الاتصال بالإنترنت وأضِف حلقة الكورس إلى وضع اللاإنترنت من زر التحميل بجانبها.',
  course: 'محتوى غير محمّل. تحقّق من الاتصال بالإنترنت وأضِف حلقات الكورس المطلوبة إلى وضع اللاإنترنت من صفحة الكورس.',
} as const;

export type OfflineNotDownloadedKind = keyof typeof OFFLINE_NOT_DOWNLOADED_MESSAGES;

/** The type-specific message for content that is not downloaded. */
export function offlineNotDownloadedMessage(kind: OfflineNotDownloadedKind): string {
  return OFFLINE_NOT_DOWNLOADED_MESSAGES[kind];
}

/** Arabic-first denial/error messages for every deny code the bridge can return. */
export function nativeCacheDenyMessage(code: string): string | null {
  switch (code) {
    case 'denied_native_session':
      return 'لتخزين المحتوى وفتحه دون اتصال، سجّل الدخول أولاً من شاشة «وضع بدون إنترنت» في التطبيق.';
    case 'denied_auth':
      return 'لم يعد هذا المحتوى متاحاً لحسابك.';
    case 'denied_offline':
      return OFFLINE_NOT_DOWNLOADED_MESSAGES.file;
    case 'denied_stale':
      return 'انتهت صلاحية النسخة المحفوظة — اتصل بالإنترنت ثم أعد فتح الملف.';
    case 'quota':
    case 'error:quota':
      return 'مساحة التخزين دون اتصال ممتلئة (10 غيغابايت مشتركة) — احذف بعض المحتوى من «وضع بدون إنترنت» ثم أعد المحاولة.';
    case 'unsupported_type':
      return 'نوع الملف غير مدعوم للعرض دون اتصال.';
    case 'invalid_args':
      return null; // our own row shape is at fault — silent web fallback, no user-facing noise
    default:
      if (code.startsWith('error')) return 'حدث خطأ أثناء تجهيز الملف دون اتصال.';
      return null;
  }
}

/** Terminal outcomes of the download wait loop. */
export type NativeCacheWaitResult =
  | 'ready'
  | 'denied_auth'
  | 'error'
  | 'absent'
  | 'timeout';

interface WaitOptions {
  pollMs?: number;
  timeoutMs?: number;
  shouldStop?: () => boolean;
  onProgress?: (percent: number) => void;
}

/**
 * Polls cacheStatus until the object is ready or the download settles.
 * `absent` means the download vanished (canceled/cleared) — the caller falls
 * back to the web path.
 */
export async function waitForNativeCacheReady(contentId: string, options: WaitOptions = {}): Promise<NativeCacheWaitResult> {
  const pollMs = options.pollMs ?? 700;
  const timeoutMs = options.timeoutMs ?? 15 * 60_000;
  const startedAt = Date.now();

  for (;;) {
    if (options.shouldStop?.()) return 'absent';
    const status = nativeCacheStatus(contentId);
    if (status !== null) {
      const percent = nativeCachePercent(status);
      if (percent !== null) options.onProgress?.(percent);
      if (status === 'ready') return 'ready';
      if (status === 'absent') return 'absent';
      if (status === 'denied_auth') return 'denied_auth';
      if (status.startsWith('error')) return 'error';
    }
    if (Date.now() - startedAt > timeoutMs) return 'timeout';
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
