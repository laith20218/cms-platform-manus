using System.Text;
using CMS.Api.Health;
using CMS.Api.Middleware;
using CMS.Application.DependencyInjection;
using CMS.Application.Interfaces;
using CMS.Infrastructure.DependencyInjection;
using CMS.Infrastructure.Services;
using Serilog;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using CMS.Api.Authorization;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// === Serilog Configuration ===
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .Enrich.WithProperty("Application", "CMS.Api")
    .WriteTo.Console()
    .CreateLogger();

try
{
    Log.Information("Starting CMS API...");

    builder.Host.UseSerilog();

    // === Request body limits (A2-4) ===
    // API-proxied bodies are capped at 16 MB. Library document uploads never traverse the API
    // (browsers PUT directly to object storage via presigned URLs, size-bound by the per-type
    // upload limits), and the largest legitimate proxied body today is the 3 MB avatar upload.
    // Per-endpoint overrides ([RequestSizeLimit]/[RequestFormLimits], e.g. avatars at 3 MB)
    // take precedence over these global limits and continue to apply.
    builder.WebHost.ConfigureKestrel(options =>
    {
        options.Limits.MaxRequestBodySize = 16 * 1024 * 1024; // 16 MB
    });
    builder.Services.Configure<FormOptions>(options =>
    {
        options.MultipartBodyLengthLimit = 16 * 1024 * 1024; // 16 MB
    });

    // === Application Services ===
    builder.Services.AddApplicationServices();

    // === Infrastructure Services ===
    builder.Services.AddInfrastructureServices(builder.Configuration);

    // === Authentication ===
    var jwtSecret = builder.Configuration["Jwt:Secret"];
    if (string.IsNullOrWhiteSpace(jwtSecret) || Encoding.UTF8.GetByteCount(jwtSecret) < 32)
        throw new InvalidOperationException("JWT Secret must be configured at runtime and contain at least 32 bytes");
    var jwtSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
    {
        KeyId = builder.Configuration["Jwt:KeyId"] ?? "v1"
    };

    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            // SessionValidationMiddleware reads the custom JWT claims (sid, installation_id, tv)
            // by their wire names, so incoming claim mapping must remain disabled.
            options.MapInboundClaims = false;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ValidIssuer = builder.Configuration["Jwt:Issuer"],
                ValidAudience = builder.Configuration["Jwt:Audience"],
                IssuerSigningKey = jwtSigningKey,
                ValidAlgorithms = new[] { SecurityAlgorithms.HmacSha256 },
                ClockSkew = TimeSpan.Zero
            };
        });

    // === Authorization ===
    builder.Services.AddAuthorization(options =>
    {
        options.AddPolicy("StudentOnly", policy => policy.RequireRole("student"));
        options.AddPolicy("AdminOnly", policy => policy.RequireRole("admin"));
        options.AddPolicy("QuestionManagement", policy =>
            policy.RequireRole("admin").RequireClaim("permissions", "questions"));
        options.AddPolicy("SuperAdmin", policy =>
            policy.RequireRole("super_admin"));
        Policies.Register(options);
    });
    builder.Services.AddScoped<IAuthorizationHandler, PermissionHandler>();

    // === Controllers ===
    builder.Services.AddControllers()
        .AddJsonOptions(options =>
        {
            options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
            options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        });

    // === CORS ===
    // R62 §2.A: the request headers are enumerated EXPLICITLY instead of relying on
    // AllowAnyHeader() so the preflight contract is deterministic and auditable. The list
    // covers every header the clients actually send: Authorization + X-Installation-Id +
    // X-Device-Fingerprint (student-web api-client.ts request interceptor), X-Entitlement
    // (entitlementRequestConfig() — the header whose absence/mismatch produced the Wave 12.4
    // courses preflight failure), Content-Type + Accept + Accept-Language (axios defaults),
    // and X-Correlation-Id (CorrelationIdMiddleware honours it when present). Header-name
    // matching in preflight evaluation is case-insensitive per the Fetch specification.
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("CMS", policy =>
        {
            policy.WithOrigins(
                    builder.Configuration["Cors:StudentApp"] ?? "https://app.cms.example.com",
                    builder.Configuration["Cors:AdminApp"] ?? "https://admin.cms.example.com"
                )
                .WithHeaders(
                    "Authorization",
                    "Content-Type",
                    "Accept",
                    "Accept-Language",
                    "X-Entitlement",
                    "X-Installation-Id",
                    "X-Device-Fingerprint",
                    "X-Correlation-Id")
                .AllowAnyMethod()
                .AllowCredentials();
        });
    });

    // === Rate Limiting ===
    // Anonymous calls are partitioned by IP plus installation. Authenticated calls add
    // the validated account claim, so independent students never share a quota.
    builder.Services.AddRateLimiter(options =>
    {
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        options.GlobalLimiter = System.Threading.RateLimiting.PartitionedRateLimiter.Create<HttpContext, string>(context =>
            System.Threading.RateLimiting.RateLimitPartition.GetNoLimiter(RateLimitKey(context)));

        options.AddPolicy("login", context => FixedWindow(context, 5, TimeSpan.FromMinutes(5)));
        options.AddPolicy("otp", context => FixedWindow(context, 3, TimeSpan.FromMinutes(5)));
        options.AddPolicy("password-reset", context => FixedWindow(context, 3, TimeSpan.FromMinutes(15)));
        options.AddPolicy("auth", context => FixedWindow(context, 8, TimeSpan.FromMinutes(5)));
        options.AddPolicy("questions", context => FixedWindow(context, 60, TimeSpan.FromMinutes(1)));
        options.AddPolicy("search", context => FixedWindow(context, 30, TimeSpan.FromMinutes(1)));
        options.AddPolicy("health", context => FixedWindow(context, 600, TimeSpan.FromMinutes(1)));
        options.AddPolicy("static", context => FixedWindow(context, 600, TimeSpan.FromMinutes(1)));
        options.AddPolicy("admin", context => FixedWindow(context, 15, TimeSpan.FromMinutes(1)));
        options.AddPolicy("offline-package", context => FixedWindow(context, 5, TimeSpan.FromMinutes(15)));
        options.AddPolicy("favorites", context => FixedWindow(context, 30, TimeSpan.FromMinutes(1)));
        options.AddPolicy("security-events", context => FixedWindow(context, 6, TimeSpan.FromMinutes(1)));
    });

    // === Admin login throttling (FIX-5) ===
    // In-process dual-partition limiter for POST /api/v1/auth/admin/login: 5/min per IP
    // and 20/5min per normalized e-mail, answered with 429 + Retry-After. The student
    // login keeps its existing "login" policy untouched.
    builder.Services.AddMemoryCache();
    builder.Services.AddSingleton(TimeProvider.System);
    builder.Services.AddSingleton<CMS.Api.Security.AdminLoginRateLimiter>();

    // === R51 — single-use HTML view tokens (in-memory by design: grants die with the process) ===
    builder.Services.AddSingleton<CMS.Application.Interfaces.IHtmlAccessTokenService, CMS.Infrastructure.Security.HtmlAccessTokenService>();

    // === Swagger ===
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new OpenApiInfo
        {
            Title = "CMS API",
            Version = "v1",
            Description = "College Medical System API - منصة تعليمية طبية",
            Contact = new OpenApiContact { Name = "CMS Team", Email = "info@cms.example.com" }
        });

        c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Description = "JWT Authorization header using the Bearer scheme. Example: \"Authorization: Bearer {token}\"",
            Name = "Authorization",
            In = ParameterLocation.Header,
            Type = SecuritySchemeType.ApiKey,
            Scheme = "Bearer"
        });

        c.AddSecurityRequirement(new OpenApiSecurityRequirement
        {
            {
                new OpenApiSecurityScheme
                {
                    Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
                },
                Array.Empty<string>()
            }
        });
    });

    // === Health Checks ===
    builder.Services.AddHealthChecks()
        .AddNpgSql(builder.Configuration.GetConnectionString("PostgreSQL")!, name: "postgresql", tags: new[] { "ready" })
        .AddCheck<UpstashRedisHealthCheck>("redis", tags: new[] { "ready" });

    var app = builder.Build();

    // === HOTFIX 10.10: apply the B2 bucket CORS policy at startup ===
    // The Backblaze web UI cannot express AllowedHeaders: ["*"] (wildcards) or
    // ExposeHeaders (ETag, Content-Range, …) — both required by the browser-direct
    // single-PUT upload and Range playback — so the policy is pushed programmatically
    // via the S3 API (PutBucketCors) with the bucket's own credentials. Idempotent
    // (PutBucketCors overwrites the bucket's CORS config wholesale): every restart
    // re-applies the same policy. Best-effort by design — a failure MUST NOT crash
    // the API (server-side storage calls still work); the warning points ops at the
    // manual procedure in docs/ops/r2-cors.md. Skipped in the Testing environment so
    // integration tests never attempt the network call.
    if (!app.Environment.IsEnvironment("Testing"))
    {
        try
        {
            if (app.Services.GetService<IFileStorageService>() is S3StorageService s3Storage)
            {
                await s3Storage.SetBucketCorsAsync();
                Log.Information("HOTFIX 10.10: B2 bucket CORS policy applied at startup.");
            }
            else
            {
                Log.Warning("HOTFIX 10.10: IFileStorageService is not S3StorageService — startup bucket CORS policy application skipped.");
            }
        }
        catch (Exception ex)
        {
            Log.Warning(ex,
                "HOTFIX 10.10: failed to apply the B2 bucket CORS policy at startup — continuing. " +
                "Browser-direct uploads/playback will fail CORS preflights (status 0) until the bucket policy is fixed; " +
                "apply it manually per docs/ops/r2-cors.md (b2 update-bucket --cors-rules).");
        }
    }

    // === Middleware Pipeline ===
    // Fix-3 (Push 2): honor the reverse proxy's X-Forwarded-For / X-Forwarded-Proto headers so
    // RemoteIpAddress is the REAL client IP behind Render's edge proxy. Must run FIRST — before
    // HTTPS redirection, CORS, rate limiting, and the admin-login rate limiter (which keys on
    // RemoteIpAddress). ForwardLimit=1 consumes only the rightmost (proxy-appended) entry, so a
    // client cannot spoof the counter by prepending fake addresses. KnownNetworks/Proxies are
    // cleared because Render's proxy is not on a loopback network.
    var forwardedHeadersOptions = new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
        ForwardLimit = 1
    };
    forwardedHeadersOptions.KnownNetworks.Clear();
    forwardedHeadersOptions.KnownProxies.Clear();
    app.UseForwardedHeaders(forwardedHeadersOptions);

    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI(c =>
        {
            c.SwaggerEndpoint("/swagger/v1/swagger.json", "CMS API v1");
            c.DocumentTitle = "CMS API Documentation";
        });
    }

    app.UseMiddleware<CorrelationIdMiddleware>();
    app.UseSerilogRequestLogging();
    app.UseHttpsRedirection();
    app.UseCors("CMS");
    // R62 §2.A.3 — completes Origin-rejected preflights with a bare 204 (no ACAO) so they can
    // never surface as 401/403 from the auth layers below. See the middleware's XML doc.
    app.UseMiddleware<CorsPreflightCompletionMiddleware>();
    app.UseRateLimiter();
    app.UseAuthentication();
    app.UseMiddleware<SessionValidationMiddleware>();
    app.UseAuthorization();
    app.UseMiddleware<ExceptionHandlingMiddleware>();
    app.UseMiddleware<SecurityHeadersMiddleware>();
    // AuditLoggingMiddleware runs late so it can observe the final status code of every
    // request (including 401/403/5xx) for security-warning log entries. It already skips
    // /health and /swagger to avoid noise. It logs to ILogger only — never to DB and never
    // the Authorization header or request body, so no tokens or PII are persisted.
    app.UseMiddleware<AuditLoggingMiddleware>();

    app.MapControllers();

    app.MapHealthChecks("/health").RequireRateLimiting("health");
    app.MapHealthChecks("/health/ready", new HealthCheckOptions
    {
        Predicate = check => check.Tags.Contains("ready")
    }).RequireRateLimiting("health");
    app.MapHealthChecks("/health/live", new HealthCheckOptions
    {
        Predicate = _ => false
    }).RequireRateLimiting("health");

    app.Run();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Application terminated unexpectedly");
}
finally
{
    Log.CloseAndFlush();
}

static System.Threading.RateLimiting.RateLimitPartition<string> FixedWindow(HttpContext context, int permitLimit, TimeSpan window) =>
    System.Threading.RateLimiting.RateLimitPartition.GetFixedWindowLimiter(
        RateLimitKey(context),
        _ => new System.Threading.RateLimiting.FixedWindowRateLimiterOptions
        {
            PermitLimit = permitLimit,
            Window = window,
            QueueProcessingOrder = System.Threading.RateLimiting.QueueProcessingOrder.OldestFirst,
            QueueLimit = 0,
            AutoReplenishment = true
        });

static string RateLimitKey(HttpContext context)
{
    var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown-ip";
    var installation = context.Request.Headers["X-Installation-Id"].FirstOrDefault()
        ?? context.Request.Headers["X-Device-Fingerprint"].FirstOrDefault()
        ?? "no-installation";
    var account = context.User.FindFirst("sub")?.Value
        ?? context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
        ?? "anonymous";
    return $"{ip}|{account}|{installation}";
}
