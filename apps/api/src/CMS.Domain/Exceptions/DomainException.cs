namespace CMS.Domain.Exceptions;

/// <summary>
/// Base exception for all domain exceptions.
/// </summary>
public class DomainException : Exception
{
    public string ErrorCode { get; }

    public DomainException(string message, string errorCode = "DOMAIN_ERROR")
        : base(message)
    {
        ErrorCode = errorCode;
    }

    public DomainException(string message, Exception innerException, string errorCode = "DOMAIN_ERROR")
        : base(message, innerException)
    {
        ErrorCode = errorCode;
    }
}

/// <summary>
/// Raised when an entity is not found.
/// </summary>
public class NotFoundException : DomainException
{
    public NotFoundException(string entityName, object key)
        : base($"{entityName} with key '{key}' was not found.", "NOT_FOUND")
    {
    }
}

/// <summary>
/// Raised when a business rule is violated.
/// </summary>
public class BusinessRuleViolationException : DomainException
{
    public BusinessRuleViolationException(string message)
        : base(message, "BUSINESS_RULE_VIOLATION")
    {
    }
}

/// <summary>
/// Raised when an operation is not allowed.
/// </summary>
public class ForbiddenException : DomainException
{
    public ForbiddenException(string message)
        : base(message, "FORBIDDEN")
    {
    }
}

/// <summary>
/// Raised when a conflict occurs (e.g., duplicate resource).
/// </summary>
public class ConflictException : DomainException
{
    public ConflictException(string message)
        : base(message, "CONFLICT")
    {
    }
}
