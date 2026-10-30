using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using CMS.Application.Commands.Library;
using CMS.Application.DTOs.Library;
using CMS.Application.Interfaces;
using CMS.Domain.Entities;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Application.Handlers.Library;

/// <summary>
/// Wave 11.8 / F2 — student PDF annotations: read the caller's own annotations for
/// one file and apply an idempotent batch (client-id-keyed upserts + owned deletes)
/// in a single commit.
///
/// Ownership model: rows are strictly per-student. Every read/write is scoped by
/// StudentId — a delete id that belongs to another student is silently ignored, and
/// an upsert whose client id collides with another student's row simply inserts a
/// new row for the caller (ids only key rows their owner created).
///
/// Conflict strategy: last-write-wins per annotation. The only same-content writer
/// is the same student on another device; the UpdatedAt returned by GET lets a
/// device detect that its local version lost.
///
/// Visibility gate mirrors /access: only live (not deleted), Published, virus-clean
/// files expose an annotation surface — an archived or infected file loses its
/// annotation surface together with its reading surface.
/// </summary>
public class FileAnnotationHandlers :
    IRequestHandler<GetFileAnnotationsQuery, List<FileAnnotationDto>>,
    IRequestHandler<SaveFileAnnotationsCommand, SaveFileAnnotationsResultDto>
{
    private const int MaxUpsertsPerBatch = 200;
    private const int MaxDeletesPerBatch = 200;
    private const int MaxPayloadChars = 8192;

    private readonly IApplicationDbContext _db;
    private readonly IUnitOfWork _unitOfWork;

    public FileAnnotationHandlers(IApplicationDbContext db, IUnitOfWork unitOfWork)
    {
        _db = db;
        _unitOfWork = unitOfWork;
    }

    public async Task<List<FileAnnotationDto>> Handle(GetFileAnnotationsQuery req, CancellationToken ct)
    {
        await EnsureReadableFileAsync(req.FileId, ct);

        // Materialize first, map in memory: the jsonb payload must be deserialized
        // client-side (EF cannot translate a JsonElement projection).
        var rows = await _db.FileAnnotations.AsNoTracking()
            .Where(a => a.FileId == req.FileId && a.StudentId == req.StudentId)
            .OrderBy(a => a.PageNumber).ThenBy(a => a.CreatedAt)
            .ToListAsync(ct);

        return rows.Select(a => new FileAnnotationDto(
            a.Id,
            a.PageNumber,
            a.AnnotationType.ToString(),
            JsonSerializer.Deserialize<JsonElement>(a.Payload),
            a.CreatedAt,
            a.UpdatedAt
        )).ToList();
    }

    public async Task<SaveFileAnnotationsResultDto> Handle(SaveFileAnnotationsCommand req, CancellationToken ct)
    {
        var upserts = req.Batch?.Upserts ?? new List<FileAnnotationUpsertDto>();
        var deletedIds = req.Batch?.DeletedIds ?? new List<Guid>();

        if (upserts.Count > MaxUpsertsPerBatch)
            throw new DomainException($"لا يمكن حفظ أكثر من {MaxUpsertsPerBatch} تعليقاً في الدفعة الواحدة", "ANNOTATION_BATCH_TOO_LARGE");
        if (deletedIds.Count > MaxDeletesPerBatch)
            throw new DomainException($"لا يمكن حذف أكثر من {MaxDeletesPerBatch} تعليقاً في الدفعة الواحدة", "ANNOTATION_BATCH_TOO_LARGE");
        if (upserts.Select(u => u.Id).Distinct().Count() != upserts.Count)
            throw new DomainException("الدفعة تحتوي على معرّفات مكرّرة", "ANNOTATION_DUPLICATE_ID");

        await EnsureReadableFileAsync(req.FileId, ct);

        // Validate every upsert BEFORE touching the change tracker — a rejected batch
        // must leave zero partial writes.
        foreach (var upsert in upserts)
        {
            if (upsert.Id == Guid.Empty)
                throw new DomainException("معرّف التعليق غير صالح", "INVALID_ANNOTATION_ID");
            if (upsert.PageNumber < 1)
                throw new DomainException("رقم الصفحة غير صالح", "INVALID_ANNOTATION_PAGE");
            if (!Enum.TryParse<FileAnnotationType>(upsert.AnnotationType, true, out _))
                throw new DomainException("نوع التعليق غير صالح", "INVALID_ANNOTATION_TYPE");
            if (upsert.Payload.ValueKind != JsonValueKind.Object)
                throw new DomainException("شكل التعليق غير صالح", "INVALID_ANNOTATION_PAYLOAD");
            if (upsert.Payload.GetRawText().Length > MaxPayloadChars)
                throw new DomainException("حجم التعليق يتجاوز الحد المسموح", "ANNOTATION_PAYLOAD_TOO_LARGE");
        }

        var existing = await _db.FileAnnotations
            .Where(a => a.FileId == req.FileId && a.StudentId == req.StudentId)
            .ToListAsync(ct);
        var existingById = existing.ToDictionary(a => a.Id);

        var applied = 0;
        foreach (var upsert in upserts)
        {
            var payloadJson = upsert.Payload.GetRawText();
            var type = Enum.Parse<FileAnnotationType>(upsert.AnnotationType, true);

            if (existingById.TryGetValue(upsert.Id, out var row))
            {
                if (row.PageNumber != upsert.PageNumber || row.AnnotationType != type || row.Payload != payloadJson)
                {
                    row.PageNumber = upsert.PageNumber;
                    row.AnnotationType = type;
                    row.Payload = payloadJson;
                    applied++;
                }
            }
            else
            {
                _db.FileAnnotations.Add(new FileAnnotation(
                    upsert.Id, req.FileId, req.StudentId, upsert.PageNumber, type, payloadJson));
                applied++;
            }
        }

        // Owner-scoped by construction: `existing` only contains this student's rows,
        // so a foreign delete id can never match anything.
        var deletedLookup = deletedIds.ToHashSet();
        var rowsToDelete = existing.Where(a => deletedLookup.Contains(a.Id)).ToList();
        if (rowsToDelete.Count > 0)
        {
            _db.FileAnnotations.RemoveRange(rowsToDelete);
            applied += rowsToDelete.Count;
        }

        await _unitOfWork.SaveChangesAsync(ct);
        return new SaveFileAnnotationsResultDto(applied, DateTime.UtcNow);
    }

    /// <summary>Same visibility rules the /access endpoint enforces for reading bytes.</summary>
    private async Task EnsureReadableFileAsync(Guid fileId, CancellationToken ct)
    {
        var fileExists = await _db.LibraryFiles.AsNoTracking()
            .AnyAsync(f => f.Id == fileId && f.DeletedAt == null
                && f.Status == ContentStatus.Published
                && f.VirusScanStatus == VirusScanStatus.Clean, ct);
        if (!fileExists)
            throw new NotFoundException("LibraryFile", fileId);
    }
}
