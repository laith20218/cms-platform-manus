import { isAxiosError } from 'axios';

type ApiProblem = {
  detail?: string;
  title?: string;
  message?: string;
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError<ApiProblem>(error)) return fallback;

  const payload = error.response?.data;
  return payload?.detail ?? payload?.message ?? payload?.title ?? fallback;
}
