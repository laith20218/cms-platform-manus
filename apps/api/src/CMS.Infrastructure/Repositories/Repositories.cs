using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Infrastructure.Persistence;

namespace CMS.Infrastructure.Repositories;

/// <summary>
/// Generic repository implementation.
/// </summary>
public class Repository<T> : IRepository<T> where T : class
{
    protected readonly ApplicationDbContext _context;
    protected readonly DbSet<T> _dbSet;

    public Repository(ApplicationDbContext context)
    {
        _context = context;
        _dbSet = context.Set<T>();
    }

    public async Task<T?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        return await _dbSet.FindAsync(new object[] { id }, ct);
    }

    public async Task<List<T>> GetAllAsync(CancellationToken ct = default)
    {
        return await _dbSet.AsNoTracking().ToListAsync(ct);
    }

    public async Task AddAsync(T entity, CancellationToken ct = default)
    {
        await _dbSet.AddAsync(entity, ct);
    }

    public void Update(T entity)
    {
        _dbSet.Update(entity);
    }

    public void Remove(T entity)
    {
        _dbSet.Remove(entity);
    }
}

/// <summary>
/// Question repository with specialized queries.
/// </summary>
public class QuestionRepository : IQuestionRepository
{
    private readonly ApplicationDbContext _context;

    public QuestionRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<Question?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        return await _context.Questions
            .FirstOrDefaultAsync(q => q.Id == id, ct);
    }

    public async Task<Question?> GetByIdWithOptionsAsync(Guid id, CancellationToken ct = default)
    {
        return await _context.Questions
            .Include(q => q.Options)
            .Include(q => q.Images)
            .Include(q => q.Subject)
            .Include(q => q.Lecture)
            .FirstOrDefaultAsync(q => q.Id == id, ct);
    }

    public async Task<(List<Question> Items, int Total)> GetBySubjectAsync(
        Guid subjectId,
        int page,
        int pageSize,
        string? difficulty = null,
        string? search = null,
        CancellationToken ct = default)
    {
        var query = _context.Questions
            .Where(q => q.SubjectId == subjectId && q.Status == Domain.Enums.ContentStatus.Published);

        if (!string.IsNullOrEmpty(difficulty) && Enum.TryParse<Domain.Enums.Difficulty>(difficulty, ignoreCase: true, out var diff))
        {
            query = query.Where(q => q.Difficulty == diff);
        }

        if (!string.IsNullOrEmpty(search))
        {
            query = query.Where(q => q.Text.Contains(search));
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(q => q.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .AsNoTracking()
            .ToListAsync(ct);

        return (items, total);
    }

    public async Task<List<Question>> GetByLectureAsync(Guid lectureId, CancellationToken ct = default)
    {
        return await _context.Questions
            .Where(q => q.LectureId == lectureId && q.Status == Domain.Enums.ContentStatus.Published)
            .OrderBy(q => q.CreatedAt)
            .AsNoTracking()
            .ToListAsync(ct);
    }

    public async Task<List<Question>> GetByExamAsync(Guid examId, CancellationToken ct = default)
    {
        return await _context.Questions
            .Where(q => q.ExamId == examId && q.Status == Domain.Enums.ContentStatus.Published)
            .OrderBy(q => q.CreatedAt)
            .AsNoTracking()
            .ToListAsync(ct);
    }

    public async Task AddAsync(Question question, CancellationToken ct = default)
    {
        await _context.Questions.AddAsync(question, ct);
    }

    public async Task UpdateAsync(Question question, CancellationToken ct = default)
    {
        _context.Questions.Update(question);
        await Task.CompletedTask;
    }

    public async Task SoftDeleteAsync(Guid questionId, Guid deletedBy, CancellationToken ct = default)
    {
        var question = await _context.Questions.FindAsync(new object[] { questionId }, ct);
        if (question != null)
        {
            question.SoftDelete(deletedBy);
        }
    }

    public async Task<int> CountBySubjectAsync(Guid subjectId, CancellationToken ct = default)
    {
        return await _context.Questions
            .CountAsync(q => q.SubjectId == subjectId && q.Status == Domain.Enums.ContentStatus.Published, ct);
    }
}

/// <summary>
/// Student repository.
/// </summary>
public class StudentRepository : IStudentRepository
{
    private readonly ApplicationDbContext _context;

    public StudentRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<Student?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        return await _context.Students.FirstOrDefaultAsync(s => s.Id == id, ct);
    }

    public async Task<Student?> GetByPhoneAsync(string phoneNormalized, CancellationToken ct = default)
    {
        return await _context.Students.FirstOrDefaultAsync(s => s.PhoneNormalized == phoneNormalized, ct);
    }

    public async Task<bool> PhoneExistsAsync(string phoneNormalized, CancellationToken ct = default)
    {
        return await _context.Students.AnyAsync(s => s.PhoneNormalized == phoneNormalized, ct);
    }

    public async Task AddAsync(Student student, CancellationToken ct = default)
    {
        await _context.Students.AddAsync(student, ct);
    }

    public async Task UpdateAsync(Student student, CancellationToken ct = default)
    {
        _context.Students.Update(student);
        await Task.CompletedTask;
    }

    public async Task<List<Student>> GetActiveAsync(int page, int pageSize, CancellationToken ct = default)
    {
        return await _context.Students
            .Where(s => s.Status == Domain.Enums.StudentStatus.Active)
            .OrderByDescending(s => s.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .AsNoTracking()
            .ToListAsync(ct);
    }
}

/// <summary>
/// Unit of Work for transactional operations.
/// </summary>
public class UnitOfWork : IUnitOfWork
{
    private readonly ApplicationDbContext _context;
    private bool _disposed;

    public UnitOfWork(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        return await _context.SaveChangesAsync(ct);
    }

    public async Task BeginTransactionAsync(CancellationToken ct = default)
    {
        await _context.Database.BeginTransactionAsync(ct);
    }

    public async Task CommitTransactionAsync(CancellationToken ct = default)
    {
        await _context.Database.CommitTransactionAsync(ct);
    }

    public async Task RollbackTransactionAsync(CancellationToken ct = default)
    {
        await _context.Database.RollbackTransactionAsync(ct);
    }

    protected virtual void Dispose(bool disposing)
    {
        if (!_disposed && disposing)
        {
            _context.Dispose();
        }
        _disposed = true;
    }

    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }
}


