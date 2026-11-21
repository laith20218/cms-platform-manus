using System.Text.Json;
using CMS.Api.Middleware;
using CMS.Domain.Exceptions;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Moq;

namespace CMS.Tests.Unit.Middleware;

/// <summary>
/// W22.3 (R-04) — the ExceptionHandlingMiddleware contract for domain rule
/// violations raised by the question import validation.
///
/// Locks:
///  1. BusinessRuleViolationException → 400 ProblemDetails whose detail carries
///     the ORIGINAL Arabic message and the structured errorCode — the
///     consistent Arabic contract, never an opaque 500.
///  2. A bare Exception stays the generic 500/INTERNAL_ERROR path — the exact
///     opaque behaviour the W22.3 handler change replaced.
/// </summary>
public class ExceptionHandlingW223Tests
{
    private static (ExceptionHandlingMiddleware Middleware, DefaultHttpContext Context) Build(RequestDelegate next)
    {
        var logger = new Mock<ILogger<ExceptionHandlingMiddleware>>();
        var middleware = new ExceptionHandlingMiddleware(next, logger.Object);
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();
        context.Request.Path = "/api/v1/admin/questions/import";
        return (middleware, context);
    }

    private static async Task<JsonDocument> ReadBodyAsync(DefaultHttpContext context)
    {
        context.Response.Body.Position = 0;
        return await JsonDocument.ParseAsync(context.Response.Body);
    }

    [Fact]
    public async Task BusinessRuleViolation_MapsTo400ProblemDetails_WithTheArabicDetail()
    {
        var (middleware, context) = Build(
            _ => Task.FromException(new BusinessRuleViolationException("نص السؤال مطلوب")));

        await middleware.InvokeAsync(context);

        context.Response.StatusCode.Should().Be((int)StatusCodes.Status400BadRequest);
        // WriteAsJsonAsync owns the final content type — assert the JSON family
        // (the body shape below is the real contract).
        context.Response.ContentType.Should().Contain("json");

        using var body = await ReadBodyAsync(context);
        body.RootElement.GetProperty("status").GetInt32().Should().Be(400);
        // The Arabic human message survives into the ProblemDetails detail.
        body.RootElement.GetProperty("detail").GetString().Should().Be("نص السؤال مطلوب");
        body.RootElement.GetProperty("title").GetString().Should().Be("business rule violation");
        body.RootElement.GetProperty("errorCode").GetString().Should().Be("BUSINESS_RULE_VIOLATION");
        body.RootElement.GetProperty("traceId").GetString().Should().NotBeNullOrEmpty();
        body.RootElement.GetProperty("instance").GetString().Should().Be("/api/v1/admin/questions/import");
    }

    [Fact]
    public async Task BareException_StaysTheOpaque500_Path_It_Replaced()
    {
        // Contrast lock: a bare Exception never carries the Arabic message —
        // the generic 500/INTERNAL_ERROR contract (why the domain exception
        // is the required type for import validation).
        var (middleware, context) = Build(_ => Task.FromException(new Exception("نص السؤال مطلوب")));

        await middleware.InvokeAsync(context);

        context.Response.StatusCode.Should().Be((int)StatusCodes.Status500InternalServerError);
        context.Response.ContentType.Should().Contain("json");

        using var body = await ReadBodyAsync(context);
        body.RootElement.GetProperty("status").GetInt32().Should().Be(500);
        body.RootElement.GetProperty("errorCode").GetString().Should().Be("INTERNAL_ERROR");
        // The Arabic detail is NOT carried on the 500 path — the generic English one is.
        body.RootElement.GetProperty("detail").GetString().Should().NotContain("نص السؤال مطلوب");
    }
}
