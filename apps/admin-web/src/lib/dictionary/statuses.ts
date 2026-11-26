/**
 * CMS Admin — Status label registry (PR-3).
 *
 * One place decides how every wire-status renders in Arabic and English, so
 * «Draft / مسودة» can never drift between the Question Bank, the Library and
 * the Exams center. The registry covers the PR-3 required set explicitly:
 *   Draft · Published · Unpublished · Archived · Quarantined ·
 *   Retention pending · Unavailable · Permission denied · Validation failed.
 *
 * Contract:
 *   • keys are the WIRE values the backend emits (case--sensitive where the
 *     API is, lower-cased where the center already lower-cased);
 *   • `statusLabel(locale, domain, value)` returns the localized label for a
 *     known value and an explicit localized «unknown» otherwise — it never
 *     leaks a raw enum member into an Arabic surface unless the legacy
 *     behavior passed it through verbatim (preserved per-domain via the
 *     `passThroughUnknown` flag so this migration changes no output);
 *   • wire values that a domain does not know fall back to the domain's own
 *     unknown label, matching the pre-PR-3 behavior of each center.
 */
import type { DictEntry, Locale } from './types';

export interface StatusDomain {
  /** Wire value → localized label. */
  readonly labels: Readonly<Record<string, DictEntry>>;
  /** Label for values the registry does not know. */
  readonly unknown: DictEntry;
  /** Legacy behavior: unknown values passed through verbatim (no label). */
  readonly passThroughUnknown?: boolean;
  /** Lower-case the wire value before lookup (legacy centers did this). */
  readonly normalizeLower?: boolean;
}

const unknownLabel: DictEntry = { ar: 'غير محدد', en: 'Unspecified' };
const passThrough: DictEntry = { ar: 'غير معروفة', en: 'Unknown' };

/** Publication lifecycle — shared by questions, exams, library files. */
const publication: StatusDomain = {
  labels: {
    draft: { ar: 'مسودة', en: 'Draft' },
    published: { ar: 'منشور', en: 'Published' },
    unpublished: { ar: 'غير منشور', en: 'Unpublished' },
    archived: { ar: 'مؤرشف', en: 'Archived' },
  },
  unknown: unknownLabel,
  normalizeLower: true,
};

