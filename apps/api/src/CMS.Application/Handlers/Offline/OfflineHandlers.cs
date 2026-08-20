using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using CMS.Application.Commands.Offline;
using CMS.Application.DTOs.Offline;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Application.Interfaces;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace CMS.Application.Handlers.Offline;

/// <summary>
/// Handles offline content management.
/// Students can download question packages for offline use,
/// solve them without internet, then sync results when online.
/// </summary>
public class OfflineHandlers :
    IRequestHandler<DownloadOfflinePackageCommand, OfflinePackageDto>,
    IRequestHandler<SyncOfflineAnswersCommand, SyncResultDto>,
    IRequestHandler<GetOfflinePackagesQuery, List<OfflinePackageListItemDto>>,
    IRequestHandler<GetOfflinePackageStatusQuery, OfflinePackageStatusDto>,
    IRequestHandler<DeleteOfflinePackageCommand, Unit>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ICacheService _cache;
    private readonly IConfiguration _configuration;
    private readonly IOfflinePackageLifecycleService _packageLifecycle;
    private readonly ISecurityAuditWriter _audit;

    public OfflineHandlers(IApplicationDbContext db, IUnitOfWork unitOfWork, ICacheService cache, IConfiguration configuration, IOfflinePackageLifecycleService packageLifecycle, ISecurityAuditWriter audit)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _cache = cache;
        _configuration = configuration;
        _packageLifecycle = packageLifecycle;
        _audit = audit;
    }

    private void EnsureOfflineIsExplicitlyEnabled()
    {
        var enabled = bool.TryParse(_configuration["Features:OfflineEnabled"], out var featureEnabled) && featureEnabled;
        var aesGcmImplemented = bool.TryParse(_configuration["Features:OfflineAesGcmImplemented"], out var aesEnabled) && aesEnabled;
        var manifestImplemented = bool.TryParse(_configuration["Features:OfflineManifestImplemented"], out var manifestEnabled) && manifestEnabled;
        var keyReleaseImplemented = bool.TryParse(_configuration["Features:OfflineKeyReleaseImplemented"], out var keyReleaseEnabled) && keyReleaseEnabled;
        var packageIssuanceImplemented = bool.TryParse(_configuration["Features:OfflinePackageIssuanceImplemented"], out var issuanceEnabled) && issuanceEnabled;

        if (!enabled || !aesGcmImplemented || !manifestImplemented || !keyReleaseImplemented || !packageIssuanceImplemented)
            throw new ForbiddenException("التنزيل دون اتصال معطّل حتى اعتماد AES-256-GCM وManifest الموقع وإصدار المفتاح الآمن");
    }

    /// <summary>
    /// Download a package of questions for offline use.
    /// Legacy path remains fail-closed unless the complete versioned encrypted-package contract is enabled.
    /// Correct answers are NOT included and are verified server-side on sync.
    /// </summary>
    public async Task<OfflinePackageDto> Handle(DownloadOfflinePackageCommand req, CancellationToken ct)
    {
        EnsureOfflineIsExplicitlyEnabled();
        var trustedClientRequired = bool.TryParse(_configuration["Features:OfflineTrustedClientImplemented"], out var trustedClientEnabled) && trustedClientEnabled;
        if (trustedClientRequired && string.IsNullOrWhiteSpace(req.OfflinePackagePublicKeySpki))
            throw new ForbiddenException("Offline trusted client device key is required before package issuance");
        await BindOfflinePackagePublicKeyAsync(req.StudentId, req.InstallationId, req.OfflinePackagePublicKeySpki, ct);
        // Get subject info
        var subject = await _db.Subjects.AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == req.SubjectId, ct)
            ?? throw new NotFoundException("Subject", req.SubjectId);

        // Get published questions
        var query = _db.Questions.AsNoTracking()
            .Include(q => q.Options)
            .Where(q => q.SubjectId == req.SubjectId && q.Status == ContentStatus.Published);

        // Filter by exam if specified
        string? examTitle = null;
        if (req.ExamId.HasValue)
        {
            var exam = await _db.Exams.AsNoTracking().FirstOrDefaultAsync(e => e.Id == req.ExamId, ct);
            if (exam != null)
            {
                query = query.Where(q => q.ExamId == req.ExamId);
                examTitle = exam.TitleAr;
            }
        }

        var questions = await query.OrderBy(q => q.CreatedAt).ToListAsync(ct);

        if (!questions.Any())
            throw new DomainException("لا توجد أسئلة منشورة في هذه المادة", "NO_QUESTIONS");

        var downloadedAt = DateTime.UtcNow;
        var expiresAt = downloadedAt.AddDays(7);
        var packageQuestions = questions.Select(q => new OfflineQuestionDto(
            q.Id, q.Text, q.Type.ToString(), q.Difficulty.ToString(), q.Tags,
            q.Options.OrderBy(o => o.SortOrder).Select(o => new OfflineOptionDto(o.Id, o.OptionLetter, o.Text)).ToList()
        )).ToList();
        var plaintext = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(packageQuestions);
        var examKey = req.ExamId?.ToString("N") ?? "all";
        var idempotencyKey = string.IsNullOrWhiteSpace(req.IdempotencyKey)
            ? $"legacy:{req.SubjectId:N}:{examKey}"
            : req.IdempotencyKey;
        var envelope = await _packageLifecycle.IssueAsync(
            req.StudentId, req.InstallationId ?? throw new UnauthorizedAccessException("Installation binding is required"), 1, idempotencyKey,
            new[] { req.SubjectId }, expiresAt, plaintext, req.OfflinePackagePublicKeySpki, ct);

        var packageMetadata = new
        {
            PackageId = envelope.Manifest.PackageId,
            StudentId = req.StudentId,
            SubjectId = req.SubjectId,
            ExamId = req.ExamId,
            DownloadedAt = envelope.Manifest.IssuedAt,
            ExpiresAt = envelope.Manifest.ExpiresAt,
            QuestionIds = questions.Select(q => q.Id).ToList(),
            CorrectAnswers = questions.ToDictionary(q => q.Id, q => q.Options.FirstOrDefault(o => o.IsCorrect)?.Id.ToString() ?? "")
        };
        await _cache.SetAsync($"offline:{envelope.Manifest.PackageId}", packageMetadata, TimeSpan.FromDays(7), ct);
        await _cache.SetAsync($"offline:{envelope.Manifest.PackageId}:answers", packageMetadata.CorrectAnswers, TimeSpan.FromDays(7), ct);
        await _audit.LogSecurityEventAsync(req.StudentId, null, SecurityEventType.OfflinePackageCreated, SecuritySeverity.Info, "Offline package issued", ct: ct);

        return new OfflinePackageDto(
            envelope.Manifest.PackageId, req.SubjectId, req.ExamId, subject.NameAr, examTitle,
            questions.Count, envelope.Manifest.IssuedAt, envelope.Manifest.ExpiresAt,
            envelope.Manifest, envelope.CiphertextBase64Url, envelope.TagBase64Url,
            envelope.WrappedKeyBase64Url, envelope.KeyReleaseToken);

    }

    private async Task BindOfflinePackagePublicKeyAsync(Guid studentId, string? installationId, string? publicKeySpki, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(publicKeySpki)) return; // Legacy package tests remain available only under explicit test feature gates.
        if (string.IsNullOrWhiteSpace(installationId)) throw new UnauthorizedAccessException("Installation binding is required");
        byte[] encoded;
        try { encoded = Convert.FromBase64String(publicKeySpki); }
        catch (FormatException) { throw new DomainException("Offline device public key is invalid", "OFFLINE_DEVICE_KEY_INVALID"); }
        try
        {
            using var rsa = RSA.Create();
            rsa.ImportSubjectPublicKeyInfo(encoded, out var consumed);
            if (consumed != encoded.Length || rsa.KeySize < 2048)
                throw new CryptographicException("Invalid RSA device key");
        }
        catch (CryptographicException)
        {
            throw new DomainException("Offline device public key is invalid", "OFFLINE_DEVICE_KEY_INVALID");
        }

        var binding = await _db.DeviceBindings.FirstOrDefaultAsync(device =>
            device.StudentId == studentId && device.DeviceFingerprint == installationId && device.IsActive, ct)
            ?? throw new UnauthorizedAccessException("Active device binding is required for offline package key release");
        if (string.IsNullOrWhiteSpace(binding.OfflinePackagePublicKeySpki))
        {
            binding.OfflinePackagePublicKeySpki = publicKeySpki;
            await _unitOfWork.SaveChangesAsync(ct);
            return;
        }
        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(binding.OfflinePackagePublicKeySpki), Encoding.UTF8.GetBytes(publicKeySpki)))
            throw new ForbiddenException("Offline device key does not match the active installation binding");
    }

    /// <summary>
    /// Sync offline answers when the student comes back online.
    /// Verifies answers against cached correct answers.
    /// </summary>
    public async Task<SyncResultDto> Handle(SyncOfflineAnswersCommand req, CancellationToken ct)
    {
        EnsureOfflineIsExplicitlyEnabled();
        var package = await _db.OfflinePackageRecords.AsNoTracking()
            .FirstOrDefaultAsync(record => record.Id == req.PackageId && record.StudentId == req.StudentId, ct);
        if (package is null || package.Status != "active" || package.RevokedAt.HasValue || package.ExpiresAt <= DateTime.UtcNow)
        {
            await _audit.LogSecurityEventAsync(req.StudentId, null, SecurityEventType.OfflineSyncRejected, SecuritySeverity.Warning, "Offline sync rejected by package ownership or lifecycle state", ct: ct);
            throw new ForbiddenException("الحزمة غير مملوكة لهذا الطالب أو منتهية أو ملغاة");
        }

        var manifest = JsonSerializer.Deserialize<OfflinePackageManifest>(package.ManifestJson)
            ?? throw new ForbiddenException("manifest الحزمة غير صالح");
        if (manifest.UserId != req.StudentId || manifest.ExpiresAt <= DateTime.UtcNow || manifest.AllowedSubjects.Count == 0)
        {
            await _audit.LogSecurityEventAsync(req.StudentId, null, SecurityEventType.OfflineSyncRejected, SecuritySeverity.Warning, "Offline sync rejected by manifest validation", ct: ct);
            throw new ForbiddenException("manifest الحزمة لا يطابق الطالب أو انتهى أو لا يملك نطاق محتوى");
        }

        // Get cached package metadata only after durable ownership and manifest-scope validation.
        var cacheKey = $"offline:{req.PackageId}";
        var metadata = await _cache.GetAsync<dynamic>(cacheKey, ct);

        if (metadata == null)
            throw new DomainException("انتهت صلاحية الحزمة أو لم يتم العثور عليها. يرجى إعادة التحميل", "PACKAGE_EXPIRED");

        // Get correct answers from cache
        var correctAnswersRaw = await _cache.GetAsync<Dictionary<Guid, string>>($"{cacheKey}:answers", ct);

        int success = 0;
        int failed = 0;
        var errors = new List<string>();

        // Get student
        var student = await _db.Students.FirstOrDefaultAsync(s => s.Id == req.StudentId, ct);
        if (student == null)
            throw new NotFoundException("Student", req.StudentId);

        // Process each answer
        foreach (var answer in req.Answers)
        {
            try
            {
                // Verify the question exists and belongs to the package
                var question = await _db.Questions
                    .Include(q => q.Options)
                    .FirstOrDefaultAsync(q => q.Id == answer.QuestionId && manifest.AllowedSubjects.Contains(q.SubjectId), ct);

                if (question == null)
                {
                    failed++;
                    errors.Add($"السؤال {answer.QuestionId} غير موجود");
                    continue;
                }

                // Check if already answered (avoid duplicates from re-sync)
                var existingAttempt = await _db.AttemptLogs
                    .AnyAsync(a => a.StudentId == req.StudentId
                        && a.QuestionId == answer.QuestionId
                        && a.IsOffline, ct);

                if (existingAttempt)
                {
                    // Skip already synced answers
                    success++;
                    continue;
                }

                // Determine correct answer
                var correctOption = question.Options.FirstOrDefault(o => o.IsCorrect);
                var isCorrect = answer.SelectedOptionId == correctOption?.Id.ToString();

                // Verify with client-reported correctness (optional sanity check)
                // If client says correct but server says wrong, trust the server
                if (answer.IsCorrect != isCorrect)
                {
                    // Log potential tampering attempt
                    // In production, this could trigger a security alert
                }

                // Check if first attempt
                var isFirstAttempt = !await _db.AttemptLogs
                    .AnyAsync(a => a.StudentId == req.StudentId && a.QuestionId == answer.QuestionId, ct);

                // Create attempt log
                _db.AttemptLogs.Add(new AttemptLog
                {
                    StudentId = req.StudentId,
                    QuestionId = answer.QuestionId,
                    ExamSessionId = req.ExamSessionId,
                    SelectedAnswer = answer.SelectedOptionId,
                    IsCorrect = isCorrect,
                    IsFirstAttempt = isFirstAttempt,
                    AttemptNumber = await _db.AttemptLogs.CountAsync(a => a.StudentId == req.StudentId && a.QuestionId == answer.QuestionId, ct) + 1,
                    DurationSeconds = answer.DurationSeconds,
                    IsOffline = true,
                    AnsweredAt = answer.AnsweredAt,
                    SyncedAt = DateTime.UtcNow
                });

                // Update question stats
                question.RecordAttempt(isCorrect);

                // Update student stats
                student.RecordActivity();
                student.RecordAnswer(isCorrect);

                success++;
            }
            catch (Exception ex)
            {
                failed++;
                errors.Add($"السؤال {answer.QuestionId}: {ex.Message}");
            }
        }

        await _unitOfWork.SaveChangesAsync(ct);

        return new SyncResultDto(
            req.Answers.Count,
            success,
            failed,
            errors,
            new UpdatedStatsDto(
                student.QuestionsAnswered,
                student.CorrectAnswers,
                student.GetAccuracy(),
                student.CurrentStreak
            )
        );
    }

    /// <summary>
    /// Get list of student's downloaded offline packages.
    /// </summary>
    public async Task<List<OfflinePackageListItemDto>> Handle(GetOfflinePackagesQuery req, CancellationToken ct)
    {
        EnsureOfflineIsExplicitlyEnabled();
        var now = DateTime.UtcNow;
        var records = await _db.OfflinePackageRecords.AsNoTracking()
            .Where(record => record.StudentId == req.StudentId && record.Status == "active" && record.RevokedAt == null && record.ExpiresAt > now)
            .OrderByDescending(record => record.IssuedAt)
            .ToListAsync(ct);
        if (records.Count == 0)
            return new List<OfflinePackageListItemDto>();

        var packages = records.Select(record => new
        {
            Record = record,
            Manifest = JsonSerializer.Deserialize<OfflinePackageManifest>(record.ManifestJson)
                ?? throw new ForbiddenException("manifest الحزمة غير صالح")
        }).ToList();
        if (packages.Any(package => package.Manifest.UserId != req.StudentId || package.Manifest.ExpiresAt <= now || package.Manifest.AllowedSubjects.Count == 0))
            throw new ForbiddenException("manifest إحدى الحزم لا يطابق الطالب أو انتهى أو لا يملك نطاق محتوى");

        var subjectIds = packages.SelectMany(package => package.Manifest.AllowedSubjects).Distinct().ToList();
        var subjects = await _db.Subjects.AsNoTracking()
            .Where(subject => subjectIds.Contains(subject.Id))
            .Select(subject => new { subject.Id, subject.NameAr })
            .ToDictionaryAsync(subject => subject.Id, subject => subject.NameAr, ct);
        var questionCounts = await _db.Questions.AsNoTracking()
            .Where(question => subjectIds.Contains(question.SubjectId) && question.Status == ContentStatus.Published)
            .GroupBy(question => question.SubjectId)
            .Select(group => new { SubjectId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(group => group.SubjectId, group => group.Count, ct);
        var answeredCounts = await _db.AttemptLogs.AsNoTracking()
            .Where(attempt => attempt.StudentId == req.StudentId && attempt.IsOffline && subjectIds.Contains(attempt.Question.SubjectId))
            .GroupBy(attempt => attempt.Question.SubjectId)
            .Select(group => new { SubjectId = group.Key, Count = group.Select(attempt => attempt.QuestionId).Distinct().Count() })
            .ToDictionaryAsync(group => group.SubjectId, group => group.Count, ct);

        return packages.Select(package =>
        {
            var primarySubjectId = package.Manifest.AllowedSubjects[0];
            return new OfflinePackageListItemDto(
                package.Record.Id,
                subjects.GetValueOrDefault(primarySubjectId, "مادة غير متاحة"),
                null,
                questionCounts.GetValueOrDefault(primarySubjectId),
                package.Record.IssuedAt,
                package.Record.ExpiresAt,
                package.Record.ExpiresAt <= now,
                answeredCounts.GetValueOrDefault(primarySubjectId));
        }).ToList();
    }


    /// <summary>
    /// Delete/invalidate an offline package.
    /// </summary>
    public async Task<OfflinePackageStatusDto> Handle(GetOfflinePackageStatusQuery req, CancellationToken ct)
    {
        var record = await _db.OfflinePackageRecords.AsNoTracking().SingleOrDefaultAsync(package =>
            package.Id == req.PackageId && package.StudentId == req.StudentId && package.InstallationId == req.InstallationId, ct)
            ?? throw new NotFoundException("OfflinePackage", req.PackageId);
        return new OfflinePackageStatusDto(record.Id, record.Status, record.ExpiresAt, record.RevokedAt, DateTime.UtcNow);
    }

    public async Task<Unit> Handle(DeleteOfflinePackageCommand req, CancellationToken ct)
    {
        EnsureOfflineIsExplicitlyEnabled();
        var package = await _db.OfflinePackageRecords.FirstOrDefaultAsync(record => record.Id == req.PackageId && record.StudentId == req.StudentId, ct);
        if (package is null) throw new NotFoundException("OfflinePackage", req.PackageId);
        package.Status = "revoked";
        package.RevokedAt = DateTime.UtcNow;
        await _unitOfWork.SaveChangesAsync(ct);
        await _cache.RemoveAsync($"offline:{req.PackageId}", ct);
        await _cache.RemoveAsync($"offline:{req.PackageId}:answers", ct);
        await _audit.LogSecurityEventAsync(req.StudentId, null, SecurityEventType.OfflinePackageRevoked, SecuritySeverity.Warning, "Offline package revoked", ct: ct);
        return Unit.Value;
    }

    // No raw encryption key is generated or returned here. Key release belongs to the Phase 36 package service.
}
