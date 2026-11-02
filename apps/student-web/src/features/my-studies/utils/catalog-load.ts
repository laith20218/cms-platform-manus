import { isEntitlementDenied, EntitlementDeniedError } from '../services/courses-api';
import { getEntitlementToken } from '@/features/entitlements/services/entitlement-api';

/**
 * Wave 12.5.A (Group 1) — the per-subject catalog loader, ported 1:1 from the
 * CoursesCatalog R69 pattern (the supervisor-locked reference):
 *   • per-subject failures are COLLECTED, never swallowed — partial success keeps
 *     rendering what loaded;
 *   • a 403 triggers the bounded self-heal (one forced entitlement re-issue, one
 *     retry) before declaring a denial;
 *   • total denial throws `EntitlementDeniedError(reason)` → the variant-aware
 *     truthful card; total non-403 failure throws → the generic error card;
 *   • only a genuine 200-empty result reaches the empty state.
 *
 * The four catalogs (library, practice, library-hub, exams) previously wrapped
 * each per-subject fetch in `catch {}` — the exact R68 bug pattern — so a full
 * API failure rendered a false "no items" state.
 */

/** Pull the ProblemDetails reason (detail, then title) out of an axios rejection. */
export function extractProblemDetail(error: unknown): string | null {
  const body = (error as { response?: { data?: { detail?: unknown; title?: unknown } } } | undefined)?.response?.data;
  if (!body || typeof body !== 'object') return null;
  if (typeof body.detail === 'string' && body.detail) return body.detail;
  if (typeof body.title === 'string' && body.title) return body.title;
  return null;
}

interface LoadOutcome<T> {
  items: T[];
  loaded: number;
  failed: number;
  sawForbidden: boolean;
  denialReason: string;
}

async function loadAcrossSubjects<T>(
  ids: string[],
  fetchOne: (id: string) => Promise<T[]>,
  outcome: LoadOutcome<T>,
): Promise<void> {
  outcome.loaded = 0;
  outcome.failed = 0;
  await Promise.all(
    ids.map(async (id) => {
      try {
        const items = await fetchOne(id);
        outcome.items.push(...items);
        outcome.loaded += 1;
      } catch (loadError) {
        outcome.failed += 1; // partial failure — keep going, remember it
        if (isEntitlementDenied(loadError)) {
          outcome.sawForbidden = true;
          const reason = extractProblemDetail(loadError);
          if (reason) outcome.denialReason = reason;
        }
      }
    }),
  );
}

/**
 * The full CoursesCatalog queryFn semantics for ANY per-subject catalog.
 * Throws `EntitlementDeniedError` (total denial after self-heal) or `Error`
 * (total outage) — callers render the matching card via isError.
 */
export async function loadCatalogAcrossSubjects<T>(
  ids: string[],
  fetchOne: (id: string) => Promise<T[]>,
): Promise<T[]> {
  const outcome: LoadOutcome<T> = { items: [], loaded: 0, failed: 0, sawForbidden: false, denialReason: 'unknown' };

  await loadAcrossSubjects(ids, fetchOne, outcome);

  // R62 §2.C (H1 mitigation) — a 403 means the CACHED signed entitlement failed
  // server-side validation. The eviction listener has already dropped it; force
  // ONE re-issue and retry the failed subjects a single time before declaring
  // a denial. Bounded: at most one self-heal per queryFn invocation.
  if (outcome.sawForbidden) {
    outcome.items.length = 0;
    try {
      await getEntitlementToken(true); // forceRenewal — bypasses the (now empty) cache
    } catch (issueError) {
      // R69 §2.B — post-guard, POST /entitlements/issue 403s ONLY for
      // "No active grants for this student."; its ProblemDetails reason is the
      // most truthful denial signal available.
      const issueReason = extractProblemDetail(issueError);
      if (issueReason) outcome.denialReason = issueReason;
    }
    await loadAcrossSubjects(ids, fetchOne, outcome);
  }

  // Total denial even after the self-heal attempt → the specific truthful card.
  if (outcome.sawForbidden && outcome.loaded === 0) {
    throw new EntitlementDeniedError(outcome.denialReason);
  }
  // TOTAL failure: every subject blew up → throw so isError kicks in.
  if (outcome.loaded === 0 && outcome.failed > 0) {
    throw new Error('catalog-unreachable');
  }
  return outcome.items;
}
