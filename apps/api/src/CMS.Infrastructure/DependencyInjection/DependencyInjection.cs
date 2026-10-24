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
        services.AddHttpClient(); // IHttpClientFactory for UpstashBlobStorageService
        services.AddHttpClient("UpstashBlob").ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
        {
            PooledConnectionLifetime = TimeSpan.FromMinutes(2)
        });
        services.AddSingleton<ICacheService>(sp => sp.GetRequiredService<UpstashRedisRestCacheService>());
        // Storage: prefer Upstash Blob when configured; fall back to S3StorageService otherwise.
        if (!string.IsNullOrWhiteSpace(configuration["Upstash:Blob:Token"]))
        {
            // S3-credential client factory — /v1/presign cannot sign DELETE, so blob
            // deletion goes through the S3-compatible API (AWS SigV4, short-lived creds).
            services.AddSingleton<IUpstashS3ClientFactory, UpstashS3ClientFactory>();
            services.AddSingleton<IFileStorageService, UpstashBlobStorageService>();
        }
        else
        {
            services.AddSingleton<IFileStorageService, S3StorageService>();
        }
        services.AddSingleton<IFileScanner, TrustedFileScanner>();
        // Server-side HTML sanitization for uploaded library documents (Ganss.XSS).
        services.AddSingleton<IHtmlBlobSanitizer, HtmlSanitizerService>();
        services.AddSingleton<ITokenService, JwtTokenService>();
        services.AddSingleton<SecurityEventBatchService>();
        services.AddSingleton<ISecurityEventBatch>(sp => sp.GetRequiredService<SecurityEventBatchService>());
        services.AddHostedService(sp => sp.GetRequiredService<SecurityEventBatchService>());
        services.AddHostedService<SecurityAuditRetentionHostedService>();
        services.AddScoped<SecurityService>();
        services.AddScoped<ISecurityAuditWriter>(sp => sp.GetRequiredService<SecurityService>());
        services.AddScoped<ISessionService, SessionService>();
        services.AddSingleton<IPasswordHasher, PasswordHasher>();
        services.AddSingleton<IPasswordPolicy, PasswordPolicy>();

        return services;
    }
}
