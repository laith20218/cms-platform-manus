using Microsoft.EntityFrameworkCore;
using Moq;
using CMS.Application.Commands.Favorites;
using CMS.Application.Commands.Questions;
using CMS.Application.DTOs.Favorites;
using CMS.Application.Handlers.Favorites;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Infrastructure.Services;
using CMS.Tests.Helpers;
using FluentAssertions;
using Xunit;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// W15.0 — FavoriteListsHandlers unit coverage: list CRUD + ownership security + name
/// conflicts, question-membership gates (Published target, entitlement, idempotency),
/// RemoveQuestion's deliberate unpublished/hard-deleted tolerance, and the list-questions
/// read (FavoriteItemDto card shape, search, paging, entitlement filtering).
/// </summary>
public class FavoriteListsHandlersTests
{
    // ===== helpers =====

    private static (FavoriteListsHandlers Handler, Mock<IEntitlementService> Entitlements) Create(
        ApplicationDbContext db, bool allowAll = true)
    {
        var entitlements = new Mock<IEntitlementService>();
        entitlements
            .Setup(service => service.CanAccessSubjectContentAsync(
                It.IsAny<Guid>(), It.IsAny<Guid>(), It.IsAny<SubscriptionContentScope>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(allowAll);
        entitlements
            .Setup(service => service.GetAccessibleSubjectMapAsync(
                It.IsAny<Guid>(),
                It.IsAny<IReadOnlyCollection<(Guid SubjectId, SubscriptionContentScope Scope)>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid _, IReadOnlyCollection<(Guid SubjectId, SubscriptionContentScope Scope)> candidates, CancellationToken _) =>
                allowAll
                    ? candidates
                        .GroupBy(candidate => candidate.Scope)
                        .ToDictionary(group => group.Key, group => new HashSet<Guid>(group.Select(candidate => candidate.SubjectId)))
                    : new Dictionary<SubscriptionContentScope, HashSet<Guid>>());

        var signed = new Mock<ISignedEntitlementService>();
        signed
            .Setup(service => service.ValidateAsync(
                It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string _, Guid studentId, string installationId, Guid? _, CancellationToken _) =>
                new SignedEntitlementValidationResult(true, null, new SignedEntitlement(
                    studentId, installationId, null, null,
                    Array.Empty<Guid>(), Array.Empty<Guid>(), Array.Empty<Guid>(),
                    DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow.AddMinutes(15), 1, "test")));

        var handler = new FavoriteListsHandlers(db, new UnitOfWork(db), entitlements.Object, signed.Object);
        return (handler, entitlements);
    }

    private static async Task<Student> SeedOtherStudentAsync(ApplicationDbContext db)
    {
        var other = Student.Create("0990000001", "hashed_password_123", "طالب آخر");
        db.Students.Add(other);
        await db.SaveChangesAsync();
        return other;
    }

    private static async Task<Question> SeedUnpublishedQuestionAsync(ApplicationDbContext db)
    {
        var subject = db.Subjects.First();
        var admin = db.Admins.First();
        var question = Question.Create(
            "سؤال غير منشور — يجب ألا يدخل أي قائمة", QuestionType.Mcq, subject.Id, null, Difficulty.Hard,
            new List<string> { "draft" }, admin.Id);
        db.Questions.Add(question);
        await db.SaveChangesAsync();
        return question;
    }

    private static async Task<FavoriteList> AddListAsync(
        ApplicationDbContext db, Guid studentId, string name, DateTime? createdAt = null)
    {
        var list = FavoriteList.Create(studentId, name, null, null);
        db.FavoriteLists.Add(list);
        if (createdAt.HasValue)
            db.Entry(list).Property(entry => entry.CreatedAt).CurrentValue = createdAt.Value;
        await db.SaveChangesAsync();
        return list;
    }

    private static async Task<FavoriteListItem> AddItemAsync(
        ApplicationDbContext db, Guid listId, Guid questionId, DateTime? createdAt = null)
    {
        var item = FavoriteListItem.Create(listId, questionId);
        db.FavoriteListItems.Add(item);
        if (createdAt.HasValue)
            db.Entry(item).Property(entry => entry.CreatedAt).CurrentValue = createdAt.Value;
        await db.SaveChangesAsync();
        return item;
    }

    // ===== CreateFavoriteListCommand =====

    [Fact]
    public async Task Create_PersistsList_AndTrimsName()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var (handler, _) = Create(db);

        var result = await handler.Handle(
            new CreateFavoriteListCommand(student.Id, "  Anatomy - Hard  ", "أسئلة صعبة", "#e11d48"), CancellationToken.None);

        result.Name.Should().Be("Anatomy - Hard");
        db.FavoriteLists.Should().ContainSingle()
            .Which.Should().Match<FavoriteList>(list => list.StudentId == student.Id && list.Color == "#e11d48");
    }

    [Fact]
    public async Task Create_DuplicateName_ThrowsConflict()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        await AddListAsync(db, student.Id, "قائمة");
        var (handler, _) = Create(db);

        var act = async () => await handler.Handle(
            new CreateFavoriteListCommand(student.Id, "قائمة", null, null), CancellationToken.None);
        await act.Should().ThrowAsync<ConflictException>();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Create_EmptyName_ThrowsDomain(string name)
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var (handler, _) = Create(db);

        var act = async () => await handler.Handle(
            new CreateFavoriteListCommand(student.Id, name, null, null), CancellationToken.None);
        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("FAVORITE_LIST_NAME_REQUIRED");
    }

