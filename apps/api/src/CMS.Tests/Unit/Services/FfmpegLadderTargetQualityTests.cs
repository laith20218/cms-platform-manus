using FluentAssertions;
using CMS.Application.BackgroundJobs;
using CMS.Domain.Enums;

namespace CMS.Tests.Unit.Services;

/// <summary>
/// Push 10.7 — manual quality selection: BuildHlsLadderArgs generates EXACTLY ONE
/// rung for a concrete target (the requested rung, or the closest LOWER rung when
/// the source is smaller — never upscale), while Auto keeps the source-driven
/// ladder from Hotfix 10.6-2. Also pins the ultrafast/threads knobs the free-tier
/// host depends on.
/// </summary>
public class FfmpegLadderTargetQualityTests
{
    private static FfmpegLadder.LadderPlan Build(int width, int height, TargetQuality quality) =>
        FfmpegLadder.BuildHlsLadderArgs("/tmp/source", "/tmp/out", height, width, hasAudio: true, targetQuality: quality);

    [Theory]
    [InlineData(TargetQuality.P1080, 1920, 1080, "1080p")]   // 1080p source → 1080p
    [InlineData(TargetQuality.P720, 1920, 1080, "720p")]     // 1080p source, P720 → 720p only
    [InlineData(TargetQuality.P360, 1920, 1080, "360p")]     // 1080p source, P360 → 360p only
    [InlineData(TargetQuality.P1080, 1280, 720, "720p")]     // 720p source, P1080 → closest lower = 720p
    [InlineData(TargetQuality.P720, 1280, 720, "720p")]      // 720p source, P720 → 720p
    [InlineData(TargetQuality.P720, 854, 480, "360p")]       // 480p source, P720 → closest lower = 360p (the production case)
    [InlineData(TargetQuality.P1080, 854, 480, "360p")]      // 480p source, P1080 → 360p
    [InlineData(TargetQuality.P360, 640, 360, "360p")]       // 360p source → 360p
    [InlineData(TargetQuality.P1080, 640, 360, "360p")]      // sub-360p source → 360p floor
    public void Concrete_Target_Generates_Exactly_One_Never_Upscaled_Rung(
        TargetQuality quality, int sourceWidth, int sourceHeight, string expectedRung)
    {
        var plan = Build(sourceWidth, sourceHeight, quality);

        plan.RungNames.Should().ContainSingle().Which.Should().Be(expectedRung);
    }

    [Fact]
    public void Auto_Keeps_The_Source_Driven_Ladder()
    {
        // 1080p source under Auto → all three rungs (the Push 10.3 behaviour).
        Build(1920, 1080, TargetQuality.Auto).RungNames.Should().Equal("360p", "720p", "1080p");
        // 480p source under Auto → 360p only (Hotfix 10.6-2's never-upscale rule).
        Build(854, 480, TargetQuality.Auto).RungNames.Should().Equal("360p");
    }

    [Fact]
    public void Ladder_Encode_Knobs_Stay_Memory_Friendly()
    {
        var plan = Build(1920, 1080, TargetQuality.P720);

        // Hotfix 10.6-2 (1.C): ultrafast preset + capped threads — the Render free
        // tier depends on these; a regression to veryfast/no cap would OOM again.
        var args = plan.Args;
        FlagAfter(args, "-preset").Should().Be("ultrafast");
        FlagAfter(args, "-threads").Should().Be("2");
    }

    private static string? FlagAfter(IReadOnlyList<string> args, string flag)
    {
        for (var i = 0; i + 1 < args.Count; i++)
            if (args[i] == flag) return args[i + 1];
        return null;
    }

    [Fact]
    public void Single_Rung_Ladder_Still_Produces_A_Master_Playlist()
    {
        var plan = Build(854, 480, TargetQuality.P720);

        // One rung still emits master.m3u8 + that rung's index — var_stream_map
        // with a single entry is a valid one-variant HLS tree.
        plan.Args.Should().Contain("-master_pl_name");
        plan.Args.Should().Contain("master.m3u8");
    }
}
