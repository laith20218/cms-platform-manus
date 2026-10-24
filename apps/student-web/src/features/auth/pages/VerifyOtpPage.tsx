import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/app/providers/useAuth';
import { motion } from 'framer-motion';
import { ShieldCheck, Loader2, ArrowRight } from 'lucide-react';
import { authApi } from '../services/auth-api';
import { getApiErrorMessage } from '@/utils/api-error';

export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const { completeAuthentication } = useAuth();
  const location = useLocation();
  const phone = (location.state as { phone?: string })?.phone || '';

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!phone) {
      navigate('/register');
      return;
    }
    inputsRef.current[0]?.focus();
  }, [phone, navigate]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [countdown]);

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError('');

    // Auto-advance to next input
    if (value && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }

    // Auto-submit when all 4 digits entered
    if (value && index === 5 && newOtp.every(d => d)) {
      handleSubmit(newOtp.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newOtp = ['', '', '', '', '', ''];
      pasted.split('').forEach((digit, i) => { newOtp[i] = digit; });
      setOtp(newOtp);
      if (pasted.length === 6) handleSubmit(pasted);
    }
  };

  const handleSubmit = async (otpCode?: string) => {
    const code = otpCode || otp.join('');
    if (code.length !== 6) {
      setError('أدخل 6 أرقام');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await authApi.verifyOtp(phone, code);
      completeAuthentication(result);
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'رمز التحقق غير صحيح'));
      setOtp(['', '', '', '', '', '']);
      inputsRef.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setCanResend(false);
    setError('');
    try {
      await authApi.resendOtp(phone);
      setCountdown(60);
      setOtp(['', '', '', '', '', '']);
      inputsRef.current[0]?.focus();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'تعذر إعادة إرسال الرمز'));
      setCanResend(true);
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
            <div className="w-[72px] h-[72px] mx-auto mb-5 rounded-[20px] flex items-center justify-center" style={{ background: 'var(--grad-primary)', boxShadow: '0 8px 24px rgba(25,118,210,0.30)' }}>
              <ShieldCheck className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-xl font-bold text-[var(--c-text)] mb-2">التحقق من الرقم</h1>
            <p className="text-sm text-[var(--c-text-muted)]">
              أدخلنا رمز التحقق على<br />
              <span className="font-semibold text-[var(--c-text-soft)]" dir="ltr">{phone}</span>
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-[10px] text-sm font-medium" style={{ background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.20)', color: 'var(--c-danger-500)' }} role="alert">
              {error}
            </div>
          )}

          {/* OTP Inputs */}
          <div className="flex justify-center gap-3 mb-6" dir="ltr">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputsRef.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                className="w-14 h-16 text-center text-2xl font-bold rounded-xl border-[2px] outline-none transition-all bg-[var(--cms-surface-2)] text-[var(--c-text)] border-[var(--c-border-strong)] focus:border-[var(--c-primary-500)] focus:shadow-[var(--shadow-glow-primary)]"
              />
            ))}
          </div>

          {/* Countdown / Resend */}
          <div className="text-center mb-6">
            {canResend ? (
              <button onClick={handleResend} className="text-[13px] font-semibold text-[var(--c-primary-700)] hover:underline">
                إعادة إرسال الرمز
              </button>
            ) : (
              <p className="text-[13px] text-[var(--c-text-muted)]">
                إعادة الإرسال خلال <span className="font-bold" lang="en">{countdown}</span> ثانية
              </p>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={() => handleSubmit()}
            disabled={loading || otp.some(d => !d)}
            className="w-full h-12 rounded-xl font-bold text-[15px] text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{ background: 'var(--grad-primary)', boxShadow: '0 6px 16px rgba(25,118,210,0.30)' }}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <>
                تأكيد
                <ArrowRight className="w-[18px] h-[18px] rotate-180" />
              </>
            )}
          </button>

          <div className="text-center mt-5">
            <Link to="/register" className="text-[13px] text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)]">
              تغيير الرقم
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
