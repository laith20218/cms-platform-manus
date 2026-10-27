using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEpisodeFavorites : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_favorites_exactly_one_target",
                table: "favorites");

            migrationBuilder.AddColumn<Guid>(
                name: "course_episode_id",
                table: "favorites",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_favorites_course_episode_id",
                table: "favorites",
                column: "course_episode_id");

            migrationBuilder.CreateIndex(
                name: "ix_favorites_student_id_course_episode_id",
                table: "favorites",
                columns: new[] { "student_id", "course_episode_id" },
                unique: true,
                filter: "course_episode_id IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "ck_favorites_exactly_one_target",
                table: "favorites",
                sql: "(question_id IS NOT NULL AND library_file_id IS NULL AND course_episode_id IS NULL) OR (question_id IS NULL AND library_file_id IS NOT NULL AND course_episode_id IS NULL) OR (question_id IS NULL AND library_file_id IS NULL AND course_episode_id IS NOT NULL)");

            migrationBuilder.AddForeignKey(
                name: "fk_favorites_course_episodes_course_episode_id",
                table: "favorites",
                column: "course_episode_id",
                principalTable: "course_episodes",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_favorites_course_episodes_course_episode_id",
                table: "favorites");

            migrationBuilder.DropIndex(
                name: "ix_favorites_course_episode_id",
                table: "favorites");

            migrationBuilder.DropIndex(
                name: "ix_favorites_student_id_course_episode_id",
                table: "favorites");

            migrationBuilder.DropCheckConstraint(
                name: "ck_favorites_exactly_one_target",
                table: "favorites");

            migrationBuilder.DropColumn(
                name: "course_episode_id",
                table: "favorites");

            migrationBuilder.AddCheckConstraint(
                name: "ck_favorites_exactly_one_target",
                table: "favorites",
                sql: "(question_id IS NOT NULL AND library_file_id IS NULL) OR (question_id IS NULL AND library_file_id IS NOT NULL)");
        }
    }
}