/// <summary>
/// Subscription-code repository with scoped, read-only lookup operations.
/// </summary>
public class SubscriptionCodeRepository : ISubscriptionCodeRepository
{
    private readonly ApplicationDbContext _context;

    public SubscriptionCodeRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public Task<SubscriptionCode?> GetByCodeAsync(string code, CancellationToken ct = default)
    {
        return _context.SubscriptionCodes
            .FirstOrDefaultAsync(c => c.Code == code, ct);
    }

    public Task<List<SubscriptionCode>> GetByBatchAsync(Guid batchId, CancellationToken ct = default)
    {
        return _context.SubscriptionCodes
            .Where(c => c.BatchId == batchId)
            .OrderByDescending(c => c.CreatedAt)
            .AsNoTracking()
            .ToListAsync(ct);
    }

    public async Task AddAsync(SubscriptionCode code, CancellationToken ct = default)
    {
        await _context.SubscriptionCodes.AddAsync(code, ct);
    }

    public async Task AddRangeAsync(List<SubscriptionCode> codes, CancellationToken ct = default)
    {
        await _context.SubscriptionCodes.AddRangeAsync(codes, ct);
    }

    public Task<int> CountActiveBySubjectAsync(Guid subjectId, CancellationToken ct = default)
    {
        return _context.SubscriptionCodes.CountAsync(
            c => c.ScopeSubjectId == subjectId && c.Status == Domain.Enums.CodeStatus.Active,
            ct);
    }
}
