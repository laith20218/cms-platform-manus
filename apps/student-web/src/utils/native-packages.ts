/**
 * Wave 1 (UX 1D) — feature-detected access to the offline QUESTION PACKAGES
 * surface of `window.CmsNative`. The Kotlin methods below do NOT exist yet
 * (Wave 2 adds them in apps/android); the names are the cross-wave CONTRACT
 * and must stay exact:
 *
 *   listOfflinePackages(): string               -> JSON array of safe rows
 *   downloadOfflinePackage(requestJson): string -> async start -> status code
 *   offlinePackageStatus(packageId): string     -> absent|queued|downloading|ready|denied_auth|error:*
 *   removeOfflinePackage(packageId): string
 *   openOfflineExam(packageId): string
 *
 * Everything is feature-detected exactly like native-cache.ts: in a plain
 * browser (or on an older shell whose bridge lacks the five methods) every
 * helper returns null/false and the UI keeps its honest fail-closed state —
 * nothing fakes an empty package list. The native side re-checks the HTTPS
 * origin allowlist per call; deny/absent codes surface as-is.
 */

import { hasNativeShell } from './native-bridge';

/** Typed shape of the packages surface — mirrors the future Kotlin @JavascriptInterface methods. */
interface CmsNativePackageBridge {
  listOfflinePackages(): string;
  downloadOfflinePackage(requestJson: string): string;
  offlinePackageStatus(packageId: string): string;
  removeOfflinePackage(packageId: string): string;
  openOfflineExam(packageId: string): string;
}

const NATIVE_BRIDGE_NAME = 'CmsNative';
const PACKAGE_METHODS: Array<keyof CmsNativePackageBridge> = [
  'listOfflinePackages',
  'downloadOfflinePackage',
  'offlinePackageStatus',
  'removeOfflinePackage',
  'openOfflineExam',
];

/** Mirror of native-cache.ts's defensive id guard — opaque UUID-ish ids, capped length. */
const MAX_PACKAGE_ID_LENGTH = 256;
/** Title strings come from our own API rows; a generous cap keeps hostile payloads out of the UI. */
const MAX_PACKAGE_TITLE_LENGTH = 256;
/** Hard ceiling on the rows the bridge may report (defensive, display only). */
const MAX_PACKAGE_ROWS = 500;

/** One offline package row exactly as the native side reports it (safe metadata only). */
export interface NativeOfflinePackageRow {
  packageId: string;
  subjectIds: string[];
  title?: string;
  status: 'active' | 'unknown' | 'revoked';
  expiresAt: string;
  questionCount?: number;
  pendingAnswerCount?: number;
  downloadedAt?: string;
}

/** Request payload for downloadOfflinePackage — serialized by the wrapper itself. */
export interface NativeOfflinePackageDownloadInput {
  /** Subject whose question bank should be baked into the package. */
  subjectId?: string;
  /** Optional single-exam scope; some CTAs only know the exam id. */
  examId?: string;
  /** Web session token — the native side needs it to call the package-build API once. */
  accessToken?: string;
  /** Display hint the native list echoes back. */
  title?: string;
}

const PACKAGE_STATUSES: ReadonlyArray<NativeOfflinePackageRow['status']> = ['active', 'unknown', 'revoked'];

function readPackageBridge(): CmsNativePackageBridge | null {
  const candidate = (globalThis as unknown as Record<string, unknown>)[NATIVE_BRIDGE_NAME];
  if (!candidate || typeof candidate !== 'object') return null;
  const bridge = candidate as unknown as Record<string, unknown>;
  if (PACKAGE_METHODS.some((method) => typeof bridge[method] !== 'function')) return null;
  return candidate as unknown as CmsNativePackageBridge;
}

/**
 * True only inside the shell AND when the bridge carries the full packages
 * surface (Wave 2+ builds). Older shells degrade to the honest
 * "update the app" state via this check.
 */
export function isNativePackagesSurfaceActive(): boolean {
  if (!hasNativeShell()) return false;
  return readPackageBridge() !== null;
}

/** Validates one opaque id: non-blank, trimmed, length-capped. */
function validId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!id || id.length > MAX_PACKAGE_ID_LENGTH) return null;
  return id;
}

/** Validates an optional safe-string field (title): trimmed, capped, undefined when junk. */
function validOptionalText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text || text.length > max) return undefined;
  return text;
}

/** Validates an optional count field: finite, non-negative, integer-ish. */
function validCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return Math.floor(value);
}

/**
 * Lists every downloaded offline package (safe metadata rows). Returns null
 * outside the shell, on bridge errors, or on a malformed payload — callers
 * fall back to the honest unavailable/empty states, never a fake list.
 */
