using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260821233000_Phase51AccessCodeScopes")]
    public partial class Phase51AccessCodeScopes : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(name: "content_scope", table: "code_batches", type: "integer", nullable: false, defaultValue: 3);
            migrationBuilder.AddColumn<bool>(name: "is_public", table: "code_batches", type: "boolean", nullable: false, defaultValue: false);
            migrationBuilder.AddColumn<int>(name: "content_scope", table: "subscription_codes", type: "integer", nullable: false, defaultValue: 3);
            migrationBuilder.AddColumn<bool>(name: "is_public", table: "subscription_codes", type: "boolean", nullable: false, defaultValue: false);
            migrationBuilder.AddColumn<int>(name: "content_scope", table: "student_subscriptions", type: "integer", nullable: false, defaultValue: 3);

            migrationBuilder.DropIndex(name: "ix_student_subscriptions_subscription_code_id", table: "student_subscriptions");
            migrationBuilder.CreateIndex(
                name: "ix_student_subscriptions_student_id_subscription_code_id",
                table: "student_subscriptions",
                columns: new[] { "student_id", "subscription_code_id" },
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(name: "ix_student_subscriptions_student_id_subscription_code_id", table: "student_subscriptions");
            migrationBuilder.CreateIndex(name: "ix_student_subscriptions_subscription_code_id", table: "student_subscriptions", column: "subscription_code_id", unique: true);

            migrationBuilder.DropColumn(name: "content_scope", table: "code_batches");
            migrationBuilder.DropColumn(name: "is_public", table: "code_batches");
            migrationBuilder.DropColumn(name: "content_scope", table: "subscription_codes");
            migrationBuilder.DropColumn(name: "is_public", table: "subscription_codes");
            migrationBuilder.DropColumn(name: "content_scope", table: "student_subscriptions");
        }
    }
}
