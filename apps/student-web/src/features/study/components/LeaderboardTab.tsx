import LeaderboardPage from '@/features/stats/pages/LeaderboardPage';

/**
 * /study → «الصدارة» tab (Wave 15.4.1 parallel build): the existing
 * LeaderboardPage mounted inside the hub with `hideBreadcrumb` — the hub
 * owns the navigation context, so the breadcrumb trail is suppressed here
 * only (the standalone /leaderboard route keeps it).
 */
export function LeaderboardTab() {
  return (
    <div data-testid="study-leaderboard-tab">
      <LeaderboardPage hideBreadcrumb />
    </div>
  );
}
