using System.Collections.Concurrent;
using System.Net;
using System.Text;
using CMS.Application.Interfaces;
using CMS.Infrastructure.Services.Monitoring;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;

namespace CMS.Tests.Unit.Services.Monitoring;

/// <summary>
/// PR-8 provider-monitor unit-test plumbing.
///
/// SECURITY NOTE: every "credential" below is an obviously synthetic fixture value
/// ("test-…" strings); no real secret value is ever written into this file.
/// </summary>
internal static class MonitoringTestDefaults
{
    // Synthetic env fixtures (names are the documented MONITORING_* names; values are fake).
    public static readonly IReadOnlyDictionary<string, string?> RenderEnv = new Dictionary<string, string?>
    {
        ["MONITORING_RENDER_API_KEY"] = "test-render-key-not-a-secret",
        ["MONITORING_RENDER_SERVICE_ID"] = "srv-cms-test"
    };

    public static readonly IReadOnlyDictionary<string, string?> VercelEnv = new Dictionary<string, string?>
    {
        ["MONITORING_VERCEL_ACCESS_TOKEN"] = "test-vercel-token-not-a-secret",
        ["MONITORING_VERCEL_ADMIN_PROJECT_ID"] = "prj_admin_test",
        ["MONITORING_VERCEL_STUDENT_PROJECT_ID"] = "prj_student_test"
    };

    public static readonly IReadOnlyDictionary<string, string?> NeonEnv = new Dictionary<string, string?>
    {
        ["MONITORING_NEON_API_KEY"] = "test-neon-key-not-a-secret",
        ["MONITORING_NEON_PROJECT_ID"] = "neon-proj-test"
    };

    public static readonly IReadOnlyDictionary<string, string?> GithubEnv = new Dictionary<string, string?>
    {
        ["MONITORING_GITHUB_TOKEN"] = "test-github-token-not-a-secret",
        ["MONITORING_GITHUB_OWNER"] = "test-owner",
        ["MONITORING_GITHUB_REPOSITORY"] = "test-repo"
    };

    public static IReadOnlyDictionary<string, string?> With(
        IReadOnlyDictionary<string, string?> baseEnv,
        params (string Key, string? Value)[] overrides)
    {
        var merged = new Dictionary<string, string?>(baseEnv);
        foreach (var (key, value) in overrides) merged[key] = value;
        return merged;
    }

    public static IReadOnlyDictionary<string, string?> Without(
        IReadOnlyDictionary<string, string?> baseEnv,
        params string[] keys)
    {
        var merged = new Dictionary<string, string?>(baseEnv);
        foreach (var key in keys) merged.Remove(key);
        return merged;
    }

    public static IConfiguration ToConfiguration(IReadOnlyDictionary<string, string?> env) =>
        new ConfigurationBuilder().AddInMemoryCollection(env).Build();
}

/// <summary>Scriptable handler: routes by absolute path, records every request, can throw.</summary>
internal sealed class StubHttpMessageHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _responder;
    private readonly object _lock = new();

    public StubHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> responder)
        => _responder = responder;

    public IReadOnlyList<HttpRequestMessage> Requests
    {
        get { lock (_lock) return _requests; }
    }
    private readonly List<HttpRequestMessage> _requests = new();

    public int Calls => Requests.Count;

    public IReadOnlyList<string> RequestedPaths => Requests.Select(request => request.RequestUri!.AbsolutePath).ToList();

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        lock (_lock) _requests.Add(request);
        return _responder(request, cancellationToken);
    }
}

internal static class StubResponses
{
    public static HttpResponseMessage Json(string body, HttpStatusCode code = HttpStatusCode.OK) => new(code)
    {
        Content = new StringContent(body, Encoding.UTF8, "application/json")
    };

    public static HttpResponseMessage Json(string body, int retryAfterSeconds) => new(HttpStatusCode.TooManyRequests)
    {
        Content = new StringContent(body, Encoding.UTF8, "application/json"),
        Headers = { RetryAfter = new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.FromSeconds(retryAfterSeconds)) }
    };

    public static HttpResponseMessage Status(HttpStatusCode code) => new(code);

    /// <summary>Simulates an HttpClient timeout: TaskCanceledException without caller cancellation.</summary>
    public static Task<HttpResponseMessage> Timeout(HttpRequestMessage request, CancellationToken ct)
        => throw new TaskCanceledException("simulated timeout");
}

