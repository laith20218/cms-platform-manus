using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;
using CMS.Application.DTOs.Monitoring;
using CMS.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace CMS.Infrastructure.Services.Monitoring;

/// <summary>Named HttpClient registrations used by the four provider monitors (see DependencyInjection).</summary>
internal static class MonitoringHttpClients
{
    public const string Render = "MonitoringRender";   // https://api.render.com/
    public const string Vercel = "MonitoringVercel";   // https://api.vercel.com/
    public const string Neon = "MonitoringNeon";       // https://api.neon.tech/
    public const string Github = "MonitoringGithub";   // https://api.github.com/
}

/// <summary>Short, technical, non-secret reason strings (never include tokens, URLs or secrets).</summary>
internal static class ProviderReasons
{
    /// <summary>Arabic by spec — used ONLY for the missing_credentials state.</summary>
    public const string MissingCredentials = "بيانات الاعتماد غير مُهيّأة";

    public const string CircuitOpen = "circuit open (recent consecutive upstream failures)";
    public const string Timeout = "upstream timeout";
    public const string NetworkError = "upstream network error";
    public const string RateLimited = "provider rate limit (429)";
    public const string Malformed = "malformed upstream response";
    public const string Unexpected = "unexpected monitor failure";

    /// <summary>Rate-limit reason with the Retry-After seconds appended only when the provider sent one.</summary>
    public static string RateLimitedWith(int? retryAfterSeconds) =>
        retryAfterSeconds is { } seconds ? $"{RateLimited}; retry-after {seconds}s" : RateLimited;

    /// <summary>Partial-data degraded reason wrapping the underlying failure reason.</summary>
    public static string Partial(string failureReason) => $"partial data: {failureReason}";
}

/// <summary>
/// Log-input + payload-text sanitizer mirroring the two existing sanitizers on purpose:
/// <see cref="CMS.Api.Middleware.LogSanitizer"/> rules for log arguments and the
/// SecurityService.SanitizeAuditText pipeline (control-char flatten → sensitive-keyword
/// redaction → truncate) for provider-sourced payload text such as commit messages.
/// </summary>
internal static class MonitoringTextSanitizer
{
    private const int LogValueMaximumLength = 256;
    private const int PayloadTextMaximumLength = 200;

    private static readonly Regex ControlCharacterPattern = new(
        @"[\u0000-\u001F\u007F]", RegexOptions.CultureInvariant | RegexOptions.Compiled);

    // Same keyword set as SecurityService.SensitiveAuditValuePattern — values are redacted, keys kept.
    private static readonly Regex SensitiveValuePattern = new(
        @"(?ix)\b(?<key>authorization|bearer|access[_-]?token|refresh[_-]?token|password|secret|api[_-]?key|key)\b\s*(?:[:=]\s*|\s+)(?<value>[^\s,;]+)",
        RegexOptions.CultureInvariant | RegexOptions.Compiled);

    /// <summary>Log-safe rendering: control chars flattened, overlong values truncated.</summary>
    public static string CleanLogValue(string? value, int maxLength = LogValueMaximumLength)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        var flattened = value.Replace("\r", " ").Replace("\n", " ");
        var stripped = ControlCharacterPattern.Replace(flattened, " ");
        return stripped.Length <= maxLength ? stripped : stripped[..maxLength];
    }

    /// <summary>Provider payload text: flatten → redact secret-shaped values → truncate.</summary>
    public static string? SanitizeProviderText(string? value, int maxLength = PayloadTextMaximumLength)
    {
        if (string.IsNullOrWhiteSpace(value)) return value;
        var flattened = ControlCharacterPattern.Replace(value, " ");
        var sanitized = SensitiveValuePattern.Replace(flattened, match => $"{match.Groups["key"].Value}=[REDACTED]");
        return sanitized.Length <= maxLength ? sanitized : sanitized[..maxLength];
    }
}

