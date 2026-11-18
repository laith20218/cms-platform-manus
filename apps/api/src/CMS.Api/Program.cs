using System.Text;
using CMS.Api.Health;
using CMS.Api.Middleware;
using CMS.Application.DependencyInjection;
using CMS.Application.Interfaces;
using CMS.Infrastructure.DependencyInjection;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Services;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
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
using CMS.Api.Security;
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

    // === Data Protection (Wave 16.2c) ===
    // Render's ephemeral filesystem wiped the default Data Protection keys on every
    // deploy, invalidating auth state and surfacing as 401 on token refresh. The key
    // ring now persists in the same PostgreSQL database the API already depends on
    // (durable on Render via Neon), and SetApplicationName pins the ring identity so
    // every deployment/instance of this app reads and writes the SAME ring.
    builder.Services.AddDataProtection()
        .PersistKeysToDbContext<ApplicationDbContext>()
        .SetApplicationName("CMS");

    // === W14.2 D.3: exam timeout sweeper (server-driven timer, D7) ===
    // Plain BackgroundService per the wave ruling — Hangfire stays unwired.
    builder.Services.AddHostedService<CMS.Api.BackgroundServices.ExamTimeoutSweeper>();

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
    // Wave 15.5a (DEBT-CORS-01): narrowed from *.vercel.app (any Vercel-hosted site,
    // added in PR #84 as a temporary exception) to project-specific patterns. Only
    // this project's Vercel deployments (production + previews) are accepted, via
    // Uri host parsing so "https://cms-platform-manus-student-web.evil.vercel.app"-
    // style prefix+suffix bypasses are rejected (the host must be EXACTLY the
    // production host, or start with "<project>-"). See PR #84 for the original
    // wildcard rationale.
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("CMS", policy =>
        {
            // Read at POLICY-BUILD time (first CORS evaluation), not at Program.cs
            // registration time: the integration-test factories (WebApplicationFactory)
            // merge their ConfigureAppConfiguration in-memory collections only after
            // the host starts building, so an eagerly captured array saw nulls. This
            // mirrors the pre-15.5a behavior, which read builder.Configuration inside
            // this same lambda.
            var corsOrigins = new[]
            {
                builder.Configuration["Cors:StudentApp"] ?? "https://app.cms.example.com",
                builder.Configuration["Cors:AdminApp"] ?? "https://admin.cms.example.com"
            };
            policy.SetIsOriginAllowed(origin => CmsCorsOrigins.IsAllowed(origin, corsOrigins))
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
        // W14.2 A.6 (R75 P2): exam-session lifecycle endpoints (start/answer/submit/cancel)
        // get their own generous-but-bounded quota so bursts cannot hammer session state.
        options.AddPolicy("exam-session", context => FixedWindow(context, 120, TimeSpan.FromMinutes(1)));
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

    // === Wave 16.2c: apply pending EF Core migrations at startup ===
    // Render deployments ship new code but nothing runs `dotnet ef database update`,
    // so the production schema drifted behind the latest migrations (500s on new
    // columns — the first symptom of this wave). Migrate() is idempotent: it applies
    // ONLY the pending migrations listed in __EFMigrationsHistory and is a no-op on
    // an up-to-date database. Skipped in the Testing environment, matching the
    // HOTFIX 10.10 guard below: the Postgres integration fixtures build their
    // throwaway schema themselves (PostgresFixture.InitializeAsync) before any
    // request is served, and the HTTP factories never touch a real database.
    if (!app.Environment.IsEnvironment("Testing"))
    {
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

            // === Wave 16.2d: repair the __EFMigrationsHistory desync before Migrate() ===
            // Production crashed on 42701: column "enable_scripts" of relation
            // "library_files" already exists. Phase62AddHtmlPlayerFields was applied to
            // the production schema through the manual, supervisor-authorized deploy
            // gate (its migration file carries the "do NOT apply to prod as part of
            // this branch" note), but the matching __EFMigrationsHistory row was never
            // inserted. Migrate() therefore replays the migration and Postgres rejects
            // the duplicate column. The patch below inserts the missing history row —
            // idempotent, and ONLY when the physical column already exists, so a fresh
            // database (no column) still receives the real migration from Migrate().
            // Best-effort by design: a patch failure is logged, NOT fatal — Migrate()
            // below still gets to run and surface whatever error remains.
            try
            {
                var historyPatchSql = @"
    INSERT INTO ""__EFMigrationsHistory"" (""MigrationId"", ""ProductVersion"")
    SELECT '20261115120000_Phase62AddHtmlPlayerFields', '9.0.0'
    WHERE NOT EXISTS (SELECT 1 FROM ""__EFMigrationsHistory"" WHERE ""MigrationId"" = '20261115120000_Phase62AddHtmlPlayerFields')
    AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'library_files' AND column_name = 'enable_scripts'
    );";
                db.Database.ExecuteSqlRaw(historyPatchSql);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex,
                    "Wave 16.2d: __EFMigrationsHistory patch for 20261115120000_Phase62AddHtmlPlayerFields failed — continuing so Migrate() can still attempt the full chain.");
            }

            try
            {
                db.Database.Migrate();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "An error occurred while migrating the database.");
                throw; // Fail fast if migration fails
            }
        }
    }

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
    // Wave 15.5c (DEBT-HEALTH-ENDPOINT): /health/live is a PURE liveness check —
    // no DB dependency. Confirmed safe for UptimeRobot pings without waking Neon
    // (owner mitigated 82.8% compute usage by pausing UptimeRobot; re-enables
    // targeting this path only). The empty Predicate means NO registered check
    // executes (AddNpgSql + UpstashRedisHealthCheck are both tagged "ready" and
    // run only under /health and /health/ready). Guarded by
    // CMS.Tests/Integration/Health/HealthEndpointTests: /health/live must answer
    // 200 even when the database is unreachable.
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
