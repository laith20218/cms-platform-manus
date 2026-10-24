using System.Text;
using CMS.Application.Interfaces;
using Ganss.Xss;
using Microsoft.Extensions.Logging;

namespace CMS.Infrastructure.Security;

/// <summary>
/// Server-side HTML sanitizer for uploaded library documents (Ganss.XSS).
///
/// Downloads the HTML object from storage, strips every dangerous construct the sanitizer
/// knows about — script/iframe/object/embed tags, inline event handlers (onclick=…),
/// javascript:/data: URLs, CSS injection vectors — and overwrites the same object key in
/// place so the database row keeps pointing at a single, always-clean object.
///
/// Failure semantics are fail-closed: ANY exception (storage outage, oversized body,
/// sanitizer fault) propagates to the caller, which must reject the upload and delete the
/// blob. A document that cannot be proven clean is never accepted.
///
/// Memory safety: the body is only buffered after the caller's declared ceiling is applied,
/// and the read is hard-capped at that value (plus a global 32 MB absolute cap) so a lying
/// storage object cannot OOM the container.
/// </summary>
public sealed class HtmlSanitizerService : IHtmlBlobSanitizer
{
    /// <summary>Sanitization hard cap independent of the caller's ceiling: 32 MB of HTML is far beyond any legitimate document.</summary>
    private const long AbsoluteHardCapBytes = 32L * 1024 * 1024;

    private readonly IFileStorageService _storage;
    private readonly ILogger<HtmlSanitizerService> _logger;

    public HtmlSanitizerService(IFileStorageService storage, ILogger<HtmlSanitizerService> logger)
    {
        _storage = storage;
        _logger = logger;
    }

    public async Task SanitizeAsync(string objectKey, long declaredSizeBytes, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(objectKey))
            throw new ArgumentException("Object key must be provided by the server.", nameof(objectKey));

        var effectiveCap = Math.Min(Math.Max(declaredSizeBytes, 0), AbsoluteHardCapBytes);
        if (effectiveCap == 0)
            return; // nothing to sanitize

        // ---- Bounded download: at most effectiveCap bytes are ever buffered ----
        string originalHtml;
        var buffer = new byte[effectiveCap];
        await using (var source = await _storage.DownloadAsync(objectKey, ct))
        {
            var totalRead = 0;
            while (totalRead < buffer.Length)
            {
                var read = await source.ReadAsync(buffer.AsMemory(totalRead, buffer.Length - totalRead), ct);
                if (read == 0) break;
                totalRead += read;
            }

            if (totalRead == buffer.Length && source.ReadByte() != -1)
                throw new InvalidOperationException(
                    $"HTML object '{objectKey}' exceeds the declared size ceiling ({effectiveCap} bytes); refusing to sanitize");

            originalHtml = Encoding.UTF8.GetString(buffer, 0, totalRead);
        }

        // ---- Sanitize (Ganss.XSS default policy) ----
        // Defaults strip script/iframe/object/embed/style vectors, on* attributes, javascript:/vbscript:
        // and dangerous data: URLs, form/action rewriting — while preserving ordinary Arabic text markup.
        // A fresh instance per call keeps the pipeline thread-safe under concurrent uploads.
        string sanitizedHtml;
        try
        {
            var sanitizer = new HtmlSanitizer();
            sanitizedHtml = sanitizer.Sanitize(originalHtml);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ganss.XSS sanitizer fault on object {ObjectKey}", objectKey);
            throw new InvalidOperationException("HTML sanitizer fault", ex);
        }

        if (string.IsNullOrEmpty(originalHtml))
        {
            _logger.LogInformation("HTML object {ObjectKey} is empty; nothing to sanitize", objectKey);
            return;
        }

        // ---- In-place overwrite (only when the sanitizer actually changed something) ----
        if (string.Equals(sanitizedHtml, originalHtml, StringComparison.Ordinal))
        {
            _logger.LogInformation("HTML object {ObjectKey} already clean; no rewrite needed", objectKey);
            return;
        }

        await using var sanitized = new MemoryStream(Encoding.UTF8.GetBytes(sanitizedHtml));
        await _storage.PutAsync(objectKey, sanitized, "text/html", ct);
        _logger.LogInformation(
            "HTML object {ObjectKey} sanitized in place ({OriginalLength:N0} chars → {SanitizedLength:N0} chars)",
            objectKey, originalHtml.Length, sanitizedHtml.Length);
    }
}
