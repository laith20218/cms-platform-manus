import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Phone, Lock, Eye, EyeOff, LogIn, Loader2 } from 'lucide-react';
import { useAuth } from '@/app/providers/useAuth';
import { getApiErrorMessage } from '@/utils/api-error';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(phone, password);
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'رقم الهاتف أو كلمة المرور غير صحيحة'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-[var(--c-bg)]">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[400px] h-[400px] rounded-full opacity-40 blur-[80px]" style={{ background: 'radial-gradient(circle, #42A5F5, transparent)', top: '-100px', right: '-100px' }} />
        <div className="absolute w-[500px] h-[500px] rounded-full opacity-30 blur-[80px]" style={{ background: 'radial-gradient(circle, #00BCD4, transparent)', bottom: '-150px', left: '-150px' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-[480px] relative z-10"
      >
        <div
          className="rounded-[28px] p-10 border backdrop-blur-2xl"
          style={{ background: 'var(--c-glass)', borderColor: 'var(--c-border-glass)', boxShadow: 'var(--shadow-glass)' }}
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div
              className="w-[72px] h-[72px] mx-auto mb-5 rounded-[20px] flex items-center justify-center"
              style={{ background: 'var(--grad-primary)', boxShadow: '0 8px 24px rgba(25,118,210,0.30)' }}
            >
              <LogIn className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[var(--c-text)] mb-2">تسجيل الدخول</h1>
            <p className="text-sm text-[var(--c-text-muted)]">أهلاً بعودتك! أدخل بياناتك لمتابعة الدراسة.</p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-[10px] text-sm font-medium"
              style={{ background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.20)', color: 'var(--c-danger-500)' }}
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-[13px] font-semibold text-[var(--c-text-soft)] mb-2 block">
                رقم الهاتف (واتساب) <span className="text-[var(--c-danger-500)]">*</span>
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0999999999"
                  className="w-full h-12 ps-4 pe-12 rounded-xl border-[1.5px] text-[15px] font-medium outline-none transition-all bg-[rgba(255,255,255,0.80)] text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] border-[var(--c-border-strong)] focus:border-[var(--c-primary-500)] focus:shadow-[var(--shadow-glow-primary)] focus:bg-white"
                  required
                />
                <Phone className="absolute end-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--c-text-faint)] pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-[13px] font-semibold text-[var(--c-text-soft)] mb-2 block">
                كلمة المرور <span className="text-[var(--c-danger-500)]">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-12 ps-4 pe-12 rounded-xl border-[1.5px] text-[15px] font-medium outline-none transition-all bg-[rgba(255,255,255,0.80)] text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] border-[var(--c-border-strong)] focus:border-[var(--c-primary-500)] focus:shadow-[var(--shadow-glow-primary)] focus:bg-white"
                  style={{ letterSpacing: '0.1em' }}
                  required
                />
                <Lock className="absolute end-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[var(--c-text-faint)] pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute start-2 top-1/2 -translate-y-1/2 p-2 text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)] rounded-lg hover:bg-[var(--c-primary-50)] transition-all"
                >
                  {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                </button>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <label className="flex items-center gap-2 cursor-pointer text-[13px] text-[var(--c-text-soft)] font-medium">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="hidden" />
                <span className={`w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center transition-all ${remember ? 'bg-[var(--c-primary-700)] border-[var(--c-primary-700)]' : 'border-[var(--c-border-strong)] bg-white'}`}>
                  {remember && <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-3 h-3"><polyline points="20 6 9 17 4 12" /></svg>}
                </span>
                تذكّرني
              </label>
              <Link to="/forgot-password" className="text-[13px] font-semibold text-[var(--c-primary-700)] hover:underline">نسيت كلمة المرور؟</Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl font-bold text-[15px] text-white flex items-center justify-center gap-2 transition-all"
              style={{ background: 'var(--grad-primary)', boxShadow: '0 6px 16px rgba(25,118,210,0.30)' }}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  تسجيل الدخول
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-[18px] h-[18px]"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                </>
              )}
            </button>
          </form>

          <div className="flex items-center gap-3 my-6 text-[var(--c-text-faint)] text-xs font-medium">
            <div className="flex-1 h-px bg-[var(--c-border-strong)]" />
            أو
            <div className="flex-1 h-px bg-[var(--c-border-strong)]" />
          </div>

          <div className="text-center flex flex-col gap-3">
            <Link to="/register" className="text-[13px] text-[var(--c-text-muted)] hover:text-[var(--c-primary-700)]">
              ليس لديك حساب؟ <strong className="font-bold text-[var(--c-primary-700)]">أنشئ حساباً جديداً</strong>
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
