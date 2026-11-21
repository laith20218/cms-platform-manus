using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations;

/// <summary>
/// Wave 20.5 (owner decision 3, C3 additive) — the Matching (وصل) question type:
///   • questions.matching_json (nullable text): the serialized payload — prompts +
///     targets with stable ids + the correct pairs map. NULL on every non-Matching
///     row and on unpublished Matching rows (old questions untouched).
///   • exam_session_questions.matching_json (nullable text): the payload snapshotted
///     verbatim at session start, so timed-exam grading never depends on the live
///     bank row (the same snapshot contract as OptionsJson).
/// </summary>
public partial class AddMatchingQuestions : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "matching_json",
            table: "questions",
            type: "text",
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "matching_json",
            table: "exam_session_questions",
            type: "text",
            nullable: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "matching_json",
            table: "questions");

        migrationBuilder.DropColumn(
            name: "matching_json",
            table: "exam_session_questions");
    }
}
