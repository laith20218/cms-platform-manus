import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Phone, Loader2, ArrowRight, Mail } from 'lucide-react';
import { authApi } from '../services/auth-api';
import { getApiErrorMessage } from '@/utils/api-error';

export default function ForgotPasswordPage() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const otpEnabled = import.meta.env.VITE_OTP_ENABLED === 'true';

  if (!otpEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--c-bg)]">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[440px]">
          <div className="rounded-[28px] p-10 border backdrop-blur-2xl text-center" style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)', boxShadow: 'var(--shadow-glass)' }}>
            <h1 className="text-xl font-bold text-[var(--c-text)] mb-2">استعادة كلمة المرور مؤجلة</h1>
            <p className="text-sm text-[var(--c-text-muted)] mb-6">ميزة OTP غير مفعلة حالياً، لذلك لا يمكن إرسال رمز استعادة في هذه النسخة.</p>
            <Link to="/login" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white" style={{ background: 'var(--grad-primary)' }}>
              العودة لتسجيل الدخول
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(phone);
      setSent(true);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'حدث خطأ. حاول مرة أخرى'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--c-bg)]">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[440px]">
          <div className="rounded-[28px] p-10 border backdrop-blur-2xl text-center" style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)', boxShadow: 'var(--shadow-glass)' }}>
            <div className="w-[72px] h-[72px] mx-auto mb-5 rounded-[20px] flex items-center justify-center" style={{ background: 'var(--grad-success)', boxShadow: '0 8px 24px rgba(0,200,83,0.30)' }}>
              <Mail className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-xl font-bold text-[var(--c-text)] mb-2">تم إرسال الرمز</h1>
            <p className="text-sm text-[var(--c-text-muted)] mb-6">
              أرسلنا رمز التحقق إلى <span className="font-semibold text-[var(--c-text-soft)]" dir="ltr">{phone}</span>
            </p>
            <Link to="/reset-password" state={{ phone }} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm text-white" style={{ background: 'var(--grad-primary)' }}>
              إعادة تعيين كلمة المرور
              <ArrowRight className="w-4 h-4 rotate-180" />
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-[var(--c-bg)]">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[400px] h-[400px] rounded-full opacity-40 blur-[80px]" style={{ background: 'radial-gradient(circle, #42A5F5, transparent)', top: '-100px', right: '-100px' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[440px] relative z-10">
        <div className="rounded-[28px] p-10 border backdrop-blur-2xl" style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)', boxShadow: 'var(--shadow-glass)' }}>
          <div className="text-center mb-8">
            <div className="w-[64px] h-[64px] mx-auto mb-4 rounded-[20px] flex items-center justify-center" style={{ background: 'var(--grad-primary)', boxShadow: '0 8px 24px rgba(25,118,210,0.30)' }}>
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl font-bold text-[var(--c-text)] mb-1">نسيت كلمة المرور؟</h1>
            <p className="text-sm text-[var(--c-text-muted)]">أدخل رقم هاتفك وسنرسل لك رمز التحقق</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-[10px] text-sm font-medium" style={{ background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.20)', color: 'var(--c-danger-500)' }} role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-[13px] font-semibold text-[var(--c-text-soft)] mb-1.5 block">رقم الهاتف</label>
              <div className="relative">
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0991234567" className="w-full h-12 ps-4 pe-12 rounded-xl border-[1.5px] text-[15px] outline-none transition-all bg-[rgba(255,255,255,0.80)] text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] border-[var(--c-border-strong)] focus:border-[var(--c-primary-500)] focus:shadow-[var(--shadow-glow-primary)] focus:bg-white" required />
                <Phone className="absolute end-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--c-text-faint)] pointer-events-none" />
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full h-12 rounded-xl font-bold text-[15px] text-white flex items-center justify-center gap-2 transition-all" style={{ background: 'var(--grad-primary)', boxShadow: '0 6px 16px rgba(25,118,210,0.30)' }}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إرسال الرمز'}
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
