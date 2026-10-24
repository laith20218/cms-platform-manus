using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Push2AdminActivityMonitor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "closed_at",
                table: "user_sessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "device_details",
                table: "user_sessions",
                type: "jsonb",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ip_address",
                table: "user_sessions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "user_agent",
                table: "user_sessions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "paragraph_tag",
                table: "questions",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "admin_activity_logs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    admin_id = table.Column<Guid>(type: "uuid", nullable: false),
                    session_id = table.Column<Guid>(type: "uuid", nullable: true),
                    action_type = table.Column<int>(type: "integer", nullable: false),
                    resource_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    metadata = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_admin_activity_logs", x => x.id);
                    table.ForeignKey(
                        name: "fk_admin_activity_logs_admins_admin_id",
                        column: x => x.admin_id,
                        principalTable: "admins",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_user_sessions_sweeper",
                table: "user_sessions",
                columns: new[] { "status", "last_activity_at" },
                filter: "closed_at IS NULL AND status = 1");

            migrationBuilder.CreateIndex(
                name: "ix_admin_activity_logs_action_type",
                table: "admin_activity_logs",
                column: "action_type");

            migrationBuilder.CreateIndex(
                name: "ix_admin_activity_logs_admin_created",
                table: "admin_activity_logs",
                columns: new[] { "admin_id", "created_at" },
                descending: new[] { false, true });

            migrationBuilder.CreateIndex(
                name: "ix_admin_activity_logs_session_id",
                table: "admin_activity_logs",
                column: "session_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "admin_activity_logs");

            migrationBuilder.DropIndex(
                name: "ix_user_sessions_sweeper",
                table: "user_sessions");

            migrationBuilder.DropColumn(
                name: "closed_at",
                table: "user_sessions");

            migrationBuilder.DropColumn(
                name: "device_details",
                table: "user_sessions");

            migrationBuilder.DropColumn(
                name: "ip_address",
                table: "user_sessions");

            migrationBuilder.DropColumn(
                name: "user_agent",
                table: "user_sessions");

            migrationBuilder.DropColumn(
                name: "paragraph_tag",
                table: "questions");
        }
    }
}
