import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getLeaderboardSharing, setLeaderboardSharing } from '../services/stats-api';

/**
 * W15.4.4.0b — the student's leaderboard mutual-sharing consent
 * (GET/PUT /profile/leaderboard-sharing, backend W15.4.4.0a).
 *
 * React Query is the only cache: no context, no global state, no
 * localStorage. Toggling invalidates both the consent query and any
 * mounted ['leaderboard'] query so the leaderboard reacts to the new
 * consent state immediately (its `enabled` flag reads isEnabled).
 *
 * W16.3 error hardening — the query error and the PUT error are exposed
 * (sharingError / toggleError) so the toggle UI can explain a failed
 * save instead of failing silently back to the stale value.
 */
export function useLeaderboardSharing() {
  const queryClient = useQueryClient();

  const sharingQuery = useQuery({
    queryKey: ['leaderboard-sharing'],
    queryFn: getLeaderboardSharing,
    staleTime: 30_000,
  });

  const sharingMutation = useMutation({
    mutationFn: (next: boolean) => setLeaderboardSharing(next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leaderboard-sharing'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
    },
  });

  const isEnabled = sharingQuery.data?.sharesLeaderboard === true;

  return {
    isEnabled,
    isLoading: sharingQuery.isLoading,
    isError: sharingQuery.isError,
    /** Raw GET error — for ApiErrorDetail rendering. */
    error: sharingQuery.error,
    refetch: sharingQuery.refetch,
    toggle: (next: boolean) => sharingMutation.mutate(next),
    isToggling: sharingMutation.isPending,
    /** PUT failed — the switch silently reverts unless the UI says why (W16.3). */
    toggleError: sharingMutation.isError ? sharingMutation.error : null,
    resetToggleError: () => sharingMutation.reset(),
  };
}