/// <summary>Defensive JSON readers for provider payloads (missing/mistyped fields never throw).</summary>
internal static class MonitoringJson
{
    public static JsonElement? Property(JsonElement element, params string[] names)
    {
        foreach (var name in names)
        {
            if (element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value)
                && value.ValueKind is not JsonValueKind.Null and not JsonValueKind.Undefined)
                return value;
        }
        return null;
    }

    public static string? String(JsonElement element, params string[] names)
    {
        var property = Property(element, names);
        return property is { ValueKind: JsonValueKind.String } text ? text.GetString() : null;
    }

    public static bool Bool(JsonElement element, bool fallback, params string[] names)
    {
        var property = Property(element, names);
        return property is { ValueKind: JsonValueKind.True or JsonValueKind.False } flag ? flag.GetBoolean() : fallback;
    }

    /// <summary>Tri-state bool: null when the field is absent or not a boolean.</summary>
    public static bool? OptionalBool(JsonElement element, params string[] names)
    {
        var property = Property(element, names);
        return property is { ValueKind: JsonValueKind.True or JsonValueKind.False } flag ? flag.GetBoolean() : null;
    }

    public static int? Int(JsonElement element, params string[] names)
    {
        var property = Property(element, names);
        return property is { ValueKind: JsonValueKind.Number } number && number.TryGetInt32(out var value) ? value : null;
    }

    public static long? Long(JsonElement element, params string[] names)
    {
        var property = Property(element, names);
        return property is { ValueKind: JsonValueKind.Number } number && number.TryGetInt64(out var value) ? value : null;
    }

    /// <summary>Parses provider dates: ISO-8601 strings OR epoch-milliseconds numbers (Vercel).</summary>
    public static DateTime? Date(JsonElement element, params string[] names)
    {
        var property = Property(element, names);
        if (property is null) return null;
        var value = property.Value;
        if (value.ValueKind == JsonValueKind.String
            && DateTimeOffset.TryParse(value.GetString(), CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var parsed))
            return parsed.UtcDateTime;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt64(out var epochMilliseconds))
            return DateTimeOffset.FromUnixTimeMilliseconds(epochMilliseconds).UtcDateTime;
        return null;
    }
}

/// <summary>Outcome of ONE fixed upstream GET (with its bounded retry applied).</summary>
/// <param name="Succeeded">True when the provider answered 2xx (a body is present).</param>
/// <param name="Body">Raw 2xx body text (parsed defensively by the provider parser).</param>
/// <param name="FailureStatus">Classified failure status when not succeeded.</param>
/// <param name="FailureReason">Short technical failure reason when not succeeded.</param>
/// <param name="RetryAfterSeconds">Retry-After seconds (clamped to 60) when the provider sent one.</param>
/// <param name="ElapsedMs">Stopwatch elapsed of this call, retries included.</param>
internal sealed record ProviderCallOutcome(
    bool Succeeded,
    string? Body,
    string? FailureStatus,
    string? FailureReason,
    int? RetryAfterSeconds,
    int ElapsedMs);

/// <summary>Outcome of one whole provider check (all its fixed GETs).</summary>
/// <param name="Status">Final envelope status.</param>
/// <param name="Reason">Final unavailableReason (null when operational).</param>
/// <param name="Data">Mapped provider payload (partial when a secondary call failed).</param>
/// <param name="ResponseTimeMs">Elapsed of the LAST upstream call (retries summed); -1 when no call was made.</param>
/// <param name="RetryAfterSeconds">Retry-After seconds when the terminal failure was 429.</param>
/// <param name="AllCallsSucceeded">True only when EVERY upstream call answered 2xx (resets the circuit).</param>
/// <param name="TransientUpstreamFailure">True when ANY upstream call failed transiently (timeout/network/5xx after retry) — trips the circuit counter.</param>
internal sealed record ProviderCheckOutcome<TData>(
    string Status,
    string? Reason,
    TData? Data,
    int ResponseTimeMs,
    int? RetryAfterSeconds,
    bool AllCallsSucceeded,
    bool TransientUpstreamFailure) where TData : class;

