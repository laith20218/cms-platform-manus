using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using CMS.Application.Interfaces;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Infrastructure.Services;
using CMS.Infrastructure.Services.Monitoring;
using CMS.Infrastructure.Security;

namespace CMS.Infrastructure.DependencyInjection;

/// <summary>
/// Extension methods for registering Infrastructure layer services.
/// </summary>
public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructureServices(this IServiceCollection services, IConfiguration configuration)
    {
        // Database
        services.AddDbContext<ApplicationDbContext>(options =>
        {
            options.UseNpgsql(
                configuration.GetConnectionString("PostgreSQL"),
                npgsql => npgsql.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName));
            options.EnableSensitiveDataLogging(false);
        });

        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<ApplicationDbContext>());
        services.AddScoped<ICorrelationContext, CorrelationContext>();
        services.AddScoped<ISecurityAuditRetentionService, SecurityAuditRetentionService>();
        // System settings (read-only access for upload limits and other runtime knobs).
        services.AddScoped<ISystemSettingsService, SystemSettingsService>();

        // Upstash Redis REST cache
        services.AddHttpClient("UpstashRedis", client =>
        {
            client.Timeout = TimeSpan.FromSeconds(10);
        });
        services.AddSingleton<UpstashRedisRestCacheService>();

        // === PR-8 (Servers Dashboard) — read-only provider monitoring ===
        // SSRF discipline: the four named clients below pin BaseAddress to the FIXED provider
        // hosts with auto-redirects and proxies disabled; the monitors only ever request fixed
        // relative paths built from OPERATOR-CONFIGURED env identifiers — no caller-supplied
        // URL or query ever reaches an upstream request. Bearer credentials are read from the
        // documented MONITORING_* env names and are never logged or exposed.
        services.AddHttpClient(MonitoringHttpClients.Render, client =>
        {
            client.BaseAddress = new Uri("https://api.render.com/");
            client.Timeout = TimeSpan.FromSeconds(8);
        }).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
        {
            // HttpClientHandler is the SocketsHttpHandler-based handler that exposes the
            // redirect switch: redirects are disabled (SSRF: a provider response can never
            // move the request off the fixed host) and environment proxies are ignored.
            AllowAutoRedirect = false,
            UseProxy = false
        });
        services.AddHttpClient(MonitoringHttpClients.Vercel, client =>
        {
            client.BaseAddress = new Uri("https://api.vercel.com/");
            client.Timeout = TimeSpan.FromSeconds(8);
        }).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
        {
            // HttpClientHandler is the SocketsHttpHandler-based handler that exposes the
            // redirect switch: redirects are disabled (SSRF: a provider response can never
            // move the request off the fixed host) and environment proxies are ignored.
            AllowAutoRedirect = false,
            UseProxy = false
        });
        services.AddHttpClient(MonitoringHttpClients.Neon, client =>
        {
            client.BaseAddress = new Uri("https://api.neon.tech/");
            client.Timeout = TimeSpan.FromSeconds(8);
        }).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
        {
            // HttpClientHandler is the SocketsHttpHandler-based handler that exposes the
            // redirect switch: redirects are disabled (SSRF: a provider response can never
            // move the request off the fixed host) and environment proxies are ignored.
            AllowAutoRedirect = false,
            UseProxy = false
        });
        services.AddHttpClient(MonitoringHttpClients.Github, client =>
        {
            client.BaseAddress = new Uri("https://api.github.com/");
            client.Timeout = TimeSpan.FromSeconds(8);
        }).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
        {
            // HttpClientHandler is the SocketsHttpHandler-based handler that exposes the
            // redirect switch: redirects are disabled (SSRF: a provider response can never
            // move the request off the fixed host) and environment proxies are ignored.
            AllowAutoRedirect = false,
            UseProxy = false
        });

        // Monitors are singletons by design: the per-provider circuit breaker and the bounded
        // in-memory history ring must be shared across requests. Read-only surface — no
        // provider mutation exists anywhere in this layer.
        services.AddSingleton<IRenderMonitor, RenderMonitor>();
        services.AddSingleton<IVercelMonitor, VercelMonitor>();
        services.AddSingleton<INeonMonitor, NeonMonitor>();
        services.AddSingleton<IGithubMonitor, GithubMonitor>();
        services.AddSingleton<IServersMonitorService, ServersMonitorService>();

        // Repositories (Scoped - one per request)
        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddScoped<IQuestionRepository, QuestionRepository>();
        services.AddScoped<IStudentRepository, StudentRepository>();
        services.AddScoped<ISubscriptionCodeRepository, SubscriptionCodeRepository>();
        services.AddScoped<IPermissionService, PermissionService>();
        services.AddScoped<IEntitlementService, EntitlementService>();
        services.AddScoped<ISignedEntitlementService, SignedEntitlementService>();
        services.AddSingleton<IPlayIntegrityService, FailClosedPlayIntegrityService>();
        services.AddScoped<IOfflinePackageCryptoService, OfflinePackageCryptoService>();
        services.AddScoped<IOfflinePackageLifecycleService, OfflinePackageLifecycleService>();

        // Unit of Work
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        // External Services (Singleton - stateless)
        services.AddHttpClient(); // IHttpClientFactory for the Upstash Redis REST cache client below
        services.AddSingleton<ICacheService>(sp => sp.GetRequiredService<UpstashRedisRestCacheService>());

        // PUSH 10.9 — MIGRATION TO BACKBLAZE B2 (S3-compatible). Upstash Blob hit its
        // 1GB free-tier limit and is now read-only; the supervisor removed the
        // Upstash:Blob:* variables from Render and provisioned Storage:S3:* against
        // a Backblaze B2 bucket (CMSmedia @ eu-central-003). S3StorageService is
        // therefore the ONLY registered IFileStorageService — no conditional, no
        // fallback. The UpstashBlobStorageService / UpstashS3ClientFactory classes
        // stay compiled (unit tests + the AdminCoursesController catch clause still
        // reference them), but they can never be activated: DI no longer constructs
        // them, and they fail-closed without Upstash:Blob:Token, which no longer
        // exists in any environment. Delete them wholesale in a later cleanup push.
        services.AddSingleton<IFileStorageService, S3StorageService>();
        // W14.5 (Phase A) — B2 presigned URLs for question images: resolves stored object
        // keys / b2:// URIs into temporary presigned GET URLs during question DTO mapping.
        // Singleton (stateless; SigV4 presigning is computed locally, no network I/O).
        // Degrades to passthrough with a log-once warning when Storage:S3 config is
        // absent — the questions read path must never fail on storage configuration.
        services.AddSingleton<IPresignedUrlService, B2PresignedUrlService>();
        services.AddSingleton<IFileScanner, TrustedFileScanner>();
        // Server-side HTML sanitization for uploaded library documents (Ganss.XSS).
        services.AddSingleton<IHtmlBlobSanitizer, HtmlSanitizerService>();
        // Wave 13 (F3) — upload-time CSP meta injection for stored HTML documents
        // (defense-in-depth layer #1; the player re-injects client-side as layer #2).
        services.AddSingleton<IHtmlCspInjector, HtmlCspInjectorService>();
        services.AddSingleton<ITokenService, JwtTokenService>();
        services.AddSingleton<SecurityEventBatchService>();
        services.AddSingleton<ISecurityEventBatch>(sp => sp.GetRequiredService<SecurityEventBatchService>());
        services.AddHostedService(sp => sp.GetRequiredService<SecurityEventBatchService>());
        services.AddHostedService<SecurityAuditRetentionHostedService>();
        services.AddScoped<SecurityService>();
        services.AddScoped<ISecurityAuditWriter>(sp => sp.GetRequiredService<SecurityService>());
        services.AddScoped<ISessionService, SessionService>();
        // Push 2 / Track 2: activity monitor — best-effort writer + idle-session sweeper.
        services.AddScoped<IAdminActivityWriter, AdminActivityWriter>();
        services.AddHostedService<SessionSweeperService>();
        services.AddSingleton<IPasswordHasher, PasswordHasher>();
        services.AddSingleton<IPasswordPolicy, PasswordPolicy>();

        return services;
    }
}
