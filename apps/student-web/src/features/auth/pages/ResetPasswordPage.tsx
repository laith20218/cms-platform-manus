import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Loader2, ArrowRight } from 'lucide-react';
import { authApi } from '../services/auth-api';
import { getApiErrorMessage } from '@/utils/api-error';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const phone = (location.state as { phone?: string })?.phone || '';

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!phone) navigate('/forgot-password');
    else inputsRef.current[0]?.focus();
  }, [phone, navigate]);

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) inputsRef.current[index + 1]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpCode = otp.join('');
    if (otpCode.length !== 6) { setError('أدخل 6 أرقام'); return; }
    if (newPassword.length < 8) { setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return; }

    setLoading(true);
    setError('');
    try {
      await authApi.resetPassword(phone, otpCode, newPassword);
      navigate('/login');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'رمز التحقق غير صحيح'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-[var(--c-bg)]">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[400px] h-[400px] rounded-full opacity-40 blur-[80px]" style={{ background: 'radial-gradient(circle, #42A5F5, transparent)', top: '-100px', right: '-100px' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[440px] relative z-10">
        <div className="rounded-[28px] p-10 border backdrop-blur-2xl" style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)', boxShadow: 'var(--shadow-glass)' }}>
          <div className="text-center mb-8">
            <div className="w-[64px] h-[64px] mx-auto mb-4 rounded-[20px] flex items-center justify-center" style={{ background: 'var(--grad-primary)', boxShadow: '0 8px 24px rgba(25,118,210,0.30)' }}>
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl font-bold text-[var(--c-text)] mb-1">إعادة تعيين كلمة المرور</h1>
            <p className="text-sm text-[var(--c-text-muted)]">أدخل الرمز وكلمة المرور الجديدة</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-[10px] text-sm font-medium" style={{ background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.20)', color: 'var(--c-danger-500)' }} role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* OTP */}
            <div>
              <label className="text-[13px] font-semibold text-[var(--c-text-soft)] mb-1.5 block">رمز التحقق</label>
              <div className="flex justify-center gap-3" dir="ltr">
                {otp.map((digit, index) => (
                  <input key={index} ref={(el) => { inputsRef.current[index] = el; }} type="text" inputMode="numeric" maxLength={1} value={digit} onChange={(e) => handleOtpChange(index, e.target.value)} className="w-14 h-14 text-center text-xl font-bold rounded-xl border-[2px] outline-none transition-all bg-[var(--cms-surface-2)] text-[var(--c-text)] border-[var(--c-border-strong)] focus:border-[var(--c-primary-500)] focus:shadow-[var(--shadow-glow-primary)]" />
                ))}
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="text-[13px] font-semibold text-[var(--c-text-soft)] mb-1.5 block">كلمة المرور الجديدة</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" className="w-full h-12 ps-4 pe-12 rounded-xl border-[1.5px] text-[15px] outline-none transition-all bg-[var(--cms-surface-2)] text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] border-[var(--c-border-strong)] focus:border-[var(--c-primary-500)] focus:shadow-[var(--shadow-glow-primary)] focus:bg-[var(--cms-surface)]" required />
                <Lock className="absolute end-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--c-text-faint)] pointer-events-none" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute start-2 top-1/2 -translate-y-1/2 p-2 text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)] rounded-lg transition-all">
                  {showPassword ? 'إخفاء' : 'إظهار'}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full h-12 rounded-xl font-bold text-[15px] text-white flex items-center justify-center gap-2 transition-all" style={{ background: 'var(--grad-primary)', boxShadow: '0 6px 16px rgba(25,118,210,0.30)' }}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                <>
                  إعادة التعيين
                  <ArrowRight className="w-[18px] h-[18px] rotate-180" />
                </>
              )}
            </button>
          </form>

          <div className="text-center mt-5">
            <Link to="/login" className="text-[13px] text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)]">
              العودة لتسجيل الدخول
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
