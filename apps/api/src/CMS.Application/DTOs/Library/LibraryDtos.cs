namespace CMS.Application.DTOs.Library;

using System.Text.Json;
using CMS.Domain.Enums;

// ===== Library File DTOs =====
public record LibraryFileDto(
    Guid Id,
    Guid SubjectId,
    Guid? LectureId,
    string Type,        // pdf, html, image, video, summary, comprehensive, paragraph
    string? Category,   // institutional category: Curriculum | Lecture | Summary | GoldenIdeas (null on legacy rows)
    string Title,
    string? Description,
    long FileSize,
    string? FileFormat,
    int? DurationSeconds,
    int? PagesCount,
    string? ThumbnailUrl,
    string? YoutubeVideoId,
    List<string> Tags,
    int ViewsCount,
    int FavoritesCount,
    DateTime CreatedAt,
    // ===== Push 10.5 — rich metadata + transcoding lifecycle exposure =====
    // Same additive contract as CourseEpisodeDto: enum strings via the global
    // JsonStringEnumConverter, null ProcessingStatus = pipeline never applied
    // (non-video / legacy), ProcessingError only while status == Failed.
    Difficulty Difficulty = Difficulty.Easy,
    ProcessingStatus? ProcessingStatus = null,
    string? ProcessingError = null,
    string? HlsKey = null,
    // Push 10.7 — admin-selected transcoding target ("Auto"|"P360"|"P720"|"P1080").
    TargetQuality TargetQuality = TargetQuality.Auto,
    // ===== Wave 11.9 — Ghostscript PDF font pipeline exposure (additive keys) =====
    // Null PdfProcessingStatus = pipeline never applied (non-PDF / legacy rows).
    // FontPipelineFixed is the DERIVED "-fixed object was produced" flag. Since R22
    // it no longer flips the player's rendering (path rendering is universal) — it
    // remains on the wire for audit/observability.
    // ProcessingError rides only while the status is Failed (admin error modal).
    PdfProcessingStatus? PdfProcessingStatus = null,
    bool FontPipelineFixed = false,
    string? FontProcessingError = null,
    // R22.2 — human-readable Ghostscript font diagnostics (the Arabic substitution
    // report on Ready rows; the raw GS stderr tail on Failed rows). Null when the
    // pipeline never ran or the run was warning-free.
    string? DiagnosticReport = null,
    // R22.5.1 — the derived health classification the admin badge renders:
    //   "Healthy"      (سليم البنية)          — Ready + warning-free run;
    //   "BrokenArabic" (يحتاج معالجة بصرية)   — Ready + diagnostics present;
    //   null           — pipeline never ran (non-PDF/legacy) or still running/failed
    //                    (a Failed row's health is unclassifiable — the error modal
    //                    carries the evidence instead).
    string? HealthStatus = null,
    // ===== Wave 13 (F3) — HTML player pipeline exposure (additive keys) =====
    // Null ContentProcessingStatus = pipeline never applied (non-HTML / legacy rows).
    ContentProcessingStatus? ContentProcessingStatus = null,
    // The trusted-lesson flag — drives the student player's sandbox policy.
    bool EnableScripts = false
);

/// <summary>
/// R22.5.1 — the PDF health classification (admin badge + diagnostic surfaces).
/// Pure derivation off the EXISTING pipeline state — no schema change: the rule
/// reads the same ProcessingError column GhostscriptDiagnostics writes.
/// </summary>
public static class PdfHealthStatus
{
    /// <summary>سليم البنية — the run finished warning-free (no missing/substituted fonts).</summary>
    public const string Healthy = "Healthy";

    /// <summary>يحتاج معالجة بصرية — the run reported font problems; the player's
    /// R22 path rendering (fallback) is what keeps the text legible.</summary>
    public const string BrokenArabic = "BrokenArabic";

