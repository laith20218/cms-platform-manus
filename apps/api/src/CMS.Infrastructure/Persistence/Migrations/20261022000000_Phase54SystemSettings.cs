using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    /// <summary>
    /// P1-08: Adds system_settings table for admin-editable platform configuration.
    /// Separated from secrets (env vars). Used for: platform_name, watermark_text,
    /// max_upload_size_mb, content_review_policy, etc.
    /// </summary>
    public partial class Phase54SystemSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "system_settings",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    value = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    updated_by = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_system_settings", x => x.id);
                    table.ForeignKey(
                        name: "fk_system_settings_admins_updated_by",
                        column: x => x.updated_by,
                        principalTable: "admins",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "ix_system_settings_key",
                table: "system_settings",
                column: "key",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_system_settings_category",
                table: "system_settings",
                column: "category");

            // Seed default platform settings (matches seed-production.sql keys + adds a few more)
            // Using INSERT ... ON CONFLICT DO NOTHING so this migration is idempotent.
            migrationBuilder.Sql(@"
                INSERT INTO system_settings (id, key, value, description, category, created_at, updated_at)
                VALUES
                    ('01100000-0000-0000-0000-000000000001', 'platform_name', 'CMS - College Medical System', 'اسم المنصة', 'platform', NOW(), NOW()),
                    ('01100000-0000-0000-0000-000000000002', 'max_upload_size_mb', '10', 'الحد الأقصى لحجم الملف بالميجابايت', 'upload', NOW(), NOW()),
                    ('01100000-0000-0000-0000-000000000003', 'allowed_upload_types', 'pdf,html,image,video,audio', 'الأنواع المسموح رفعها', 'upload', NOW(), NOW()),
                    ('01100000-0000-0000-0000-000000000004', 'watermark_text', '{student_name} - {student_phone}', 'نص العلامة المائية للملفات', 'content', NOW(), NOW()),
                    ('01100000-0000-0000-0000-000000000005', 'content_review_policy', 'manual', 'سياسة مراجعة المحتوى: manual|auto|disabled', 'content', NOW(), NOW()),
                    ('01100000-0000-0000-0000-000000000006', 'default_exam_duration_minutes', '60', 'مدة الاختبار الافتراضية بالدقائق', 'exams', NOW(), NOW()),
                    ('01100000-0000-0000-0000-000000000007', 'default_passing_score', '60', 'درجة النجاح الافتراضية %', 'exams', NOW(), NOW()),
                    ('01100000-0000-0000-0000-000000000008', 'session_timeout_minutes', '15', 'مدة انتهاء access token بالدقائق', 'security', NOW(), NOW()),
                    ('01100000-0000-0000-0000-000000000009', 'refresh_token_expiry_days', '7', 'مدة انتهاء refresh token بالأيام', 'security', NOW(), NOW()),
                    ('01100000-0000-0000-0000-000000000010', 'auth_rate_limit_per_minute', '5', 'حد محاولات الدخول في الدقيقة', 'security', NOW(), NOW()),
                    ('01100000-0000-0000-0000-000000000011', 'otp_enabled', 'false', 'تفعيل OTP عبر واتساب', 'security', NOW(), NOW())
                ON CONFLICT (key) DO NOTHING;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "system_settings");
        }
    }
}
