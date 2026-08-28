using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase53ExamManagementLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_exam_sessions_exam_id",
                table: "exam_sessions");

            migrationBuilder.DropIndex(
                name: "ix_exam_sessions_student_id",
                table: "exam_sessions");

            migrationBuilder.DropIndex(
                name: "ix_attempt_logs_exam_session_id",
                table: "attempt_logs");

            migrationBuilder.Sql("ALTER TABLE exams ADD COLUMN IF NOT EXISTS available_from timestamp with time zone;");
            migrationBuilder.Sql("ALTER TABLE exams ADD COLUMN IF NOT EXISTS available_until timestamp with time zone;");

            migrationBuilder.AddColumn<Guid>(
                name: "lecture_id",
                table: "exams",
                type: "uuid",
                nullable: true);

            migrationBuilder.Sql("ALTER TABLE exams ADD COLUMN IF NOT EXISTS max_attempts integer;");

            migrationBuilder.AddColumn<bool>(
                name: "show_correct_answers",
                table: "exams",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "show_explanations",
                table: "exams",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<int>(
                name: "sort_order",
                table: "exams",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "allow_review_snapshot",
                table: "exam_sessions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "cancelled_at",
                table: "exam_sessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "current_question_order",
                table: "exam_sessions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "duration_minutes_snapshot",
                table: "exam_sessions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.Sql("ALTER TABLE exam_sessions ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone NOT NULL DEFAULT TIMESTAMPTZ '-infinity';");

            migrationBuilder.AddColumn<decimal>(
                name: "passing_score_snapshot",
                table: "exam_sessions",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<bool>(
                name: "show_correct_answers_snapshot",
                table: "exam_sessions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "show_explanations_snapshot",
                table: "exam_sessions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "show_results_immediately_snapshot",
                table: "exam_sessions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "start_idempotency_key",
                table: "exam_sessions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "submitted_at",
                table: "exam_sessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "timed_out_at",
                table: "exam_sessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "exam_session_question_id",
                table: "attempt_logs",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "exam_questions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    exam_id = table.Column<Guid>(type: "uuid", nullable: false),
                    question_id = table.Column<Guid>(type: "uuid", nullable: false),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_exam_questions", x => x.id);
                    table.ForeignKey(
                        name: "fk_exam_questions_exams_exam_id",
                        column: x => x.exam_id,
                        principalTable: "exams",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_exam_questions_questions_question_id",
                        column: x => x.question_id,
                        principalTable: "questions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "exam_session_questions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    exam_session_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_question_id = table.Column<Guid>(type: "uuid", nullable: true),
                    sort_order = table.Column<int>(type: "integer", nullable: false),
                    question_type = table.Column<int>(type: "integer", nullable: false),
                    question_text = table.Column<string>(type: "text", nullable: false),
                    question_text_html = table.Column<string>(type: "text", nullable: true),
                    options_json = table.Column<string>(type: "jsonb", nullable: false),
                    correct_answer = table.Column<string>(type: "text", nullable: false),
                    explanation = table.Column<string>(type: "text", nullable: false),
                    explanation_html = table.Column<string>(type: "text", nullable: true),
                    reference = table.Column<string>(type: "text", nullable: true),
                    tags_json = table.Column<string>(type: "jsonb", nullable: false),
                    images_json = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_exam_session_questions", x => x.id);
                    table.ForeignKey(
                        name: "fk_exam_session_questions_exam_sessions_exam_session_id",
                        column: x => x.exam_session_id,
                        principalTable: "exam_sessions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            // Preserve existing content and historical sessions before new uniqueness constraints are enforced.
            migrationBuilder.Sql("""
                UPDATE exam_sessions AS session
                SET expires_at = session.started_at + make_interval(mins => GREATEST(exam.duration_minutes, 1)),
                    duration_minutes_snapshot = GREATEST(exam.duration_minutes, 1),
                    passing_score_snapshot = exam.passing_score,
                    show_results_immediately_snapshot = exam.show_results_immediately,
                    allow_review_snapshot = exam.allow_review,
                    show_correct_answers_snapshot = exam.allow_review,
                    show_explanations_snapshot = exam.allow_review
                FROM exams AS exam
                WHERE exam.id = session.exam_id;
                """);

            migrationBuilder.Sql("""
                INSERT INTO exam_questions (id, exam_id, question_id, sort_order, created_at, updated_at)
                SELECT md5(question.exam_id::text || ':' || question.id::text)::uuid,
                       question.exam_id,
                       question.id,
                       ROW_NUMBER() OVER (PARTITION BY question.exam_id ORDER BY question.created_at, question.id) - 1,
                       question.created_at,
                       question.updated_at
                FROM questions AS question
                WHERE question.exam_id IS NOT NULL
                ON CONFLICT DO NOTHING;
                """);

            migrationBuilder.Sql("""
                UPDATE exams AS exam
                SET total_questions = composition.total_questions
                FROM (
                    SELECT exam_id, COUNT(*)::integer AS total_questions
                    FROM exam_questions
                    GROUP BY exam_id
                ) AS composition
                WHERE exam.id = composition.exam_id;
                """);

            migrationBuilder.Sql("""
                INSERT INTO exam_session_questions (
                    id, exam_session_id, source_question_id, sort_order, question_type,
                    question_text, question_text_html, options_json, correct_answer,
                    explanation, explanation_html, reference, tags_json, images_json,
                    created_at, updated_at)
                SELECT md5(session.id::text || ':' || question.id::text)::uuid,
                       session.id,
                       question.id,
                       ROW_NUMBER() OVER (PARTITION BY session.id ORDER BY question.created_at, question.id) - 1,
                       question.type,
                       question.text,
                       question.text_html,
                       COALESCE((
                           SELECT jsonb_agg(jsonb_build_object(
                               'id', option.id,
                               'letter', option.option_letter,
                               'text', option.text,
                               'textHtml', option.text_html,
                               'imageUrl', option.image_url,
                               'sortOrder', option.sort_order
                           ) ORDER BY option.sort_order)
                           FROM question_options AS option
                           WHERE option.question_id = question.id
                       ), '[]'::jsonb),
                       question.correct_answer,
                       question.explanation,
                       question.explanation_html,
                       question.reference,
                       to_jsonb(question.tags),
                       COALESCE((
                           SELECT jsonb_agg(jsonb_build_object(
                               'id', image.id,
                               'imageUrl', image.image_url,
                               'altText', image.alt_text,
                               'caption', image.caption,
                               'sortOrder', image.sort_order
                           ) ORDER BY image.sort_order)
                           FROM question_images AS image
                           WHERE image.question_id = question.id
                       ), '[]'::jsonb),
                       session.started_at,
                       session.started_at
                FROM exam_sessions AS session
                INNER JOIN questions AS question ON question.exam_id = session.exam_id
                ON CONFLICT DO NOTHING;
                """);

            migrationBuilder.Sql("""
                UPDATE attempt_logs AS attempt
                SET exam_session_question_id = snapshot.id
                FROM exam_session_questions AS snapshot
                WHERE snapshot.exam_session_id = attempt.exam_session_id
                  AND snapshot.source_question_id = attempt.question_id;
                """);

            migrationBuilder.Sql("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM exam_sessions
                        WHERE status = 0
                        GROUP BY student_id, exam_id
                        HAVING COUNT(*) > 1
                    ) THEN
                        RAISE EXCEPTION 'Cannot apply exam lifecycle migration while duplicate in-progress sessions exist.';
                    END IF;
                END $$;
                """);

            migrationBuilder.AddCheckConstraint(
                name: "ck_exams_valid_availability_window",
                table: "exams",
                sql: "available_from IS NULL OR available_until IS NULL OR available_until > available_from");
            migrationBuilder.AddCheckConstraint(
                name: "ck_exams_positive_max_attempts",
                table: "exams",
                sql: "max_attempts IS NULL OR max_attempts > 0");
            migrationBuilder.AddCheckConstraint(
                name: "ck_exam_sessions_expiry_after_start",
                table: "exam_sessions",
                sql: "expires_at >= started_at");

            migrationBuilder.CreateIndex(
                name: "ix_exams_lecture_id",
                table: "exams",
                column: "lecture_id");

            migrationBuilder.CreateIndex(
                name: "ix_exam_sessions_exam_id_status_completed_at",
                table: "exam_sessions",
                columns: new[] { "exam_id", "status", "completed_at" });

            migrationBuilder.Sql("CREATE INDEX IF NOT EXISTS ix_exam_sessions_expires_at ON exam_sessions (expires_at);");

            migrationBuilder.CreateIndex(
                name: "ix_exam_sessions_student_id_exam_id",
                table: "exam_sessions",
                columns: new[] { "student_id", "exam_id" },
                unique: true,
                filter: "status = 0");

            migrationBuilder.CreateIndex(
                name: "ix_attempt_logs_exam_session_id_question_id",
                table: "attempt_logs",
                columns: new[] { "exam_session_id", "question_id" },
                unique: true,
                filter: "exam_session_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_attempt_logs_exam_session_question_id",
                table: "attempt_logs",
                column: "exam_session_question_id");

            migrationBuilder.CreateIndex(
                name: "ix_exam_questions_exam_id_question_id",
                table: "exam_questions",
                columns: new[] { "exam_id", "question_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_exam_questions_exam_id_sort_order",
                table: "exam_questions",
                columns: new[] { "exam_id", "sort_order" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_exam_questions_question_id",
                table: "exam_questions",
                column: "question_id");

            migrationBuilder.CreateIndex(
                name: "ix_exam_session_questions_exam_session_id_sort_order",
                table: "exam_session_questions",
                columns: new[] { "exam_session_id", "sort_order" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_exam_session_questions_exam_session_id_source_question_id",
                table: "exam_session_questions",
                columns: new[] { "exam_session_id", "source_question_id" },
                unique: true,
                filter: "source_question_id IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "fk_attempt_logs_exam_session_questions_exam_session_question_id",
                table: "attempt_logs",
                column: "exam_session_question_id",
                principalTable: "exam_session_questions",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "fk_exams_lectures_lecture_id",
                table: "exams",
                column: "lecture_id",
                principalTable: "lectures",
                principalColumn: "id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_attempt_logs_exam_session_questions_exam_session_question_id",
                table: "attempt_logs");

            migrationBuilder.DropForeignKey(
                name: "fk_exams_lectures_lecture_id",
                table: "exams");

            migrationBuilder.DropCheckConstraint(
                name: "ck_exams_valid_availability_window",
                table: "exams");
            migrationBuilder.DropCheckConstraint(
                name: "ck_exams_positive_max_attempts",
                table: "exams");
            migrationBuilder.DropCheckConstraint(
                name: "ck_exam_sessions_expiry_after_start",
                table: "exam_sessions");

            migrationBuilder.DropTable(
                name: "exam_questions");

            migrationBuilder.DropTable(
                name: "exam_session_questions");

            migrationBuilder.DropIndex(
                name: "ix_exams_lecture_id",
                table: "exams");

            migrationBuilder.DropIndex(
                name: "ix_exam_sessions_exam_id_status_completed_at",
                table: "exam_sessions");

            migrationBuilder.Sql("DROP INDEX IF EXISTS ix_exam_sessions_expires_at;");

            migrationBuilder.DropIndex(
                name: "ix_exam_sessions_student_id_exam_id",
                table: "exam_sessions");

            migrationBuilder.DropIndex(
                name: "ix_attempt_logs_exam_session_id_question_id",
                table: "attempt_logs");

            migrationBuilder.DropIndex(
                name: "ix_attempt_logs_exam_session_question_id",
                table: "attempt_logs");

            migrationBuilder.Sql("ALTER TABLE exams DROP COLUMN IF EXISTS available_from;");
            migrationBuilder.Sql("ALTER TABLE exams DROP COLUMN IF EXISTS available_until;");

            migrationBuilder.DropColumn(
                name: "lecture_id",
                table: "exams");

            migrationBuilder.Sql("ALTER TABLE exams DROP COLUMN IF EXISTS max_attempts;");

            migrationBuilder.DropColumn(
                name: "show_correct_answers",
                table: "exams");

            migrationBuilder.DropColumn(
                name: "show_explanations",
                table: "exams");

            migrationBuilder.DropColumn(
                name: "sort_order",
                table: "exams");

            migrationBuilder.DropColumn(
                name: "allow_review_snapshot",
                table: "exam_sessions");

            migrationBuilder.DropColumn(
                name: "cancelled_at",
                table: "exam_sessions");

            migrationBuilder.DropColumn(
                name: "current_question_order",
                table: "exam_sessions");

            migrationBuilder.DropColumn(
                name: "duration_minutes_snapshot",
                table: "exam_sessions");

            migrationBuilder.Sql("ALTER TABLE exam_sessions DROP COLUMN IF EXISTS expires_at;");

            migrationBuilder.DropColumn(
                name: "passing_score_snapshot",
                table: "exam_sessions");

            migrationBuilder.DropColumn(
                name: "show_correct_answers_snapshot",
                table: "exam_sessions");

            migrationBuilder.DropColumn(
                name: "show_explanations_snapshot",
                table: "exam_sessions");

            migrationBuilder.DropColumn(
                name: "show_results_immediately_snapshot",
                table: "exam_sessions");

            migrationBuilder.DropColumn(
                name: "start_idempotency_key",
                table: "exam_sessions");

            migrationBuilder.DropColumn(
                name: "submitted_at",
                table: "exam_sessions");

            migrationBuilder.DropColumn(
                name: "timed_out_at",
                table: "exam_sessions");

            migrationBuilder.DropColumn(
                name: "exam_session_question_id",
                table: "attempt_logs");

            migrationBuilder.CreateIndex(
                name: "ix_exam_sessions_exam_id",
                table: "exam_sessions",
                column: "exam_id");

            migrationBuilder.CreateIndex(
                name: "ix_exam_sessions_student_id",
                table: "exam_sessions",
                column: "student_id");

            migrationBuilder.CreateIndex(
                name: "ix_attempt_logs_exam_session_id",
                table: "attempt_logs",
                column: "exam_session_id");
        }
    }
}
