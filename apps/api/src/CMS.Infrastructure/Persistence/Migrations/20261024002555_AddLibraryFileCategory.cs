using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    /// <summary>
    /// A2-2: Adds the nullable institutional category column to library_files
    ///       (Curriculum | Lecture | Summary | GoldenIdeas). Existing rows keep NULL.
    /// A2-3: Seeds the per-type upload limit settings (upload.limit.*_mb, category "upload").
    ///
    /// NOTE ON HAND-TRIMMING: EF scaffolding also emitted operations for a pre-existing
    /// snapshot drift (notifications sender_id family, error_reports moderation columns,
    /// system_settings updated_by index) caused by the hand-written Phase55/56/57
    /// migrations that never regenerated the model snapshot. Those operations were REMOVED
    /// from this migration because the database already contains those changes (applying
    /// them again would fail with "already exists"). Only the genuinely missing additive
    /// indexes (ix_notifications_sent_by, ix_system_settings_updated_by — never created by
    /// any migration) are kept, so the database fully matches the regenerated snapshot.
    /// </summary>
    public partial class AddLibraryFileCategory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // A2-2 — institutional content category (nullable: legacy rows stay valid).
            migrationBuilder.AddColumn<int>(
                name: "category",
                table: "library_files",
                type: "integer",
                nullable: true);

            // Completes the Phase57 hand-fix: sent_by carried a FK but no index
            // (PostgreSQL does not auto-index foreign keys).
            migrationBuilder.CreateIndex(
                name: "ix_notifications_sent_by",
                table: "notifications",
                column: "sent_by");

            // Completes the Phase54 system_settings table: its updated_by FK never got an index.
            migrationBuilder.CreateIndex(
                name: "ix_system_settings_updated_by",
                table: "system_settings",
                column: "updated_by");

            // A2-3 — per-type upload ceilings (editable at runtime from the admin settings UI).
            // Idempotent: safe to re-run; never clobbers an admin-tuned value.
            migrationBuilder.Sql(@"
                INSERT INTO system_settings (id, key, value, description, category, created_at, updated_at)
                VALUES
                    ('01100000-0000-0000-0000-000000000101', 'upload.limit.pdf_mb', '200', 'الحد الأقصى لملفات PDF/Word بالميجابايت', 'upload', NOW(), NOW()),
                    ('01100000-0000-0000-0000-000000000102', 'upload.limit.html_mb', '10', 'الحد الأقصى لملفات HTML بالميجابايت', 'upload', NOW(), NOW()),
                    ('01100000-0000-0000-0000-000000000103', 'upload.limit.image_mb', '20', 'الحد الأقصى للصور بالميجابايت', 'upload', NOW(), NOW()),
                    ('01100000-0000-0000-0000-000000000104', 'upload.limit.audio_mb', '100', 'الحد الأقصى للملفات الصوتية بالميجابايت (مفاتيح مستقبلية — الصوت خارج قائمة المكتبة المسموحة حالياً)', 'upload', NOW(), NOW()),
                    ('01100000-0000-0000-0000-000000000105', 'upload.limit.avatar_mb', '3', 'الحد الأقصى للصورة الشخصية بالميجابايت (مفروض أيضاً لكل endpoint)', 'upload', NOW(), NOW())
                ON CONFLICT (key) DO NOTHING;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "category",
                table: "library_files");

            migrationBuilder.DropIndex(
                name: "ix_notifications_sent_by",
                table: "notifications");

            migrationBuilder.DropIndex(
                name: "ix_system_settings_updated_by",
                table: "system_settings");

            migrationBuilder.Sql(@"
                DELETE FROM system_settings
                WHERE key IN (
                    'upload.limit.pdf_mb',
                    'upload.limit.html_mb',
                    'upload.limit.image_mb',
                    'upload.limit.audio_mb',
                    'upload.limit.avatar_mb');
            ");
        }
    }
}
