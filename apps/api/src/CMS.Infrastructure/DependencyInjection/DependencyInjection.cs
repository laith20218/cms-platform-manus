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

        // Redis Cache
        services.AddSingleton<StackExchange.Redis.IConnectionMultiplexer>(sp =>
        {
            var connectionString = configuration.GetConnectionString("Redis") ?? "localhost:6379";
            return StackExchange.Redis.ConnectionMultiplexer.Connect(connectionString);
        });

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
        services.AddSingleton<ICacheService, RedisCacheService>();
        services.AddSingleton<IFileStorageService, R2StorageService>();
        services.AddSingleton<IFileScanner, FailClosedFileScanner>();
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
