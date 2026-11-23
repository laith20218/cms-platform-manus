import { isAxiosError } from 'axios';

type ApiProblem = {
  detail?: string;
  title?: string;
  message?: string;
  errors?: Record<string, string[]>;
  extensions?: {
    errors?: Record<string, string[]>;
  };
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError<ApiProblem>(error)) return fallback;

  const payload = error.response?.data;
  const validationErrors = payload?.errors ?? payload?.extensions?.errors;
  const firstValidationMessage = validationErrors
    ? Object.values(validationErrors).flat().find((message) => Boolean(message))
    : undefined;

  if (firstValidationMessage) return firstValidationMessage;
  return payload?.detail ?? payload?.message ?? payload?.title ?? fallback;
}

/**
 * Wave 18.1 error taxonomy — the shared classification every student-visible
 * surface must agree on:
 *   • network / timeout / 5xx → Arabic connection + retry copy (NEVER
 *     "unpublished", "policy forbids", or empty-catalog claims)
 *   • 403 → entitlement/activation pattern (reason from ProblemDetails)
 *   • 404 → not-found copy
 *   • anything else with a response → prefer the backend's Arabic
 *     ProblemDetails `detail` (business rule)
 */
export type ApiErrorKind = 'network' | 'forbidden' | 'not-found' | 'business';

/** HTTP status of an axios-shaped error, or undefined for connection faults. */
export function getHttpStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined;
}

/** True for connection failures, timeouts, and 5xx server faults — the states
 *  where "retry" is the honest remedy and empty/policy copy would be a lie. */
export function isNetworkError(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === undefined || status === 408 || (status ?? 0) >= 500;
}

/**
 * Wave A (remember-me hardening) — the ONLY failures allowed to end a session.
 *
 * A remembered session must be wiped exactly when the SERVER ruled it dead:
 * a 401/403 verdict from an authenticated call (the api-client interceptor
 * surfaces refresh rejections this way). Everything else keeps the session:
 *   • transport faults (no response — offline, DNS, timeout): the API on Render
 *     cold-starts; a slow first request is NOT a session verdict.
 *   • 408 / 429 / 5xx: the request never reached an auth decision, and the
 *     single-use refresh token was NOT consumed — retrying later is correct.
 *   • non-axios errors (an unexpected client bug): fail closed like before.
 */
export function isSessionEndingFailure(error: unknown): boolean {
  if (!isAxiosError(error)) return true;
  const status = error.response?.status;
  return status === 401 || status === 403;
}

/** R69 §2.E — the 403 denial reason: ProblemDetails `detail`, then `title`,
 *  then the X-Entitlement-Error header, else 'unknown'. Single source of truth
 *  for api-client's broadcast and the feature denial cards (D-13). */
export function getEntitlementReason(error: unknown): string {
  if (!isAxiosError<ApiProblem>(error)) return 'unknown';
  const headerReason = (
    error.response?.headers as Record<string, unknown> | undefined
  )?.['x-entitlement-error'];
  return (
    (typeof error.response?.data?.detail === 'string' && error.response.data.detail) ||
    (typeof error.response?.data?.title === 'string' && error.response.data.title) ||
    (typeof headerReason === 'string' && headerReason) ||
    'unknown'
  );
}

export interface ApiErrorUiCopy {
  /** connection / timeout / 5xx */
  network: string;
  /** 403 fallback — the ProblemDetails `detail` wins when present */
  forbidden: string;
  /** 404 fallback */
  notFound: string;
  /** any other API error fallback */
  business: string;
}

export interface ApiErrorUi {
  kind: ApiErrorKind;
  message: string;
}

/** Classify an API failure and produce its truthful Arabic message per the
 *  Wave 18.1 taxonomy. Pages own the titles/cards; this owns the copy rules. */
export function mapApiErrorToUi(error: unknown, copy: ApiErrorUiCopy): ApiErrorUi {
  if (isNetworkError(error)) return { kind: 'network', message: copy.network };
  const status = getHttpStatus(error);
  if (status === 403) return { kind: 'forbidden', message: getApiErrorMessage(error, copy.forbidden) };
  if (status === 404) return { kind: 'not-found', message: getApiErrorMessage(error, copy.notFound) };
  return { kind: 'business', message: getApiErrorMessage(error, copy.business) };
}
