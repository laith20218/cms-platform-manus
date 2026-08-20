using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase36OfflinePackageLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "offline_package_records",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    student_id = table.Column<Guid>(type: "uuid", nullable: false),
                    installation_id = table.Column<string>(type: "text", nullable: false),
                    content_version = table.Column<int>(type: "integer", nullable: false),
                    idempotency_hash = table.Column<string>(type: "text", nullable: false),
                    manifest_json = table.Column<string>(type: "jsonb", nullable: false),
                    ciphertext_base64_url = table.Column<string>(type: "text", nullable: false),
                    tag_base64_url = table.Column<string>(type: "text", nullable: false),
                    wrapped_key_base64_url = table.Column<string>(type: "text", nullable: false),
                    issued_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    revoked_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    status = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_offline_package_records", x => x.id);
                    table.ForeignKey(
                        name: "fk_offline_package_records_students_student_id",
                        column: x => x.student_id,
                        principalTable: "students",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_offline_package_records_expires_at",
                table: "offline_package_records",
                column: "expires_at");

            migrationBuilder.CreateIndex(
                name: "ix_offline_package_records_student_id_idempotency_hash",
                table: "offline_package_records",
                columns: new[] { "student_id", "idempotency_hash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_offline_package_records_student_id_installation_id_status",
                table: "offline_package_records",
                columns: new[] { "student_id", "installation_id", "status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "offline_package_records");
        }
    }
}
