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
    int? DurationSeconds
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
    List<CompletedPartDto> Parts
) : IRequest<CourseEpisodeDto>;

public record AbortEpisodeUploadCommand(Guid EpisodeId, Guid DeletedBy) : IRequest<Unit>;
