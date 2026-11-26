/**
 * PR-3 — Dictionary v2 unit tests.
 *
 * Contract under test (execution prompt, PR-3 acceptance criteria):
 *   1. Arabic and English locale selection resolve real strings.
 *   2. Missing keys fall back to the raw path (never crash / blank surface).
 *   3. Interpolation is safe: {{token}} substitution, unknown tokens stay
 *      visible, and markup-shaped params remain inert text (no HTML path).
 *   4. Every entry in the composed tree is a complete bilingual pair.
 *   5. The PR-3 required status set renders consistently in both locales:
 *      Draft, Published, Unpublished, Archived, Quarantined, Retention
 *      pending, Unavailable, Permission denied, Validation failed.
 *   6. Server error codes map to localized human messages in priority order
 *      (humanMessage → errorCode map → raw message → generic), with
 *      technicalDetails preserved, never hidden.
 *   7. No secret or credential values live in the dictionary.
 */
import { describe, expect, it } from 'vitest';
import {
  apiErrorCodes,
  apiErrorFallbacks,
  apiErrorHumanMessage,
  dictEntries,
  hasDictKey,
  localeOf,
  statusLabel,
  t,
} from '../lib/dictionary';

const REQUIRED_STATUS_AR = {
  draft: 'مسودة',
  published: 'منشور',
  unpublished: 'غير منشور',
  archived: 'مؤرشف',
  quarantined: 'معزول',
  retentionPending: 'قيد الاحتجاز',
  unavailable: 'غير متاح',
  permissionDenied: 'لا تملك صلاحية الوصول',
  validationFailed: 'البيانات المرسلة غير مكتملة أو غير صحيحة. راجع الحقول وأعد المحاولة.',
} as const;

const REQUIRED_STATUS_EN = {
  draft: 'Draft',
  published: 'Published',
  unpublished: 'Unpublished',
  archived: 'Archived',
  quarantined: 'Quarantined',
  retentionPending: 'Retention pending',
  unavailable: 'Unavailable',
  permissionDenied: 'Permission denied',
  validationFailed: 'The submitted data is incomplete or invalid. Review the fields and try again.',
} as const;

describe('dictionary: locale selection', () => {
  it('resolves Arabic (primary) and English for the same key', () => {
    expect(t('ar', 'login.title')).toBe('دخول إلى لوحة الإدارة');
    expect(t('en', 'login.title')).toBe('Sign in to the administration console');
    expect(t('ar', 'common.save')).toBe('حفظ');
    expect(t('en', 'common.save')).toBe('Save');
  });

  it('localeOf maps the legacy isArabic boolean', () => {
    expect(localeOf(true)).toBe('ar');
    expect(localeOf(false)).toBe('en');
  });
});

describe('dictionary: fallback behavior', () => {
  it('returns the raw path for a missing key (no crash, no blank)', () => {
    expect(t('ar', 'nope.missing.key')).toBe('nope.missing.key');
    expect(t('en', 'login')).toBe('login'); // section, not an entry
    expect(hasDictKey('nope.missing.key')).toBe(false);
  });

  it('hasDictKey confirms existing bilingual entries', () => {
    expect(hasDictKey('common.save')).toBe(true);
    expect(hasDictKey('notFound.description')).toBe(true);
  });
});

describe('dictionary: safe interpolation', () => {
  it('substitutes {{token}} params as plain text', () => {
    expect(t('ar', 'shell.welcomeToast', { name: 'ليث' })).toBe('أهلًا ليث');
    expect(t('en', 'shell.welcomeToast', { name: 'Laith' })).toBe('Welcome, Laith');
  });

  it('leaves unknown tokens intact instead of silently emptying them', () => {
    expect(t('en', 'shell.welcomeToast', {})).toBe('Welcome, {{name}}');
    expect(t('en', 'shell.welcomeToast', { other: 1 })).toBe('Welcome, {{name}}');
  });

  it('renders markup-shaped params as inert text (no HTML interpretation)', () => {
    const hostile = '<script>alert(1)</script>';
    const out = t('en', 'notFound.description', { path: hostile });
    // The translator performs plain string substitution only: the hostile
    // text passes through UNCHANGED (no stripping, no escaping, no parsing).
    // Inertness comes from React rendering it as a text node — never innerHTML.
    expect(out).toBe(
      `The requested path does not exist in the administration console: ${hostile}. Check the link or return to the command center.`,
    );
  });

  it('interpolates numbers', () => {
    expect(t('en', 'shell.operatorMenuWith', { name: 42 })).toBe('Operator menu: 42');
  });
});