/// <summary>
/// Shared mechanics for the four provider monitors: short cache (ICacheService, key
/// "servers:monitor:{provider}"), bounded single retry (250ms backoff) on transient failures,
/// per-provider consecutive-failure circuit breaker (3 failures → OPEN 60s), and the bounded
/// in-memory check history ring (50 entries). Singleton by design — the circuit/history state
/// must be shared across requests. Thread safety: Interlocked for the circuit counters, a lock
/// for the history ring. Cache HITS are not recorded into the history ring (they are repeats of
/// the ORIGINAL check, not new checks — attempted or short-circuited checks are).
///
/// Circuit semantics (documented reading of the spec): only checks that end "down"
/// (timeout / network / 5xx after retry) increment the consecutive-failure counter; checks where
/// every upstream call answered 2xx reset it; every other outcome (invalid_credentials /
/// rate_limited / missing_credentials / malformed / other non-2xx) leaves it untouched.
/// </summary>
internal abstract class ProviderMonitorBase<TData> : IProviderMonitor where TData : class
{
    private const int StandardCacheTtlSeconds = 60;
    private const int RateLimitedMinimumCacheSeconds = 15;
    private const int CacheTtlCapSeconds = 60;
    private const int RetryBackoffMilliseconds = 250;
    private const int CircuitFailureThreshold = 3;
    private const int CircuitOpenSeconds = 60;
    private const int HistoryCapacity = 50;

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ICacheService _cache;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger _logger;
    private readonly string _httpClientName;
    private readonly string? _bearerToken;

    private readonly object _historyLock = new();
    private readonly ProviderHistoryItem?[] _historyRing = new ProviderHistoryItem?[HistoryCapacity];
    private int _historyHead;
    private int _historyCount;

    private int _consecutiveFailures;
    private long _circuitOpenUntilTicks;

