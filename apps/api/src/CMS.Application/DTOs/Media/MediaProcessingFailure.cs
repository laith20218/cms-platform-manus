namespace CMS.Application.DTOs.Media;

/// <summary>
/// Push 10.5 — shared copy for assets whose transcoding pipeline terminated in
/// <see cref="CMS.Domain.Enums.ProcessingStatus.Failed"/>.
///
/// Push 10.3 persisted only the terminal status enum on the row (the worker logs the
/// full FFmpeg diagnostics server-side at failure time), so the read side surfaces an
/// honest, deterministic description instead of persisted logs. Both audiences of the
/// dual-language error modal are served:
///   • the Arabic human sentence rides the 422 ProblemDetails (detail + humanMessage
///     extension) via <c>MediaProcessingException.DefaultHumanMessage</c>;
///   • this technical string rides the episode/file DTO (<c>processingError</c> — feeds
///     the modal's collapsible section while polling) and the 422 technicalDetails
///     extension when playback is attempted on a Failed asset.
/// </summary>
public static class MediaProcessingFailure
{
    /// <summary>
    /// English/technical description for a Failed asset — safe to show to admins,
    /// never the primary message for students.
    /// </summary>
    public const string TechnicalDetails =
        "The FFmpeg transcoding pipeline marked this asset as Failed. The original upload is still stored. "
        + "Detailed FFmpeg diagnostics were logged server-side at failure time and are not persisted on the record — "
        + "retry processing or re-upload the source video.";
}
