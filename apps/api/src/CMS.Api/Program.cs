using System.Text;
using CMS.Api.Middleware;
using CMS.Application.DependencyInjection;
using CMS.Infrastructure.DependencyInjection;
using Serilog;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
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
    builder.Services.AddScoped<IAuthorizationHandler, ScopeHandler>();

    // === Controllers ===
    builder.Services.AddControllers()
        .AddJsonOptions(options =>
        {
            options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
            options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        });

    // === CORS ===
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("CMS", policy =>
        {
            policy.WithOrigins(
                    builder.Configuration["Cors:StudentApp"] ?? "https://app.cms.example.com",
                    builder.Configuration["Cors:AdminApp"] ?? "https://admin.cms.example.com"
                )
                .AllowAnyHeader()
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
        .AddRedis(builder.Configuration.GetConnectionString("Redis")!, name: "redis", tags: new[] { "ready" });

    var app = builder.Build();

    // === Middleware Pipeline ===
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
    app.UseRateLimiter();
    app.UseAuthentication();
    app.UseMiddleware<SessionValidationMiddleware>();
    app.UseAuthorization();
    app.UseMiddleware<ExceptionHandlingMiddleware>();
    app.UseMiddleware<SecurityHeadersMiddleware>();

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
