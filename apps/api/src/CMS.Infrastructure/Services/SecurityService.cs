using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using Microsoft.Extensions.Configuration;

namespace CMS.Infrastructure.Services;

/// <summary>
/// Security service - handles device binding, security logging, and suspicious activity detection.
/// </summary>
public class SecurityService : ISecurityAuditWriter
{
    private readonly ApplicationDbContext _db;
    private readonly ICacheService _cache;
    private readonly ISecurityEventBatch _auditBatch;
    private readonly ICorrelationContext _correlation;
    private readonly bool _singleActiveDevice;
    private const int AuditTextMaximumLength = 512;
    private static readonly Regex SensitiveAuditValuePattern = new(
        @"(?ix)\b(?<key>authorization|bearer|access[_-]?token|refresh[_-]?token|password|secret|api[_-]?key|key)\b\s*(?:[:=]\s*|\s+)(?<value>[^\s,;]+)",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public SecurityService(ApplicationDbContext db, ICacheService cache, ISecurityEventBatch auditBatch, ICorrelationContext correlation, IConfiguration configuration)
    {
        _db = db;
        _cache = cache;
        _auditBatch = auditBatch;
        _correlation = correlation;
        _singleActiveDevice = !bool.TryParse(configuration["Security:Device:SingleActiveDevice"], out var configured) || configured;
    }

    /// <summary>
    /// Verify device binding for a student.
    /// If student has no bound device, bind this one.
    /// If student has a different device, reject and log.
    /// </summary>
    public async Task<(bool IsValid, string? Reason)> VerifyDeviceBindingAsync(
        Guid studentId, string deviceFingerprint, string? ipAddress, string? userAgent, CancellationToken ct = default)
    {
        // Check if student already has a device bound
        var existingBinding = await _db.DeviceBindings
            .FirstOrDefaultAsync(d => d.StudentId == studentId && d.IsActive, ct);

        if (existingBinding == null)
        {
            // First login - bind the device
            _db.DeviceBindings.Add(new DeviceBinding
            {
                StudentId = studentId,
                DeviceFingerprint = deviceFingerprint,
                DeviceName = userAgent?.Length > 200 ? userAgent[..200] : userAgent,
                DeviceType = DetectDeviceType(userAgent),
                Os = DetectOS(userAgent),
                Browser = DetectBrowser(userAgent),
                UserAgent = userAgent,
                IpAddress = ipAddress != null ? System.Net.IPAddress.Parse(ipAddress) : null,
                IsActive = true,
                BoundAt = DateTime.UtcNow,
                LastUsed = DateTime.UtcNow
            });

            await _db.SaveChangesAsync(ct);
            await LogSecurityEventAsync(
                studentId, null, SecurityEventType.DeviceRegistered, SecuritySeverity.Info,
                "New device registered", ipAddress, userAgent, deviceFingerprint, ct);
            return (true, null);
        }

        // Check if same device
        if (existingBinding.DeviceFingerprint == deviceFingerprint)
        {
            // Update last used
            typeof(DeviceBinding).GetProperty("LastUsed")?.SetValue(existingBinding, DateTime.UtcNow);
            await _db.SaveChangesAsync(ct);
            return (true, null);
        }

        if (!_singleActiveDevice)
        {
            _db.DeviceBindings.Add(new DeviceBinding
            {
                StudentId = studentId,
                DeviceFingerprint = deviceFingerprint,
                DeviceName = userAgent?.Length > 200 ? userAgent[..200] : userAgent,
                DeviceType = DetectDeviceType(userAgent),
                Os = DetectOS(userAgent),
                Browser = DetectBrowser(userAgent),
                UserAgent = userAgent,
                IpAddress = ipAddress != null ? System.Net.IPAddress.Parse(ipAddress) : null,
                IsActive = true,
                BoundAt = DateTime.UtcNow,
                LastUsed = DateTime.UtcNow
            });
            await _db.SaveChangesAsync(ct);
            await LogSecurityEventAsync(studentId, null, SecurityEventType.DeviceRegistered, SecuritySeverity.Info,
                "Additional device registered", ipAddress, userAgent, deviceFingerprint, ct);
            return (true, null);
        }

        // Different device - reject and log
        await LogSecurityEventAsync(
            studentId, null,
            SecurityEventType.DeviceChange,
            SecuritySeverity.Warning,
            $"Login attempt from different device. Expected: {existingBinding.DeviceFingerprint[..8]}..., Got: {deviceFingerprint[..8]}...",
            ipAddress, userAgent, deviceFingerprint, ct);

        return (false, "تم رصد محاولة دخول من جهاز غير معروف. تم إشعار المدير.");
    }

    /// <summary>
    /// Log a security event.
    /// </summary>
    public async Task LogSecurityEventAsync(
        Guid? studentId, Guid? adminId,
        SecurityEventType eventType, SecuritySeverity severity,
        string description,
        string? ipAddress = null, string? userAgent = null,
        string? deviceFingerprint = null,
        CancellationToken ct = default)
    {
        var safeDescription = SanitizeAuditText(description) ?? string.Empty;
        var safeUserAgent = SanitizeAuditText(userAgent);
        var safeDeviceFingerprint = SanitizeAuditText(deviceFingerprint);
        var correlationId = _correlation.CorrelationId;
        var securityEvent = new SecurityEventWrite(
            studentId, adminId, eventType, severity, safeDescription, ipAddress, safeUserAgent, safeDeviceFingerprint, correlationId);

        if (MustPersistImmediately(eventType, severity))
        {
            var log = new SecurityLog
            {
                StudentId = studentId,
                AdminId = adminId,
                EventType = eventType,
                Severity = severity,
                Description = safeDescription,
                IpAddress = System.Net.IPAddress.TryParse(ipAddress, out var parsedIp) ? parsedIp : null,
                UserAgent = safeUserAgent,
                DeviceFingerprint = safeDeviceFingerprint,
                CorrelationId = correlationId
            };
            await _db.SecurityLogs.AddAsync(log, ct);
            await _db.SaveChangesAsync(ct);

            // Cache critical alerts only after their durable write has succeeded.
            if (severity == SecuritySeverity.Critical)
            {
                var cacheKey = $"security:critical:{DateTime.UtcNow:yyyyMMddHH}";
                var count = await _cache.GetAsync<int?>(cacheKey, ct) ?? 0;
                await _cache.SetAsync(cacheKey, count + 1, TimeSpan.FromHours(1), ct);
            }
            return;
        }

        await _auditBatch.EnqueueAsync(securityEvent, ct);
    }

    private static string? SanitizeAuditText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return value;

        var sanitized = SensitiveAuditValuePattern.Replace(value, match =>
            $"{match.Groups["key"].Value}=[REDACTED]");
        return sanitized.Length <= AuditTextMaximumLength
            ? sanitized
            : sanitized[..AuditTextMaximumLength];
    }