/// <summary>Fake clock for circuit-breaker timing tests.</summary>
internal sealed class MutableTimeProvider : TimeProvider
{
    private DateTimeOffset _utcNow = new(2026, 1, 15, 12, 0, 0, TimeSpan.Zero);

    public override DateTimeOffset GetUtcNow() => _utcNow;

    public void Advance(TimeSpan delta) => _utcNow = _utcNow.Add(delta);
}

/// <summary>In-memory ICacheService capturing writes (key + TTL) for cache-semantics assertions.</summary>
internal sealed class RecordingCacheService : ICacheService
{
    private readonly ConcurrentDictionary<string, object?> _entries = new();
    private readonly object _lock = new();

    public IReadOnlyList<(string Key, TimeSpan? Expiry)> Writes
    {
        get { lock (_lock) return _writes; }
    }
    private readonly List<(string Key, TimeSpan? Expiry)> _writes = new();

    public Task<T?> GetAsync<T>(string key, CancellationToken ct = default)
        => Task.FromResult(_entries.TryGetValue(key, out var value) && value is T typed ? typed : default);

    public Task<T?> GetAndRemoveAsync<T>(string key, CancellationToken ct = default)
    {
        _entries.TryRemove(key, out var value);
        return Task.FromResult(value is T typed ? typed : default);
    }

    public Task SetAsync<T>(string key, T value, TimeSpan? expiry = null, CancellationToken ct = default)
    {
        _entries[key] = value;
        lock (_lock) _writes.Add((key, expiry));
        return Task.CompletedTask;
    }

    public Task<long> IncrementAsync(string key, TimeSpan? expiry = null, CancellationToken ct = default)
        => Task.FromResult(0L);

    public Task RemoveAsync(string key, CancellationToken ct = default)
    {
        _entries.TryRemove(key, out _);
        return Task.CompletedTask;
    }

    public Task RemoveByPatternAsync(string pattern, CancellationToken ct = default) => Task.CompletedTask;
}

/// <summary>Builds a real monitor over a stub handler (no IHttpClientFactory involved at runtime).</summary>
internal static class MonitorFactory
{
    public static HttpClient Client(StubHttpMessageHandler handler, string baseAddress) =>
        new(handler) { BaseAddress = new Uri(baseAddress) };

    public static Mock<IHttpClientFactory> FactoryReturning(HttpClient client) =>
        MoqFactory(client);

    private static Mock<IHttpClientFactory> MoqFactory(HttpClient client)
    {
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(client);
        return factory;
    }

    public static RenderMonitor Render(StubHttpMessageHandler handler, RecordingCacheService cache,
        IReadOnlyDictionary<string, string?> env, MutableTimeProvider time)
        => new(MoqFactory(Client(handler, "https://api.render.com/")).Object,
            MonitoringTestDefaults.ToConfiguration(env), cache, time, NullLogger<RenderMonitor>.Instance);

    public static VercelMonitor Vercel(StubHttpMessageHandler handler, RecordingCacheService cache,
        IReadOnlyDictionary<string, string?> env, MutableTimeProvider time)
        => new(MoqFactory(Client(handler, "https://api.vercel.com/")).Object,
            MonitoringTestDefaults.ToConfiguration(env), cache, time, NullLogger<VercelMonitor>.Instance);

    public static NeonMonitor Neon(StubHttpMessageHandler handler, RecordingCacheService cache,
        IReadOnlyDictionary<string, string?> env, MutableTimeProvider time)
        => new(MoqFactory(Client(handler, "https://api.neon.tech/")).Object,
            MonitoringTestDefaults.ToConfiguration(env), cache, time, NullLogger<NeonMonitor>.Instance);

    public static GithubMonitor Github(StubHttpMessageHandler handler, RecordingCacheService cache,
        IReadOnlyDictionary<string, string?> env, MutableTimeProvider time)
        => new(MoqFactory(Client(handler, "https://api.github.com/")).Object,
            MonitoringTestDefaults.ToConfiguration(env), cache, time, NullLogger<GithubMonitor>.Instance);
}
