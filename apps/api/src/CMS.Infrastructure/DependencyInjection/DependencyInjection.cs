using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using CMS.Application.Interfaces;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Infrastructure.Services;
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
