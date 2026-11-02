using System.Security.Claims;
using System.Text.Json;
using CMS.Api.Authorization;
using CMS.Api.Controllers;
using CMS.Application.Commands.ExamCourses;
using CMS.Application.Commands.Practice;
using CMS.Application.Commands.Questions;
using CMS.Application.DTOs.Questions;
using CMS.Application.Handlers.ExamCourses;
using CMS.Application.Handlers.Practice;
using CMS.Application.Handlers.Questions;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;
using CMS.Infrastructure.Repositories;
using CMS.Tests.Helpers;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Moq;

namespace CMS.Tests.Unit.Handlers;

/// <summary>
/// W14.2 F.1 — question reports (B.4/D12): ReportType lands on ErrorReport from the
/// student path, and the admin resolve/reject transitions persist resolver identity.
/// </summary>
public class QuestionReportW14Tests
{
    private static QuestionCommandHandlers BuildHandler(ApplicationDbContext db, IUnitOfWork uow)
    {
        var entitlements = new Mock<IEntitlementService>();
        return new QuestionCommandHandlers(db, uow, entitlements.Object, new Mock<IAdminActivityWriter>().Object);
    }

    private static AdminQuestionsController BuildController(ApplicationDbContext db, Guid adminId)
    {
        var permissions = new Mock<IPermissionService>();
        permissions.Setup(service => service.HasPermissionAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        permissions.Setup(service => service.IsInScopeAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<Guid>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        permissions.Setup(service => service.GetScopeAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AdminScope(null, null, null, null, IsSuperAdmin: true));
        var controller = new AdminQuestionsController(db, permissions.Object);
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity(new[]
                {
                    new Claim("sub", adminId.ToString()),
                    new Claim(ClaimTypes.Role, "admin")
                }, "test"))
            }
        };
        return controller;
    }

    [Fact]
    public async Task Report_WithReportType_PersistsClassification()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        using var uow = new UnitOfWork(db);
        var handler = BuildHandler(db, uow);
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);

        await handler.Handle(new ReportQuestionCommand(
            question.Id, student.Id, "Typo", "خطأ إملائي في السؤال", null, "WrongAnswer"), CancellationToken.None);

        var report = await db.ErrorReports.SingleAsync(item => item.QuestionId == question.Id);
        report.ReportType.Should().Be(ReportType.WrongAnswer);
        report.Status.Should().Be(ErrorReportStatus.Pending);
        report.QuestionId.Should().Be(question.Id);
    }

    [Fact]
    public async Task Report_WithoutReportType_DefaultsToOther()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        using var uow = new UnitOfWork(db);
        var handler = BuildHandler(db, uow);
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);

        await handler.Handle(new ReportQuestionCommand(
            question.Id, student.Id, "Other", "وصف العام", null), CancellationToken.None);

        var report = await db.ErrorReports.SingleAsync(item => item.QuestionId == question.Id);
        report.ReportType.Should().Be(ReportType.Other);
    }

    [Fact]
    public async Task Resolve_And_Reject_PersistResolverIdentity()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        using var uow = new UnitOfWork(db);
        var admin = db.Admins.First();
        var handler = BuildHandler(db, uow);
        var student = TestDbHelper.GetTestStudent(db);
        var question = TestDbHelper.GetTestQuestion(db);

        await handler.Handle(new ReportQuestionCommand(question.Id, student.Id, "Other", "تقرير", null, "Typo"), CancellationToken.None);
        var report = await db.ErrorReports.SingleAsync(item => item.QuestionId == question.Id);

        var controller = BuildController(db, admin.Id);
        var resolve = await controller.ResolveReport(report.Id, new ResolveErrorReportDto("تم التصحيح"), CancellationToken.None);
        resolve.Should().BeOfType<NoContentResult>();
        var resolved = await db.ErrorReports.SingleAsync(item => item.Id == report.Id);
        resolved.Status.Should().Be(ErrorReportStatus.Resolved);
        resolved.ResolvedBy.Should().Be(admin.Id);
        resolved.ResolvedAt.Should().NotBeNull();
        resolved.ResolutionNotes.Should().Be("تم التصحيح");

        var reject = await controller.RejectReport(report.Id, new ResolveErrorReportDto(null), CancellationToken.None);
        reject.Should().BeOfType<NoContentResult>();
        var rejected = await db.ErrorReports.SingleAsync(item => item.Id == report.Id);
        rejected.Status.Should().Be(ErrorReportStatus.Rejected);
        rejected.ResolvedBy.Should().Be(admin.Id);
    }

    [Fact]
    public async Task BulkPublish_And_BulkArchive_TransitionStatuses()
    {
        using var db = TestDbHelper.CreateInMemoryContext();
        var admin = db.Admins.First();
        var controller = BuildController(db, admin.Id);

        // Seed draft question (the seeded fixture questions are Published).
        var draft = Question.Create("سؤال مسودة للنشر الجماعي", QuestionType.Mcq, TestDbHelper.GetTestSubject(db).Id, null, Difficulty.Easy, new List<string>(), admin.Id);
        draft.AddOption("خيار 1", true);
        draft.AddOption("خيار 2", false);
        draft.UpdateExplanation("شرح مطلوب للنشر");
        db.Questions.Add(draft);
        var archiveTarget = TestDbHelper.GetTestQuestion(db);
        await db.SaveChangesAsync();

        var publish = await controller.BulkPublish(new BulkQuestionActionDto(new List<Guid> { draft.Id }), CancellationToken.None);
        var publishDto = publish.Result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<BulkQuestionResultDto>().Subject;
        publishDto.Succeeded.Should().Be(1);
        (await db.Questions.SingleAsync(item => item.Id == draft.Id)).Status.Should().Be(ContentStatus.Published);

        var archive = await controller.BulkArchive(new BulkQuestionActionDto(new List<Guid> { archiveTarget.Id }), CancellationToken.None);
        var archiveDto = archive.Result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<BulkQuestionResultDto>().Subject;
        archiveDto.Succeeded.Should().Be(1);
        (await db.Questions.SingleAsync(item => item.Id == archiveTarget.Id)).Status.Should().Be(ContentStatus.Archived);

        // Unknown ids are reported as not-found, never crash the batch.
        var mixed = await controller.BulkPublish(new BulkQuestionActionDto(new List<Guid> { Guid.NewGuid() }), CancellationToken.None);
        var mixedDto = mixed.Result.Should().BeOfType<OkObjectResult>().Subject.Value.Should().BeOfType<BulkQuestionResultDto>().Subject;
        mixedDto.NotFoundIds.Should().HaveCount(1);
    }
}
