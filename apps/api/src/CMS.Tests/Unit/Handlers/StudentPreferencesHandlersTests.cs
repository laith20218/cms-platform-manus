using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Commands.Profile;
using CMS.Application.Handlers.Profile;
using CMS.Application.Interfaces;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using FluentAssertions;
using Xunit;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// W15.0 — StudentPreferencesHandlers coverage: default read, canonical round-trip,
/// object-kind + size-cap validation, missing/deleted-student 404s, and the corrupt-stored-
/// value degradation to the entity default.
/// </summary>
public class StudentPreferencesHandlersTests
{
    private static StudentPreferencesHandlers Create(ApplicationDbContext db) =>
        new(db, new UnitOfWork(db));

    [Fact]
    public async Task Get_NeverWritten_ReturnsEntityDefault()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);

        var result = await Create(db).Handle(new GetStudentPreferencesQuery(student.Id), CancellationToken.None);

        result["theme"]!.GetValue<string>().Should().Be("light");
        result["notifications"]!.GetValue<bool>().Should().BeTrue();
    }

    [Fact]
    public async Task Update_StoresCanonical_AndRoundTrips()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var handler = Create(db);

        var updated = await handler.Handle(
            new UpdateStudentPreferencesCommand(student.Id, """{"lastSubjectId":"abc","theme":"dark"}"""), CancellationToken.None);
        updated["theme"]!.GetValue<string>().Should().Be("dark");

        var reread = await handler.Handle(new GetStudentPreferencesQuery(student.Id), CancellationToken.None);
        reread["lastSubjectId"]!.GetValue<string>().Should().Be("abc");
        reread["theme"]!.GetValue<string>().Should().Be("dark");
    }

    [Theory]
    [InlineData("[1,2,3]")]
    [InlineData("\"just a string\"")]
    [InlineData("42")]
    [InlineData("null")]
    public async Task Update_NonObjectJson_Rejected(string raw)
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);

        var act = async () => await Create(db).Handle(
            new UpdateStudentPreferencesCommand(student.Id, raw), CancellationToken.None);
        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("PREFERENCES_INVALID_JSON");
    }

    [Fact]
    public async Task Update_OversizedJson_Rejected()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var oversized = "{\"pad\":\"" + new string('x', 9 * 1024) + "\"}";

        var act = async () => await Create(db).Handle(
            new UpdateStudentPreferencesCommand(student.Id, oversized), CancellationToken.None);
        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("PREFERENCES_TOO_LARGE");
    }

    [Fact]
    public async Task Update_MissingStudent_ThrowsNotFound()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();

        var act = async () => await Create(db).Handle(
            new UpdateStudentPreferencesCommand(Guid.NewGuid(), """{"a":1}"""), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Get_DeletedStudent_ThrowsNotFound()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        student.DeletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var act = async () => await Create(db).Handle(new GetStudentPreferencesQuery(student.Id), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Get_CorruptStoredValue_DegradesToDefault()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        db.Entry(student).Property(entry => entry.Preferences).CurrentValue = "{{not json at all";
        await db.SaveChangesAsync();

        var result = await Create(db).Handle(new GetStudentPreferencesQuery(student.Id), CancellationToken.None);

        result["theme"]!.GetValue<string>().Should().Be("light"); // fallback, no 500
    }
}
