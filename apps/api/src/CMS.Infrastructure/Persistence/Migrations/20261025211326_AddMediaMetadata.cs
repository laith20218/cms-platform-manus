using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddMediaMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "difficulty",
                table: "library_files",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "hls_key",
                table: "library_files",
                type: "character varying(600)",
                maxLength: 600,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "processing_status",
                table: "library_files",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "description",
                table: "course_episodes",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "difficulty",
                table: "course_episodes",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "hls_key",
                table: "course_episodes",
                type: "character varying(600)",
                maxLength: 600,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "processing_status",
                table: "course_episodes",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_library_files_processing_status",
                table: "library_files",
                column: "processing_status",
                filter: "processing_status IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_course_episodes_processing_status",
                table: "course_episodes",
                column: "processing_status",
                filter: "processing_status IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_library_files_processing_status",
                table: "library_files");

            migrationBuilder.DropIndex(
                name: "ix_course_episodes_processing_status",
                table: "course_episodes");

            migrationBuilder.DropColumn(
                name: "difficulty",
                table: "library_files");

            migrationBuilder.DropColumn(
                name: "hls_key",
                table: "library_files");

            migrationBuilder.DropColumn(
                name: "processing_status",
                table: "library_files");

            migrationBuilder.DropColumn(
                name: "description",
                table: "course_episodes");

            migrationBuilder.DropColumn(
                name: "difficulty",
                table: "course_episodes");

            migrationBuilder.DropColumn(
                name: "hls_key",
                table: "course_episodes");

            migrationBuilder.DropColumn(
                name: "processing_status",
                table: "course_episodes");
        }
    }
}
