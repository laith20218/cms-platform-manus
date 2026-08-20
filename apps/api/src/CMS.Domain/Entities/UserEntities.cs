using CMS.Domain.Common;
using CMS.Domain.Enums;
using CMS.Domain.Exceptions;

namespace CMS.Domain.Entities;

/// <summary>
/// Student entity - primary user of the platform.
/// </summary>
public class Student : BaseEntity
{
    public string Phone { get; private set; } = string.Empty;
    public string PhoneNormalized { get; private set; } = string.Empty;
    public string PasswordHash { get; private set; } = string.Empty;
    public string FullName { get; private set; } = string.Empty;
    public string? AvatarUrl { get; private set; }

    // Academic info
    public Guid? UniversityId { get; private set; }
    public Guid? CollegeId { get; private set; }
    public Guid? AcademicYearId { get; private set; }

    // Optional info
    public string? Email { get; private set; }
    public string? Gender { get; private set; }
    public DateTime? BirthDate { get; private set; }

    // Status
    public StudentStatus Status { get; private set; } = StudentStatus.Active;
    public string? BanReason { get; private set; }
    public DateTime? BanUntil { get; private set; }

    // Verification
    public DateTime? PhoneVerifiedAt { get; private set; }
    public string? OtpCode { get; private set; }
    public DateTime? OtpExpiresAt { get; private set; }

    // Authentication abuse controls
    public int FailedLoginCount { get; private set; }
    public DateTime? LockoutUntil { get; private set; }

    // Denormalized stats
    public DateTime? LastLogin { get; private set; }
    public int LoginCount { get; private set; }
    public int QuestionsAnswered { get; private set; }
    public int CorrectAnswers { get; private set; }
    public int CurrentStreak { get; private set; }
    public int LongestStreak { get; private set; }
    public DateTime? LastActivityDate { get; private set; }

    // Preferences (JSON)
    public string Preferences { get; private set; } = """{"theme":"light","notifications":true,"sounds":true,"vibration":true}""";

    public DateTime? DeletedAt { get; set; }

    // Navigation
    public University? University { get; private set; }
    public College? College { get; private set; }
    public AcademicYear? AcademicYear { get; private set; }
    public ICollection<StudentSubscription> Subscriptions { get; private set; } = new List<StudentSubscription>();
    public ICollection<DeviceBinding> DeviceBindings { get; private set; } = new List<DeviceBinding>();
    public ICollection<AttemptLog> AttemptLogs { get; private set; } = new List<AttemptLog>();
    public ICollection<Favorite> Favorites { get; private set; } = new List<Favorite>();

    public static Student Create(string phone, string passwordHash, string fullName)
    {
        if (string.IsNullOrWhiteSpace(phone))
            throw new DomainException("Phone is required");
        if (string.IsNullOrWhiteSpace(passwordHash))
            throw new DomainException("Password hash is required");
        if (string.IsNullOrWhiteSpace(fullName))
            throw new DomainException("Full name is required");

        var normalized = NormalizePhone(phone);

        return new Student
        {
            Phone = phone,
            PhoneNormalized = normalized,
            PasswordHash = passwordHash,
            FullName = fullName
        };
    }

    public void SetAcademicInfo(Guid universityId, Guid collegeId, Guid academicYearId)
    {
        UniversityId = universityId;
        CollegeId = collegeId;
        AcademicYearId = academicYearId;
        UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateProfile(string? fullName, string? avatarUrl, string? gender)
    {
        if (!string.IsNullOrWhiteSpace(fullName))
            FullName = fullName;
        if (avatarUrl != null)
            AvatarUrl = avatarUrl;
        if (!string.IsNullOrWhiteSpace(gender))
            Gender = gender;
        UpdatedAt = DateTime.UtcNow;
    }

    public void ChangePasswordHash(string passwordHash)
    {
        if (string.IsNullOrWhiteSpace(passwordHash))
            throw new DomainException("Password hash is required");
        PasswordHash = passwordHash;
        UpdatedAt = DateTime.UtcNow;
    }

    public void VerifyPhone()
    {
        PhoneVerifiedAt = DateTime.UtcNow;
        OtpCode = null;
        OtpExpiresAt = null;
    }

    public void SetOtp(string otp, int expiryMinutes = 5)
    {
        OtpCode = otp;
        OtpExpiresAt = DateTime.UtcNow.AddMinutes(expiryMinutes);
    }

    public bool IsOtpValid(string otp)
    {
        return OtpCode == otp && OtpExpiresAt > DateTime.UtcNow;
    }

    public bool IsLockedOut() => LockoutUntil.HasValue && LockoutUntil > DateTime.UtcNow;

    public void RegisterFailedLogin(int maximumAttempts, int lockoutMinutes)
    {
        FailedLoginCount++;
        if (FailedLoginCount >= Math.Clamp(maximumAttempts, 3, 10))
        {
            LockoutUntil = DateTime.UtcNow.AddMinutes(Math.Clamp(lockoutMinutes, 1, 60));
            FailedLoginCount = 0;
        }
        UpdatedAt = DateTime.UtcNow;
    }

    public void ClearLoginFailures()
    {
        FailedLoginCount = 0;
        LockoutUntil = null;
        UpdatedAt = DateTime.UtcNow;
    }

    public void RecordLogin()
    {
        LastLogin = DateTime.UtcNow;
        LoginCount++;
    }

    public void RecordActivity()
    {
        var today = DateTime.UtcNow.Date;
        if (LastActivityDate == today)
        {
            // Already active today, no streak change
        }
        else if (LastActivityDate == today.AddDays(-1))
        {
            CurrentStreak++;
            if (CurrentStreak > LongestStreak)
                LongestStreak = CurrentStreak;
        }
        else
        {
            CurrentStreak = 1;
        }
        LastActivityDate = today;
    }

    public void RecordAnswer(bool isCorrect)
    {
        QuestionsAnswered++;
        if (isCorrect)
            CorrectAnswers++;
    }

    public double GetAccuracy()
    {
        return QuestionsAnswered == 0 ? 0 : (double)CorrectAnswers / QuestionsAnswered * 100;
    }

    public void Ban(string reason, DateTime? until)
    {
        Status = StudentStatus.Banned;
        BanReason = reason;
        BanUntil = until;
    }

    public void Unban()
    {
        Status = StudentStatus.Active;
        BanReason = null;
        BanUntil = null;
    }

    public bool IsBanned()
    {
        return Status == StudentStatus.Banned && (BanUntil == null || BanUntil > DateTime.UtcNow);
    }

    public bool HasActiveSubscription()
    {
        return Subscriptions.Any(s => s.Status == SubscriptionStatus.Active && s.ExpiresAt > DateTime.UtcNow);
    }

    private static string NormalizePhone(string phone)
    {
        // Convert Syrian numbers to +963 format
        if (phone.StartsWith("09"))
            return "+963" + phone.Substring(1);
        if (phone.StartsWith("9"))
            return "+963" + phone;
        return phone;
    }
}

/// <summary>
/// Admin entity - manages the platform.
/// </summary>
public class Admin : BaseEntity
{
    public string Email { get; private set; } = string.Empty;
    public string PasswordHash { get; private set; } = string.Empty;
    public string FullName { get; private set; } = string.Empty;
    public string? AvatarUrl { get; private set; }
    public string? Phone { get; private set; }

