using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Wave 13 (F3) — HTML player pipeline columns on library_files.
    ///
    /// Hand-authored (the sandbox has no dotnet SDK / dotnet-ef to run
    /// `dotnet ef migrations add`); the [DbContext]/[Migration] attributes live on the
    /// migration class itself, which EF Core resolves exactly like a generated
    /// .Designer.cs pair. The model snapshot was updated in the same commit so the
    /// next tool-generated migration diffs cleanly (Phase61 precedent).
    ///
    /// PRODUCTION NOTE: do NOT apply to prod as part of this branch — deploy gate is a
    /// separate supervisor-authorized step (mirror of the Phase60/Phase61 rollouts).
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20261115120000_Phase62AddHtmlPlayerFields")]
    public partial class Phase62AddHtmlPlayerFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Wave 13 (F3/Q1) — trusted interactive-lesson flag for text/html rows.
            // NOT NULL DEFAULT false: every legacy row reads as a strict, script-free
            // document — the safe default (the sanitizer + CSP pipeline never runs for
            // these rows unless the file is re-uploaded).
            migrationBuilder.AddColumn<bool>(
                name: "enable_scripts",
                table: "library_files",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            // Nullable pipeline state (CMS.Domain.Enums.ContentProcessingStatus):
            // NULL = pipeline never applied (non-HTML assets + all legacy rows) —
            // identical convention to pdf_processing_status (Phase61).
            migrationBuilder.AddColumn<int>(
                name: "content_processing_status",
                table: "library_files",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "content_processing_status",
                table: "library_files");

            migrationBuilder.DropColumn(
                name: "enable_scripts",
                table: "library_files");
        }
    }
}