    protected ProviderMonitorBase(
        string provider,
        string httpClientName,
        string? bearerToken,
        IHttpClientFactory httpClientFactory,
        ICacheService cache,
        TimeProvider timeProvider,
        ILogger logger)
    {
        ProviderName = provider;
        _httpClientName = httpClientName;
        _bearerToken = bearerToken;
        _httpClientFactory = httpClientFactory;
        _cache = cache;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    public string ProviderName { get; }

    private string CacheKey => $"servers:monitor:{ProviderName}";

    /// <summary>True only when every documented env name this monitor needs is configured.</summary>
    protected abstract bool IsConfigured { get; }

    /// <summary>Runs the fixed allowlisted GETs for this provider and maps the payload.</summary>
    protected abstract Task<ProviderCheckOutcome<TData>> FetchAsync(HttpClient client, string? correlationId, CancellationToken ct);

    /// <summary>
    /// One bounded check: circuit gate → short cache → credentials gate → upstream (fixed GETs,
    /// one retry on transient). NEVER throws for provider-side conditions; only caller
    /// cancellation (or a bug) escapes — the catch-all below keeps the dashboard alive.
    /// </summary>
    public async Task<ProviderEnvelope<TData>> GetAsync(bool fresh, string? correlationId = null, CancellationToken ct = default)
    {
        var now = _timeProvider.GetUtcNow().UtcDateTime;

        // 1) Circuit OPEN: short-circuit without any upstream call (and without cache IO — the
        //    circuit verdict is fresher than anything cached).
        if (IsCircuitOpen(now))
        {
            var shortCircuit = BuildEnvelope(ProviderStatus.Unavailable, -1, ProviderReasons.CircuitOpen, now, null);
            RecordHistory(shortCircuit);
            LogCheck("circuit", ProviderStatus.Unavailable, 0, correlationId);
            return shortCircuit;
        }

        // 2) Short cache (60s): a hit keeps the ORIGINAL checkedAt and reports cached=true + age.
        if (!fresh)
        {
            var cached = await TryReadCacheAsync(ct);
            if (cached is not null)
            {
                return cached with { Freshness = new ProviderFreshness(true, ComputeAgeSeconds(cached.CheckedAt, now)) };
            }
        }

        // 3) Credentials gate: documented env names unset → no upstream call at all.
        if (!IsConfigured)
        {
            var missing = BuildEnvelope(ProviderStatus.MissingCredentials, -1, ProviderReasons.MissingCredentials, now, null);
            await TryWriteCacheAsync(missing, TimeSpan.FromSeconds(StandardCacheTtlSeconds), ct);
            RecordHistory(missing);
            LogCheck("env", ProviderStatus.MissingCredentials, 0, correlationId);
            return missing;
        }

        // 4) Upstream check through the fixed-allowlist client.
        var client = _httpClientFactory.CreateClient(_httpClientName);
        ProviderCheckOutcome<TData> outcome;
        try
        {
            outcome = await FetchAsync(client, correlationId, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            throw; // caller cancellation is not a provider state — it must propagate.
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Failure isolation net: one monitor's bug can never take the dashboard down.
            outcome = new ProviderCheckOutcome<TData>(ProviderStatus.Unavailable, ProviderReasons.Unexpected, null, -1, null, false, false);
            _logger.LogWarning("provider monitor unexpected failure {Provider} cid {CorrelationId} {ExceptionType}",
                ProviderName, MonitoringTextSanitizer.CleanLogValue(correlationId), ex.GetType().Name);
        }

        var envelope = BuildEnvelope(outcome.Status, outcome.ResponseTimeMs, outcome.Reason, now, outcome.Data);
        var ttl = outcome.Status == ProviderStatus.RateLimited
            ? RateLimitedCacheTtl(outcome.RetryAfterSeconds)
            : TimeSpan.FromSeconds(StandardCacheTtlSeconds);
        await TryWriteCacheAsync(envelope, ttl, ct);
        RecordHistory(envelope);
        ApplyCircuitTransition(outcome, now);
        return envelope;
    }

    public ProviderHistorySnapshot GetHistory()
    {
        lock (_historyLock)
        {
            var items = new List<ProviderHistoryItem>(_historyCount);
            for (var i = 0; i < _historyCount; i++)
            {
                var index = (_historyHead - 1 - i + HistoryCapacity) % HistoryCapacity;
                if (_historyRing[index] is { } item) items.Add(item);
            }
            return new ProviderHistorySnapshot(HistoryCapacity, items);
        }
    }

    // ===== shared helpers for the concrete monitors =====

    /// <summary>
    /// Executes ONE fixed-path GET with the provider Bearer token and the bounded retry policy:
    /// exactly one retry (250ms backoff) for transient failures (HttpRequestException /
    /// TaskCanceledException timeout / 5xx). 401/403 → invalid_credentials (no retry);
    /// 429 → rate_limited (Retry-After honored, capped 60s); 5xx after retry → down;
    /// other non-2xx → unavailable. The Authorization header is NEVER logged.
    /// </summary>
    protected async Task<ProviderCallOutcome> CallGetAsync(HttpClient client, string relativePath, string? correlationId, CancellationToken ct)
    {
        var stopwatch = Stopwatch.StartNew();
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, relativePath);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _bearerToken);

                using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
                var code = (int)response.StatusCode;
                var retryAfter = ReadRetryAfterSeconds(response);

                if (code is >= 200 and <= 299)
                {
                    var body = await response.Content.ReadAsStringAsync(ct);
                    LogRequest(relativePath, code, stopwatch.ElapsedMilliseconds, correlationId);
                    return new ProviderCallOutcome(true, body, null, null, null, ElapsedMs(stopwatch));
                }

                LogRequest(relativePath, code, stopwatch.ElapsedMilliseconds, correlationId);

                if (code is 401 or 403)
                    return new ProviderCallOutcome(false, null, ProviderStatus.InvalidCredentials,
                        $"provider rejected credentials ({code})", retryAfter, ElapsedMs(stopwatch));

                if (code == 429)
                    return new ProviderCallOutcome(false, null, ProviderStatus.RateLimited,
                        ProviderReasons.RateLimitedWith(retryAfter), retryAfter, ElapsedMs(stopwatch));

                if (code >= 500)
                {
                    if (attempt == 1)
                    {
                        await BackoffAsync(ct);
                        continue; // the single bounded retry
                    }
                    return new ProviderCallOutcome(false, null, ProviderStatus.Down,
                        $"upstream {code} after retry", retryAfter, ElapsedMs(stopwatch));
                }

                return new ProviderCallOutcome(false, null, ProviderStatus.Unavailable,
                    $"upstream {code}", retryAfter, ElapsedMs(stopwatch));
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw; // caller cancellation propagates — never classified as a provider state.
            }
            catch (TaskCanceledException)
            {
                // HttpClient timeout (ct NOT cancelled): transient.
                if (attempt == 1)
                {
                    await BackoffAsync(ct);
                    continue;
                }
                return new ProviderCallOutcome(false, null, ProviderStatus.Down,
                    ProviderReasons.Timeout, null, ElapsedMs(stopwatch));
            }
            catch (HttpRequestException)
            {
                if (attempt == 1)
                {
                    await BackoffAsync(ct);
                    continue;
                }
                return new ProviderCallOutcome(false, null, ProviderStatus.Down,
                    ProviderReasons.NetworkError, null, ElapsedMs(stopwatch));
            }
        }
    }

    /// <summary>Failure outcome for the FIRST fixed GET — the call classification becomes the envelope.</summary>
    protected static ProviderCheckOutcome<TData> FromCallFailure(ProviderCallOutcome call) => new(
        call.FailureStatus ?? ProviderStatus.Unavailable,
        call.FailureReason,
        null,
        call.ElapsedMs,
        call.RetryAfterSeconds,
        AllCallsSucceeded: false,
        TransientUpstreamFailure: call.FailureStatus == ProviderStatus.Down);

    /// <summary>
    /// Failure outcome for a NON-first fixed GET after earlier calls already succeeded:
    /// 401/403/429 keep their provider-wide status (token/quota level — data null); every other
    /// failure becomes degraded "partial data: …" keeping the already-mapped payload.
    /// </summary>
    protected static ProviderCheckOutcome<TData> FromSecondaryFailure(ProviderCallOutcome call, TData? partialData)
    {
        var providerWide = call.FailureStatus is ProviderStatus.InvalidCredentials or ProviderStatus.RateLimited;
        return new ProviderCheckOutcome<TData>(
            providerWide ? call.FailureStatus! : ProviderStatus.Degraded,
            providerWide ? call.FailureReason : ProviderReasons.Partial(call.FailureReason ?? ProviderStatus.Unavailable),
            providerWide ? null : partialData,
            call.ElapsedMs,
            call.RetryAfterSeconds,
            AllCallsSucceeded: false,
            TransientUpstreamFailure: call.FailureStatus == ProviderStatus.Down);
    }

    /// <summary>Reclassifies a 2xx call whose body could not be mapped as a malformed-payload failure.</summary>
    protected static ProviderCallOutcome MalformedCall(ProviderCallOutcome call) => call with
    {
        Succeeded = false,
        FailureStatus = ProviderStatus.Unavailable,
        FailureReason = ProviderReasons.Malformed
    };

    /// <summary>Escapes an operator-configured identifier into a fixed path segment (path-injection guard).</summary>
    protected static string Escaped(string value) => Uri.EscapeDataString(value);

    /// <summary>Parses a 2xx body defensively; null when the payload is not valid JSON.</summary>
    protected static JsonElement? ParseBody(string? body)
    {
        if (string.IsNullOrWhiteSpace(body)) return null;
        try
        {
            using var document = JsonDocument.Parse(body);
            return document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static int ElapsedMs(Stopwatch stopwatch) => (int)Math.Min(stopwatch.ElapsedMilliseconds, int.MaxValue);

    private static TimeSpan RateLimitedCacheTtl(int? retryAfterSeconds) => TimeSpan.FromSeconds(
        Math.Max(RateLimitedMinimumCacheSeconds, Math.Min(CacheTtlCapSeconds, retryAfterSeconds ?? 0)));

    private static int ComputeAgeSeconds(DateTime checkedAt, DateTime now)
    {
        var age = (now - checkedAt).TotalSeconds;
        return age <= 0 ? 0 : (int)Math.Min(age, int.MaxValue);
    }

    private static int? ReadRetryAfterSeconds(HttpResponseMessage response)
    {
        var retryAfter = response.Headers.RetryAfter;
        if (retryAfter?.Delta is { } delta)
            return (int)Math.Clamp(delta.TotalSeconds, 0, CacheTtlCapSeconds);
        if (retryAfter?.Date is { } date)
            return (int)Math.Clamp((date - DateTimeOffset.UtcNow).TotalSeconds, 0, CacheTtlCapSeconds);
        return null;
    }

    private ProviderEnvelope<TData> BuildEnvelope(string status, int responseTimeMs, string? reason, DateTime now, TData? data) =>
        new(ProviderName, status, now, responseTimeMs, reason, new ProviderFreshness(false, 0), data);

    private async Task BackoffAsync(CancellationToken ct) => await Task.Delay(RetryBackoffMilliseconds, ct);

    private bool IsCircuitOpen(DateTime now) =>
        now.Ticks < Interlocked.Read(ref _circuitOpenUntilTicks);

    private void ApplyCircuitTransition(ProviderCheckOutcome<TData> outcome, DateTime now)
    {
        if (outcome.AllCallsSucceeded)
        {
            Interlocked.Exchange(ref _consecutiveFailures, 0);
            Interlocked.Exchange(ref _circuitOpenUntilTicks, 0);
            return;
        }

        if (!outcome.TransientUpstreamFailure) return; // only transient-class upstream failures trip.

        var failures = Interlocked.Increment(ref _consecutiveFailures);
        if (failures >= CircuitFailureThreshold)
        {
            Interlocked.Exchange(ref _circuitOpenUntilTicks, now.AddSeconds(CircuitOpenSeconds).Ticks);
            _logger.LogWarning("provider circuit OPEN {Provider} after {Failures} consecutive down checks", ProviderName, failures);
        }
    }

    private async Task<ProviderEnvelope<TData>?> TryReadCacheAsync(CancellationToken ct)
    {
        try
        {
            return await _cache.GetAsync<ProviderEnvelope<TData>>(CacheKey, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning("provider cache read failed (best-effort) {Provider} {ExceptionType}", ProviderName, ex.GetType().Name);
            return null;
        }
    }

    private async Task TryWriteCacheAsync(ProviderEnvelope<TData> envelope, TimeSpan ttl, CancellationToken ct)
    {
        try
        {
            await _cache.SetAsync(CacheKey, envelope, ttl, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning("provider cache write failed (best-effort) {Provider} {ExceptionType}", ProviderName, ex.GetType().Name);
        }
    }

    private void RecordHistory(ProviderEnvelope<TData> envelope)
    {
        var item = new ProviderHistoryItem(envelope.CheckedAt, envelope.Status, envelope.ResponseTimeMs, envelope.UnavailableReason);
        lock (_historyLock)
        {
            _historyRing[_historyHead] = item;
            _historyHead = (_historyHead + 1) % HistoryCapacity;
            if (_historyCount < HistoryCapacity) _historyCount++;
        }
    }

    // ===== sanitized log lines (provider / fixed path / status / elapsed / correlationId only) =====

    private void LogRequest(string path, int statusCode, long elapsedMs, string? correlationId) =>
        _logger.LogInformation("provider check {Provider} {Path} -> {Status} {ElapsedMs}ms cid {CorrelationId}",
            ProviderName, MonitoringTextSanitizer.CleanLogValue(path, 128), statusCode, elapsedMs,
            MonitoringTextSanitizer.CleanLogValue(correlationId, 64));

    private void LogCheck(string path, string status, int elapsedMs, string? correlationId) =>
        _logger.LogInformation("provider check {Provider} {Path} -> {Status} {ElapsedMs}ms cid {CorrelationId}",
            ProviderName, MonitoringTextSanitizer.CleanLogValue(path, 128), status, elapsedMs,
            MonitoringTextSanitizer.CleanLogValue(correlationId, 64));
}