    /// <summary>
    /// Check for suspicious activity patterns.
    /// </summary>
    public async Task<(bool IsSuspicious, string? Reason)> CheckSuspiciousActivityAsync(
        Guid studentId, string? ipAddress, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var oneHourAgo = now.AddHours(-1);

        // Check: Too many failed logins
        var failedLogins = await _db.SecurityLogs
            .CountAsync(s => s.StudentId == studentId
                && s.EventType == SecurityEventType.LoginFailed
                && s.CreatedAt >= oneHourAgo, ct);

        if (failedLogins >= 5)
        {
            var reason = $"5+ failed login attempts in the last hour ({failedLogins} attempts)";
            await LogSecurityEventAsync(studentId, null, SecurityEventType.SecurityAlert, SecuritySeverity.Critical, reason, ipAddress, ct: ct);
            return (true, reason);
        }

        // Check: Multiple device changes
        var deviceChanges = await _db.SecurityLogs
            .CountAsync(s => s.StudentId == studentId
                && s.EventType == SecurityEventType.DeviceChange
                && s.CreatedAt >= oneHourAgo, ct);

        if (deviceChanges >= 3)
        {
            var reason = $"3+ device changes in the last hour ({deviceChanges} changes)";
            await LogSecurityEventAsync(studentId, null, SecurityEventType.SecurityAlert, SecuritySeverity.Critical, reason, ipAddress, ct: ct);
            return (true, reason);
        }

        // Check: Copy attempts
        var copyAttempts = await _db.SecurityLogs
            .CountAsync(s => s.StudentId == studentId
                && s.EventType == SecurityEventType.CopyAttempt
                && s.CreatedAt >= oneHourAgo, ct);

        if (copyAttempts >= 10)
        {
            var reason = $"10+ copy attempts in the last hour ({copyAttempts} attempts)";
            await LogSecurityEventAsync(studentId, null, SecurityEventType.SecurityAlert, SecuritySeverity.Critical, reason, ipAddress, ct: ct);
            return (true, reason);
        }

        // Check: DevTools detection
        var devtoolsCount = await _db.SecurityLogs
            .CountAsync(s => s.StudentId == studentId
                && s.EventType == SecurityEventType.DevtoolsDetected
                && s.CreatedAt >= oneHourAgo, ct);

        if (devtoolsCount >= 5)
        {
            var reason = $"5+ DevTools detections in the last hour ({devtoolsCount} detections)";
            await LogSecurityEventAsync(studentId, null, SecurityEventType.SecurityAlert, SecuritySeverity.Critical, reason, ipAddress, ct: ct);
            return (true, reason);
        }

        return (false, null);
    }

