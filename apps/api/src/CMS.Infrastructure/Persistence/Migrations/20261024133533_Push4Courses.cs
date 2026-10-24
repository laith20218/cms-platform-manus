using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    /// <summary>
    /// Push 4 / Track 4: creates the courses and course_episodes tables.
    ///   • courses: subject-scoped course with ContentStatus lifecycle (د2: Draft/Published/Archived,
    ///     publishing at course level only — د3).
    ///   • course_episodes: ordered episodes, either S3 multipart uploads (up to 2.5 GB,
    ///     64 MB parts — د4) or YouTube embeds. The CHECK constraint enforces that a
    ///     YouTube episode may carry no file_key, while an Upload episode MUST have one.
    ///     upload_id is the active S3 multipart id between initiate and complete — NULL
    ///     means the blob is ready for playback.
    /// Also seeds upload.limit.video_mb (runtime-editable ceiling, default 2560 MB).
    /// Additive only: no existing table is touched.
    /// </summary>
    public partial class Push4Courses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "courses",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    subject_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    description = table.Column<string>(type: "text", nullable: true),
                    cover_image_url = table.Column<string>(type: "text", nullable: true),
                    status = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_courses", x => x.id);
                    table.ForeignKey(
                        name: "fk_courses_subjects_subject_id",
                        column: x => x.subject_id,
                        principalTable: "subjects",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "course_episodes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    course_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    episode_number = table.Column<int>(type: "integer", nullable: false),
                    duration_seconds = table.Column<int>(type: "integer", nullable: true),
                    file_key = table.Column<string>(type: "text", nullable: true),
                    file_size = table.Column<long>(type: "bigint", nullable: true),
                    content_type = table.Column<string>(type: "text", nullable: true),
                    source_type = table.Column<int>(type: "integer", nullable: false),
                    youtube_video_id = table.Column<string>(type: "text", nullable: true),
                    upload_id = table.Column<string>(type: "text", nullable: true),
                    views_count = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<Guid>(type: "uuid", nullable: false),
                    deleted_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    deleted_by = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_course_episodes", x => x.id);
                    table.CheckConstraint("ck_course_episodes_source", "(source_type = 1) OR (file_key IS NOT NULL)");
                    table.ForeignKey(
                        name: "fk_course_episodes_courses_course_id",
                        column: x => x.course_id,
                        principalTable: "courses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_course_episodes_course_id",
                table: "course_episodes",
                column: "course_id");

            migrationBuilder.CreateIndex(
                name: "ix_course_episodes_course_id_episode_number",
                table: "course_episodes",
                columns: new[] { "course_id", "episode_number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_courses_subject_id",
                table: "courses",
                column: "subject_id");

            // Push 4 — video upload ceiling (editable at runtime from the admin settings UI).
            // Idempotent: safe to re-run; never clobbers an admin-tuned value.
            migrationBuilder.Sql(@"
                INSERT INTO system_settings (id, key, value, description, category, created_at, updated_at)
                VALUES
                    ('01100000-0000-0000-0000-000000000106', 'upload.limit.video_mb', '2560', 'الحد الأقصى لفيديوهات الكورسات بالميجابايت (رفع متعدد الأجزاء)', 'upload', NOW(), NOW())
                ON CONFLICT (key) DO NOTHING;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "course_episodes");

            migrationBuilder.DropTable(
                name: "courses");

            migrationBuilder.Sql(@"
                DELETE FROM system_settings
                WHERE key = 'upload.limit.video_mb';
            ");
        }
    }
}
