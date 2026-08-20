using Microsoft.EntityFrameworkCore;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Infrastructure.Persistence;

namespace CMS.Tests.Helpers;

/// <summary>
/// Test helper for creating in-memory database context.
/// </summary>
public static class TestDbHelper
{
    public static ApplicationDbContext CreateInMemoryContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;

        var context = new ApplicationDbContext(options);
        SeedTestData(context);
        return context;
    }

    public static void SeedTestData(ApplicationDbContext db)
    {
        // University
        var uni = University.Create("جامعة حمص", "homs-university", "Homs University");
        db.Universities.Add(uni);

        // College
        var college = College.Create(uni.Id, "الطب البشري", "medicine", "Medicine");
        db.Colleges.Add(college);

        // Year
        var year = AcademicYear.Create(college.Id, "السنة الثالثة", "third-year", 3);
        db.AcademicYears.Add(year);

        // Semester
        var sem = Semester.Create(year.Id, "الفصل الأول", "first-semester", 1);
        db.Semesters.Add(sem);

        // Subject
        var subject = Subject.Create(sem.Id, "الباطنة", "internal-medicine", "Internal Medicine");
        db.Subjects.Add(subject);

        // Student
        var student = Student.Create("0991234567", "hashed_password_123", "أحمد العبد الله");
        student.SetAcademicInfo(uni.Id, college.Id, year.Id);
        student.VerifyPhone();
        db.Students.Add(student);

        // Admin Role
        var role = AdminRole.Create("super_admin", "مدير عام", "صلاحيات كاملة", true);
        db.AdminRoles.Add(role);

        // Admin
        var admin = Admin.Create("admin@cms.example.com", "hashed_admin_pass", "Super Admin", role.Id);
        db.Admins.Add(admin);

        // Questions
        var question1 = Question.Create(
            "ما هو التشخيص الأكثر احتمالاً لمريض يعاني من ألم صدري ضاغط؟",
            QuestionType.Mcq, subject.Id, null, Difficulty.Medium,
            new List<string> { "cardiology" }, admin.Id
        );
        question1.AddOption("ذبحة صدرية مستقرة", false);
        question1.AddOption("احتشاء عضلة القلب", true);
        question1.AddOption("التهاب التامور", false);
        question1.AddOption("تمزق الأبهر", false);
        question1.UpdateExplanation("الألم الصدري الضاغط المستمر > 20 دقيقة هو عرض كلاسيكي لاحتشاء عضلة القلب.");
        question1.SetReference("ديفيدسون ص. 245");
        question1.Publish();
        db.Questions.Add(question1);

        var question2 = Question.Create(
            "أي مما يلي يعتبر عامل خطر للسكري النوع الثاني؟",
            QuestionType.Mcq, subject.Id, null, Difficulty.Easy,
            new List<string> { "endocrinology" }, admin.Id
        );
        question2.AddOption("السمنة", true);
        question2.AddOption("الطول القصير", false);
        question2.AddOption("العرق الزائد", false);
        question2.AddOption("كثرة النوم", false);
        question2.UpdateExplanation("السمنة هي أهم عوامل الخطر للسكري النوع الثاني.");
        question2.Publish();
        db.Questions.Add(question2);

        // Lecture
        var lecture = Lecture.Create(subject.Id, "محاضرة 1: مقدمة", "lecture-1", 1);
        db.Lectures.Add(lecture);

        // Exam
        var exam = Exam.Create(subject.Id, "دورة 2024 النهائية", "2024-final", 2024, admin.Id);
        exam.Publish();
        db.Exams.Add(exam);

        db.SaveChanges();
    }

    public static Question GetTestQuestion(ApplicationDbContext db) =>
        db.Questions.First();

    public static Student GetTestStudent(ApplicationDbContext db) =>
        db.Students.First();

    public static Subject GetTestSubject(ApplicationDbContext db) =>
        db.Subjects.First();
}
