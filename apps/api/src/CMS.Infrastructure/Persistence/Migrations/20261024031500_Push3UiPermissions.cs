using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    /// <summary>
    /// Push 3 / Track 3: adds admin_roles.ui_permissions (jsonb, nullable).
    /// NULL = unconfigured = full admin-web access → zero behavior change for every
    /// existing role (all existing rows stay NULL — D4 regression gate).
    /// super_admin is never configurable; system roles are read-only (SYSTEM_ROLE_READONLY).
    /// A GIN index is deliberately NOT added now; it can be added later if cross-role key
    /// queries are ever needed (recorded in the column comment — Q1 decision).
    /// </summary>
    public partial class Push3UiPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Nullable jsonb: NULL means "unconfigured" = full access. Never backfilled.
            migrationBuilder.AddColumn<string>(
                name: "ui_permissions",
                table: "admin_roles",
                type: "jsonb",
                nullable: true);

            // The GIN-index note lives on the column itself so it is visible in psql/Neon
            // (col_description) long after this migration is history.
            migrationBuilder.Sql(@"
                COMMENT ON COLUMN admin_roles.ui_permissions IS 'UI permission keys (view:/tab:/btn:) as a JSON array - Push 3. NULL = unconfigured = full admin-web access (zero behavior change for existing roles). super_admin is never configurable; system roles are read-only (SYSTEM_ROLE_READONLY). A GIN index may be added later if cross-role key queries are ever needed - deliberately not added now (Q1 decision).';
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ui_permissions",
                table: "admin_roles");
        }
    }
}
