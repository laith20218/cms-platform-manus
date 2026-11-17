using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSemesterCourseIdToQuestion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "semester_course_id",
                table: "questions",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_questions_semester_course_id",
                table: "questions",
                column: "semester_course_id");

            migrationBuilder.AddForeignKey(
                name: "fk_questions_exam_courses_semester_course_id",
                table: "questions",
                column: "semester_course_id",
                principalTable: "exam_courses",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_questions_exam_courses_semester_course_id",
                table: "questions");

            migrationBuilder.DropIndex(
                name: "ix_questions_semester_course_id",
                table: "questions");

            migrationBuilder.DropColumn(
                name: "semester_course_id",
                table: "questions");
        }
    }
}
