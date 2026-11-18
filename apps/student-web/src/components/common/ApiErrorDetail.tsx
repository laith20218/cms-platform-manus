import { getApiProblemDetail } from '@/utils/api-problem-detail';

/**
 * Wave 16.3 — renders the API-provided Arabic error detail (ProblemDetails
 * `detail` / validation errors) under an error heading — or NOTHING when
 * the response carries no usable message, so each surface keeps its own
 * Arabic fallback. Shared by the leaderboard / profile / settings error
 * states (and later waves: 16.5 content pages, 16.6 audit).
 */
export function ApiErrorDetail({ error }: { error: unknown }) {
  const detail = getApiProblemDetail(error);
  if (!detail) return null;
  return (
    <p data-testid="api-error-detail" className="mt-2 text-sm text-[var(--c-text-muted)]">
      {detail}
    </p>
  );
}
