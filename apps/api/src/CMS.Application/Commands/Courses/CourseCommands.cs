using MediatR;
using CMS.Application.DTOs.Courses;
using CMS.Domain.Enums;

namespace CMS.Application.Commands.Courses;

// ===== Student queries =====
public record GetSubjectCoursesQuery(
    Guid StudentId,
    Guid SubjectId
) : IRequest<List<CourseListItemDto>>;

public record GetCourseByIdQuery(
    Guid Id,
    Guid StudentId
) : IRequest<CourseDto>;

public record GetEpisodeAccessCommand(
    Guid EpisodeId,
    Guid StudentId
) : IRequest<EpisodeAccessDto>;

// ===== Admin: course CRUD =====
public record GetAdminCourseByIdQuery(Guid Id) : IRequest<CourseDto>;

public record CreateCourseCommand(
    Guid SubjectId,
    string Title,
    string? Description,
    string? CoverImageUrl,
    Guid CreatedBy
) : IRequest<CourseDto>;

public record UpdateCourseCommand(
    Guid Id,
    string Title,
    string? Description,
    string? CoverImageUrl
) : IRequest<CourseDto>;

public record PublishCourseCommand(Guid Id) : IRequest<CourseDto>;

public record ArchiveCourseCommand(Guid Id) : IRequest<CourseDto>;

public record DeleteCourseCommand(Guid Id, Guid DeletedBy) : IRequest<Unit>;

// ===== Admin: episode CRUD =====
public record AddYouTubeEpisodeCommand(
    Guid CourseId,
    string Title,
    int EpisodeNumber,
    int? DurationSeconds,
    string YoutubeVideoId,
    Guid CreatedBy
) : IRequest<CourseEpisodeDto>;

public record UpdateEpisodeCommand(
    Guid Id,
    string Title,
    int EpisodeNumber,
    int? DurationSeconds,
    // Push 10.5 — PATCH-optional metadata: null leaves the stored value untouched
    // (the 10.4 edit modal always sends them; older callers keep compiling).
    string? Description = null,
    Difficulty? Difficulty = null,
    // Push 10.7 — PATCH-optional transcoding target: null keeps the stored quality.
    // Applies on the next encode (recovery sweep re-run or future re-queue); an
    // already-Ready episode keeps its existing HLS tree until re-encoded.
    TargetQuality? TargetQuality = null
) : IRequest<CourseEpisodeDto>;

public record DeleteEpisodeCommand(Guid Id, Guid DeletedBy) : IRequest<Unit>;

// ===== Admin: multipart upload orchestration =====
public record InitiateEpisodeUploadCommand(
    Guid CourseId,
    string FileName,
    string ContentType,
    long FileSize,
    string Title,
    int EpisodeNumber,
    Guid CreatedBy
) : IRequest<InitiateUploadDto>;

public record GetMultipartStatusQuery(
    Guid EpisodeId
) : IRequest<MultipartStatusDto>;

public record CompleteEpisodeUploadCommand(
    Guid EpisodeId,
    List<CompletedPartDto> Parts,
    // Push 10.5 — metadata riding the complete-upload body (the 10.4 upload panel
    // sends title/description/difficulty alongside the parts list). Title/description
    // are overrides for the values captured at initiate-upload; difficulty defaults
    // to the entity's stored tier when absent (null = leave unchanged).
    string? Title = null,
    string? Description = null,
    Difficulty? Difficulty = null,
    // Push 10.7 — admin-selected transcoding target riding the same body (absent on
    // older clients = keep the stored value, which defaults to Auto).
    TargetQuality? TargetQuality = null
) : IRequest<CourseEpisodeDto>;

public record AbortEpisodeUploadCommand(Guid EpisodeId, Guid DeletedBy) : IRequest<Unit>;
