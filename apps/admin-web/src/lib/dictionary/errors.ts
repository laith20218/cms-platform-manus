/**
 * CMS Admin — API error → localized human message (PR-3).
 *
 * Backend contract (ExceptionHandlingMiddleware, verified): every failure is
 * a ProblemDetails body whose `errorCode` extension carries a stable code
 * (DomainException 400s: NOT_FOUND / CONFLICT / FORBIDDEN /
 * BUSINESS_RULE_VIOLATION / BAD_GATEWAY / custom codes such as
 * TWO_FACTOR_REQUIRED; 401: UNAUTHORIZED; 429: RATE_LIMIT_EXCEEDED; 422:
 * MEDIA_PROCESSING_FAILED). `ApiError` (lib/api.ts) already parses
 * `errorCode` plus the optional `humanMessage` / `technicalDetails`
 * extensions.
 *
 * Resolution order for the human message (technical details are ALWAYS
 * preserved separately — never hidden):
 *   1. the backend's own `humanMessage` extension (already Arabic, authored
 *      by the domain that rejected the request);
 *   2. a localized mapping for the known `errorCode`;
 *   3. the raw ProblemDetails `message` (frequently an Arabic domain
 *      message authored server-side);
 *   4. a generic localized failure message.
 *
 * Security: this module maps codes and messages ONLY — it never constructs,
 * stores or prints credentials, tokens, connection strings or JWT material.
 */
import type { DictEntry, Locale } from './types';

/** Known backend errorCode values → localized human explanations. */
export const apiErrorCodes: Readonly<Record<string, DictEntry>> = {
  UNAUTHORIZED: { ar: 'انتهت الجلسة أو بيانات الدخول غير صحيحة. سجّل الدخول من جديد.', en: 'The session ended or the sign-in details are invalid. Sign in again.' },
  FORBIDDEN: { ar: 'لا تملك صلاحية تنفيذ هذا الإجراء ضمن نطاقك الأكاديمي.', en: 'You do not have permission to perform this action within your academic scope.' },
  NOT_FOUND: { ar: 'العنصر المطلوب غير موجود أو تمت أرشفته.', en: 'The requested item was not found or has been archived.' },
  CONFLICT: { ar: 'تعارض في البيانات — قد يكون عنصرًا مكررًا أو حالة تغيّرت للتو.', en: 'A data conflict occurred — possibly a duplicate or a state that just changed.' },
  BUSINESS_RULE_VIOLATION: { ar: 'رفض النظام هذا الطلب لأنه يخالف قاعدة عمل معتمدة.', en: 'The request was rejected because it violates an approved business rule.' },
  DOMAIN_ERROR: { ar: 'رفض النظام هذا الطلب.', en: 'The request was rejected.' },
  BAD_GATEWAY: { ar: 'تعذّر الوصول إلى خدمة داخلية (مثل التخزين). أعد المحاولة لاحقًا.', en: 'An internal dependency (such as storage) could not be reached. Try again later.' },
  MEDIA_PROCESSING_FAILED: { ar: 'فشلت معالجة الوسائط. راجع التفاصيل التقنية أدناه.', en: 'Media processing failed. See the technical details below.' },
  RATE_LIMIT_EXCEEDED: { ar: 'تم تجاوز الحد المسموح من المحاولات. انتظر قليلًا ثم أعد المحاولة.', en: 'Too many attempts. Wait a moment and try again.' },
  VALIDATION_FAILED: { ar: 'البيانات المرسلة غير مكتملة أو غير صحيحة. راجع الحقول وأعد المحاولة.', en: 'The submitted data is incomplete or invalid. Review the fields and try again.' },
  TWO_FACTOR_REQUIRED: { ar: 'هذا الحساب محمي بالمصادقة الثنائية — أدخل رمز التحقق.', en: 'This account is protected by two-factor authentication — enter the verification code.' },
  TWO_FACTOR_INVALID: { ar: 'رمز التحقق غير صحيح. تأكد من التطبيق وأعد الإدخال.', en: 'The verification code is incorrect. Check the app and try again.' },
  TWO_FACTOR_REPLAY: { ar: 'استُخدم هذا الرمز مسبقًا. اطلب رمزًا جديدًا من تطبيق المصادقة.', en: 'This code was already used. Generate a new code in your authenticator app.' },
  // PR-7 (Settings + Role Studio) — the backend's exact Arabic sentences ride
  // in the DomainException detail; these mirrors let the EN locale render a
  // localized explanation wherever apiErrorHumanMessage resolves the code.
  SETTING_VALUE_INVALID: { ar: 'قيمة الإعداد غير صالحة', en: 'The setting value is invalid (type, bounds or allowed values).' },
  SETTING_NO_DEFAULT: { ar: 'لا يوجد افتراضي مسجّل لهذا الإعداد', en: 'No registered default exists for this setting.' },
  LAST_SUPER_ADMIN: {
    ar: 'لا يمكن تنفيذ هذا الإجراء على آخر مدير عام فعّال — يحمي النظام من فقدان الوصول الكامل',
    en: 'This action cannot be performed on the last effective super administrator — it protects the platform from losing full access.',
  },
  ROLE_HAS_ADMINS: { ar: 'انقل المدراء إلى دور آخر قبل حذف هذا الدور', en: 'Move the assigned administrators to another role before deleting this one.' },
  SYSTEM_ROLE_DELETE_FORBIDDEN: { ar: 'أدوار نظامية لا تُحذف', en: 'System roles cannot be deleted.' },
  ROLE_DISABLED: { ar: 'لا يمكن تعيين دور معطّل', en: 'A disabled role cannot be assigned.' },
};

/** Generic fallbacks (no code, no humanMessage, no message). */
export const apiErrorFallbacks: Readonly<Record<string, DictEntry>> = {
  network: { ar: 'تعذّر الاتصال بالخادم. تحقق من الشبكة وأعد المحاولة.', en: 'Could not reach the server. Check the network and try again.' },
  generic: { ar: 'حدث خطأ أثناء تنفيذ الطلب.', en: 'The request failed.' },
};

/** Minimal shape shared by ApiError and plain Errors. */
export interface LocalizableError {
  message: string;
  humanMessage?: string;
  technicalDetails?: string | null;
  errorCode?: string;
}

/**
 * Human-friendly localized message for an API failure. Never hides technical
 * detail: `technicalDetails` (when present) is returned alongside for the
 * operator-facing detail surfaces (e.g. the dual-language error modal).
 */
export function apiErrorHumanMessage(
  error: unknown,
  locale: Locale,
): { human: string; technicalDetails?: string } {
  const err = error as LocalizableError | null | undefined;
  if (!err || typeof err.message !== 'string') {
    return { human: apiErrorFallbacks.generic[locale] };
  }
  if (typeof err.humanMessage === 'string' && err.humanMessage.trim()) {
    return { human: err.humanMessage, technicalDetails: err.technicalDetails ?? undefined };
  }
  const mapped = err.errorCode ? apiErrorCodes[err.errorCode] : undefined;
  if (mapped) {
    return { human: mapped[locale], technicalDetails: err.technicalDetails ?? undefined };
  }
  // The ProblemDetails `message` (backend domain message — usually Arabic).
  return { human: err.message, technicalDetails: err.technicalDetails ?? undefined };
}
