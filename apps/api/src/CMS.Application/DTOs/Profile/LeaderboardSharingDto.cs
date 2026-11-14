namespace CMS.Application.DTOs.Profile;

/// <summary>
/// W15.4.4.0a — leaderboard mutual-sharing consent state (D2: default false).
/// Returned by GET /api/v1/profile/leaderboard-sharing and echoed by the PUT.
/// Serializes as { "sharesLeaderboard": true | false } under the API's camelCase policy.
/// </summary>
public record LeaderboardSharingDto(bool SharesLeaderboard);
