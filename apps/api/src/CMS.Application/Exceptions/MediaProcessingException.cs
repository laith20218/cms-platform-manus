namespace CMS.Application.Exceptions;

/// <summary>
/// Push 10.3 — a media (FFmpeg) processing failure carrying TWO audiences in one exception:
///
///  • <see cref="HumanMessage"/> — Arabic, simple, safe to show to any user
///    (default: "تعذر معالجة الفيديو بسبب مشكلة في الترميز.").
///  • <see cref="TechnicalDetails"/> — English/technical, for logs and admins
///    (e.g. "FFmpeg exited with code 1: Invalid data found when processing input.").
///
/// The global exception middleware maps it to <c>422 Unprocessable Entity</c> with BOTH
/// messages in the ProblemDetails payload — the client decides which one to render.
/// Thrown by the transcoding pipeline surfaces (and future admin retry endpoints);
/// background-job failures catch it internally, mark the asset Failed and log both
/// strings rather than crashing the worker.
/// </summary>
public sealed class MediaProcessingException : Exception
{
    /// <summary>Default human-facing message (Arabic) per the Push 10.3 task book.</summary>
    public const string DefaultHumanMessage = "تعذر معالجة الفيديو بسبب مشكلة في الترميز.";

    /// <summary>User-facing Arabic message — simple, non-technical, always safe to display.</summary>
    public string HumanMessage { get; }

    /// <summary>English/technical explanation — logs, admins, engineers. Never shown as-is to students.</summary>
    public string TechnicalDetails { get; }

    public MediaProcessingException(
        string? humanMessage = null,
        string? technicalDetails = null,
        Exception? innerException = null)
        : base(string.IsNullOrWhiteSpace(humanMessage) ? DefaultHumanMessage : humanMessage, innerException)
    {
        HumanMessage = string.IsNullOrWhiteSpace(humanMessage) ? DefaultHumanMessage : humanMessage;
        TechnicalDetails = string.IsNullOrWhiteSpace(technicalDetails)
            ? "Media processing failed without technical details."
            : technicalDetails;
    }
}
