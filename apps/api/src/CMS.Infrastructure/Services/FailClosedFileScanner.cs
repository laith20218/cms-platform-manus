using CMS.Application.Interfaces;

namespace CMS.Infrastructure.Services;

/// <summary>
/// Safe default until a managed malware-scanning provider is configured. The caller must
/// retain the asset in draft/quarantine state because this result can never authorize it.
/// </summary>
public sealed class FailClosedFileScanner : IFileScanner
{
    public Task<FileScanResult> ScanAsync(string objectKey, string? declaredContentType, CancellationToken ct = default) =>
        Task.FromResult(new FileScanResult(
            IsClean: false,
            IsInfected: false,
            Verdict: "not_configured",
            Detail: "No production malware-scanning provider is configured."));
}
