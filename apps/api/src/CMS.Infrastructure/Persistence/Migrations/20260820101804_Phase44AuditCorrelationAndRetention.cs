using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase44AuditCorrelationAndRetention : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "correlation_id",
                table: "security_logs",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "ix_security_logs_correlation_id_created_at",
                table: "security_logs",
                columns: new[] { "correlation_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_security_logs_created_at",
                table: "security_logs",
                column: "created_at");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_security_logs_correlation_id_created_at",
                table: "security_logs");

            migrationBuilder.DropIndex(
                name: "ix_security_logs_created_at",
                table: "security_logs");

            migrationBuilder.DropColumn(
                name: "correlation_id",
                table: "security_logs");
        }
    }
}
