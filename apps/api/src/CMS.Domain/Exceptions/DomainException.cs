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

/// <summary>
/// Push 11.1-REWRITE — raised when an upstream dependency (object storage) fails
/// mid-operation and the request must FAIL FAST instead of serving partial content
/// (e.g. a presign generation failure during the HLS variant-rewrite). Maps to
/// HTTP 502 Bad Gateway (see ExceptionHandlingMiddleware — must stay ABOVE the
/// generic <see cref="DomainException"/> catch, which maps to 400).
/// </summary>
public class BadGatewayException : DomainException
{
    public BadGatewayException(string message, string errorCode = "BAD_GATEWAY")
        : base(message, errorCode)
    {
    }

    public BadGatewayException(string message, Exception innerException, string errorCode = "BAD_GATEWAY")
        : base(message, innerException, errorCode)
    {
    }
}
