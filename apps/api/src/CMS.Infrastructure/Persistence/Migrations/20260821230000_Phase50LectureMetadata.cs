using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260821230000_Phase50LectureMetadata")]
    public partial class Phase50LectureMetadata : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "instructor_name",
                table: "lectures",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "source_reference",
                table: "lectures",
                type: "text",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "instructor_name", table: "lectures");
            migrationBuilder.DropColumn(name: "source_reference", table: "lectures");
        }
    }
}
