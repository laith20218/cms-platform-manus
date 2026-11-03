using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// W14.5 (Phase B) — drops the legacy Question.ExamId column.
    ///
    /// Hand-authored (the [DbContext]/[Migration] attributes live on the migration class
    /// itself, no Designer.cs — Phase61/62/Wave14 precedent). The model snapshot was
    /// updated in the same commit so `dotnet ef migrations has-pending-model-changes`
    /// reports "No changes"; verified in-sandbox with the .NET 9 SDK.
    ///
    /// Exam composition has been authoritative through the ExamQuestion join since
    /// W14.2 (R75 P1 — the Question.ExamId read paths were retired then; Phase53 had
    /// already backfilled exam_questions from the legacy column). The column has been
    /// dormant since; this migration drops it together with its conventional
    /// index (ix_questions_exam_id) and FK (fk_questions_exams_exam_id).
    ///
    /// PRODUCTION NOTE: do NOT apply to prod as part of this branch — the deploy gate is a
    /// separate supervisor-authorized step (Phase60/61/62/Wave14 rollout mirror). An
    /// idempotent SQL mirror for Neon lives at scripts/migrations/W14_5DropQuestionExamId.sql.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20261117120000_DropQuestionExamId")]
    public partial class DropQuestionExamId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Postgres drops the referencing FK and its index together with the column;
            // the explicit DropForeignKey/DropIndex calls keep the operation portable
            // and make the intent auditable.
            migrationBuilder.DropForeignKey(
                name: "fk_questions_exams_exam_id",
                table: "questions");

            migrationBuilder.DropIndex(
                name: "ix_questions_exam_id",
                table: "questions");

            migrationBuilder.DropColumn(
                name: "exam_id",
                table: "questions");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Restores the exact Phase34 shape: uuid NULL, conventional index, FK to
            // exams.id with NO ACTION (no onDelete was specified when it was created).
            migrationBuilder.AddColumn<Guid>(
                name: "exam_id",
                table: "questions",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_questions_exam_id",
                table: "questions",
                column: "exam_id");

            migrationBuilder.AddForeignKey(
                name: "fk_questions_exams_exam_id",
                table: "questions",
                column: "exam_id",
                principalTable: "exams",
                principalColumn: "id");
        }
    }
}
