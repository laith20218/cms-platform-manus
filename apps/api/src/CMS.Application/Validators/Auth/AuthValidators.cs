using FluentValidation;

namespace CMS.Application.Validators.Auth;

public class RegisterCommandValidator : AbstractValidator<Commands.Auth.RegisterCommand>
{
    public RegisterCommandValidator()
    {
        RuleFor(x => x.Phone)
            .NotEmpty().WithMessage("رقم الهاتف مطلوب")
            .Matches(@"^09\d{8}$").WithMessage("الرقم يجب أن يبدأ بـ 09 ويكون 10 أرقام");

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("كلمة المرور مطلوبة")
            .MinimumLength(8).WithMessage("كلمة المرور يجب أن تكون 8 أحرف على الأقل")
            .Must(p => p.Any(char.IsLetter) && p.Any(char.IsDigit))
            .WithMessage("كلمة المرور يجب أن تحتوي على أحرف وأرقام");

        RuleFor(x => x.FullName)
            .NotEmpty().WithMessage("الاسم مطلوب")
            .MinimumLength(3).WithMessage("الاسم قصير جداً")
            .MaximumLength(200).WithMessage("الاسم طويل جداً");

        RuleFor(x => x.UniversityId).NotEmpty().WithMessage("الجامعة مطلوبة");
        RuleFor(x => x.CollegeId).NotEmpty().WithMessage("الكلية مطلوبة");
        RuleFor(x => x.AcademicYearId).NotEmpty().WithMessage("السنة مطلوبة");
        RuleFor(x => x.AcceptTerms).Equal(true).WithMessage("يجب الموافقة على الشروط");
        RuleFor(x => x.InstallationId)
            .NotEmpty().WithMessage("معرّف التثبيت مطلوب")
            .Length(16, 200).WithMessage("معرّف التثبيت يجب أن يكون بين 16 و200 حرف");
    }
}

public class ResendOtpCommandValidator : AbstractValidator<Commands.Auth.ResendOtpCommand>
{
    public ResendOtpCommandValidator()
    {
        RuleFor(x => x.Phone)
            .NotEmpty().WithMessage("رقم الهاتف مطلوب")
            .Matches(@"^09\d{8}$").WithMessage("صيغة الرقم غير صحيحة");
        RuleFor(x => x.InstallationId)
            .NotEmpty().WithMessage("معرّف التثبيت مطلوب")
            .Length(16, 200).WithMessage("معرّف التثبيت يجب أن يكون بين 16 و200 حرف");
    }
}

public class LoginCommandValidator : AbstractValidator<Commands.Auth.LoginCommand>
{
    public LoginCommandValidator()
    {
        RuleFor(x => x.Phone)
            .NotEmpty().WithMessage("رقم الهاتف مطلوب")
            .Matches(@"^09\d{8}$").WithMessage("صيغة الرقم غير صحيحة");

        RuleFor(x => x.Password)
            .NotEmpty().WithMessage("كلمة المرور مطلوبة");

        RuleFor(x => x.DeviceFingerprint)
            .NotEmpty().WithMessage("بصمة الجهاز مطلوبة")
            .Length(16, 200).WithMessage("معرّف التثبيت يجب أن يكون بين 16 و200 حرف");
    }
}

public class VerifyOtpCommandValidator : AbstractValidator<Commands.Auth.VerifyOtpCommand>
{
    public VerifyOtpCommandValidator()
    {
        RuleFor(x => x.Phone)
            .NotEmpty().WithMessage("رقم الهاتف مطلوب")
            .Matches(@"^09\d{8}$").WithMessage("صيغة الرقم غير صحيحة");

        RuleFor(x => x.OtpCode)
            .NotEmpty().WithMessage("رمز التحقق مطلوب")
            .Matches(@"^\d{6}$").WithMessage("رمز التحقق يجب أن يكون 6 أرقام");

        RuleFor(x => x.InstallationId)
            .NotEmpty().WithMessage("معرّف التثبيت مطلوب")
            .Length(16, 200).WithMessage("معرّف التثبيت يجب أن يكون بين 16 و200 حرف");
    }
}

public class ForgotPasswordCommandValidator : AbstractValidator<Commands.Auth.ForgotPasswordCommand>
{
    public ForgotPasswordCommandValidator()
    {
        RuleFor(x => x.Phone)
            .NotEmpty().WithMessage("رقم الهاتف مطلوب")
            .Matches(@"^09\d{8}$").WithMessage("صيغة الرقم غير صحيحة");
    }
}

public class ResetPasswordCommandValidator : AbstractValidator<Commands.Auth.ResetPasswordCommand>
{
    public ResetPasswordCommandValidator()
    {
        RuleFor(x => x.Phone).NotEmpty().Matches(@"^09\d{8}$");
        RuleFor(x => x.OtpCode)
            .NotEmpty().WithMessage("رمز التحقق مطلوب")
            .Matches(@"^\d{6}$").WithMessage("رمز التحقق يجب أن يكون 6 أرقام");
        RuleFor(x => x.NewPassword)
            .NotEmpty().MinimumLength(8)
            .Must(p => p.Any(char.IsLetter) && p.Any(char.IsDigit))
            .WithMessage("كلمة المرور يجب أن تحتوي على أحرف وأرقام");
    }
}

public class ChangePasswordCommandValidator : AbstractValidator<Commands.Auth.ChangePasswordCommand>
{
    public ChangePasswordCommandValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty().WithMessage("كلمة المرور الحالية مطلوبة");
        RuleFor(x => x.NewPassword)
            .NotEmpty().WithMessage("كلمة المرور الجديدة مطلوبة")
            .MinimumLength(8).WithMessage("كلمة المرور يجب أن تكون 8 أحرف على الأقل")
            .Must((model, newPassword) => newPassword != model.CurrentPassword)
            .WithMessage("كلمة المرور الجديدة يجب أن تكون مختلفة عن الحالية")
            .Must(p => p.Any(char.IsLetter) && p.Any(char.IsDigit))
            .WithMessage("كلمة المرور يجب أن تحتوي على أحرف وأرقام");
    }
}