export function nativeListOfflinePackages(): NativeOfflinePackageRow[] | null {
  const bridge = readPackageBridge();
  if (!bridge) return null;
  try {
    const raw = bridge.listOfflinePackages();
    if (typeof raw !== 'string' || raw.length === 0) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const rows: NativeOfflinePackageRow[] = [];
    for (const entry of parsed) {
      if (rows.length >= MAX_PACKAGE_ROWS) break;
      if (!entry || typeof entry !== 'object') continue;
      const row = entry as Record<string, unknown>;
      const packageId = validId(row.packageId);
      if (!packageId) continue; // malformed row — dropped, fail closed
      if (typeof row.expiresAt !== 'string' || Number.isNaN(new Date(row.expiresAt).getTime())) continue;
      if (!PACKAGE_STATUSES.includes(row.status as NativeOfflinePackageRow['status'])) continue;
      const subjectIds = Array.isArray(row.subjectIds)
        ? row.subjectIds.map(validId).filter((id): id is string => id !== null)
        : [];
      rows.push({
        packageId,
        subjectIds,
        title: validOptionalText(row.title, MAX_PACKAGE_TITLE_LENGTH),
        status: row.status as NativeOfflinePackageRow['status'],
        expiresAt: row.expiresAt,
        questionCount: validCount(row.questionCount),
        pendingAnswerCount: validCount(row.pendingAnswerCount),
        downloadedAt: typeof row.downloadedAt === 'string' ? row.downloadedAt : undefined,
      });
    }
    return rows;
  } catch {
    return null;
  }
}

/**
 * Starts an async package download. Serializes the request JSON itself and
 * returns the native status code ("started" | "queued" | "ready" | deny codes…),
 * or null outside the shell / on a call failure / without any scope id.
 */
export function nativeDownloadOfflinePackage(input: NativeOfflinePackageDownloadInput): string | null {
  const bridge = readPackageBridge();
  if (!bridge) return null;
  const subjectId = input.subjectId?.trim();
  const examId = input.examId?.trim();
  // At least one scope id is required — a scopeless request is our own bug,
  // fail closed instead of bothering the native side.
  if (!subjectId && !examId) return null;
  const request: Record<string, string> = {};
  if (subjectId) request.subjectId = subjectId;
  if (examId) request.examId = examId;
  const accessToken = input.accessToken?.trim();
  if (accessToken) request.accessToken = accessToken;
  const title = input.title?.trim();
  if (title) request.title = title.slice(0, MAX_PACKAGE_TITLE_LENGTH);
  try {
    const code = bridge.downloadOfflinePackage(JSON.stringify(request));
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/** Reads offlinePackageStatus(packageId): "absent | queued | downloading | ready | deny codes…". */
export function nativeOfflinePackageStatus(packageId: string): string | null {
  const bridge = readPackageBridge();
  if (!bridge) return null;
  const id = packageId.trim();
  if (!id || id.length > MAX_PACKAGE_ID_LENGTH) return null;
  try {
    const code = bridge.offlinePackageStatus(id);
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/** Deletes one downloaded package; returns the native code or null outside the shell. */
export function nativeRemoveOfflinePackage(packageId: string): string | null {
  const bridge = readPackageBridge();
  if (!bridge) return null;
  const id = packageId.trim();
  if (!id || id.length > MAX_PACKAGE_ID_LENGTH) return null;
  try {
    const code = bridge.removeOfflinePackage(id);
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/** Opens the offline exam player for a downloaded package; native code or null. */
export function nativeOpenOfflineExam(packageId: string): string | null {
  const bridge = readPackageBridge();
  if (!bridge) return null;
  const id = packageId.trim();
  if (!id || id.length > MAX_PACKAGE_ID_LENGTH) return null;
  try {
    const code = bridge.openOfflineExam(id);
    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}

/** Arabic-first denial/error messages for every deny code the bridge can return. */
export function nativePackageDenyMessage(code: string): string | null {
  switch (code) {
    case 'denied_native_session':
      return 'لتخزين الحزم دون اتصال سجّل الدخول أولاً ثم أعد المحاولة.';
    case 'denied_auth':
      return 'لم تعد هذه الحزمة متاحة لحسابك.';
    case 'denied_offline':
      return 'لا يوجد اتصال بالإنترنت — تحميل الحزم يحتاج اتصالاً مرة واحدة.';
    case 'denied_stale':
      return 'انتهت صلاحية الحزمة المحفوظة.';
    case 'denied_disabled':
      return 'ميزة الحزم دون اتصال غير مفعّلة في هذا الإصدار من التطبيق.';
    case 'quota':
    case 'error:quota':
      return 'مساحة التخزين دون اتصال ممتلئة — احذف بعض الحزم أو الملفات من «وضع بدون إنترنت».';
    case 'invalid_args':
      return null; // our own request shape is at fault — silent fallback, no user-facing noise
    default:
      if (code.startsWith('error')) return 'حدث خطأ أثناء تجهيز الحزمة دون اتصال.';
      return null;
  }
}

/**
 * Toast copy for a downloadOfflinePackage start result (W1 CTA contract —
 * no polling: the student follows progress via the offline panel refresh).
 */
export function nativePackageDownloadToast(code: string | null): { kind: 'info' | 'error'; message: string } {
  if (code === null) return { kind: 'error', message: 'تعذّر بدء تحميل الحزمة دون اتصال — أعد المحاولة.' };
  if (code === 'started' || code === 'queued' || code.startsWith('downloading')) {
    return { kind: 'info', message: 'بدأ تحميل حزمة الأسئلة… تابع التقدم من لوحة «وضع بدون إنترنت».' };
  }
  if (code === 'ready') return { kind: 'info', message: 'الحزمة محفوظة مسبقاً.' };
  const deny = nativePackageDenyMessage(code);
  return { kind: 'error', message: deny ?? 'تعذّر بدء تحميل الحزمة دون اتصال — أعد المحاولة.' };
}
