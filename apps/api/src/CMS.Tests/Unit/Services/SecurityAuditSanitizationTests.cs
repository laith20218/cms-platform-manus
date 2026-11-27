using CMS.Application.Interfaces;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;

namespace CMS.Tests.Unit.Services;

/// <summary>
/// PR-6 (Security Center) — SanitizeAuditText hardening: control characters
/// (CR/LF/tab/NUL/ESC/DEL — U+0000..U+001F + U+007F) must be flattened to a single
/// space BEFORE keyword redaction and BEFORE the 512-char truncation, while Arabic +
/// Unicode content and the password=[REDACTED] redaction stay intact. All cases run
/// through the public LogSecurityEventAsync surface (Warning severity — persisted
/// immediately) so the stored SecurityLog is the asserted artifact.
/// </summary>
public class SecurityAuditSanitizationTests
{
    [Fact]
    public async Task LogSecurityEventAsync_LineFeedOnly_IsFlattenedToSingleSpace()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var service = CreateService(db);

        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginFailed, SecuritySeverity.Warning,
            "first line\nsecond line");

        (await db.SecurityLogs.SingleAsync()).Description.Should().Be("first line second line");
    }

    [Fact]
    public async Task LogSecurityEventAsync_CarriageReturnLineFeed_EachControlCharBecomesOneSpace()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var service = CreateService(db);

        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginFailed, SecuritySeverity.Warning,
            "first\r\nsecond");

        (await db.SecurityLogs.SingleAsync()).Description.Should().Be("first  second");
    }

    [Fact]
    public async Task LogSecurityEventAsync_TabInjection_IsFlattenedToSingleSpace()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var service = CreateService(db);

        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginFailed, SecuritySeverity.Warning,
            "before\tafter");

        (await db.SecurityLogs.SingleAsync()).Description.Should().Be("before after");
    }

    [Theory]
    [InlineData("\u001B[31m forged")]   // ESC + CSI sequence
    [InlineData("nul\u0000separated")]   // NUL
    [InlineData("soh\u0001stx")]         // SOH / control chars
    [InlineData("del\u007Fkey")]         // DEL
    [InlineData("cr\ronly")]             // CR alone
    public async Task LogSecurityEventAsync_ControlCharacters_AreReplacedWithASingleSpace(string raw)
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var service = CreateService(db);

        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginFailed, SecuritySeverity.Warning,
            $"raw=[{raw}]");

        var stored = (await db.SecurityLogs.SingleAsync()).Description;
        stored.Should().Be($"raw=[{Flatten(raw)}]");
        stored.Should().NotContainAny("\r", "\n", "\t", "\u0000", "\u0001", "\u0002", "\u001B", "\u007F");
    }

    [Fact]
    public async Task LogSecurityEventAsync_MixedControlCharacters_AllFlattened()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var service = CreateService(db);

        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginFailed, SecuritySeverity.Warning,
            "a\r\nb\tc\u0000d\u001Be\u007Ff");

        (await db.SecurityLogs.SingleAsync()).Description.Should().Be("a  b c d e f");
    }

    [Fact]
    public async Task LogSecurityEventAsync_UserAgentAndDeviceFingerprint_AreFlattenedToo()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var service = CreateService(db);

        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginFailed, SecuritySeverity.Warning,
            "description", userAgent: "Mozilla/5.0\tEvil\r\nAgent", deviceFingerprint: "fp\u001B injected");

        var stored = await db.SecurityLogs.SingleAsync();
        stored.UserAgent.Should().Be("Mozilla/5.0 Evil  Agent");
        stored.DeviceFingerprint.Should().Be("fp  injected");
    }

    [Fact]
    public async Task LogSecurityEventAsync_LongValue_IsTruncatedToAuditCap()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var service = CreateService(db);
        var longDescription = new string('x', 700);

        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginFailed, SecuritySeverity.Warning,
            longDescription);

        (await db.SecurityLogs.SingleAsync()).Description.Should().Be(new string('x', 512));
    }

    [Fact]
    public async Task LogSecurityEventAsync_TruncationAppliesToFlattenedText_NotTheRawInput()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var service = CreateService(db);
        // 511 plain chars + CRLF + tail: flattening makes 513+ chars, so the cap (512)
        // must be applied AFTER flattening.
        var raw = new string('y', 511) + "\r\n" + new string('z', 40);

        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginFailed, SecuritySeverity.Warning,
            raw);

        var stored = (await db.SecurityLogs.SingleAsync()).Description;
        stored.Length.Should().Be(512);
        stored.Should().Be(new string('y', 511) + " ");
    }

    [Fact]
    public async Task LogSecurityEventAsync_ArabicAndUnicodeContent_IsPreserved()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var service = CreateService(db);
        const string text = "الطالب أحمد من جامعة حمص — 中学生 📘 résumé naïve";

        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginFailed, SecuritySeverity.Warning,
            text);

        (await db.SecurityLogs.SingleAsync()).Description.Should().Be(text);
    }

    [Fact]
    public async Task LogSecurityEventAsync_KeywordRedaction_StillAppliedAfterFlattening()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var service = CreateService(db);

        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginFailed, SecuritySeverity.Warning,
            "password=TEST_ONLY_SECRET");

        var stored = (await db.SecurityLogs.SingleAsync()).Description;
        stored.Should().Contain("password=[REDACTED]");
        stored.Should().NotContain("TEST_ONLY_SECRET");
    }

    [Fact]
    public async Task LogSecurityEventAsync_ControlCharactersPlusKeyword_BothSanitizedAndRedacted()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var service = CreateService(db);

        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginFailed, SecuritySeverity.Warning,
            "login attempt\r\npassword=TEST_ONLY_SECRET\tend");

        var stored = (await db.SecurityLogs.SingleAsync()).Description;
        stored.Should().Contain("password=[REDACTED]");
        stored.Should().NotContain("TEST_ONLY_SECRET");
        stored.Should().NotContainAny("\r", "\n", "\t");
        stored.Should().StartWith("login attempt");
    }

    [Fact]
    public async Task LogSecurityEventAsync_BatchedPath_AlsoFlattensControlCharacters()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var batch = new Mock<ISecurityEventBatch>();
        var service = new SecurityService(db, new Mock<ICacheService>().Object, batch.Object, new CorrelationContext(), Configuration());

        // Info severity → batched path (not persisted immediately)
        await service.LogSecurityEventAsync(Guid.NewGuid(), null, SecurityEventType.LoginSuccess, SecuritySeverity.Info,
            "batched\nline\tdescription password=TEST_ONLY_BATCH");

        batch.Verify(queue => queue.EnqueueAsync(
            It.Is<SecurityEventWrite>(entry =>
                entry.Description == "batched line description password=[REDACTED]"
                && !entry.Description.Contains("TEST_ONLY_BATCH")),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    private static SecurityService CreateService(ApplicationDbContext db) =>
        new(db, new Mock<ICacheService>().Object, new Mock<ISecurityEventBatch>().Object, new CorrelationContext(), Configuration());

    /// <summary>Mirrors the sanitizer contract: every C0/DEL char becomes exactly one space.</summary>
    private static string Flatten(string value) =>
        new(value.Select(c => c < ' ' || c == '\u007F' ? ' ' : c).ToArray());

    private static IConfiguration Configuration() => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?> { ["Security:Device:SingleActiveDevice"] = "true" })
        .Build();
}
