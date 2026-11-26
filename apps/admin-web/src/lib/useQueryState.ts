/** PR-2 — generic URL query-string state for the admin shell.
 *
 * Follows the proven W14.3 D4 pattern from lib/academicContext.ts: the value
 * lives in the address bar (`?q=…&role=…&status=…&tab=…`), so a browser
 * refresh, a shared deep link, and history back/forward all restore the exact
 * working state. Writes use history `replace` (one entry per screen, not one
 * per keystroke — the back button stays a view-level undo).
 *
 * Scope note: PR-2 wires the App-shell surfaces (admins-center filters and
 * the overview tab). The content centers keep their internal state until
 * their overhaul PRs (PR-4 Question Bank, PR-5 Exams/Library, PR-6 Students)
 * adopt the hook during the rebuild, where their fetch effects are reworked
 * under test.
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface QueryStateApi {
  /** Current value (`defaultValue` when the parameter is absent). */
  value: string;
  /** Write the parameter (`defaultValue` removes it to keep the URL clean). */
  setValue: (next: string) => void;
}

/**
 * Single-parameter URL query state.
 * @param key URL parameter name (short + stable — it appears in the bar).
 * @param defaultValue value used when the parameter is absent; writing this
 *   value deletes the parameter instead of storing a redundant `key=`.
 * @param allowed optional whitelist — any value outside the set reads as
 *   `defaultValue` (protects against hand-edited URLs feeding a view state
 *   the component never renders).
 */
export function useQueryState(key: string, defaultValue: string, allowed?: readonly string[]): QueryStateApi {
  const [params, setParams] = useSearchParams();

  const raw = params.get(key) ?? defaultValue;
  const value = allowed && !allowed.includes(raw) ? defaultValue : raw;

  const setValue = useCallback(
    (next: string) => {
      setParams(
        (previous) => {
          const updated = new URLSearchParams(previous);
          if (next === defaultValue) updated.delete(key);
          else updated.set(key, next);
          return updated;
        },
        { replace: true },
      );
    },
    [key, defaultValue, setParams],
  );

  return useMemo(() => ({ value, setValue }), [value, setValue]);
}

/**
 * Atomically remove several query parameters in ONE history replace.
 *
 * Why: react-router's setParams functional updater reads the searchParams
 * captured at closure time, so several synchronous setValue calls inside one
 * event handler each compute from the same stale base — the last write wins
 * and earlier deletions are lost (observed with the admins-filter clear
 * action). Multi-key resets must be a single update.
 *
 * @param keys parameter names to remove; pass a module-level constant so the
 *   returned callback stays referentially stable.
 */
export function useClearQueryParams(keys: readonly string[]) {
  const [, setParams] = useSearchParams();
  return useCallback(
    () => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const key of keys) next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [keys, setParams],
  );
}

/**
 * PR-4 — atomically write SEVERAL parameters in ONE history replace.
 *
 * The PR-4 question-bank filter bar resets the page whenever a filter changes:
 * `page→1` + `filter→value` must land in a single update or the page deletion
 * is lost to the stale-closure quirk documented above (the last setValue would
 * re-add the old page). Each write mirrors useQueryState semantics: writing a
 * key's `defaultValue` removes it.
 */
export interface QueryParamWrite {
  key: string;
  value: string;
  /** The key's useQueryState default — writing it deletes the parameter. */
  defaultValue: string;
}

export function useQueryParamsWriter() {
  const [, setParams] = useSearchParams();
  return useCallback(
    (writes: readonly QueryParamWrite[]) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const write of writes) {
            if (write.value === write.defaultValue) next.delete(write.key);
            else next.set(write.key, write.value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
}