    /// <summary>
    /// Get security logs for a student (admin view).
    /// </summary>
    public async Task<List<SecurityLog>> GetStudentSecurityLogsAsync(
        Guid studentId, int count = 50, CancellationToken ct = default)
    {
        return await _db.SecurityLogs.AsNoTracking()
            .Where(s => s.StudentId == studentId)
            .OrderByDescending(s => s.CreatedAt)
            .Take(count)
            .ToListAsync(ct);
    }

    /// <summary>
    /// Get critical security alerts (admin dashboard).
    /// </summary>
    public async Task<List<SecurityLog>> GetCriticalAlertsAsync(int count = 20, CancellationToken ct = default)
    {
        return await _db.SecurityLogs.AsNoTracking()
            .Where(s => s.Severity == SecuritySeverity.Critical)
            .OrderByDescending(s => s.CreatedAt)
            .Take(count)
            .ToListAsync(ct);
    }

    /// <summary>
    /// Unbind a student's device (admin action).
    /// </summary>
    public async Task UnbindDeviceAsync(Guid studentId, Guid adminId, CancellationToken ct = default)
    {
        var bindings = await _db.DeviceBindings
            .Where(d => d.StudentId == studentId && d.IsActive)
            .ToListAsync(ct);

        foreach (var binding in bindings)
        {
            typeof(DeviceBinding).GetProperty("IsActive")?.SetValue(binding, false);
        }

        await LogSecurityEventAsync(
            studentId, adminId,
            SecurityEventType.DeviceBindingFailed,
            SecuritySeverity.Info,
            "Device unbound by admin",
            null, null, null, ct);

        await _db.SaveChangesAsync(ct);
    }

    private static bool MustPersistImmediately(SecurityEventType eventType, SecuritySeverity severity) =>
        severity is SecuritySeverity.Warning or SecuritySeverity.Critical ||
        eventType is SecurityEventType.LoginFailed
            or SecurityEventType.DeviceRegistered
            or SecurityEventType.DeviceChange
            or SecurityEventType.DeviceBindingFailed
            or SecurityEventType.RefreshReuse
            or SecurityEventType.SessionRevoked
            or SecurityEventType.EntitlementDenied
            or SecurityEventType.FileAccessDenied
            or SecurityEventType.OfflineSyncRejected
            or SecurityEventType.SuspiciousActivity
            or SecurityEventType.SecurityAlert;

    // ===== Helpers =====
    private static string DetectDeviceType(string? userAgent)
    {
        if (string.IsNullOrEmpty(userAgent)) return "unknown";
        if (userAgent.Contains("Mobile") || userAgent.Contains("Android") || userAgent.Contains("iPhone")) return "mobile";
        if (userAgent.Contains("iPad") || userAgent.Contains("Tablet")) return "tablet";
        return "desktop";
    }

    private static string DetectOS(string? userAgent)
    {
        if (string.IsNullOrEmpty(userAgent)) return "unknown";
        if (userAgent.Contains("Windows")) return "Windows";
        if (userAgent.Contains("Mac OS")) return "macOS";
        if (userAgent.Contains("Android")) return "Android";
        if (userAgent.Contains("iPhone") || userAgent.Contains("iPad")) return "iOS";
        if (userAgent.Contains("Linux")) return "Linux";
        return "unknown";
    }

    private static string DetectBrowser(string? userAgent)
    {
        if (string.IsNullOrEmpty(userAgent)) return "unknown";
        if (userAgent.Contains("Edg")) return "Edge";
        if (userAgent.Contains("Chrome")) return "Chrome";
        if (userAgent.Contains("Firefox")) return "Firefox";
        if (userAgent.Contains("Safari")) return "Safari";
        return "unknown";
    }
}
