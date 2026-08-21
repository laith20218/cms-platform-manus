using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace CMS.Infrastructure.Persistence;

/// <summary>
/// Creates the database context for EF Core design-time operations without starting the API host.
/// </summary>
public sealed class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext(string[] args)
    {
        var connectionString =
            Environment.GetEnvironmentVariable("CMS_EF_CONNECTION") ??
            Environment.GetEnvironmentVariable("ConnectionStrings__PostgreSQL");

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "Set CMS_EF_CONNECTION or ConnectionStrings__PostgreSQL before running EF Core design-time commands.");
        }

        var options = new DbContextOptionsBuilder<ApplicationDbContext>();
        options.UseNpgsql(
            connectionString,
            npgsql => npgsql.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName));

        return new ApplicationDbContext(options.Options);
    }
}
