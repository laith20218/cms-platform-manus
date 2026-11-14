import LeaderboardPage from '@/features/stats/pages/LeaderboardPage';

/**
 * /study → «الصدارة» tab (Wave 15.4.1 parallel build): the existing
 * LeaderboardPage mounted inside the hub. Phase 4 of this wave adds the
 * optional `hideBreadcrumb` prop (on LeaderboardPage and here) so the hub
 * owns the navigation context.
 */
export function LeaderboardTab() {
  return (
    <div data-testid="study-leaderboard-tab">
      <LeaderboardPage />
    </div>
  );
}
