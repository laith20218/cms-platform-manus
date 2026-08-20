using MediatR;
using CMS.Application.DTOs.Offline;

namespace CMS.Application.Commands.Offline;

/// <summary>
/// Download a package of questions for offline use.
/// Can be by subject (all published questions) or by exam.
/// </summary>
public record DownloadOfflinePackageCommand(
    Guid StudentId,
    Guid SubjectId,
    Guid? ExamId,
    string? IdempotencyKey = null,
    string? InstallationId = null,
    string? OfflinePackagePublicKeySpki = null
) : IRequest<OfflinePackageDto>;

/// <summary>
/// Sync offline answers back to the server when online.
/// </summary>
public record SyncOfflineAnswersCommand(
    Guid StudentId,
    Guid PackageId,
    Guid? ExamSessionId,
    List<OfflineAnswerDto> Answers
) : IRequest<SyncResultDto>;

/// <summary>
/// Get list of student's downloaded offline packages.
/// </summary>
public record GetOfflinePackagesQuery(
    Guid StudentId
) : IRequest<List<OfflinePackageListItemDto>>;

/// <summary>Returns a minimal ownership- and installation-bound revocation status, without exposing package content or keys.</summary>
public record GetOfflinePackageStatusQuery(
    Guid StudentId,
    Guid PackageId,
    string InstallationId
) : IRequest<OfflinePackageStatusDto>;

/// <summary>
/// Delete an offline package (invalidate it on server).
/// </summary>
public record DeleteOfflinePackageCommand(
    Guid StudentId,
    Guid PackageId
) : IRequest<Unit>;
