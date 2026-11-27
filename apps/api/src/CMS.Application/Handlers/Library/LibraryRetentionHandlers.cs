using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using CMS.Application.Commands.Library;
using CMS.Application.Commands.Maintenance;
using CMS.Application.DTOs.Library;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.Library;

/// <summary>
/// PR-5 — the provider-neutral object-retention lifecycle for library assets
/// (Backblaze B2 is the verified provider; every state below carries no provider
/// semantics):
///
///   Active → Archived | Tombstoned (soft delete, retention pending)
///          → Quarantined (suspicion; hidden from students, object untouched)
///          → Restorable (restore returns the row to Draft)
///          → Final Deletion (purge: authorized + re-authenticated + retention-aware
///            + audited; the ONLY path that physically removes stored objects).
///
/// A normal archive/delete NEVER physically deletes a stored object. The purge flow
/// reuses the fail-closed Features:HardDeleteEnabled kill switch from the system
/// hard-delete (SystemMaintenanceHandlers.IsHardDeleteEnabled) so production stays
/// safe by default: with the flag off, nothing runs downstream — no password
/// verification, no storage access, no row removal.
/// </summary>
public sealed class LibraryRetentionHandlers :
    IRequestHandler<QuarantineLibraryFileCommand, LibraryFileDto>,
    IRequestHandler<RestoreLibraryFileCommand, LibraryFileDto>,
    IRequestHandler<PurgeLibraryFileCommand, PurgeLibraryFileResultDto>
{
    /// <summary>Default minimum tombstone/quarantine age before final deletion (days).
    /// Override per environment with Library:RetentionDays (0 = no minimum).</summary>
    public const int DefaultRetentionDays = 30;

    private static readonly string[] PipelineKeySuffixes = { "-fixed", "-sanitized", "-ready" };

    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IFileStorageService _storage;
    private readonly IPasswordHasher _passwordHasher;
    private readonly IConfiguration _configuration;
    private readonly ISecurityAuditWriter _securityAudit;
    private readonly ILogger<LibraryRetentionHandlers> _logger;

    public LibraryRetentionHandlers(
        IApplicationDbContext db,
        IUnitOfWork unitOfWork,
        IFileStorageService storage,
        IPasswordHasher passwordHasher,
        IConfiguration configuration,
        ISecurityAuditWriter securityAudit,
        ILogger<LibraryRetentionHandlers> logger)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _storage = storage;
        _passwordHasher = passwordHasher;
        _configuration = configuration;
        _securityAudit = securityAudit;
        _logger = logger;
    }

    // ===== Quarantine =====
    public async Task<LibraryFileDto> Handle(QuarantineLibraryFileCommand req, CancellationToken ct)
    {
        var file = await _db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == req.Id && f.DeletedAt == null, ct)
            ?? throw new NotFoundException("LibraryFile", req.Id);

        file.Quarantine(req.QuarantinedBy, req.Reason);
        await _unitOfWork.SaveChangesAsync(ct);

        await _securityAudit.LogSecurityEventAsync(null, req.QuarantinedBy, SecurityEventType.AdminAction, SecuritySeverity.Warning,
            $"action=library_file_quarantine; file={file.Id}", ct: ct);
        return LibraryHandlers.MapToDto(file);
    }

    // ===== Restore (quarantine lift or tombstone clear) =====
    public async Task<LibraryFileDto> Handle(RestoreLibraryFileCommand req, CancellationToken ct)
    {
        var file = await _db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == req.Id, ct)
            ?? throw new NotFoundException("LibraryFile", req.Id);

        file.RestoreFromTombstone(); // throws for rows with nothing to restore
        await _unitOfWork.SaveChangesAsync(ct);

        await _securityAudit.LogSecurityEventAsync(null, req.RestoredBy, SecurityEventType.AdminAction, SecuritySeverity.Info,
            $"action=library_file_restore; file={file.Id}", ct: ct);
        return LibraryHandlers.MapToDto(file);
    }

    // ===== Final deletion (purge) =====
    public async Task<PurgeLibraryFileResultDto> Handle(PurgeLibraryFileCommand req, CancellationToken ct)
    {
        // PR-1 (Gate B decision #3) shared with the system hard-delete: fail-closed
        // kill switch checked FIRST — before password verification, counts, storage
        // access or any transaction. With the flag off nothing downstream runs,
        // regardless of what the request carries.
        if (!SystemMaintenanceHandlers.IsHardDeleteEnabled(_configuration))
        {
            await _securityAudit.LogSecurityEventAsync(null, req.ActorAdminId, SecurityEventType.AdminAction, SecuritySeverity.Warning,
                $"action=library_file_purge; phase=rejected; reason=HARD_DELETE_DISABLED; file={req.Id}", ct: ct);
            throw new DomainException(
                "الحذف النهائي معطّل في هذه البيئة (Features:HardDeleteEnabled) — الاحتجاز هو المسار الافتراضي",
                "HARD_DELETE_DISABLED");
        }

        // Authorized: SuperAdmin only (mirrors the system hard-delete gate).
        var actor = await _db.Admins.AsNoTracking()
            .Include(admin => admin.Role)
            .FirstOrDefaultAsync(admin => admin.Id == req.ActorAdminId, ct)
            ?? throw new NotFoundException("Admin", req.ActorAdminId);
        if (actor.Role?.Name != Roles.SuperAdmin)
            throw new DomainException("هذه العملية متاحة للمدير العام فقط", "FORBIDDEN_NOT_SUPER_ADMIN");

        // Re-authenticated: the live session is not enough for a physical deletion.
        if (!_passwordHasher.VerifyPassword(req.ActorPassword ?? string.Empty, actor.PasswordHash))
            throw new DomainException("كلمة مرور المدير العام غير صحيحة", "INVALID_CURRENT_PASSWORD");

        var file = await _db.LibraryFiles.FirstOrDefaultAsync(f => f.Id == req.Id, ct)
            ?? throw new NotFoundException("LibraryFile", req.Id);

        // Lifecycle gate: final deletion is never a shortcut around retention — the
        // row must be tombstoned or quarantined first (Active → tombstone/quarantine
        // → purge). An active file is refused with a pointer to the normal delete.
        if (file.DeletedAt is null && file.RetentionState is not LibraryRetentionState.Quarantined)
            throw new DomainException(
                "لا يمكن الحذف النهائي لملف نشط — احذفه أولاً (يبقى محتجزاً) أو اعزله ثم نفّذ الحذف النهائي",
                "PURGE_REQUIRES_RETENTION_STATE");

        // Retention-aware: the row must have rested in its retention state for the
        // configured minimum window before the object can be physically destroyed.
        var retentionDays = ResolveRetentionDays();
        var retentionSince = file.DeletedAt ?? file.QuarantinedAt ?? DateTime.UtcNow;
        if (retentionSince.AddDays(retentionDays) > DateTime.UtcNow)
            throw new DomainException(
                $"لا يمكن الحذف النهائي قبل انقضاء مدة الاحتجاز ({retentionDays} يوماً من دخول الملف حالة الاحتجاز)",
                "LIBRARY_RETENTION_ACTIVE");

        // Student-private derivatives (cascade semantics of the FK model + the
        // polymorphic media rows that reference library files by design without a
        // DB FK). Counted first so the result reports exactly what was removed.
        var views = await _db.LibraryViews.Where(v => v.FileId == file.Id).ToListAsync(ct);
        var annotations = await _db.FileAnnotations.Where(a => a.FileId == file.Id).ToListAsync(ct);
        var bookmarks = await _db.FileBookmarks.Where(b => b.FileId == file.Id).ToListAsync(ct);
        var favorites = await _db.Favorites.Where(f => f.LibraryFileId == file.Id).ToListAsync(ct);
        var mediaBookmarks = await _db.MediaBookmarks
            .Where(b => b.AssetType == MediaAssetType.LibraryFile && b.AssetId == file.Id).ToListAsync(ct);
        var playbackProgress = await _db.PlaybackProgress
            .Where(p => p.AssetType == MediaAssetType.LibraryFile && p.AssetId == file.Id).ToListAsync(ct);

        await _securityAudit.LogSecurityEventAsync(null, req.ActorAdminId, SecurityEventType.AdminAction, SecuritySeverity.Critical,
            $"action=library_file_purge; phase=intent; file={file.Id}", ct: ct);

        // Physical deletion FIRST, row removal second: a provider failure mid-flight
        // leaves the tombstone + row intact (nothing in the DB has changed yet) and
        // the whole operation is safely retryable — S3 delete semantics are idempotent
        // (re-deleting an already-deleted prefix succeeds with count 0).
        var objectsDeleted = await PurgeStoredObjectsAsync(file, ct);

        // Database cleanup inside one transaction. Favorites pointing at the purged
        // file are DELETED (not nulled): the ternary CHECK constraint on favorites
        // (exactly one of QuestionId/LibraryFileId/CourseEpisodeId) forbids leaving a
        // row with zero targets, and a favorite for a purged file is meaningless —
        // the student's other favorites (questions, episodes) are untouched.
        await _unitOfWork.BeginTransactionAsync(ct);
        List<PurgeCountDto> results;
        try
        {
            _db.LibraryViews.RemoveRange(views);
            _db.FileAnnotations.RemoveRange(annotations);
            _db.FileBookmarks.RemoveRange(bookmarks);
            _db.MediaBookmarks.RemoveRange(mediaBookmarks);
            _db.PlaybackProgress.RemoveRange(playbackProgress);
            _db.Favorites.RemoveRange(favorites);
            _db.LibraryFiles.Remove(file);
            await _unitOfWork.SaveChangesAsync(ct);
            await _unitOfWork.CommitTransactionAsync(ct);
        }
        catch
        {
            await _unitOfWork.RollbackTransactionAsync(CancellationToken.None);
            throw;
        }

        results = new List<PurgeCountDto>();
        if (views.Count > 0) results.Add(new PurgeCountDto("library_views", views.Count));
        if (annotations.Count > 0) results.Add(new PurgeCountDto("file_annotations", annotations.Count));
        if (bookmarks.Count > 0) results.Add(new PurgeCountDto("file_bookmarks", bookmarks.Count));
        if (mediaBookmarks.Count > 0) results.Add(new PurgeCountDto("media_bookmarks", mediaBookmarks.Count));
        if (playbackProgress.Count > 0) results.Add(new PurgeCountDto("playback_progress", playbackProgress.Count));
        if (favorites.Count > 0) results.Add(new PurgeCountDto("favorites", favorites.Count));
        results.Add(new PurgeCountDto("library_file", 1));

        // Post-commit audit (same rationale as the wipe/hard-delete handlers: a
        // post-commit failure must never trigger a rollback attempt on a completed
        // transaction). The internal object key is an audit fact, not a secret.
        await _securityAudit.LogSecurityEventAsync(null, req.ActorAdminId, SecurityEventType.AdminAction, SecuritySeverity.Critical,
            $"action=library_file_purge; phase=executed; file={file.Id}; objects={objectsDeleted}; " +
            $"views={views.Count}; annotations={annotations.Count}; bookmarks={bookmarks.Count}; " +
            $"media_bookmarks={mediaBookmarks.Count}; playback_progress={playbackProgress.Count}; favorites={favorites.Count}", ct: ct);

        return new PurgeLibraryFileResultDto(file.Id, file.FileUrl, results);
    }

    /// <summary>Library:RetentionDays (default 30, clamped 0–3650). 0 disables the
    /// minimum-age gate deliberately (owner configuration choice), never by accident:
    /// an unparsable or missing value falls back to the safe default.</summary>
    private int ResolveRetentionDays()
    {
        var raw = _configuration["Library:RetentionDays"];
        if (!int.TryParse(raw, out var days)) return DefaultRetentionDays;
        return Math.Clamp(days, 0, 3650);
    }

    /// <summary>Physically removes every stored object of the asset. Folder-keyed
    /// uploads (the `library/{guid}/{guid}` convention since upload-url generates it)
    /// hold every derived object — original, -fixed/-sanitized/-ready siblings and the
    /// /hls/ tree — inside the one upload folder, so a single prefix delete covers the
    /// whole set. Legacy / non-folder keys fall back to explicit key deletes: the key,
    /// every suffix sibling, the stripped base of a swapped key, the HLS prefix and
    /// the pinned HlsKey.</summary>
    private async Task<int> PurgeStoredObjectsAsync(LibraryFile file, CancellationToken ct)
    {
        var key = file.FileUrl;
        var slash = key.LastIndexOf('/');
        if (slash > 0)
        {
            var folder = key[..slash];
            if (folder.StartsWith("library/", StringComparison.Ordinal))
            {
                var count = await _storage.DeletePrefixAsync(folder, ct);
                _logger.LogInformation(
                    "Library file objects purged (prefix). FileId={FileId} Folder={Folder} Objects={Count}",
                    file.Id, folder, count);
                return count;
            }
        }

        // Legacy/non-folder keys: explicit deletes (all idempotent at the provider).
        var total = 0;
        var bases = new HashSet<string> { key };
        foreach (var suffix in PipelineKeySuffixes)
        {
            if (key.EndsWith(suffix, StringComparison.Ordinal))
                bases.Add(key[..^suffix.Length]);
        }
        foreach (var baseKey in bases)
        {
            await _storage.DeleteAsync(baseKey, ct);
            foreach (var suffix in PipelineKeySuffixes)
                await _storage.DeleteAsync($"{baseKey}{suffix}", ct);
            // The HLS ladder lives under {key}/hls/ — covered by a prefix delete.
            total += await _storage.DeletePrefixAsync(baseKey, ct);
        }
        if (!string.IsNullOrEmpty(file.HlsKey))
            await _storage.DeleteAsync(file.HlsKey, ct);
        _logger.LogInformation(
            "Library file objects purged (explicit keys). FileId={FileId} Objects={Count}",
            file.Id, total);
        return total;
    }
}
