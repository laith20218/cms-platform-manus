using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
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
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20261022210000_Phase57FixNotificationSenderFk")]
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

            // NOTE (Push 11.5.1, N1 fix): the manual INSERT INTO __EFMigrationsHistory that
            // used to live here was removed (supervisor-approved). EF Core records the
            // history row itself after applying this migration; the manual insert collided
            // with EF's plain runtime insert (duplicate key 23505) when replaying the chain
            // on an empty database via MigrateAsync.
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