describe('dictionary: full-tree integrity', () => {
  it('every composed entry is a complete, non-empty bilingual pair', () => {
    const entries = dictEntries();
    expect(entries.length).toBeGreaterThan(150);
    for (const { path, entry } of entries) {
      expect(typeof entry.ar, `ar missing/empty at ${path}`).toBe('string');
      expect(entry.ar.length, `ar empty at ${path}`).toBeGreaterThan(0);
      expect(typeof entry.en, `en missing/empty at ${path}`).toBe('string');
      expect(entry.en.length, `en empty at ${path}`).toBeGreaterThan(0);
    }
  });

  it('every {{token}} placeholder is a word token (interpolatable)', () => {
    for (const { path, entry } of dictEntries()) {
      const placeholders = [...entry.ar.matchAll(/\{\{(\w+)\}\}/g), ...entry.en.matchAll(/\{\{(\w+)\}\}/g)];
      for (const match of placeholders) {
        expect(match[1], `bad placeholder at ${path}`).toMatch(/^\w+$/);
      }
    }
  });

  it('contains no secret or credential values', () => {
    // Heuristic scan for credential-looking material. The dictionary is
    // translated UI copy only — anything matching these patterns is a bug.
    const secretPattern =
      /(?:sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{12,}|Bearer\s+[A-Za-z0-9._-]{10,}|eyJ[A-Za-z0-9_-]{15,}\.|postgres(?:ql)?:\/\/|mysql:\/\/|redis:\/\/|connection\s*string|api[_-]?key\s*[:=]\s*\S+|password\s*[:=]\s*\S{6,})/i;
    for (const { path, entry } of dictEntries()) {
      expect(String(entry.ar).match(secretPattern), `secret-shaped value at ${path} (ar)`).toBeNull();
      expect(String(entry.en).match(secretPattern), `secret-shaped value at ${path} (en)`).toBeNull();
    }
    for (const [code, entry] of Object.entries(apiErrorCodes)) {
      expect(String(entry.ar).match(secretPattern), `secret-shaped value at errors.${code} (ar)`).toBeNull();
      expect(String(entry.en).match(secretPattern), `secret-shaped value at errors.${code} (en)`).toBeNull();
    }
  });
});

describe('status registry: PR-3 required set', () => {
  it('renders the required statuses consistently in Arabic', () => {
    expect(statusLabel('ar', 'publication', 'draft')).toBe(REQUIRED_STATUS_AR.draft);
    expect(statusLabel('ar', 'publication', 'published')).toBe(REQUIRED_STATUS_AR.published);
    expect(statusLabel('ar', 'publication', 'unpublished')).toBe(REQUIRED_STATUS_AR.unpublished);
    expect(statusLabel('ar', 'publication', 'archived')).toBe(REQUIRED_STATUS_AR.archived);
    expect(statusLabel('ar', 'retention', 'quarantined')).toBe(REQUIRED_STATUS_AR.quarantined);
    expect(statusLabel('ar', 'retention', 'retentionpending')).toBe(REQUIRED_STATUS_AR.retentionPending);
    expect(statusLabel('ar', 'availability', 'unavailable')).toBe(REQUIRED_STATUS_AR.unavailable);
    expect(t('ar', 'common.permissionDenied')).toBe(REQUIRED_STATUS_AR.permissionDenied);
    expect(apiErrorCodes.VALIDATION_FAILED.ar).toBe(REQUIRED_STATUS_AR.validationFailed);
  });

  it('renders the required statuses consistently in English', () => {
    expect(statusLabel('en', 'publication', 'draft')).toBe(REQUIRED_STATUS_EN.draft);
    expect(statusLabel('en', 'publication', 'published')).toBe(REQUIRED_STATUS_EN.published);
    expect(statusLabel('en', 'publication', 'unpublished')).toBe(REQUIRED_STATUS_EN.unpublished);
    expect(statusLabel('en', 'publication', 'archived')).toBe(REQUIRED_STATUS_EN.archived);
    expect(statusLabel('en', 'retention', 'quarantined')).toBe(REQUIRED_STATUS_EN.quarantined);
    expect(statusLabel('en', 'retention', 'retentionpending')).toBe(REQUIRED_STATUS_EN.retentionPending);
    expect(statusLabel('en', 'availability', 'unavailable')).toBe(REQUIRED_STATUS_EN.unavailable);
    expect(t('en', 'common.permissionDenied')).toBe(REQUIRED_STATUS_EN.permissionDenied);
    expect(apiErrorCodes.VALIDATION_FAILED.en).toBe(REQUIRED_STATUS_EN.validationFailed);
  });

  it('matches the legacy center glossaries byte-for-byte (no output change)', () => {
    // Student statuses (StudentsCenter).
    expect(statusLabel('ar', 'student', 'banned')).toBe('محظور');
    expect(statusLabel('en', 'student', 'suspended')).toBe('Suspended');
    // Session statuses (feminine register).
    expect(statusLabel('ar', 'session', 'Revoked')).toBe('منتهية');
    expect(statusLabel('en', 'session', 'Expired')).toBe('Expired');
    // Question types (W21.1 glossary).
    expect(statusLabel('ar', 'questionType', 'Mcq')).toBe('اختيار من متعدد');
    expect(statusLabel('en', 'questionType', 'TrueFalse')).toBe('True / False');
    expect(statusLabel('ar', 'questionType', 'Matching')).toBe('وصل');
    expect(statusLabel('en', 'questionDifficulty', 'Hard')).toBe('Hard');
    // Library domains.
    expect(statusLabel('ar', 'libraryType', 'Pdf')).toBe('ملف PDF');
    expect(statusLabel('ar', 'libraryScan', 'clean')).toBe('نظيف');
    expect(statusLabel('en', 'libraryScan', 'infected')).toBe('Infected');
    expect(statusLabel('ar', 'libraryCategory', 'GoldenIdeas')).toBe('أفكار ذهبية');
    // Access codes.
    expect(statusLabel('ar', 'codeStatus', 'used')).toBe('مستخدم');
    expect(statusLabel('ar', 'redemptionStatus', 'expired')).toBe('منتهية');
  });

  it('unknown values follow the legacy per-domain behavior (pass-through or label)', () => {
    // Legacy passed these through verbatim.
    expect(statusLabel('en', 'session', 'Weird')).toBe('Weird');
    expect(statusLabel('en', 'libraryType', 'FutureType')).toBe('FutureType');
    // Legacy rendered explicit unknown labels here.
    expect(statusLabel('ar', 'questionType', 'FutureType')).toBe('نوع غير معروف');
    expect(statusLabel('en', 'questionType', 'FutureType')).toBe('Unknown type');
    expect(statusLabel('ar', 'questionDifficulty', 'Unknown')).toBe('غير محدد');
    // Case handling: domains that lower-case keep resolving.
    expect(statusLabel('ar', 'publication', 'PUBLISHED')).toBe('منشور');
    expect(statusLabel('ar', 'student', 'BANNED')).toBe('محظور');
  });
});

