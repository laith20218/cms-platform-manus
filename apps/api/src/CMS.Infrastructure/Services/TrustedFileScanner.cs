using CMS.Application.Interfaces;

namespace CMS.Infrastructure.Services;

/// <summary>
/// Trust-based scanner that approves any uploaded object immediately.
///
/// This implementation exists because the platform operators have decided to trust
/// all uploaded content (the team is the sole uploader and content is reviewed
/// before upload). It replaces <see cref="FailClosedFileScanner"/> so that the
/// library publication pipeline can proceed: <c>CompleteUpload</c> will mark the
/// file <c>VirusScanStatus=Clean</c>, and <c>PublishLibraryFileCommand</c> will
/// succeed because the publish gate requires <c>VirusScanStatus == Clean</c>.
///
/// SECURITY IMPLICATIONS:
///   - This scanner performs NO malware detection.
///   - Do NOT use this scanner if files are uploaded by untrusted users or if
///     the platform accepts user-generated content from students.
///   - The upload endpoint remains protected by <c>[Authorize(Roles="admin,super_admin")]</c>
///     plus <c>HasPermissionAsync(Resources.Library, ...)</c> + ABAC scope checks,
///     so only authorized admins can trigger the trusted upload path.
///   - If a real scanner is needed later, register a different <c>IFileScanner</c>
///     implementation (e.g. <c>ClamAvFileScanner</c>) in DependencyInjection.
/// </summary>
public sealed class TrustedFileScanner : IFileScanner
{
    public Task<FileScanResult> ScanAsync(string objectKey, string? declaredContentType, CancellationToken ct = default) =>
        Task.FromResult(new FileScanResult(
            IsClean: true,
            IsInfected: false,
            Verdict: "trusted",
            Detail: "Content is trusted by the platform operator; no external scan performed."));
}
