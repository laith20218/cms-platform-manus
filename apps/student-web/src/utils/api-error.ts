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