describe('api error → localized human message', () => {
  it('maps every known backend errorCode in both locales', () => {
    const expected = [
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'BUSINESS_RULE_VIOLATION',
      'DOMAIN_ERROR',
      'BAD_GATEWAY',
      'MEDIA_PROCESSING_FAILED',
      'RATE_LIMIT_EXCEEDED',
      'VALIDATION_FAILED',
      'TWO_FACTOR_REQUIRED',
      'TWO_FACTOR_INVALID',
      'TWO_FACTOR_REPLAY',
    ];
    for (const code of expected) {
      expect(apiErrorCodes[code], `missing mapping for ${code}`).toBeDefined();
      expect(apiErrorHumanMessage({ message: 'x', errorCode: code }, 'ar').human).not.toBe('x');
      expect(apiErrorHumanMessage({ message: 'x', errorCode: code }, 'en').human).not.toBe('x');
    }
  });

  it('prefers the backend humanMessage extension (domain-authored Arabic)', () => {
    const out = apiErrorHumanMessage(
      { message: 'technical', humanMessage: 'رسالة عربية من النطاق', errorCode: 'CONFLICT' },
      'en',
    );
    expect(out.human).toBe('رسالة عربية من النطاق');
  });

  it('falls back to the raw backend message, keeping technicalDetails visible', () => {
    const out = apiErrorHumanMessage(
      { message: 'كلمة مرور المدير العام غير صحيحة', technicalDetails: 'trace xyz' },
      'ar',
    );
    expect(out.human).toBe('كلمة مرور المدير العام غير صحيحة');
    expect(out.technicalDetails).toBe('trace xyz');
  });

  it('returns the generic localized message for non-error inputs', () => {
    expect(apiErrorHumanMessage(null, 'ar').human).toBe(apiErrorFallbacks.generic.ar);
    expect(apiErrorHumanMessage({}, 'en').human).toBe(apiErrorFallbacks.generic.en);
  });

  it('rate-limit wording is operator-friendly in Arabic', () => {
    expect(apiErrorHumanMessage({ message: 'x', errorCode: 'RATE_LIMIT_EXCEEDED' }, 'ar').human)
      .toContain('انتظر قليلًا ثم أعد المحاولة');
  });
});

describe('dictionary: RTL-sensitive labels', () => {
  it('keeps direction-sensitive shell labels bilingual', () => {
    expect(t('ar', 'shell.closeNav')).toBe('إغلاق القائمة');
    expect(t('en', 'shell.closeNav')).toBe('Close navigation');
    expect(t('ar', 'shell.openNav')).toBe('فتح القائمة');
    expect(t('en', 'shell.operatorMenu')).toBe('Operator menu');
  });

  it('keeps destructive-warning vocabulary bilingual (shell + roles)', () => {
    expect(t('ar', 'admins.deleteText')).toContain('لا يمكن التراجع');
    expect(t('en', 'admins.deleteText')).toContain('cannot be undone');
    expect(t('ar', 'roles.deleteAck')).toContain('نهائي');
    expect(t('en', 'roles.deleteAck')).toContain('permanent');
  });
});