    // Role & Permissions
    public Guid RoleId { get; private set; }

    // 2FA
    public bool TwoFactorEnabled { get; private set; }
    public string? TwoFactorSecret { get; private set; }
    public string? RecoveryCodes { get; private set; }

    // Scope (for scoped admins)
    public Guid? ScopeUniversityId { get; private set; }
    public Guid? ScopeCollegeId { get; private set; }
    public Guid? ScopeYearId { get; private set; }
    public Guid? ScopeSubjectId { get; private set; }

    // Status
    public AdminStatus Status { get; private set; } = AdminStatus.Active;

    // Activity
    public DateTime? LastLogin { get; private set; }
    public int LoginCount { get; private set; }

    public DateTime? DeletedAt { get; set; }

    // Navigation
    public AdminRole Role { get; private set; } = null!;

    public static Admin Create(string email, string passwordHash, string fullName, Guid roleId)
    {
        if (string.IsNullOrWhiteSpace(email))
            throw new DomainException("Email is required");
        if (string.IsNullOrWhiteSpace(passwordHash))
            throw new DomainException("Password hash is required");

        return new Admin
        {
            Email = email.ToLowerInvariant(),
            PasswordHash = passwordHash,
            FullName = fullName,
            RoleId = roleId
        };
    }

    public void SetScope(Guid? universityId, Guid? collegeId, Guid? yearId, Guid? subjectId)
    {
        ScopeUniversityId = universityId;
        ScopeCollegeId = collegeId;
        ScopeYearId = yearId;
        ScopeSubjectId = subjectId;
        UpdatedAt = DateTime.UtcNow;
    }

    public void AssignRole(Guid roleId)
    {
        if (roleId == Guid.Empty)
            throw new DomainException("Role is required");

        RoleId = roleId;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Enable2FA(string secret, string recoveryCodes)
    {
        TwoFactorEnabled = true;
        TwoFactorSecret = secret;
        RecoveryCodes = recoveryCodes;
    }

    public void RecordLogin()
    {
        LastLogin = DateTime.UtcNow;
        LoginCount++;
    }

    public bool IsSuperAdmin()
    {
        return Role?.Name == "super_admin";
    }
}

/// <summary>
/// Admin role entity.
/// </summary>
public class AdminRole : BaseEntity
{
    public string Name { get; private set; } = string.Empty;
    public string NameAr { get; private set; } = string.Empty;
    public string? Description { get; private set; }
    public bool IsSystem { get; private set; }

    public ICollection<Admin> Admins { get; private set; } = new List<Admin>();
    public ICollection<AdminPermission> Permissions { get; private set; } = new List<AdminPermission>();

    public static AdminRole Create(string name, string nameAr, string? description = null, bool isSystem = false)
    {
        return new AdminRole
        {
            Name = name,
            NameAr = nameAr,
            Description = description,
            IsSystem = isSystem
        };
    }

    public void ReplacePermissions(IEnumerable<AdminPermission> permissions)
    {
        Permissions.Clear();
        foreach (var permission in permissions)
            Permissions.Add(permission);
        UpdatedAt = DateTime.UtcNow;
    }
}

/// <summary>
/// Admin permission entity - defines what actions a role can perform on a resource.
/// </summary>
public class AdminPermission : BaseEntity
{
    public Guid RoleId { get; private set; }
    public string Resource { get; private set; } = string.Empty;
    public string Actions { get; private set; } = "[]"; // JSON array
    public string Scope { get; private set; } = "own"; // own | all

    public AdminRole Role { get; private set; } = null!;

    public static AdminPermission Create(Guid roleId, string resource, string actions, string scope = "own")
    {
        return new AdminPermission
        {
            RoleId = roleId,
            Resource = resource,
            Actions = actions,
            Scope = scope
        };
    }
}
