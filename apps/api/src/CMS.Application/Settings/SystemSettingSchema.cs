using CMS.Domain.Exceptions;

namespace CMS.Application.Settings;

/// <summary>
/// Per-key schema entry: how a registered setting's value must be shaped before it is
/// accepted (ValueType + bounds + enum membership + length caps). Mirrors
/// <see cref="SystemSettingDefaults"/> keys; unregistered keys stay plain strings with
/// the existing 2000-character cap (legacy behavior preserved).
/// </summary>
public sealed record SystemSettingSchemaEntry(
    string ValueType,
    int? Min,
    int? Max,
    string[]? AllowedValues,
    int? MaxLength
);

/// <summary>
/// PR-7 (Settings + Role Studio): typed validation registry for the seeded system settings.
/// <see cref="Validate"/> runs on BOTH update and reset before any mutation so a malformed
/// value can never reach the settings consumers (the previous surface accepted arbitrary
/// strings for typed settings like max_login_attempts). Failures raise
/// <see cref="DomainException"/> code SETTING_VALUE_INVALID with the Arabic detail
/// "قيمة الإعداد غير صالحة" — mapped to RFC 7807 ProblemDetails by the exception middleware.
/// </summary>
public static class SystemSettingSchema
{
    /// <summary>Value type names surfaced to the UI ("bool" | "int" | "enum" | "string").</summary>
    public const string BoolType = "bool";
    public const string IntType = "int";
    public const string EnumType = "enum";
    public const string StringType = "string";

    private static readonly IReadOnlyDictionary<string, SystemSettingSchemaEntry> Entries =
        new Dictionary<string, SystemSettingSchemaEntry>
        {
            ["default_language"] = new(EnumType, Min: null, Max: null, AllowedValues: ["ar", "en"], MaxLength: null),
            ["maintenance_mode"] = new(BoolType, Min: null, Max: null, AllowedValues: null, MaxLength: null),
            ["enable_offline_mode"] = new(BoolType, Min: null, Max: null, AllowedValues: null, MaxLength: null),
            ["enable_watermark"] = new(BoolType, Min: null, Max: null, AllowedValues: null, MaxLength: null),
            ["max_login_attempts"] = new(IntType, Min: 3, Max: 10, AllowedValues: null, MaxLength: null),
            ["otp_expiry_minutes"] = new(IntType, Min: 1, Max: 30, AllowedValues: null, MaxLength: null),
            ["session_timeout_minutes"] = new(IntType, Min: 5, Max: 120, AllowedValues: null, MaxLength: null),
            ["platform_name"] = new(StringType, Min: null, Max: null, AllowedValues: null, MaxLength: 200),
            ["platform_name_ar"] = new(StringType, Min: null, Max: null, AllowedValues: null, MaxLength: 200),
            ["platform_version"] = new(StringType, Min: null, Max: null, AllowedValues: null, MaxLength: 200),
            ["default_timezone"] = new(StringType, Min: null, Max: null, AllowedValues: null, MaxLength: 64),
        };

    /// <summary>True when the key has a registered typed schema entry.</summary>
    public static bool IsRegistered(string key) => Entries.ContainsKey(key);

    /// <summary>The schema entry for a registered key; null for unregistered keys.</summary>
    public static SystemSettingSchemaEntry? TryGetEntry(string key) =>
        Entries.TryGetValue(key, out var entry) ? entry : null;

    /// <summary>
    /// The set of registered keys (the schema mirrors <see cref="SystemSettingDefaults"/>).
    /// </summary>
    public static IReadOnlyList<string> Keys => [.. Entries.Keys];

    /// <summary>
    /// Validates a candidate value for a key. Registered keys are typed-checked (bool/int
    /// parse failures, int bounds, enum membership, string length caps); unregistered keys
    /// pass through unchanged (the controller keeps the existing 2000-char cap for them).
    /// Throws <see cref="DomainException"/> (SETTING_VALUE_INVALID) on violation.
    /// </summary>
    public static void Validate(string key, string value)
    {
        if (!Entries.TryGetValue(key, out var entry))
            return; // Unregistered key: legacy plain-string behavior (2000-char cap upstream).

        switch (entry.ValueType)
        {
            case BoolType:
                if (!bool.TryParse(value, out _))
                    throw InvalidValue();
                break;

            case IntType:
                if (!int.TryParse(value, out var number))
                    throw InvalidValue();
                if ((entry.Min.HasValue && number < entry.Min.Value) ||
                    (entry.Max.HasValue && number > entry.Max.Value))
                    throw InvalidValue();
                break;

            case EnumType:
                if (entry.AllowedValues is null || entry.AllowedValues.Length == 0 ||
                    !entry.AllowedValues.Contains(value, StringComparer.Ordinal))
                    throw InvalidValue();
                break;

            case StringType:
                if (entry.MaxLength.HasValue && value.Length > entry.MaxLength.Value)
                    throw InvalidValue();
                break;
        }
    }

    private static DomainException InvalidValue() =>
        new("قيمة الإعداد غير صالحة", "SETTING_VALUE_INVALID");
}
