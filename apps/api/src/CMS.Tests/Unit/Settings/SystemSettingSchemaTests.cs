using CMS.Application.Settings;
using CMS.Domain.Exceptions;
using FluentAssertions;

namespace CMS.Tests.Unit.Settings;

/// <summary>
/// PR-7 (Settings + Role Studio): typed validation registry tests — bool/int/enum/string
/// shapes, int bounds, string length caps, unregistered-key passthrough, and the
/// registry-level invariants (the 11 seeded keys exist in BOTH the defaults registry and
/// the schema registry, and every registered default satisfies its own schema).
/// </summary>
public class SystemSettingSchemaTests
{
    // ===== Bool keys =====

    [Theory]
    [InlineData("maintenance_mode", "true")]
    [InlineData("maintenance_mode", "false")]
    [InlineData("maintenance_mode", "True")]
    [InlineData("maintenance_mode", "FALSE")]
    [InlineData("enable_offline_mode", "true")]
    [InlineData("enable_watermark", "false")]
    public void Validate_BoolKey_AcceptsParseableBool(string key, string value)
    {
        var act = () => SystemSettingSchema.Validate(key, value);
        act.Should().NotThrow();
    }

    [Theory]
    [InlineData("maintenance_mode", "enabled")]
    [InlineData("maintenance_mode", "1")]
    [InlineData("maintenance_mode", "yes")]
    [InlineData("enable_offline_mode", "off")]
    [InlineData("enable_watermark", "")]
    public void Validate_BoolKey_UnparseableValue_ThrowsInvalid(string key, string value)
    {
        var act = () => SystemSettingSchema.Validate(key, value);
        act.Should().Throw<DomainException>().Which.ErrorCode.Should().Be("SETTING_VALUE_INVALID");
    }

    // ===== Int keys with bounds =====

    [Theory]
    [InlineData("max_login_attempts", "3")]     // inclusive min
    [InlineData("max_login_attempts", "10")]    // inclusive max
    [InlineData("max_login_attempts", "7")]
    [InlineData("otp_expiry_minutes", "1")]
    [InlineData("otp_expiry_minutes", "30")]
    [InlineData("session_timeout_minutes", "5")]
    [InlineData("session_timeout_minutes", "120")]
    [InlineData("session_timeout_minutes", "45")]
    public void Validate_IntKey_InBounds_Accepts(string key, string value)
    {
        var act = () => SystemSettingSchema.Validate(key, value);
        act.Should().NotThrow();
    }

    [Theory]
    [InlineData("max_login_attempts", "2")]     // below min 3
    [InlineData("max_login_attempts", "11")]    // above max 10
    [InlineData("otp_expiry_minutes", "0")]     // below min 1
    [InlineData("otp_expiry_minutes", "31")]    // above max 30
    [InlineData("session_timeout_minutes", "4")]     // below min 5
    [InlineData("session_timeout_minutes", "121")]    // above max 120
    [InlineData("max_login_attempts", "abc")]   // not an int at all
    [InlineData("otp_expiry_minutes", "5.5")]  // decimal is not an int
    [InlineData("session_timeout_minutes", "")]
    public void Validate_IntKey_OutOfBoundsOrUnparseable_ThrowsInvalid(string key, string value)
    {
        var act = () => SystemSettingSchema.Validate(key, value);
        act.Should().Throw<DomainException>().Which.ErrorCode.Should().Be("SETTING_VALUE_INVALID");
    }

    // ===== Enum key (default_language) =====

    [Theory]
    [InlineData("default_language", "ar")]
    [InlineData("default_language", "en")]
    public void Validate_EnumKey_AllowedValue_Accepts(string key, string value)
    {
        var act = () => SystemSettingSchema.Validate(key, value);
        act.Should().NotThrow();
    }

    [Theory]
    [InlineData("default_language", "fr")]
    [InlineData("default_language", "AR")]     // ordinal match — case is significant
    [InlineData("default_language", "ar-SA")]
    [InlineData("default_language", "")]
    public void Validate_EnumKey_ValueOutsideAllowedSet_ThrowsInvalid(string key, string value)
    {
        var act = () => SystemSettingSchema.Validate(key, value);
        act.Should().Throw<DomainException>().Which.ErrorCode.Should().Be("SETTING_VALUE_INVALID");
    }

    // ===== String keys with length caps =====