    /// <summary>
    /// The binary rule the task book pins, scoped to the only state that consumes it:
    /// Ready + empty diagnostics → Healthy; Ready + diagnostics → BrokenArabic.
    /// Everything else (never-processed, in-flight, Failed) is null — unclassified.
    /// </summary>
    public static string? Classify(PdfProcessingStatus? status, string? diagnosticReport) =>
        status == PdfProcessingStatus.Ready
            ? (string.IsNullOrWhiteSpace(diagnosticReport) ? Healthy : BrokenArabic)
            : null;
}

public record LibraryFileListItemDto(
    Guid Id,
    string Type,
    string Title,
    string? Description,
    long FileSize,
    int? DurationSeconds,
    int? PagesCount,
    string? ThumbnailUrl,
    int ViewsCount,
    bool IsFavorite,
    // Curricular classification (Curriculum / Lecture / Summary / GoldenIdeas) — null = uncategorized.
    string? Category = null,
    DateTime CreatedAt = default
);

// ===== Access (Signed URL) =====
public record FileAccessDto(
    string AccessUrl,
    DateTime ExpiresAt,
    WatermarkDto Watermark
);

public record WatermarkDto(
    string StudentName,
    string StudentPhone,
    string Timestamp,
    string SiteName
);

// ===== View Recording =====
public record RecordViewDto(
    int DurationSeconds,
    int? PagesViewed,
    decimal? CompletionPercentage
);

// ===== Upload (Admin) =====
public record RequestUploadUrlDto(
    string FileName,
    string ContentType,
    long FileSize,
    Guid SubjectId,
    Guid? LectureId,
    string Type,
    string Title,
    string? Description,
    LibraryFileCategory? Category = null,
    // Wave 13 (F3) — trusted interactive lesson flag (text/html only; ignored for
    // every other content type).
    bool EnableScripts = false
);

public record UploadUrlDto(
    string UploadUrl,
    string FileKey,
    Guid FileId
);

public record CompleteUploadDto(
    Guid FileId,
    string FileKey,
    long ActualFileSize,
    int? PagesCount,
    int? DurationSeconds,
    string? YoutubeVideoId,
    // Push 10.5 — optional metadata override (null = keep the values captured at
    // upload-url time). The current library UI does not send them yet; the keys are
    // additive so the wire contract stays forward-compatible.
    string? Title = null,
    string? Description = null,
    Difficulty? Difficulty = null,
    // Push 10.8 — admin-selected transcoding target for video files (the 10.7
    // binding gap: the command accepted it, this DTO dropped it). Absent = keep
    // the stored value (Auto).
    TargetQuality? TargetQuality = null,
    // Wave 13 (F3) — contract symmetry only; the authoritative flag is the one
    // persisted at upload-url time (see CompleteUploadCommand.EnableScripts).
    bool EnableScripts = false
);

// ===== Wave 11.8 / F2: PDF annotations =====
// Payload travels as a raw JSON object (System.Text.Json) and is stored 1:1 in the
// jsonb column after size/shape validation — the server is schema-agnostic for the
// geometry so the player can evolve rect/point shapes without a migration.
public record FileAnnotationDto(
    Guid Id,
    int PageNumber,
    string AnnotationType,   // "Highlight" | "Ink" | "Shape" | "Note" (global JsonStringEnumConverter contract)
    JsonElement Payload,
    DateTime CreatedAt,
    DateTime UpdatedAt
);

public record FileAnnotationUpsertDto(
    Guid Id,
    int PageNumber,
    string AnnotationType,
    JsonElement Payload
);

public record SaveFileAnnotationsDto(
    List<FileAnnotationUpsertDto> Upserts,
    List<Guid> DeletedIds
);

public record SaveFileAnnotationsResultDto(
    int AppliedCount,
    DateTime ServerTime
);

// ===== Admin: Update/Delete =====
public record UpdateLibraryFileDto(
    string Title,
    string? Description,
    List<string> Tags,
    Guid? LectureId,
    // Push 10.5 — difficulty is PATCH-optional: null leaves the stored tier untouched.
    Difficulty? Difficulty = null,
    // Push 10.8 — PATCH-optional transcoding target (same 10.7 binding gap).
    TargetQuality? TargetQuality = null
);
