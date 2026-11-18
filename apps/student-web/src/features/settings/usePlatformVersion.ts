import { useQuery } from '@tanstack/react-query';
import { FALLBACK_PLATFORM_VERSION, getPlatformVersion } from './preferences-api';

/**
 * Wave 16.4 — dynamic platform version for Settings → «حول»
 * (was: hardcoded «الإصدار 1.0.0»).
 *
 * Failure policy: a version string is cosmetic — if GET /system/version
 * fails (offline, deploy blip) the UI silently falls back to the last known
 * default instead of surfacing an error to the student.
 */
export function usePlatformVersion() {
  const query = useQuery({
    queryKey: ['platform-version'],
    queryFn: getPlatformVersion,
    staleTime: 60 * 60_000,
    retry: 1,
  });

  return {
    version: query.data ?? FALLBACK_PLATFORM_VERSION,
    isLoaded: query.isSuccess,
  };
}
