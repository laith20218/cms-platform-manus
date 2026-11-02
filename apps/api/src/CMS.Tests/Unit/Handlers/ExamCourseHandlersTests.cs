using CMS.Application.Commands.ExamCourses;
using CMS.Application.Handlers.ExamCourses;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// W14.2 F.1 — ExamCourse admin lifecycle (B.1): CRUD, publish gating, bank-only
/// exam picking (D6), uniqueness of (course, exam) pairs, and full-order reorder.
/// </summary>
public class ExamCourseHandlersTests
{
    private static (ExamCourseHandlers Handler, ApplicationDbContext Db, IUnitOfWork Uow) Build()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var uow = new UnitOfWork(db);
        return (new ExamCourseHandlers(db, uow), db, uow);
    }

    private static async Task<Exam> AddExamAsync(ApplicationDbContext db, Guid subjectId, string title)
    {
        var admin = db.Admins.First();
        var exam = Exam.Create(subjectId, title, $"exam-{Guid.NewGuid():N}", 2025, admin.Id);
        exam.Publish();
        db.Exams.Add(exam);
        await db.SaveChangesAsync();
        return exam;
    }

    [Fact]
    public async Task Create_StartsInDraft_AndValidatesFields()
    {
        var (handler, db, _) = Build();
        var subject = TestDbHelper.GetTestSubject(db);
        var admin = db.Admins.First();

        var created = await handler.Handle(new CreateExamCourseCommand(
            subject.Id, "دورة أولى 2025", null, null, null, 2025, 1, "First", true, 0, admin.Id), CancellationToken.None);

        created.Status.Should().Be(nameof(ContentStatus.Draft));
        created.CourseType.Should().Be(nameof(ExamCourseType.First));
        created.FreeOrPaid.Should().BeTrue();
        (await db.ExamCourses.SingleAsync(course => course.Id == created.Id)).Status.Should().Be(ContentStatus.Draft);

        var emptyName = () => handler.Handle(new CreateExamCourseCommand(
            subject.Id, "   ", null, null, null, 2025, 1, "First", true, 0, admin.Id), CancellationToken.None);
        await emptyName.Should().ThrowAsync<DomainException>();

        var badSemester = () => handler.Handle(new CreateExamCourseCommand(
            subject.Id, "دورة", null, null, null, 2025, 7, "First", true, 0, admin.Id), CancellationToken.None);
        await badSemester.Should().ThrowAsync<DomainException>();

        var unknownSubject = () => handler.Handle(new CreateExamCourseCommand(
            Guid.NewGuid(), "دورة", null, null, null, 2025, 1, "First", true, 0, admin.Id), CancellationToken.None);
        await unknownSubject.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task Publish_RejectedWhileEmpty_AllowedAfterAddExam()
    {
        var (handler, db, _) = Build();
        var subject = TestDbHelper.GetTestSubject(db);
        var admin = db.Admins.First();
        var course = await handler.Handle(new CreateExamCourseCommand(
            subject.Id, "دورة نموذجية", null, null, null, 2025, 1, "Model", false, 0, admin.Id), CancellationToken.None);

        var publishEmpty = () => handler.Handle(new PublishExamCourseCommand(course.Id, admin.Id), CancellationToken.None);
        await publishEmpty.Should().ThrowAsync<BusinessRuleViolationException>();

        var exam = await AddExamAsync(db, subject.Id, "نموذج A");
        await handler.Handle(new AddExamToCourseCommand(course.Id, exam.Id, admin.Id), CancellationToken.None);
        await handler.Handle(new PublishExamCourseCommand(course.Id, admin.Id), CancellationToken.None);

        (await db.ExamCourses.SingleAsync(item => item.Id == course.Id)).Status.Should().Be(ContentStatus.Published);
    }

    [Fact]
    public async Task AddExam_IsBankOnly_SameSubjectOnly_AndUnique()
    {
        var (handler, db, _) = Build();
        var subject = TestDbHelper.GetTestSubject(db);
        var admin = db.Admins.First();
        var course = await handler.Handle(new CreateExamCourseCommand(
            subject.Id, "دورة أولى", null, null, null, 2025, 1, "First", true, 0, admin.Id), CancellationToken.None);
        var exam = await AddExamAsync(db, subject.Id, "دورة أولى 2025");

        await handler.Handle(new AddExamToCourseCommand(course.Id, exam.Id, admin.Id), CancellationToken.None);
        (await db.ExamCourseItems.CountAsync(item => item.ExamCourseId == course.Id)).Should().Be(1);

        // D6: same exam cannot ship twice inside one bundle.
        var duplicate = () => handler.Handle(new AddExamToCourseCommand(course.Id, exam.Id, admin.Id), CancellationToken.None);
        await duplicate.Should().ThrowAsync<ConflictException>();

        // D6: picking is bank-only AND subject-bound — a foreign-subject exam is rejected.
        var otherSubject = Subject.Create(Semester.Create(AcademicYear.Create(College.Create(University.Create("جامعة أخرى", "other-uni", "Other Uni").Id, "كلية أخرى", "other-college", "Other College").Id, "سنة أخرى", "other-year", 1).Id, "فصل آخر", "other-semester", 1).Id, "مادة أخرى", "other-subject", "Other Subject");
        db.Subjects.Add(otherSubject);
        await db.SaveChangesAsync();
        var foreignExam = await AddExamAsync(db, otherSubject.Id, "اختبار مادة أخرى");

        var foreign = () => handler.Handle(new AddExamToCourseCommand(course.Id, foreignExam.Id, admin.Id), CancellationToken.None);
        await foreign.Should().ThrowAsync<BusinessRuleViolationException>();
    }

    [Fact]
    public async Task Reorder_AssignsSortOrderByIndex_AndRejectsForeignIds()
    {
        var (handler, db, _) = Build();
        var subject = TestDbHelper.GetTestSubject(db);
        var admin = db.Admins.First();
        var course = await handler.Handle(new CreateExamCourseCommand(
            subject.Id, "دورة ثانية", null, null, null, 2025, 2, "Second", false, 0, admin.Id), CancellationToken.None);
        var examA = await AddExamAsync(db, subject.Id, "اختبار A");
        var examB = await AddExamAsync(db, subject.Id, "اختبار B");
        await handler.Handle(new AddExamToCourseCommand(course.Id, examA.Id, admin.Id), CancellationToken.None);
        await handler.Handle(new AddExamToCourseCommand(course.Id, examB.Id, admin.Id), CancellationToken.None);

        var reordered = await handler.Handle(new ReorderCourseExamsCommand(
            course.Id, new List<Guid> { examB.Id, examA.Id }, admin.Id), CancellationToken.None);

        var items = reordered.Items.OrderBy(item => item.SortOrder).ToList();
        items.Should().HaveCount(2);
        items[0].ExamId.Should().Be(examB.Id);
        items[0].SortOrder.Should().Be(0);
        items[1].ExamId.Should().Be(examA.Id);
        items[1].SortOrder.Should().Be(1);

        var partial = () => handler.Handle(new ReorderCourseExamsCommand(
            course.Id, new List<Guid> { examB.Id }, admin.Id), CancellationToken.None);
        await partial.Should().ThrowAsync<DomainException>();
    }

    [Fact]
    public async Task RemoveExam_AndSoftDelete_Work()
    {
        var (handler, db, _) = Build();
        var subject = TestDbHelper.GetTestSubject(db);
        var admin = db.Admins.First();
        var course = await handler.Handle(new CreateExamCourseCommand(
            subject.Id, "دورة تكميلية", null, null, null, 2025, 3, "Supplementary", true, 0, admin.Id), CancellationToken.None);
        var exam = await AddExamAsync(db, subject.Id, "اختبار تكميلي");
        await handler.Handle(new AddExamToCourseCommand(course.Id, exam.Id, admin.Id), CancellationToken.None);

        await handler.Handle(new RemoveExamFromCourseCommand(course.Id, exam.Id, admin.Id), CancellationToken.None);
        (await db.ExamCourseItems.CountAsync(item => item.ExamCourseId == course.Id)).Should().Be(0);

        await handler.Handle(new DeleteExamCourseCommand(course.Id, admin.Id), CancellationToken.None);
        (await db.ExamCourses.SingleAsync(item => item.Id == course.Id)).Status.Should().Be(ContentStatus.Deleted);
    }

    [Fact]
    public async Task StudentDetail_FailsClosed_WithoutSubjectEntitlement()
    {
        var db = TestDbHelper.CreateInMemoryContext();
        var subject = TestDbHelper.GetTestSubject(db);
        var entitlements = new Mock<IEntitlementService>();
        entitlements.Setup(service => service.CanAccessSubjectContentAsync(It.IsAny<Guid>(), It.IsAny<Guid>(),
            SubscriptionContentScope.QuestionsExams, It.IsAny<CancellationToken>())).ReturnsAsync(false);
        var handler = new StudentExamCourseHandlers(db, entitlements.Object);
        var student = TestDbHelper.GetTestStudent(db);

        var action = () => handler.Handle(new GetStudentExamCoursesQuery(student.Id, subject.Id, null, null), CancellationToken.None);
        await action.Should().ThrowAsync<ForbiddenException>();
    }
}
