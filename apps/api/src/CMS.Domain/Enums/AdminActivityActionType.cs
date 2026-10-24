namespace CMS.Domain.Enums;

/// <summary>
/// Push 2 / Track 2: the administrative actions tracked by the activity monitor.
/// One row per completed action — ghost/abandoned attempts are never logged
/// (e.g. uploads are logged at complete-upload, not at upload-url issuance).
/// </summary>
public enum AdminActivityActionType
{
    /// <summary>إنشاء سؤال — a question was created (draft or published).</summary>
    CreateQuestion = 1,

    /// <summary>رفع ملف — a library file upload was completed and verified.</summary>
    UploadFile = 2,

    /// <summary>توليد أكواد — a batch of subscription codes was generated.</summary>
    GenerateCode = 3
}
