using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// PR-6 (Student Center — admin password reset): students.must_change_password
    /// boolean NOT NULL DEFAULT false. Set when an admin force-resets a student password
    /// with ForceChangeOnNextLogin; cleared by the student's own ChangePassword /
    /// ResetPassword flows. Legacy rows keep the safe default (no forced change).
    /// </summary>
    public partial class AddStudentMustChangePassword : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "must_change_password",
                table: "students",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "must_change_password",
                table: "students");
        }
    }
}
