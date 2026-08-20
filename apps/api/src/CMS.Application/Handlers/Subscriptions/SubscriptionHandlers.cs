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
    IRequestHandler<RevokeStudentSubscriptionCommand, Unit>
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
        var normalizedCode = request.Code?.Trim().ToUpperInvariant();
        if (request.StudentId == Guid.Empty || string.IsNullOrWhiteSpace(normalizedCode))
            throw new DomainException("رمز الاشتراك غير صالح", "INVALID_SUBSCRIPTION_CODE");

        var student = await _db.Students.FirstOrDefaultAsync(candidate => candidate.Id == request.StudentId && candidate.DeletedAt == null, ct)
            ?? throw new NotFoundException("Student", request.StudentId);
        if (student.Status != StudentStatus.Active)
            throw new ForbiddenException("حساب الطالب غير نشط");

        var now = DateTime.UtcNow;
        var code = await _db.SubscriptionCodes.FirstOrDefaultAsync(candidate => candidate.Code == normalizedCode, ct)
            ?? throw new NotFoundException("SubscriptionCode", normalizedCode);
        if (code.Status != CodeStatus.Active || (code.CodeExpiresAt.HasValue && code.CodeExpiresAt <= now))
            throw new ForbiddenException("رمز الاشتراك غير متاح");

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
            Status = SubscriptionStatus.Active,
            StartsAt = now,
            ExpiresAt = now.AddDays(code.DurationDays)
        };
        code.Status = CodeStatus.Used;
        code.UsedBy = student.Id;
        code.UsedAt = now;
        await _db.StudentSubscriptions.AddAsync(subscription, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        await _audit.LogSecurityEventAsync(
            student.Id, null, SecurityEventType.SubscriptionActivated, SecuritySeverity.Warning,
            $"subscription_id={subscription.Id}; subscription_code_id={code.Id}; scope_type={subscription.ScopeType}; scope_subject_id={subscription.ScopeSubjectId}", ct: ct);
        return new SubscriptionRedemptionDto(subscription.Id, subscription.ScopeType, subscription.ScopeSubjectId, subscription.ExpiresAt);
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
}
