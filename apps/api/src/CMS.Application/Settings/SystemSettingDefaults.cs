namespace CMS.Application.Settings;

/// <summary>
/// PR-7 (Settings + Role Studio): server-side registry of factory defaults for the seeded
/// system settings. Reset restores from THIS table — the client-supplied DefaultValue is
/// deliberately ignored (it was a client-trusted value: any caller could "reset" a setting
/// to an arbitrary value of its choosing). Values mirror deploy/seed/seed-production.sql
/// section 9 exactly; keys without an entry here have no registered default and reset 404s.
/// </summary>
public static class SystemSettingDefaults
{
    /// <summary>
    /// The 11 seeded keys and their factory values (seed-production.sql section 9).
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> Values = new Dictionary<string, string>
    {
        ["platform_name"] = "CMS - College Medical System",
        ["platform_name_ar"] = "منصة CMS الطبية",
        ["default_language"] = "ar",
        ["default_timezone"] = "Asia/Riyadh",
        ["maintenance_mode"] = "false",
        ["max_login_attempts"] = "5",
        ["otp_expiry_minutes"] = "5",
        ["session_timeout_minutes"] = "15",
        ["enable_offline_mode"] = "true",
        ["enable_watermark"] = "true",
        ["platform_version"] = "1.0.0",
    };
}
