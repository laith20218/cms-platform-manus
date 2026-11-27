using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations;

/// <summary>
/// PR-5 — provider-neutral object-retention lifecycle for library assets
/// (Active → Archived/Tombstoned → Quarantine | Retention Pending → Restorable or
/// Final Deletion). Additive nullable columns on library_files (NULL = Active,
/// legacy rows unaffected):
///   1. retention_state int NULL — LibraryRetentionState (1 = RetentionPending
///      tombstone, 2 = Quarantined); partial filtered index for the admin
///      retention-management sweep;
///   2. quarantined_at / quarantined_by / quarantine_reason — the quarantine
///      transition's actor, timestamp and reason (reason capped at 500 chars).
/// A normal archive/delete never physically deletes the stored object; the
/// separate purge (final-deletion) flow is the only path that does.
/// </summary>
public partial class AddLibraryRetention : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "quarantine_reason",
            table: "library_files",
            type: "character varying(500)",
            maxLength: 500,
            nullable: true);

        migrationBuilder.AddColumn<DateTime>(
            name: "quarantined_at",
            table: "library_files",
            type: "timestamp with time zone",
            nullable: true);

        migrationBuilder.AddColumn<Guid>(
            name: "quarantined_by",
            table: "library_files",
            type: "uuid",
            nullable: true);

        migrationBuilder.AddColumn<int>(
            name: "retention_state",
            table: "library_files",
            type: "integer",
            nullable: true);

        migrationBuilder.CreateIndex(
            name: "ix_library_files_retention_state",
            table: "library_files",
            column: "retention_state",
            filter: "retention_state IS NOT NULL");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_library_files_retention_state",
            table: "library_files");

        migrationBuilder.DropColumn(
            name: "quarantine_reason",
            table: "library_files");

        migrationBuilder.DropColumn(
            name: "quarantined_at",
            table: "library_files");

        migrationBuilder.DropColumn(
            name: "quarantined_by",
            table: "library_files");

        migrationBuilder.DropColumn(
            name: "retention_state",
            table: "library_files");
    }
}
