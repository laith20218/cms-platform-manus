using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// Wave 11.9 — Ghostscript PDF pre-processing pipeline columns on library_files.
    ///
    /// Hand-authored (the sandbox has no dotnet SDK / dotnet-ef to run
    /// `dotnet ef migrations add`); the [DbContext]/[Migration] attributes live on the
    /// migration class itself, which EF Core resolves exactly like a generated
    /// .Designer.cs pair. The model snapshot was updated in the same commit so the
    /// next tool-generated migration diffs cleanly.
    ///
    /// PRODUCTION NOTE: do NOT apply to prod as part of this branch — deploy gate is a
    /// separate Wave 11.9 step (mirror of the Phase60 rollout).
    /// </summary>
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20261109120000_Phase61AddPdfProcessingStatus")]
    public partial class Phase61AddPdfProcessingStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Nullable enum (CMS.Domain.Enums.PdfProcessingStatus): NULL = pipeline never
            // applied (non-PDF assets + all legacy rows) — identical convention to
            // processing_status (Push 10.3).
            migrationBuilder.AddColumn<int>(
                name: "pdf_processing_status",
                table: "library_files",
                type: "integer",
                nullable: true);

            // English technical failure details (GS stderr tail / storage errors);
            // only meaningful while pdf_processing_status = Failed (3).
            migrationBuilder.AddColumn<string>(
                name: "processing_error",
                table: "library_files",
                type: "text",
                nullable: true);

            // Push 10.3 precedent: partial index for the recovery sweep / admin pipeline
            // views — NULL rows (non-PDF + legacy) stay out of the index entirely.
            migrationBuilder.CreateIndex(
                name: "ix_library_files_pdf_processing_status",
                table: "library_files",
                column: "pdf_processing_status",
                filter: "pdf_processing_status IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_library_files_pdf_processing_status",
                table: "library_files");

            migrationBuilder.DropColumn(
                name: "processing_error",
                table: "library_files");

            migrationBuilder.DropColumn(
                name: "pdf_processing_status",
                table: "library_files");
        }
    }
}
