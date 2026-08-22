using CMS.Domain.Enums;
using MediatR;

namespace CMS.Application.Commands.Subscriptions;

/// <summary>Redeems one active subscription code for the authenticated student.</summary>
public record RedeemSubscriptionCodeCommand(Guid StudentId, string Code) : IRequest<SubscriptionRedemptionDto>;

/// <summary>Revokes one active student subscription through an authorized administrative action.</summary>
public record RevokeStudentSubscriptionCommand(Guid ActorAdminId, Guid SubscriptionId, string Reason) : IRequest<Unit>;
public record RevokeSubscriptionCodeCommand(Guid ActorAdminId, Guid SubscriptionCodeId, string Reason) : IRequest<int>;

public record SubscriptionRedemptionDto(Guid SubscriptionId, SubscriptionScopeType ScopeType, SubscriptionContentScope ContentScope, Guid? ScopeSubjectId, DateTime ExpiresAt);
