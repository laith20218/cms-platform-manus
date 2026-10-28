using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Phase58RestoreCountsAgainstLimit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='exam_sessions'
          AND column_name='counts_against_limit'
    ) THEN
        ALTER TABLE exam_sessions
            ADD COLUMN counts_against_limit boolean NOT NULL DEFAULT true;
    END IF;
END $$;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Intentionally no-op: the column predates this migration
            // on production. Dropping it in Down() would break prod.
        }
    }
}
