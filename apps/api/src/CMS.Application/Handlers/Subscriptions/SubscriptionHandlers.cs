using CMS.Application.Commands.Subscriptions;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CMS.Application.Handlers.Subscriptions;

/// <summary>
/// Owns durable student-subscription state changes. Audit writes occur only after the business mutation is committed.
/// </summary>
public sealed class SubscriptionHandlers :
    IRequestHandler<RedeemSubscriptionCodeCommand, SubscriptionRedemptionDto>,
    IRequestHandler<RevokeStudentSubscriptionCommand, Unit>,
    IRequestHandler<RevokeSubscriptionCodeCommand, int>
{
    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IPermissionService _permissions;
    private readonly ISecurityAuditWriter _audit;

    public SubscriptionHandlers(
        IApplicationDbContext db,
        IUnitOfWork unitOfWork,
        IPermissionService permissions,
        ISecurityAuditWriter audit)
    {
        _db = db;
        _unitOfWork = unitOfWork;
        _permissions = permissions;
        _audit = audit;
    }

    public async Task<SubscriptionRedemptionDto> Handle(RedeemSubscriptionCodeCommand request, CancellationToken ct)
    {
        // Normalize the code: trim, uppercase, and strip dashes/spaces so that
        // both the new 16-char dash-formatted codes (XXXX-XXXX-XXXX-XXXX) and
        // any legacy 12-char no-dash codes can be redeemed by students who type
        // or paste them with or without dashes.
        var normalizedCode = new string((request.Code ?? "").Trim().ToUpperInvariant()
            .Where(c => char.IsLetterOrDigit(c)).ToArray());
        if (request.StudentId == Guid.Empty || string.IsNullOrWhiteSpace(normalizedCode))
            throw new DomainException("رمز الاشتراك غير صالح", "INVALID_SUBSCRIPTION_CODE");

        var student = await _db.Students.FirstOrDefaultAsync(candidate => candidate.Id == request.StudentId && candidate.DeletedAt == null, ct)
            ?? throw new NotFoundException("Student", request.StudentId);
        if (student.Status != StudentStatus.Active)
            throw new ForbiddenException("حساب الطالب غير نشط");

        var now = DateTime.UtcNow;
        // Lookup must be dash-agnostic: store codes with dashes (new format) but
        // also match legacy no-dash codes. We compare against a dash-stripped
        // version of the stored Code so both formats work.
        var code = await _db.SubscriptionCodes.FirstOrDefaultAsync(
            candidate => new string((candidate.Code ?? "").Where(char.IsLetterOrDigit).ToArray()) == normalizedCode, ct)
            ?? throw new NotFoundException("SubscriptionCode", normalizedCode);
        if (code.Status != CodeStatus.Active || (code.CodeExpiresAt.HasValue && code.CodeExpiresAt <= now))
            throw new ForbiddenException("رمز الاشتراك غير متاح");

        if (await _db.StudentSubscriptions.AnyAsync(subscription => subscription.StudentId == student.Id && subscription.SubscriptionCodeId == code.Id, ct))
            throw new DomainException("تم استرداد هذا الرمز مسبقًا", "SUBSCRIPTION_CODE_ALREADY_REDEEMED");

        var durationExpiresAt = code.DurationDays > 0 ? now.AddDays(code.DurationDays) : DateTime.MaxValue;
        var subscriptionExpiresAt = code.CodeExpiresAt.HasValue && code.CodeExpiresAt.Value < durationExpiresAt
            ? code.CodeExpiresAt.Value
            : durationExpiresAt;
        var subscription = new StudentSubscription
        {
            StudentId = student.Id,
            SubscriptionCodeId = code.Id,
            ScopeType = code.ScopeType,
            ScopeUniversityId = code.ScopeUniversityId,
            ScopeCollegeId = code.ScopeCollegeId,
            ScopeYearId = code.ScopeYearId,
            ScopeSemesterId = code.ScopeSemesterId,
            ScopeSubjectId = code.ScopeSubjectId,
            ContentScope = code.ContentScope,
            Status = SubscriptionStatus.Active,
            StartsAt = now,
            ExpiresAt = subscriptionExpiresAt
        };

        await _unitOfWork.BeginTransactionAsync(ct);
        try
        {
            if (!code.IsPublic)
            {
                var claimed = await _db.SubscriptionCodes
                    .Where(candidate => candidate.Id == code.Id && candidate.Status == CodeStatus.Active && candidate.UsedBy == null)
                    .ExecuteUpdateAsync(setters => setters
                        .SetProperty(candidate => candidate.Status, CodeStatus.Used)
                        .SetProperty(candidate => candidate.UsedBy, student.Id)
                        .SetProperty(candidate => candidate.UsedAt, now), ct);
                if (claimed != 1)
                    throw new ForbiddenException("تم استرداد هذا الرمز من طالب آخر");
            }

            await _db.StudentSubscriptions.AddAsync(subscription, ct);
            await _unitOfWork.SaveChangesAsync(ct);
            await _unitOfWork.CommitTransactionAsync(ct);
        }
        catch
        {
            await _unitOfWork.RollbackTransactionAsync(ct);
            throw;
        }

        await _audit.LogSecurityEventAsync(
            student.Id, null, SecurityEventType.SubscriptionActivated, SecuritySeverity.Warning,
            $"subscription_id={subscription.Id}; subscription_code_id={code.Id}; scope_type={subscription.ScopeType}; scope_subject_id={subscription.ScopeSubjectId}", ct: ct);
        return new SubscriptionRedemptionDto(subscription.Id, subscription.ScopeType, subscription.ContentScope, subscription.ScopeSubjectId, subscription.ExpiresAt);
    }

    public async Task<Unit> Handle(RevokeStudentSubscriptionCommand request, CancellationToken ct)
    {
        if (request.ActorAdminId == Guid.Empty || !await _permissions.HasPermissionAsync(request.ActorAdminId, Resources.Codes, Actions.Edit, ct))
            throw new ForbiddenException("لا تملك الصلاحية الإدارية المطلوبة");
        var subscription = await _db.StudentSubscriptions.FirstOrDefaultAsync(candidate => candidate.Id == request.SubscriptionId, ct)
            ?? throw new NotFoundException("StudentSubscription", request.SubscriptionId);
        if (!await _permissions.IsInScopeAsync(request.ActorAdminId, "student", subscription.StudentId, ct))
            throw new ForbiddenException("الاشتراك المطلوب خارج نطاقك الإداري");
        if (subscription.Status != SubscriptionStatus.Active || subscription.RevokedAt.HasValue)
            throw new DomainException("الاشتراك غير نشط", "SUBSCRIPTION_NOT_ACTIVE");

        subscription.Status = SubscriptionStatus.Cancelled;
        subscription.RevokedAt = DateTime.UtcNow;
        subscription.RevocationReason = string.IsNullOrWhiteSpace(request.Reason) ? "administrative_revocation" : request.Reason.Trim()[..Math.Min(request.Reason.Trim().Length, 256)];
        await _unitOfWork.SaveChangesAsync(ct);

        await _audit.LogSecurityEventAsync(
            subscription.StudentId, request.ActorAdminId, SecurityEventType.SubscriptionRevoked, SecuritySeverity.Warning,
            $"subscription_id={subscription.Id}; reason={subscription.RevocationReason}", ct: ct);
        return Unit.Value;
    }

    public async Task<int> Handle(RevokeSubscriptionCodeCommand request, CancellationToken ct)
    {
        if (request.ActorAdminId == Guid.Empty || !await _permissions.HasPermissionAsync(request.ActorAdminId, Resources.Codes, Actions.Edit, ct))
            throw new ForbiddenException("لا تملك الصلاحية الإدارية المطلوبة");

        var code = await _db.SubscriptionCodes.FirstOrDefaultAsync(candidate => candidate.Id == request.SubscriptionCodeId, ct)
            ?? throw new NotFoundException("SubscriptionCode", request.SubscriptionCodeId);
        if (!await _permissions.IsInScopeAsync(request.ActorAdminId, "subscription_code", code.Id, ct))
            throw new ForbiddenException("الرمز المطلوب خارج نطاقك الإداري");

        var now = DateTime.UtcNow;
        var reason = string.IsNullOrWhiteSpace(request.Reason) ? "code_revoked" : request.Reason.Trim()[..Math.Min(request.Reason.Trim().Length, 256)];
        code.Status = CodeStatus.Cancelled;
        var subscriptions = await _db.StudentSubscriptions
            .Where(subscription => subscription.SubscriptionCodeId == code.Id && subscription.Status == SubscriptionStatus.Active && subscription.RevokedAt == null)
            .ToListAsync(ct);
        foreach (var subscription in subscriptions)
        {
            subscription.Status = SubscriptionStatus.Cancelled;
            subscription.RevokedAt = now;
            subscription.RevocationReason = reason;
        }
        await _unitOfWork.SaveChangesAsync(ct);

        foreach (var subscription in subscriptions)
        {
            await _audit.LogSecurityEventAsync(subscription.StudentId, request.ActorAdminId, SecurityEventType.SubscriptionRevoked, SecuritySeverity.Warning,
                $"subscription_id={subscription.Id}; subscription_code_id={code.Id}; reason={reason}", ct: ct);
        }
        return subscriptions.Count;
    }
}
