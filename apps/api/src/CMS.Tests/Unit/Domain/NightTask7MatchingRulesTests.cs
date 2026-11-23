using CMS.Domain.Exceptions;
using CMS.Domain.ValueObjects;
using FluentAssertions;

namespace CMS.Tests.Unit.Domain;

/// <summary>
/// Night Task 7 — Matching (وصل) rules:
///   7.1 AllowMultiMap — a left item may be correctly paired with MULTIPLE
///       right items; grading demands per-prompt SET equality. Default false
///       keeps the W20.5 bijection bit-for-bit (legacy content untouched).
///   7.2 Numbering styles per list (digits / arabicLetters / latinLetters) —
///       validated at write time; null = surface default (legacy).
/// </summary>
public sealed class NightTask7MatchingRulesTests
{
    private static readonly Guid P1 = Guid.NewGuid();
    private static readonly Guid P2 = Guid.NewGuid();
    private static readonly Guid T1 = Guid.NewGuid();
    private static readonly Guid T2 = Guid.NewGuid();
    private static readonly Guid T3 = Guid.NewGuid();

    private static MatchingPayload BijectionPayload() => new()
    {
        Prompts = new List<MatchingItem> { new(P1, "أ", 0), new(P2, "ب", 1) },
        Targets = new List<MatchingItem> { new(T1, "١", 0), new(T2, "٢", 1) },
        Pairs = new List<MatchingPair> { new(P1, T1), new(P2, T2) },
    };

    private static MatchingPayload MultiMapPayload() => new()
    {
        AllowMultiMap = true,
        // 2 prompts, 3 targets (extra distractor) — counts may differ.
        Prompts = new List<MatchingItem> { new(P1, "أ", 0), new(P2, "ب", 1) },
        Targets = new List<MatchingItem> { new(T1, "١", 0), new(T2, "٢", 1), new(T3, "٣", 2) },
        // P1 is correctly paired with BOTH T1 and T2; P2 with T3.
        Pairs = new List<MatchingPair> { new(P1, T1), new(P1, T2), new(P2, T3) },
    };

    // ===== 7.1 validation =====

    [Fact]
    public void LegacyBijectionPayload_StillValidates_Unchanged()
    {
        var payload = BijectionPayload();
        var act = () => payload.Validate();
        act.Should().NotThrow("legacy content must keep passing the W20.5 invariants");
    }

    [Fact]
    public void BijectionMode_StillRejects_UnequalCounts_AndSharedTargets()
    {
        var payload = BijectionPayload();
        payload = payload with { Targets = new List<MatchingItem> { new(T1, "١", 0), new(T2, "٢", 1), new(T3, "٣", 2) } };
        ((Action)(() => payload.Validate())).Should().Throw<DomainException>();

        var shared = BijectionPayload() with { Pairs = new List<MatchingPair> { new(P1, T1), new(P2, T1) } };
        ((Action)(() => shared.Validate())).Should().Throw<DomainException>();
    }

    [Fact]
    public void MultiMapPayload_WithPromptMappedToTwoTargets_AndExtraDistractor_Validates()
    {
        var payload = MultiMapPayload();
        var act = () => payload.Validate();
        act.Should().NotThrow("a left item may be valid for multiple right items");
    }

    [Fact]
    public void MultiMapMode_Rejects_UnpairedPrompt_SharedTarget_DuplicatePair()
    {
        // A prompt with no pair at all.
        var unpaired = MultiMapPayload() with { Pairs = new List<MatchingPair> { new(P1, T1), new(P1, T2) } };
        ((Action)(() => unpaired.Validate())).Should().Throw<DomainException>();

        // A target correct for TWO prompts — only the LEFT side is relaxed.
        var sharedTarget = MultiMapPayload() with
        {
            Pairs = new List<MatchingPair> { new(P1, T1), new(P2, T1) },
        };
        ((Action)(() => sharedTarget.Validate())).Should().Throw<DomainException>();

        // The very same pair twice.
        var duplicate = MultiMapPayload() with
        {
            Pairs = new List<MatchingPair> { new(P1, T1), new(P1, T1), new(P2, T2) },
        };
        ((Action)(() => duplicate.Validate())).Should().Throw<DomainException>();
    }

    // ===== 7.1 grading =====

    [Fact]
    public void MultiMapGrading_SetEqualityPerPrompt()
    {
        var payload = MultiMapPayload();

        // Exact sets → correct.
        var exact = payload.Grade(new List<MatchingPair> { new(P1, T1), new(P1, T2), new(P2, T3) });
        exact.IsCorrect.Should().BeTrue();
        exact.Pairs.Should().OnlyContain(pair => pair.IsCorrect);

        // Superset (extra submission for P1) → wrong.
        var superset = payload.Grade(new List<MatchingPair> { new(P1, T1), new(P1, T2), new(P1, T3), new(P2, T3) });
        superset.IsCorrect.Should().BeFalse();

        // Subset (missing one of P1's two correct targets) → wrong.
        var subset = payload.Grade(new List<MatchingPair> { new(P1, T1), new(P2, T3) });
        subset.IsCorrect.Should().BeFalse();

        // Nothing submitted → wrong, no crash.
        var empty = payload.Grade(Array.Empty<MatchingPair>());
        empty.IsCorrect.Should().BeFalse();
    }

    [Fact]
    public void BijectionGrading_Unchanged_ByTheNewRules()
    {
        var payload = BijectionPayload();
        payload.Grade(new List<MatchingPair> { new(P1, T1), new(P2, T2) }).IsCorrect.Should().BeTrue();
        payload.Grade(new List<MatchingPair> { new(P1, T2), new(P2, T1) }).IsCorrect.Should().BeFalse();
        payload.Grade(new List<MatchingPair> { new(P1, T1) }).IsCorrect.Should().BeFalse();
    }

    // ===== 7.2 numbering styles =====

    [Theory]
    [InlineData("digits")]
    [InlineData("arabicLetters")]
    [InlineData("latinLetters")]
    public void NumberingStyles_AllAccepted(string style)
    {
        var payload = BijectionPayload() with { PromptNumbering = style, TargetNumbering = style };
        var act = () => payload.Validate();
        act.Should().NotThrow();
    }

    [Fact]
    public void NumberingStyle_UnknownValue_Rejected()
    {
        var payload = BijectionPayload() with { PromptNumbering = "roman" };
        ((Action)(() => payload.Validate())).Should().Throw<DomainException>()
            .Which.Message.Should().Contain("ترقيم");
    }

    [Fact]
    public void NumberingFields_RoundTrip_ThroughSerialize()
    {
        var payload = MultiMapPayload() with { PromptNumbering = "arabicLetters", TargetNumbering = "latinLetters" };
        var restored = MatchingPayload.Deserialize(payload.Serialize());
        restored.AllowMultiMap.Should().BeTrue();
        restored.PromptNumbering.Should().Be("arabicLetters");
        restored.TargetNumbering.Should().Be("latinLetters");
        restored.Pairs.Should().HaveCount(3);
    }
}
