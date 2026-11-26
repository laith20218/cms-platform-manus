/**
 * CMS Admin — Dictionary v2 composition and public API (PR-3 / DESIGN-01).
 *
 * The shared dictionary is composed from:
 *   • `./core`    — shell, navigation, login/2FA, common, admins, roles, scope,
 *                   palette, 404, modal, error-boundary furniture;
 *   • `./statuses`— the central status-label registry (statusLabel());
 *   • `./errors`  — API errorCode → localized human message mapping;
 *   • one section module per center (students, questions, exams, courses,
 *     library, codes, academic, reports, audit, admincenters, notifications).
 *
 * Public API:
 *   t(locale, path, params?)   — dotted-path lookup with {{token}} interpolation;
 *   hasDictKey(path)           — existence check (used by tests/CI inventory);
 *   statusLabel(locale, domain, value) — central status registry;
 *   apiErrorHumanMessage(error, locale) — backend error → human message;
 *   dictPathSuggestions()      — the full list of resolvable paths (tests).
 *
 * Missing-key contract: `t` returns the raw path string (never throws, never
 * blanks a surface) — the dictionary unit tests assert this behavior, and a
 * full-coverage test walks EVERY path in the composed tree.
 */
import { coreDict } from './core';
import { studentsDict } from './students';
import { questionsDict } from './questions';
import { examsDict } from './exams';
import { coursesDict } from './courses';
import { libraryDict } from './library';
import { codesDict } from './codes';
import { academicDict } from './academic';
import { reportsDict } from './reports';
import { auditDict } from './audit';
import { admincentersDict } from './admincenters';
import { notificationsDict } from './notifications';
import { dangerDict } from './danger';
import {
  interpolate,
  readDictEntry,
  resolveDictPath,
  type DictEntry,
  type DictSection,
  type InterpolationParams,
  type Locale,
} from './types';

export type { DictEntry, DictSection, InterpolationParams, Locale } from './types';
export type { StatusDomainKey } from './statuses';
export { statusRegistry, statusLabel } from './statuses';
export { apiErrorHumanMessage, apiErrorCodes, apiErrorFallbacks } from './errors';
export type { LocalizableError } from './errors';

/** The composed dictionary — the single source of Admin Web language. */
export const dictionary = {
  ...coreDict,
  students: studentsDict,
  questions: questionsDict,
  exams: examsDict,
  courses: coursesDict,
  library: libraryDict,
  codes: codesDict,
  academic: academicDict,
  reports: reportsDict,
  audit: auditDict,
  admincenters: admincentersDict,
  notifications: notificationsDict,
  danger: dangerDict,
} as const;

export type Dictionary = typeof dictionary;

/**
 * Resolve a localized string. `path` is a dotted key into `dictionary`.
 * Missing keys return the raw path (visible, debuggable, never a crash).
 * `params` interpolate `{{token}}` placeholders as plain text — values are
 * never interpreted as markup.
 */
export function t(locale: Locale, path: string, params?: InterpolationParams): string {
  const node = resolveDictPath(dictionary, path);
  const value = readDictEntry(node, locale);
  if (value === undefined) return path;
  return interpolate(value, params);
}

/** True when `path` resolves to a complete bilingual entry. */
export function hasDictKey(path: string): boolean {
  return readDictEntry(resolveDictPath(dictionary, path), 'ar') !== undefined
    && readDictEntry(resolveDictPath(dictionary, path), 'en') !== undefined;
}

/** Locale tag from the legacy `isArabic` boolean used across the centers. */
export function localeOf(isArabic: boolean): Locale {
  return isArabic ? 'ar' : 'en';
}

// ---- Test/inventory helpers (walk the composed tree) -----------------------

interface FlatEntry {
  path: string;
  entry: DictEntry;
}

function walk(prefix: string, node: DictSection, out: FlatEntry[]): void {
  for (const key of Object.keys(node)) {
    const child = node[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && 'ar' in child && 'en' in child) {
      out.push({ path, entry: child as DictEntry });
    } else if (child && typeof child === 'object') {
      walk(path, child as DictSection, out);
    }
  }
}

/** Every resolvable dotted path in the composed dictionary (tests/CI). */
export function dictEntries(): FlatEntry[] {
  const out: FlatEntry[] = [];
  walk('', dictionary as unknown as DictSection, out);
  return out;
}
