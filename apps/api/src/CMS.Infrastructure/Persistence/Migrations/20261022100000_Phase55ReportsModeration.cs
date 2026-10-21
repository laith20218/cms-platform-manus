using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    /// <summary>
    /// P1-09: Adds moderation lifecycle fields to error_reports + Closed status.
    /// New columns: assigned_to, reviewed_by, reviewed_at (all nullable).
    /// The ErrorReportStatus enum gets a new value (Closed=4) — no schema change needed
    /// since the column is already int.
    /// </summary>
    public partial class Phase55ReportsModeration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "assigned_to",
                table: "error_reports",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "reviewed_by",
                table: "error_reports",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "reviewed_at",
                table: "error_reports",
                type: "timestamp with time zone",
                nullable: true);

            // Index for filtering by status + assigned_to (common admin query)
            migrationBuilder.CreateIndex(
                name: "ix_error_reports_status_assigned_to",
                table: "error_reports",
                columns: new[] { "status", "assigned_to" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_error_reports_status_assigned_to",
                table: "error_reports");

            migrationBuilder.DropColumn(
                name: "assigned_to",
                table: "error_reports");

            migrationBuilder.DropColumn(
                name: "reviewed_by",
                table: "error_reports");

            migrationBuilder.DropColumn(
                name: "reviewed_at",
                table: "error_reports");
        }
    }
}
