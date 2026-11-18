import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FONT_SIZE_STORAGE_KEY,
  applyFontSizeStep,
  isFontSizeStep,
  readStoredFontSizeStep,
  type FontSizeStep,
} from './font-size';
import { getStudentPreferences, saveStudentPreferences } from './preferences-api';
import { getApiErrorMessage } from '@/utils/api-error';

/** Shared query (React Query dedupes by key — one fetch per cache lifetime). */
function useStudentPreferencesQuery() {
  return useQuery({
    queryKey: ['student-preferences'],
    queryFn: getStudentPreferences,
    staleTime: 5 * 60_000,
  });
}

/**
 * Wave 16.4 — reconciles the account's font-size preference (server) with the
 * per-device localStorage mirror, and applies it to <html>. Mounted once in
 * AppShell so a student logging in on a new device gets their size on ANY page,
 * not just after visiting Settings.
 */
export function useFontSizeSync(): void {
  const preferences = useStudentPreferencesQuery();

  useEffect(() => {
    const serverStep = preferences.data?.fontSize;
    if (isFontSizeStep(serverStep)) {
      // Server is the source of truth: adopt + mirror for next boot.
      applyFontSizeStep(serverStep);
      try {
        localStorage.setItem(FONT_SIZE_STORAGE_KEY, serverStep);
      } catch {
        // Storage unavailable (private mode) — the applied size still works.
      }
    }
  }, [preferences.data]);
}

/**
 * The SettingsPage control: current step (server-adopted), optimistic choose
 * with server persistence, and Arabic error feedback when the save fails
 * (W16.4 hardening — the control never reverts silently).
 */
export function useFontSize() {
  useFontSizeSync();
  const queryClient = useQueryClient();
  const preferences = useStudentPreferencesQuery();
  const [step, setStep] = useState<FontSizeStep>(readStoredFontSizeStep);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Adopt the server value into the CONTROL state whenever fresh data lands
  // (initial load, refetch, or the post-save setQueryData). Between data
  // arrivals the optimistic local state is authoritative.
  useEffect(() => {
    const serverStep = preferences.data?.fontSize;
    if (isFontSizeStep(serverStep)) {
      setStep(serverStep);
    }
  }, [preferences.data]);

  useEffect(() => {
    applyFontSizeStep(step);
  }, [step]);

  const save = useMutation({
    mutationFn: async (next: FontSizeStep) => {
      // PUT replaces the whole preferences object — read-merge-write so keys
      // owned by other features (exam-courses cascade filters, …) survive.
      const current = await getStudentPreferences();
      return saveStudentPreferences({ ...current, fontSize: next });
    },
  });

  const choose = (next: FontSizeStep) => {
    if (next === step) return;
    const previous = step;
    setStep(next);
    setSaveError(null);
    try {
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, next);
    } catch {
      // Mirror is best-effort; the server write below is the durable channel.
    }

    save.mutate(next, {
      onSuccess: (saved) => {
        queryClient.setQueryData(['student-preferences'], saved);
      },
      onError: (error: unknown) => {
        // Revert the optimistic apply and explain in Arabic (prefer the
        // backend's Arabic ProblemDetails detail when present).
        setStep(previous);
        setSaveError(getApiErrorMessage(error, 'تعذر حفظ تفضيل حجم الخط. تحقق من اتصالك وحاول مجدداً.'));
        toast.error(getApiErrorMessage(error, 'تعذر حفظ تفضيل حجم الخط. تحقق من اتصالك وحاول مجدداً.'));
      },
    });
  };

  return {
    step,
    choose,
    isSaving: save.isPending,
    saveError,
  };
}
