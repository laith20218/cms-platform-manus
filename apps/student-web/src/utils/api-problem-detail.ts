import { isAxiosError } from 'axios';

/**
 * Wave 16.3 — strict, student-facing API error detail extraction.
 *
 * `getApiErrorMessage` (utils/api-error.ts) is the broad helper: it also
 * falls back to `title` / `message`, which ASP.NET fills with ENGLISH
 * framework defaults ("Not Found", "One or more validation errors…").
 * This stricter variant surfaces ONLY what the backend deliberately
 * wrote for students — the Arabic ProblemDetails `detail` and custom
 * validation messages — so it can never leak programmer text.
 */
type ApiProblem = {
  detail?: string;
  errors?: Record<string, string[]>;
  extensions?: {
    errors?: Record<string, string[]>;
  };
};

export function getApiProblemDetail(error: unknown): string {
  if (!isAxiosError<ApiProblem>(error)) return '';
  const payload = error.response?.data;
  if (!payload) return '';
  if (typeof payload.detail === 'string' && payload.detail.trim()) return payload.detail.trim();
  const validationErrors = payload.errors ?? payload.extensions?.errors;
  const firstValidationMessage = validationErrors
    ? Object.values(validationErrors).flat().find((message) => Boolean(message))
    : undefined;
  return typeof firstValidationMessage === 'string' ? firstValidationMessage : '';
}
