using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    /// <summary>
    /// Fix: Notification.Sender navigation was auto-generating a separate `sender_id` column
    /// instead of using `sent_by` as the FK. This migration:
    /// 1. Drops the old FK constraint on sender_id
    /// 2. Drops the sender_id column
    /// 3. Creates FK on sent_by → admins.id
    /// Safe on empty tables (production has 0 notifications).
    /// </summary>
    public partial class Phase57FixNotificationSenderFk : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Drop old FK constraint on sender_id (if exists)
            migrationBuilder.Sql(@"
                DO $$ BEGIN
                    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_notifications_admins_sender_id;
                EXCEPTION WHEN OTHERS THEN NULL; END $$;
            ");

            // Drop the orphaned sender_id column
            migrationBuilder.Sql(@"
                DO $$ BEGIN
                    ALTER TABLE notifications DROP COLUMN IF EXISTS sender_id;
                EXCEPTION WHEN OTHERS THEN NULL; END $$;
            ");

            // Create FK on sent_by → admins.id
            migrationBuilder.Sql(@"
                DO $$ BEGIN
                    ALTER TABLE notifications
                    ADD CONSTRAINT fk_notifications_admins_sent_by
                    FOREIGN KEY (sent_by) REFERENCES admins(id) ON DELETE RESTRICT;
                EXCEPTION WHEN OTHERS THEN NULL; END $$;
            ");

            // Record migration
            migrationBuilder.Sql(@"
                INSERT INTO ""__EFMigrationsHistory"" (""MigrationId"", ""ProductVersion"")
                VALUES ('20261022210000_Phase57FixNotificationSenderFk', '9.0.0')
                ON CONFLICT (""MigrationId"") DO NOTHING;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Re-create sender_id column (for rollback safety)
            migrationBuilder.AddColumn<Guid>(
                name: "sender_id",
                table: "notifications",
                type: "uuid",
                nullable: false,
                defaultValue: Guid.Empty);

            migrationBuilder.Sql("ALTER TABLE notifications DROP CONSTRAINT IF EXISTS fk_notifications_admins_sent_by;");
        }
    }
}
