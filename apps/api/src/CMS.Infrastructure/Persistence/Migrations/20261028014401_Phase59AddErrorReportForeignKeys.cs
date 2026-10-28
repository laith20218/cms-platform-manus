using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase59AddErrorReportForeignKeys : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'fk_error_reports_admins_assigned_to') THEN
        ALTER TABLE error_reports
            ADD CONSTRAINT fk_error_reports_admins_assigned_to
            FOREIGN KEY (assigned_to) REFERENCES admins(id)
            ON DELETE SET NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conname = 'fk_error_reports_admins_reviewed_by') THEN
        ALTER TABLE error_reports
            ADD CONSTRAINT fk_error_reports_admins_reviewed_by
            FOREIGN KEY (reviewed_by) REFERENCES admins(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_error_reports_assigned_to
    ON error_reports (assigned_to);

CREATE INDEX IF NOT EXISTS ix_error_reports_reviewed_by
    ON error_reports (reviewed_by);

CREATE INDEX IF NOT EXISTS ix_error_reports_status_assigned_to
    ON error_reports (status, assigned_to);
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Intentionally no-op: all DDL is guarded and may pre-exist
            // on production. Dropping FKs/indexes in Down() would break
            // idempotency across environments.
        }
    }
}
