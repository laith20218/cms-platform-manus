using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Wave 14.1 — data-model foundations for the exams rework (R75 DIAG; D1/D3/D7/D12/D13).
    ///
    /// Hand-authored (the [DbContext]/[Migration] attributes live on the migration class
    /// itself, no Designer.cs — Phase61/62 precedent). The model snapshot was updated in
    /// the same commit so the next tool-generated migration diffs cleanly; UNLIKE
    /// Phase61/62, this migration was verified in-sandbox with the .NET 9 SDK:
    /// dotnet build + dotnet test + `dotnet ef migrations has-pending-model-changes`.
    ///
    /// Creates ONLY new tables/columns — no existing column is altered or dropped:
    ///   + exam_courses            (D1) — FK subjects RESTRICT
    ///   + exam_course_items       (D1/D6) — unique (exam_course_id, exam_id); FKs cascade
    ///   + practice_sessions       (D13) — FK students CASCADE, exams RESTRICT
    ///   + practice_answers        (D13) — FK practice_sessions CASCADE, questions RESTRICT
    ///   + questions.question_usage     int NOT NULL DEFAULT 2 (Both — D3 backfill)
    ///   + exams.model_letter           character(1) NULL (D7)
    ///   + error_reports.report_type    int NOT NULL DEFAULT 3 (Other — D12 backfill)
    ///   + ix_error_reports_question_id_status (D10) — the composite supersedes the
    ///     conventional single-column FK index (leading-column rule, hence the DROP).
    ///
    /// PRODUCTION NOTE: do NOT apply to prod as part of this branch — deploy gate is a
    /// separate supervisor-authorized step (Phase60/61/62 rollout mirror). An idempotent
    /// SQL mirror for Neon lives at scripts/migrations/Wave14ExamsRework.sql.
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20261116120000_AddWave14ExamsRework")]
    public partial class AddWave14ExamsRework : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── D1: exam-course bundles ─────────────────────────────────────────────
            migrationBuilder.CreateTable(
                name: "exam_courses",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    subject_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name_ar = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    name_en = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    description = table.Column<string>(type: "text", nullable: true),
                    cover_url = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    year = table.Column<int>(type: "integer", nullable: false),
                    semester = table.Column<int>(type: "integer", nullable: false),
                    course_type = table.Column<int>(type: "integer", nullable: false),
                    free_or_paid = table.Column<bool>(type: "boolean", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_exam_courses", x => x.id);
                    table.ForeignKey(
                        name: "fk_exam_courses_subjects_subject_id",
                        column: x => x.subject_id,
                        principalTable: "subjects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_exam_courses_subject_id_year_semester",
                table: "exam_courses",
                columns: new[] { "subject_id", "year", "semester" });

            // ── D1/D6: bundle ↔ exam join (unique pair) ────────────────────────────
            migrationBuilder.CreateTable(
                name: "exam_course_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    exam_course_id = table.Column<Guid>(type: "uuid", nullable: false),
                    exam_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_exam_course_items", x => x.id);
                    table.ForeignKey(
                        name: "fk_exam_course_items_exam_courses_exam_course_id",
                        column: x => x.exam_course_id,
                        principalTable: "exam_courses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_exam_course_items_exams_exam_id",
                        column: x => x.exam_id,
                        principalTable: "exams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_exam_course_items_exam_course_id_exam_id",
                table: "exam_course_items",
                columns: new[] { "exam_course_id", "exam_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_exam_course_items_exam_id",
                table: "exam_course_items",
                column: "exam_id");

            // ── D13: DB-backed practice tracking ───────────────────────────────────
            migrationBuilder.CreateTable(
                name: "practice_sessions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    student_id = table.Column<Guid>(type: "uuid", nullable: false),
                    exam_model_id = table.Column<Guid>(type: "uuid", nullable: false),
                    started_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    last_accessed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    score = table.Column<decimal>(type: "numeric", nullable: true),
                    status = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_practice_sessions", x => x.id);
                    table.ForeignKey(
                        name: "fk_practice_sessions_students_student_id",
                        column: x => x.student_id,
                        principalTable: "students",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_practice_sessions_exams_exam_model_id",
                        column: x => x.exam_model_id,
                        principalTable: "exams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_practice_sessions_student_id_status",
                table: "practice_sessions",
                columns: new[] { "student_id", "status" });

            migrationBuilder.CreateIndex(
                name: "ix_practice_sessions_exam_model_id",
                table: "practice_sessions",
                column: "exam_model_id");

            migrationBuilder.CreateTable(
                name: "practice_answers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    practice_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    question_id = table.Column<Guid>(type: "uuid", nullable: false),
                    selected_answer = table.Column<string>(type: "text", nullable: true),
                    is_correct = table.Column<bool>(type: "boolean", nullable: true),
                    answered_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_practice_answers", x => x.id);
                    table.ForeignKey(
                        name: "fk_practice_answers_practice_sessions_practice_session_id",
                        column: x => x.practice_session_id,
                        principalTable: "practice_sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_practice_answers_questions_question_id",
                        column: x => x.question_id,
                        principalTable: "questions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_practice_answers_practice_session_id_question_id",
                table: "practice_answers",
                columns: new[] { "practice_session_id", "question_id" });

            migrationBuilder.CreateIndex(
                name: "ix_practice_answers_question_id",
                table: "practice_answers",
                column: "question_id");

            // ── D3: question usage (default Both = 2 → legacy rows keep working everywhere)
            migrationBuilder.AddColumn<int>(
                name: "question_usage",
                table: "questions",
                type: "integer",
                nullable: false,
                defaultValue: 2);

            // ── D7: model-paper letter (A/B/C), NULL for normal exams ──────────────
            migrationBuilder.AddColumn<char>(
                name: "model_letter",
                table: "exams",
                type: "character(1)",
                nullable: true);

            // ── D12: report classification (default Other = 3 → legacy meaning preserved)
            migrationBuilder.AddColumn<int>(
                name: "report_type",
                table: "error_reports",
                type: "integer",
                nullable: false,
                defaultValue: 3);

            // D10: per-question report table. The composite replaces the conventional
            // single-column FK index (same leading column → only one survives in the model).
            migrationBuilder.DropIndex(
                name: "ix_error_reports_question_id",
                table: "error_reports");

            migrationBuilder.CreateIndex(
                name: "ix_error_reports_question_id_status",
                table: "error_reports",
                columns: new[] { "question_id", "status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_error_reports_question_id_status",
                table: "error_reports");

            migrationBuilder.CreateIndex(
                name: "ix_error_reports_question_id",
                table: "error_reports",
                column: "question_id");

            migrationBuilder.DropColumn(
                name: "report_type",
                table: "error_reports");

            migrationBuilder.DropColumn(
                name: "model_letter",
                table: "exams");

            migrationBuilder.DropColumn(
                name: "question_usage",
                table: "questions");

            migrationBuilder.DropTable(
                name: "practice_answers");

            migrationBuilder.DropTable(
                name: "practice_sessions");

            migrationBuilder.DropTable(
                name: "exam_course_items");

            migrationBuilder.DropTable(
                name: "exam_courses");
        }
    }
}