    [Fact]
    public void Validate_StringKey_UnderMaxLength_Accepts()
    {
        var act = () => SystemSettingSchema.Validate("platform_name", new string('x', 200));
        act.Should().NotThrow();
    }

    [Fact]
    public void Validate_StringKey_OverMaxLength_ThrowsInvalid()
    {
        var act = () => SystemSettingSchema.Validate("platform_name", new string('x', 201));
        act.Should().Throw<DomainException>().Which.ErrorCode.Should().Be("SETTING_VALUE_INVALID");
    }

    [Fact]
    public void Validate_TimezoneKey_Over64Chars_ThrowsInvalid()
    {
        var act = () => SystemSettingSchema.Validate("default_timezone", new string('x', 65));
        act.Should().Throw<DomainException>().Which.ErrorCode.Should().Be("SETTING_VALUE_INVALID");
    }

    // ===== Unregistered keys keep the legacy plain-string behavior =====

    [Theory]
    [InlineData("max_upload_size_mb", "10")]
    [InlineData("watermark_text", "{student_name}")]
    [InlineData("totally_unknown_key", "any garbage value 🌊")]
    [InlineData("allowed_upload_types", "")]
    public void Validate_UnregisteredKey_PassesThrough(string key, string value)
    {
        var act = () => SystemSettingSchema.Validate(key, value);
        act.Should().NotThrow("unregistered keys keep the pre-PR-7 plain-string behavior (2000-char cap lives at the controller)");
    }

    // ===== Registry-level invariants =====

    [Fact]
    public void Defaults_Registry_ContainsExactlyTheElevenSeededKeysWithSeedValues()
    {
        SystemSettingDefaults.Values.Should().HaveCount(11);
        SystemSettingDefaults.Values.Should().Contain(new KeyValuePair<string, string>("platform_name", "CMS - College Medical System"));
        SystemSettingDefaults.Values.Should().Contain(new KeyValuePair<string, string>("platform_name_ar", "منصة CMS الطبية"));
        SystemSettingDefaults.Values.Should().Contain(new KeyValuePair<string, string>("default_language", "ar"));
        SystemSettingDefaults.Values.Should().Contain(new KeyValuePair<string, string>("default_timezone", "Asia/Riyadh"));
        SystemSettingDefaults.Values.Should().Contain(new KeyValuePair<string, string>("maintenance_mode", "false"));
        SystemSettingDefaults.Values.Should().Contain(new KeyValuePair<string, string>("max_login_attempts", "5"));
        SystemSettingDefaults.Values.Should().Contain(new KeyValuePair<string, string>("otp_expiry_minutes", "5"));
        SystemSettingDefaults.Values.Should().Contain(new KeyValuePair<string, string>("session_timeout_minutes", "15"));
        SystemSettingDefaults.Values.Should().Contain(new KeyValuePair<string, string>("enable_offline_mode", "true"));
        SystemSettingDefaults.Values.Should().Contain(new KeyValuePair<string, string>("enable_watermark", "true"));
        SystemSettingDefaults.Values.Should().Contain(new KeyValuePair<string, string>("platform_version", "1.0.0"));
    }

    [Fact]
    public void Schema_Registry_MirrorsTheDefaultsRegistryKeySet()
    {
        SystemSettingSchema.Keys.Should().HaveCount(11);
        SystemSettingSchema.Keys.Should().BeEquivalentTo(SystemSettingDefaults.Values.Keys);
    }

    [Fact]
    public void Schema_EveryRegisteredDefault_SatisfiesItsOwnSchema()
    {
        // The reset path validates the registry default through the schema — a registry
        // default that violates its own schema would brick reset for that key.
        foreach (var (key, defaultValue) in SystemSettingDefaults.Values)
        {
            var act = () => SystemSettingSchema.Validate(key, defaultValue);
            act.Should().NotThrow($"registered default for '{key}' must satisfy the schema");
        }
    }

    [Fact]
    public void Schema_EnumKey_ExposesAllowedValuesToTheDto()
    {
        var entry = SystemSettingSchema.TryGetEntry("default_language");
        entry.Should().NotBeNull();
        entry!.ValueType.Should().Be("enum");
        entry.AllowedValues.Should().BeEquivalentTo("ar", "en");
    }

    [Fact]
    public void Schema_TryGetEntry_UnregisteredKey_ReturnsNull()
    {
        SystemSettingSchema.TryGetEntry("not_a_registered_key").Should().BeNull();
    }
}
