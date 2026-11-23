import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Phone, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react';
import { authApi } from '../services/auth-api';
import { academicApi } from '@/features/subjects/services/academic-api';
import { getApiErrorMessage } from '@/utils/api-error';

type AcademicOption = { id: string; nameAr: string };

// P2-31 alignment (Wave 18.2, D-09): the /verify-otp ROUTE exists only when the
// frontend build flag is on — the same expression the router uses. Navigating
// there when the flag is off would land on the 404 page.
const otpRouteEnabled = import.meta.env.VITE_OTP_ENABLED === 'true';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    phone: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    universityId: '',
    collegeId: '',
    academicYearId: '',
    acceptTerms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [universities, setUniversities] = useState<AcademicOption[]>([]);
  const [colleges, setColleges] = useState<AcademicOption[]>([]);
  const [years, setYears] = useState<AcademicOption[]>([]);
  // W19.4 (D-33): academic-load errors live SEPARATELY from form/registration
  // errors — they render inline next to the academic selects with their own
  // retry, and every later load SUCCESS clears them (no stale error text).
  const [academicError, setAcademicError] = useState<string | null>(null);

  const loadUniversities = () => {
    academicApi.getUniversities()
      .then((result) => {
        setUniversities(result.items ?? []);
        setAcademicError(null);
      })
      .catch(() => setAcademicError('تعذّر تحميل البيانات الأكاديمية. حاول لاحقاً.'));
  };

  useEffect(() => {
    loadUniversities();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only initial academic load
  }, []);

  // D-33: one affordance re-runs the academic cascade as far as the student
  // has already selected — universities, then the chosen college's list, then
  // the chosen year's list.
  const retryAcademicLoad = async () => {
    setAcademicError(null);
    try {
      setUniversities((await academicApi.getUniversities()).items ?? []);
      if (formData.universityId) {
        setColleges(await academicApi.getColleges(formData.universityId));
        if (formData.collegeId) {
          setYears(await academicApi.getYears(formData.collegeId));
        }
      }
    } catch {
      setAcademicError('تعذّر تحميل البيانات الأكاديمية. حاول لاحقاً.');
    }
  };

  const selectUniversity = async (universityId: string) => {
    setFormData((current) => ({ ...current, universityId, collegeId: '', academicYearId: '' }));
    setColleges([]);
    setYears([]);
    if (!universityId) return;
    try {
      setColleges(await academicApi.getColleges(universityId));
      setAcademicError(null);
    } catch {
      setAcademicError('تعذّر تحميل الكليات. حاول لاحقاً.');
    }
  };

  const selectCollege = async (collegeId: string) => {
    setFormData((current) => ({ ...current, collegeId, academicYearId: '' }));
    setYears([]);
    if (!collegeId) return;
    try {
      setYears(await academicApi.getYears(collegeId));
      setAcademicError(null);
    } catch {
      setAcademicError('تعذّر تحميل السنوات الدراسية. حاول لاحقاً.');
    }
  };

  const passwordScore = (pwd: string): number => {
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    return score;
  };

  const handlePasswordChange = (value: string) => {
    setFormData({ ...formData, password: value });
    setPasswordStrength(passwordScore(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }

    if (!formData.acceptTerms) {
      setError('يجب الموافقة على الشروط');
      return;
    }

    if (!formData.universityId || !formData.collegeId || !formData.academicYearId) {
      setError('يجب اختيار الجامعة والكلية والسنة الدراسية قبل إنشاء الحساب');
      return;
    }

    setLoading(true);
    try {
      const registration = await authApi.register({
        phone: formData.phone,
        password: formData.password,
        fullName: formData.fullName,
        universityId: formData.universityId,
        collegeId: formData.collegeId,
        academicYearId: formData.academicYearId,
        acceptTerms: formData.acceptTerms,
      });

      // D-09 (Wave 18.2): navigate to /verify-otp ONLY when the backend demands
      // OTP AND this build actually ships the route. When the flag is off, the
      // safe fallback is /login (registration itself already succeeded).
      if (registration.otpRequired && otpRouteEnabled) {
        navigate('/verify-otp', { state: { phone: formData.phone } });
      } else {
        navigate('/login');
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'حدث خطأ أثناء التسجيل'));
    } finally {
      setLoading(false);
    }
  };

  const strengthLabels = ['ضعيفة', 'ضعيفة', 'متوسطة', 'جيدة', 'قوية'];
  const strengthColors = ['var(--c-danger-500)', 'var(--c-danger-500)', 'var(--c-warning-500)', 'var(--c-primary-500)', 'var(--c-success-500)'];

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-6 relative overflow-hidden bg-[var(--c-bg)]">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[400px] h-[400px] rounded-full opacity-40 blur-[80px]" style={{ background: 'radial-gradient(circle, #42A5F5, transparent)', top: '-100px', left: '-100px' }} />
        <div className="absolute w-[500px] h-[500px] rounded-full opacity-30 blur-[80px]" style={{ background: 'radial-gradient(circle, #00BCD4, transparent)', bottom: '-150px', right: '-150px' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[500px] relative z-10"
      >
        <div className="rounded-[28px] p-8 md:p-10 border backdrop-blur-2xl" style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)', boxShadow: 'var(--shadow-glass)' }}>
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-[64px] h-[64px] mx-auto mb-4 rounded-[20px] flex items-center justify-center" style={{ background: 'var(--grad-primary)', boxShadow: '0 8px 24px rgba(25,118,210,0.30)' }}>
              <User className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl font-bold text-[var(--c-text)] mb-1">إنشاء حساب جديد</h1>
            <p className="text-sm text-[var(--c-text-muted)]">انضم لمنصة CMS وابدأ رحلتك التعليمية</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-[10px] text-sm font-medium" style={{ background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.20)', color: 'var(--c-danger-500)' }} role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="text-[13px] font-semibold text-[var(--c-text-soft)] mb-1.5 block">الاسم الكامل <span className="text-[var(--c-danger-500)]">*</span></label>
              <div className="relative">
                <input type="text" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} placeholder="أحمد العبد الله" className="w-full h-12 ps-4 pe-12 rounded-xl border-[1.5px] text-[15px] outline-none transition-all bg-[var(--cms-surface-2)] text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] border-[var(--c-border-strong)] focus:border-[var(--c-primary-500)] focus:shadow-[var(--shadow-glow-primary)] focus:bg-[var(--cms-surface)]" required />
                <User className="absolute end-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--c-text-faint)] pointer-events-none" />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label className="text-[13px] font-semibold text-[var(--c-text-soft)] mb-1.5 block">رقم الهاتف (واتساب) <span className="text-[var(--c-danger-500)]">*</span></label>
              <div className="relative">
                <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="0991234567" className="w-full h-12 ps-4 pe-12 rounded-xl border-[1.5px] text-[15px] outline-none transition-all bg-[var(--cms-surface-2)] text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] border-[var(--c-border-strong)] focus:border-[var(--c-primary-500)] focus:shadow-[var(--shadow-glow-primary)] focus:bg-[var(--cms-surface)]" required />
                <Phone className="absolute end-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--c-text-faint)] pointer-events-none" />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-[13px] font-semibold text-[var(--c-text-soft)] mb-1.5 block">كلمة المرور <span className="text-[var(--c-danger-500)]">*</span></label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(e) => handlePasswordChange(e.target.value)} placeholder="••••••••" className="w-full h-12 ps-4 pe-12 rounded-xl border-[1.5px] text-[15px] outline-none transition-all bg-[var(--cms-surface-2)] text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] border-[var(--c-border-strong)] focus:border-[var(--c-primary-500)] focus:shadow-[var(--shadow-glow-primary)] focus:bg-[var(--cms-surface)]" required />
                <Lock className="absolute end-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--c-text-faint)] pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="absolute start-2 top-1/2 -translate-y-1/2 p-2 text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)] rounded-lg hover:bg-[var(--c-primary-50)] transition-all"
                >
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>
              {formData.password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="flex-1 h-1.5 rounded-full transition-all" style={{ background: i < passwordStrength ? strengthColors[passwordStrength] : 'var(--c-neutral-200)' }} />
                    ))}
                  </div>
                  <span className="text-xs font-medium" style={{ color: strengthColors[passwordStrength] }}>{strengthLabels[passwordStrength]}</span>
                </div>
              )}
            </div>

            {/* Academic identity */}
            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-[13px] font-semibold text-[var(--c-text-soft)]">الجامعة
                <select value={formData.universityId} onChange={(event) => void selectUniversity(event.target.value)} className="mt-1.5 w-full h-12 rounded-xl border-[1.5px] bg-[var(--cms-surface-2)] px-3 text-[14px] text-[var(--c-text)] border-[var(--c-border-strong)]" required>
                  <option value="">اختر الجامعة</option>
                  {universities.map((university) => <option key={university.id} value={university.id}>{university.nameAr}</option>)}
                </select>
              </label>
              <label className="text-[13px] font-semibold text-[var(--c-text-soft)]">الكلية
                <select value={formData.collegeId} onChange={(event) => void selectCollege(event.target.value)} disabled={!formData.universityId} className="mt-1.5 w-full h-12 rounded-xl border-[1.5px] bg-[var(--cms-surface-2)] px-3 text-[14px] text-[var(--c-text)] border-[var(--c-border-strong)] disabled:opacity-50" required>
                  <option value="">اختر الكلية</option>
                  {colleges.map((college) => <option key={college.id} value={college.id}>{college.nameAr}</option>)}
                </select>
              </label>
              <label className="text-[13px] font-semibold text-[var(--c-text-soft)]">السنة
                <select value={formData.academicYearId} onChange={(event) => setFormData((current) => ({ ...current, academicYearId: event.target.value }))} disabled={!formData.collegeId} className="mt-1.5 w-full h-12 rounded-xl border-[1.5px] bg-[var(--cms-surface-2)] px-3 text-[14px] text-[var(--c-text)] border-[var(--c-border-strong)] disabled:opacity-50" required>
                  <option value="">اختر السنة</option>
                  {years.map((year) => <option key={year.id} value={year.id}>{year.nameAr}</option>)}
                </select>
              </label>
            </div>

            {/* W19.4 (D-33): inline academic-load error + retry — clears on the
                next successful load, never pollutes the form error banner. */}
            {academicError && (
              <div
                role="alert"
                data-testid="register-academic-error"
                className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] p-3 text-sm font-medium"
                style={{ background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.20)', color: 'var(--c-danger-500)' }}
              >
                <span>{academicError}</span>
                <button
                  type="button"
                  onClick={() => void retryAcademicLoad()}
                  data-testid="register-academic-retry"
                  className="press min-h-9 rounded-lg bg-[var(--c-danger-500)] px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
                >
                  إعادة المحاولة
                </button>
              </div>
            )}

            {/* Confirm Password */}
            <div>
              <label className="text-[13px] font-semibold text-[var(--c-text-soft)] mb-1.5 block">تأكيد كلمة المرور <span className="text-[var(--c-danger-500)]">*</span></label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} placeholder="••••••••" className="w-full h-12 ps-4 pe-12 rounded-xl border-[1.5px] text-[15px] outline-none transition-all bg-[var(--cms-surface-2)] text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] border-[var(--c-border-strong)] focus:border-[var(--c-primary-500)] focus:shadow-[var(--shadow-glow-primary)] focus:bg-[var(--cms-surface)]" required />
                <Lock className="absolute end-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--c-text-faint)] pointer-events-none" />
              </div>
            </div>

            {/* Terms — D-16 (Wave 18.3): the checkbox is sr-only (focusable via
                keyboard — Tailwind's sr-only keeps it in the a11y tree, unlike the
                old `hidden`), and the visual square shows the focus ring. */}
            <label className="flex items-center gap-2 cursor-pointer text-[13px] text-[var(--c-text-soft)] font-medium">
              <input type="checkbox" checked={formData.acceptTerms} onChange={(e) => setFormData({ ...formData, acceptTerms: e.target.checked })} className="sr-only peer" />
              <span className={`w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--c-primary-500)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--c-bg)] ${formData.acceptTerms ? 'bg-[var(--c-primary-700)] border-[var(--c-primary-700)]' : 'border-[var(--c-border-strong)] bg-[var(--cms-surface-2)]'}`}>
                {formData.acceptTerms && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-3 h-3"><polyline points="20 6 9 17 4 12" /></svg>}
              </span>
              أوافق على <Link to="/terms" className="text-[var(--c-primary-700)] font-semibold hover:underline">الشروط</Link> و<Link to="/privacy" className="text-[var(--c-primary-700)] font-semibold hover:underline">سياسة الخصوصية</Link>
            </label>

            {/* Submit */}
            <button type="submit" disabled={loading} className="w-full h-12 rounded-xl font-bold text-[15px] text-white flex items-center justify-center gap-2 transition-all" style={{ background: 'var(--grad-primary)', boxShadow: '0 6px 16px rgba(25,118,210,0.30)' }}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إنشاء الحساب'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5 text-[var(--c-text-faint)] text-xs font-medium">
            <div className="flex-1 h-px bg-[var(--c-border-strong)]" />
            أو
            <div className="flex-1 h-px bg-[var(--c-border-strong)]" />
          </div>

          <div className="text-center">
            <Link to="/login" className="text-[13px] text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)]">
              لديك حساب؟ <strong className="font-bold text-[var(--c-primary-700)]">سجّل دخولك</strong>
            </Link>
          </div>

          {/* W16.5 — public contact page entry (admin-managed content). */}
          <div className="text-center mt-3">
            <Link to="/contact" className="text-xs text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)] hover:underline">
              تواصل معنا
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
