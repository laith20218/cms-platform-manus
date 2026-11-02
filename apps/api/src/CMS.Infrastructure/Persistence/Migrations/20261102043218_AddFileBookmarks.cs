using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddFileBookmarks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "file_bookmarks",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_id = table.Column<Guid>(type: "uuid", nullable: false),
                    student_id = table.Column<Guid>(type: "uuid", nullable: false),
                    page_number = table.Column<int>(type: "integer", nullable: false),
                    snippet = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_file_bookmarks", x => x.id);
                    table.CheckConstraint("ck_file_bookmarks_page", "(page_number >= 1)");
                    table.ForeignKey(
                        name: "fk_file_bookmarks_library_files_file_id",
                        column: x => x.file_id,
                        principalTable: "library_files",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_file_bookmarks_students_student_id",
                        column: x => x.student_id,
                        principalTable: "students",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_file_bookmarks_file_id",
                table: "file_bookmarks",
                column: "file_id");

            migrationBuilder.CreateIndex(
                name: "ix_file_bookmarks_student_id_created_at",
                table: "file_bookmarks",
                columns: new[] { "student_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "ix_file_bookmarks_student_id_file_id_page_number",
                table: "file_bookmarks",
                columns: new[] { "student_id", "file_id", "page_number" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "file_bookmarks");
        }
    }
}