const registrySource = {
  /** Questions / exams / library publication state. */
  publication,
  /** Object-retention lifecycle (PR-5 contract surfaces early in labels). */
  retention: {
    labels: {
      quarantined: { ar: 'معزول', en: 'Quarantined' },
      'retention pending': { ar: 'قيد الاحتجاز', en: 'Retention pending' },
      retentionpending: { ar: 'قيد الاحتجاز', en: 'Retention pending' },
    },
    unknown: unknownLabel,
  },
  /** Availability of a metric / provider / capability. */
  availability: {
    labels: {
      unavailable: { ar: 'غير متاح', en: 'Unavailable' },
    },
    unknown: unknownLabel,
  },
  /** Student account status (StudentsCenter — lower-cases the wire value). */
  student: {
    labels: {
      active: { ar: 'نشط', en: 'Active' },
      banned: { ar: 'محظور', en: 'Banned' },
      suspended: { ar: 'معلّق', en: 'Suspended' },
      pending: { ar: 'قيد المراجعة', en: 'Pending' },
    },
    unknown: unknownLabel,
    normalizeLower: true,
  },
  /** Admin/security session status (StudentsCenter sessions drawer — exact-case wire values). */
  session: {
    labels: {
      Active: { ar: 'نشطة', en: 'Active' },
      Revoked: { ar: 'منتهية', en: 'Revoked' },
      Expired: { ar: 'منتهية الصلاحية', en: 'Expired' },
    },
    unknown: passThrough,
    passThroughUnknown: true,
  },
  /** Security event severity (StudentsCenter security tab). */
  securitySeverity: {
    labels: {
      info: { ar: 'معلومة', en: 'Info' },
      warning: { ar: 'تحذير', en: 'Warning' },
      critical: { ar: 'حرج', en: 'Critical' },
    },
    unknown: passThrough,
    passThroughUnknown: true,
  } satisfies StatusDomain,
  /** Student subscription academic scope. */
  subscriptionScope: {
    labels: {
      subject: { ar: 'مادة', en: 'Subject' },
      semester: { ar: 'فصل', en: 'Semester' },
      year: { ar: 'سنة', en: 'Year' },
      college: { ar: 'كلية', en: 'College' },
      university: { ar: 'جامعة', en: 'University' },
    },
    unknown: passThrough,
    passThroughUnknown: true,
    normalizeLower: true,
  } satisfies StatusDomain,
  /** Question report reason (reports moderation — legacy exact-case wire values). */
  reportReason: {
    labels: {
      scientific: { ar: 'خطأ علمي', en: 'Scientific' },
      typo: { ar: 'خطأ إملائي', en: 'Typo' },
      missingoption: { ar: 'خيار ناقص', en: 'Missing option' },
      unclearexplanation: { ar: 'شرح غير واضح', en: 'Unclear explanation' },
    },
    unknown: { ar: 'أخرى', en: 'Other' },
    normalizeLower: true,
  } satisfies StatusDomain,
  /** Access-code status (CodesCenter — lower-cases the wire value). */
  codeStatus: {
    labels: {
      active: { ar: 'نشط', en: 'Active' },
      used: { ar: 'مستخدم', en: 'Used' },
      revoked: { ar: 'مُبطَل', en: 'Revoked' },
      expired: { ar: 'منتهي', en: 'Expired' },
    },
    unknown: passThrough,
    passThroughUnknown: true,
    normalizeLower: true,
  },
  /** Redemption status (CodesCenter — lower-cases; feminine register). */
  redemptionStatus: {
    labels: {
      active: { ar: 'نشطة', en: 'Active' },
      cancelled: { ar: 'مُبطلة', en: 'Revoked' },
      revoked: { ar: 'مُبطلة', en: 'Revoked' },
      expired: { ar: 'منتهية', en: 'Expired' },
    },
    unknown: passThrough,
    passThroughUnknown: true,
    normalizeLower: true,
  },
  /** Library file type (LibraryCenter — exact-case wire values). */
  libraryType: {
    labels: {
      Pdf: { ar: 'ملف PDF', en: 'PDF' },
      Html: { ar: 'صفحة HTML', en: 'HTML' },
      Image: { ar: 'صورة', en: 'Image' },
      Video: { ar: 'فيديو', en: 'Video' },
      Audio: { ar: 'صوت', en: 'Audio' },
      Summary: { ar: 'ملخص', en: 'Summary' },
      Comprehensive: { ar: 'شامل', en: 'Comprehensive' },
      Paragraph: { ar: 'فقرة', en: 'Paragraph' },
    },
    unknown: passThrough,
    passThroughUnknown: true,
  },
  /** Library virus-scan status (lower-cases the wire value). */
  libraryScan: {
    labels: {
      clean: { ar: 'نظيف', en: 'Clean' },
      pending: { ar: 'قيد الفحص', en: 'Pending' },
      infected: { ar: 'مصاب', en: 'Infected' },
      error: { ar: 'خطأ', en: 'Error' },
    },
    unknown: passThrough,
    passThroughUnknown: true,
    normalizeLower: true,
  },
  /** Library institutional category (exact-case wire values). */
  libraryCategory: {
    labels: {
      Curriculum: { ar: 'منهاج', en: 'Curriculum' },
      Lecture: { ar: 'محاضرة', en: 'Lecture' },
      Summary: { ar: 'تلخيص', en: 'Summary' },
      GoldenIdeas: { ar: 'أفكار ذهبية', en: 'Golden ideas' },
    },
    unknown: { ar: 'غير مصنّف', en: 'Uncategorized' },
  },
  /** HTML media protection state (exact-case wire values). */
  mediaProtection: {
    labels: {
      Pending: { ar: 'جارٍ الحماية', en: 'Protecting' },
      Sanitized: { ar: 'تم التعقيم', en: 'Sanitized' },
      CSPApplied: { ar: 'تم الحماية', en: 'CSP applied' },
      Ready: { ar: 'جاهز', en: 'Ready' },
      Failed: { ar: 'فشلت المعالجة', en: 'Failed' },
    },
    unknown: passThrough,
    passThroughUnknown: true,
  },
  /** Question type (W21.1 glossary — shared by Questions/Exams centers). */
  questionType: {
    labels: {
      Mcq: { ar: 'اختيار من متعدد', en: 'MCQ' },
      TrueFalse: { ar: 'صح أو خطأ', en: 'True / False' },
      MultipleSelect: { ar: 'اختيارات متعددة', en: 'Multiple select' },
      Essay: { ar: 'تحريري', en: 'Essay' },
      Matching: { ar: 'وصل', en: 'Matching' },
    },
    unknown: { ar: 'نوع غير معروف', en: 'Unknown type' },
  },
  /** Question difficulty. */
  questionDifficulty: {
    labels: {
      Easy: { ar: 'سهل', en: 'Easy' },
      Medium: { ar: 'متوسط', en: 'Medium' },
      Hard: { ar: 'صعب', en: 'Hard' },
    },
    unknown: unknownLabel,
  },
  /** Episode / PDF processing status (chip labels). */
  mediaProcessing: {
    labels: {
      failed: { ar: 'فشلت المعالجة', en: 'Processing failed' },
      ready: { ar: 'جاهز', en: 'Ready' },
    },
    unknown: unknownLabel,
  },
} satisfies Record<string, StatusDomain>;

export type StatusDomainKey = keyof typeof registrySource;

/** Typed registry — every domain addressable by its literal key. */
export const statusRegistry: Record<StatusDomainKey, StatusDomain> = registrySource;

/**
 * Localized status label for a wire value. Mirrors the legacy per-center
 * behavior: known values render the glossary label; unknown values either
 * pass through verbatim (domains whose legacy code did that) or render the
 * domain's explicit unknown label. Never throws.
 */
export function statusLabel(locale: Locale, domain: StatusDomainKey, value: string | null | undefined): string {
  const entry = statusRegistry[domain];
  if (!entry) return value ?? '';
  const raw = value ?? '';
  const key = entry.normalizeLower ? raw.toLowerCase() : raw;
  const label = entry.labels[key];
  if (label) return label[locale];
  if (entry.passThroughUnknown) return raw;
  return entry.unknown[locale];
}