    [Fact]
    public async Task Create_NameTooLong_ThrowsDomain()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var (handler, _) = Create(db);

        var act = async () => await handler.Handle(
            new CreateFavoriteListCommand(student.Id, new string('س', 101), null, null), CancellationToken.None);
        (await act.Should().ThrowAsync<DomainException>()).Which.ErrorCode.Should().Be("FAVORITE_LIST_NAME_TOO_LONG");
    }

    // ===== UpdateFavoriteListCommand =====

    [Fact]
    public async Task Update_RenamesAndChangesColor_NullFieldsKeepOldValues()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var list = await AddListAsync(db, student.Id, "قائمة قديمة");
        var (handler, _) = Create(db);

        await handler.Handle(
            new UpdateFavoriteListCommand(student.Id, list.Id, "قائمة جديدة", null, "#0ea5e9"), CancellationToken.None);

        list.Name.Should().Be("قائمة جديدة");
        list.Color.Should().Be("#0ea5e9");
        list.Description.Should().BeNull();
    }

    [Fact]
    public async Task Update_ForeignList_ThrowsNotFound()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var other = await SeedOtherStudentAsync(db);
        var foreign = await AddListAsync(db, other.Id, "قائمة الطالب الآخر");
        var (handler, _) = Create(db);

        var act = async () => await handler.Handle(
            new UpdateFavoriteListCommand(student.Id, foreign.Id, "محاولة اختراق", null, null), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    // ===== DeleteFavoriteListCommand =====

    [Fact]
    public async Task Delete_RemovesList_AndCascadesItems()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var list = await AddListAsync(db, student.Id, "قائمة");
        await AddItemAsync(db, list.Id, question.Id);

        var (handler, _) = Create(db);
        await handler.Handle(new DeleteFavoriteListCommand(student.Id, list.Id), CancellationToken.None);

        db.FavoriteLists.Should().BeEmpty();
        db.FavoriteListItems.Should().BeEmpty();
    }

    [Fact]
    public async Task Delete_ForeignList_ThrowsNotFound()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var other = await SeedOtherStudentAsync(db);
        var foreign = await AddListAsync(db, other.Id, "قائمة الطالب الآخر");
        var (handler, _) = Create(db);

        var act = async () => await handler.Handle(new DeleteFavoriteListCommand(student.Id, foreign.Id), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    // ===== AddQuestionToFavoriteListCommand =====

    [Fact]
    public async Task AddQuestion_CreatesMembership_ThenIdempotent()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var list = await AddListAsync(db, student.Id, "قائمة");
        var (handler, _) = Create(db);

        var first = await handler.Handle(
            new AddQuestionToFavoriteListCommand(student.Id, list.Id, question.Id, "token", "install"), CancellationToken.None);
        var second = await handler.Handle(
            new AddQuestionToFavoriteListCommand(student.Id, list.Id, question.Id, "token", "install"), CancellationToken.None);

        first.IsNew.Should().BeTrue();
        second.IsNew.Should().BeFalse();
        db.FavoriteListItems.Should().ContainSingle()
            .Which.Should().Match<FavoriteListItem>(item => item.FavoriteListId == list.Id && item.QuestionId == question.Id);
    }

    [Fact]
    public async Task AddQuestion_UnpublishedQuestion_ThrowsNotFound()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var draft = await SeedUnpublishedQuestionAsync(db);
        var list = await AddListAsync(db, student.Id, "قائمة");
        var (handler, _) = Create(db);

        var act = async () => await handler.Handle(
            new AddQuestionToFavoriteListCommand(student.Id, list.Id, draft.Id, "token", "install"), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task AddQuestion_ForeignList_ThrowsNotFound()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var other = await SeedOtherStudentAsync(db);
        var foreign = await AddListAsync(db, other.Id, "قائمة الطالب الآخر");
        var (handler, _) = Create(db);

        var act = async () => await handler.Handle(
            new AddQuestionToFavoriteListCommand(student.Id, foreign.Id, question.Id, "token", "install"), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task AddQuestion_EntitlementDenied_ThrowsForbidden()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var list = await AddListAsync(db, student.Id, "قائمة");
        var (handler, _) = Create(db, allowAll: false);

        var act = async () => await handler.Handle(
            new AddQuestionToFavoriteListCommand(student.Id, list.Id, question.Id, "token", "install"), CancellationToken.None);
        await act.Should().ThrowAsync<ForbiddenException>();
    }

    // ===== RemoveQuestionFromFavoriteListCommand =====

    [Fact]
    public async Task RemoveQuestion_RemovesMembership_IdempotentWhenAbsent()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var list = await AddListAsync(db, student.Id, "قائمة");
        await AddItemAsync(db, list.Id, question.Id);
        var (handler, _) = Create(db);

        await handler.Handle(
            new RemoveQuestionFromFavoriteListCommand(student.Id, list.Id, question.Id, "token", "install"), CancellationToken.None);
        db.FavoriteListItems.Should().BeEmpty();

        // Second call: no row, no throw.
        await handler.Handle(
            new RemoveQuestionFromFavoriteListCommand(student.Id, list.Id, question.Id, "token", "install"), CancellationToken.None);
        db.FavoriteListItems.Should().BeEmpty();
    }

    [Fact]
    public async Task RemoveQuestion_StillWorksAfterUnpublish()
    {
        // Deliberate deviation from DeleteFavoriteCommand: removal must stay possible
        // after the question is unpublished (it is the student's OWN row). Membership was
        // seeded directly (bypassing the add-gate) exactly like a legacy pre-unpublish row.
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var draft = await SeedUnpublishedQuestionAsync(db);
        var list = await AddListAsync(db, student.Id, "قائمة");
        await AddItemAsync(db, list.Id, draft.Id);
        var (handler, _) = Create(db);

        await handler.Handle(
            new RemoveQuestionFromFavoriteListCommand(student.Id, list.Id, draft.Id, "token", "install"), CancellationToken.None);
        db.FavoriteListItems.Should().BeEmpty();
    }

    [Fact]
    public async Task RemoveQuestion_QuestionHardDeleted_IdempotentSuccess()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = await SeedUnpublishedQuestionAsync(db);
        var list = await AddListAsync(db, student.Id, "قائمة");
        await AddItemAsync(db, list.Id, question.Id);
        var (handler, _) = Create(db);

        db.Questions.Remove(question); // hard delete — cascades the membership row away
        await db.SaveChangesAsync();
        db.FavoriteListItems.Should().BeEmpty();

        var act = async () => await handler.Handle(
            new RemoveQuestionFromFavoriteListCommand(student.Id, list.Id, question.Id, "token", "install"), CancellationToken.None);
        await act.Should().NotThrowAsync();
    }

    // ===== GetFavoriteListsQuery =====

    [Fact]
    public async Task GetLists_ReturnsCountersAndCreationOrder()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var questions = db.Questions.Take(2).ToList();
        var first = await AddListAsync(db, student.Id, "الأولى", createdAt: DateTime.UtcNow.AddMinutes(-10));
        var second = await AddListAsync(db, student.Id, "الثانية", createdAt: DateTime.UtcNow.AddMinutes(-5));
        await AddItemAsync(db, first.Id, questions[0].Id);
        await AddItemAsync(db, first.Id, questions[1].Id);
        await AddItemAsync(db, second.Id, questions[0].Id);
        var (handler, _) = Create(db);

        var result = await handler.Handle(new GetFavoriteListsQuery(student.Id, QuestionId: null), CancellationToken.None);

        result.Should().HaveCount(2);
        result.Select(list => list.Name).Should().ContainInOrder("الأولى", "الثانية");
        result[0].QuestionsCount.Should().Be(2);
        result[1].QuestionsCount.Should().Be(1);
        result[0].ContainsQuestion.Should().BeNull(); // no QuestionId in the query
    }

    [Fact]
    public async Task GetLists_WithQuestionId_ReportsMembershipFlags()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var questions = db.Questions.Take(2).ToList();
        var first = await AddListAsync(db, student.Id, "الأولى");
        var second = await AddListAsync(db, student.Id, "الثانية");
        await AddItemAsync(db, first.Id, questions[0].Id);
        var (handler, _) = Create(db);

        var result = await handler.Handle(new GetFavoriteListsQuery(student.Id, QuestionId: questions[0].Id), CancellationToken.None);

        result.Single(list => list.Name == "الأولى").ContainsQuestion.Should().BeTrue();
        result.Single(list => list.Name == "الثانية").ContainsQuestion.Should().BeFalse();
    }

    // ===== GetQuestionsInFavoriteListQuery =====

    [Fact]
    public async Task GetQuestionsInList_ReturnsFavoriteItemShape_WithSearchAndPaging()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var diabetesQuestion = db.Questions.Single(question => question.Text.Contains("سكري"));
        var otherQuestion = db.Questions.First(question => question.Id != diabetesQuestion.Id);
        var list = await AddListAsync(db, student.Id, "قائمة");
        await AddItemAsync(db, list.Id, otherQuestion.Id, createdAt: DateTime.UtcNow.AddMinutes(-5));
        await AddItemAsync(db, list.Id, diabetesQuestion.Id, createdAt: DateTime.UtcNow.AddMinutes(-1));
        var (handler, _) = Create(db);

        var all = await handler.Handle(
            new GetQuestionsInFavoriteListQuery(student.Id, list.Id, null, 1, 20, "token", "install"), CancellationToken.None);

        all.Total.Should().Be(2);
        all.Items.Should().OnlyContain(item => item.TargetType == "question");
        // Newest membership first.
        all.Items[0].TargetId.Should().Be(diabetesQuestion.Id);
        all.Items[0].SubjectId.Should().NotBe(Guid.Empty);
        all.Items[0].Title.Should().NotBeNullOrWhiteSpace();
        all.Items[0].CreatedAt.Should().BeAfter(DateTime.UtcNow.AddMinutes(-2));

        var searched = await handler.Handle(
            new GetQuestionsInFavoriteListQuery(student.Id, list.Id, "سكري", 1, 20, "token", "install"), CancellationToken.None);
        searched.Total.Should().Be(1);
        searched.Items[0].TargetId.Should().Be(diabetesQuestion.Id);

        var paged = await handler.Handle(
            new GetQuestionsInFavoriteListQuery(student.Id, list.Id, null, 1, 1, "token", "install"), CancellationToken.None);
        paged.Total.Should().Be(2);
        paged.TotalPages.Should().Be(2);
        paged.Items.Should().HaveCount(1);
    }

    [Fact]
    public async Task GetQuestionsInList_EntitlementDenied_HidesRows()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);
        var list = await AddListAsync(db, student.Id, "قائمة");
        await AddItemAsync(db, list.Id, question.Id);
        var (handler, _) = Create(db, allowAll: false);

        var result = await handler.Handle(
            new GetQuestionsInFavoriteListQuery(student.Id, list.Id, null, 1, 20, "token", "install"), CancellationToken.None);

        result.Total.Should().Be(1); // pre-entitlement count (pagination stability)
        result.Items.Should().BeEmpty(); // but the page hides inaccessible questions
    }

    [Fact]
    public async Task GetQuestionsInList_ForeignList_ThrowsNotFound()
    {
        await using var db = TestDbHelper.CreateInMemoryContext();
        var student = TestDbHelper.GetTestStudent(db);
        var other = await SeedOtherStudentAsync(db);
        var foreign = await AddListAsync(db, other.Id, "قائمة الطالب الآخر");
        var (handler, _) = Create(db);

        var act = async () => await handler.Handle(
            new GetQuestionsInFavoriteListQuery(student.Id, foreign.Id, null, 1, 20, "token", "install"), CancellationToken.None);
        await act.Should().ThrowAsync<NotFoundException>();
    }
}
