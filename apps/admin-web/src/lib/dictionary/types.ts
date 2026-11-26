/**
 * CMS Admin — Dictionary v2 type machinery (PR-3 / DESIGN-01).
 *
 * The dictionary is the single source for Admin Web user-facing language:
 *   • every entry carries exactly two locales — `ar` (primary, RTL) and `en`;
 *   • sections are plain nested objects, so TS can derive literal key paths;
 *   • `t()` resolves a dotted path at runtime with an explicit fallback
 *     (the raw path) so a missing key can never crash the console — and the
 *     dictionary unit tests assert the fallback behavior.
 *
 * Interpolation is `{{token}}`-style *string* replacement only. Values are
 * never interpreted as HTML: React renders them as text nodes, and the
 * translator never touches innerHTML. The tests inject markup-shaped params
 * to prove they pass through as inert text.
 */

export type Locale = 'ar' | 'en';

/** A single localized entry — exactly two locales, always. */
export type DictEntry = { readonly ar: string; readonly en: string };

/** A dictionary section: nested sections or localized entries. */
export type DictSection = { readonly [key: string]: DictEntry | DictSection };

/** Safe interpolation parameters (values are coerced to plain strings). */
export type InterpolationParams = Readonly<Record<string, string | number>>;

/**
 * Resolve a dotted path against a section tree. Returns `undefined` for a
 * missing key — the caller decides the fallback.
 */
export function resolveDictPath(root: unknown, path: string): unknown {
  if (!path) return undefined;
  let current: unknown = root;
  for (const part of path.split('.')) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Read a localized entry for a locale. Returns `undefined` unless the node is
 * an entry carrying BOTH locales (a partial entry is treated as missing so a
 * bad edit cannot silently blank one language).
 */
export function readDictEntry(node: unknown, locale: Locale): string | undefined {
  if (node && typeof node === 'object' && 'ar' in node && 'en' in node) {
    const value = (node as Record<string, unknown>)[locale];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

/**
 * Interpolate `{{token}}` placeholders with plain-string substitution.
 * Unknown tokens are left intact (visible, debuggable, never silently empty).
 */
export function interpolate(template: string, params?: InterpolationParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, token: string) => {
    const value = (params as Record<string, string | number>)[token];
    return value === undefined || value === null ? match : String(value);
  });
}

/**
 * Literal key-path type derived from a section tree. Entries map to their own
 * key; sections recurse with dotted paths. Used for editor autocomplete on
 * `t(locale, '…')` calls. Raw strings remain accepted at runtime (the
 * fallback contract above), so a not-yet-typed key never breaks a build.
 */
export type DictPaths<T> = T extends DictEntry
  ? never
  : {
      [K in keyof T & string]: T[K] extends DictEntry
        ? K
        : T[K] extends DictSection
          ? `${K}.${DictPaths<T[K]>}`
          : never;
    }[keyof T & string];
