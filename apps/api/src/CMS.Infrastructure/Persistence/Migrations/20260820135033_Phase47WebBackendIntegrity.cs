using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase47WebBackendIntegrity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_favorites_student_id",
                table: "favorites");

            migrationBuilder.CreateIndex(
                name: "ix_favorites_student_id_library_file_id",
                table: "favorites",
                columns: new[] { "student_id", "library_file_id" },
                unique: true,
                filter: "library_file_id IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "ix_favorites_student_id_question_id",
                table: "favorites",
                columns: new[] { "student_id", "question_id" },
                unique: true,
                filter: "question_id IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "ck_favorites_exactly_one_target",
                table: "favorites",
                sql: "(question_id IS NOT NULL AND library_file_id IS NULL) OR (question_id IS NULL AND library_file_id IS NOT NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_favorites_student_id_library_file_id",
                table: "favorites");

            migrationBuilder.DropIndex(
                name: "ix_favorites_student_id_question_id",
                table: "favorites");

            migrationBuilder.DropCheckConstraint(
                name: "ck_favorites_exactly_one_target",
                table: "favorites");

            migrationBuilder.CreateIndex(
                name: "ix_favorites_student_id",
                table: "favorites",
                column: "student_id");
        }
    }
}
