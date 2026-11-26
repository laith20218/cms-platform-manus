/**
 * CMS Admin — Centralized Dictionary (DESIGN-01, PR-3 v2).
 *
 * The dictionary moved to `./dictionary/` (one module per surface) in PR-3;
 * this file remains the stable import path for consumers. See
 * `./dictionary/index.ts` for the public API and the migration contract.
 */
export {
  t,
  hasDictKey,
  localeOf,
  dictionary,
  dictEntries,
  statusLabel,
  statusRegistry,
  apiErrorHumanMessage,
  apiErrorCodes,
  apiErrorFallbacks,
} from './dictionary/index';
export type {
  Locale,
  DictEntry,
  DictSection,
  InterpolationParams,
  StatusDomainKey,
  LocalizableError,
  Dictionary,
} from './dictionary/index';
