using MediatR;
using CMS.Application.DTOs.Stats;

namespace CMS.Application.Commands.Stats;

// ===== Student Stats =====
public record GetStudentStatsQuery(Guid StudentId, string Period = "all") : IRequest<StudentStatsDto>;

// ===== Leaderboard =====
public record GetLeaderboardQuery(
    string Scope,         // subject, year, college
    Guid? ScopeId,
    Guid? StudentId,
    string Period = "all", // all, month, week
    int Count = 100
) : IRequest<LeaderboardDto>;

// ===== Admin: Global Stats =====
public record GetGlobalStatsQuery() : IRequest<GlobalStatsDto>;
