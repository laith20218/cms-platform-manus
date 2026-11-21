using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMS.Infrastructure.Persistence.Migrations;

/// <summary>
/// Wave 20.3 (owner decision 1, C3 additive) — six-digit public codes for
/// library files and video courses ("000000"–"999999", zero-padded):
///   1. nullable varchar(6) column on library_files + courses
///      (NULL allowed by the unique index — Postgres permits multiple NULLs);
///   2. collision-safe backfill for existing rows: deterministic
///      ROW_NUMBER() over (created_at, id) modulo 10^6, zero-padded —
///      distinct per table while it holds fewer than 1,000,000 rows;
///   3. unique index per table.
/// New rows get their code auto-assigned at creation (PublicCodes.GenerateUniqueAsync).
/// Episodes deliberately get NO codes (the code belongs to the file / course as a whole).
/// </summary>
public partial class AddPublicCodes : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "public_code",
            table: "library_files",
            type: "character varying(6)",
            maxLength: 6,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "public_code",
            table: "courses",
            type: "character varying(6)",
            maxLength: 6,
            nullable: true);

        // Backfill — window functions are not allowed directly in UPDATE SET,
        // so the numbering runs in a FROM subquery keyed by id.
        migrationBuilder.Sql(@"UPDATE library_files
SET public_code = LPAD((numbered.rn % 1000000)::text, 6, '0')
FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
    FROM library_files
    WHERE public_code IS NULL
) AS numbered
WHERE library_files.id = numbered.id;");

        migrationBuilder.Sql(@"UPDATE courses
SET public_code = LPAD((numbered.rn % 1000000)::text, 6, '0')
FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
    FROM courses
    WHERE public_code IS NULL
) AS numbered
WHERE courses.id = numbered.id;");

        migrationBuilder.CreateIndex(
            name: "ix_library_files_public_code",
            table: "library_files",
            column: "public_code",
            unique: true);

        migrationBuilder.CreateIndex(
            name: "ix_courses_public_code",
            table: "courses",
            column: "public_code",
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropIndex(
            name: "ix_library_files_public_code",
            table: "library_files");

        migrationBuilder.DropIndex(
            name: "ix_courses_public_code",
            table: "courses");

        migrationBuilder.DropColumn(
            name: "public_code",
            table: "library_files");

        migrationBuilder.DropColumn(
            name: "public_code",
            table: "courses");
    }
}
