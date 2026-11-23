import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Phone, Lock, Eye, EyeOff, LogIn, Loader2 } from 'lucide-react';
import { useAuth } from '@/app/providers/useAuth';
import { getApiErrorMessage } from '@/utils/api-error';

/** D-17 (Wave 18.2): only same-app relative paths may ride the ?next= param —
 *  an absolute/protocol-relative value is ignored (open-redirect guard). */
function safeNextPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Task 2 (Night) — «تذكّرني» is now REAL: an explicit opt-in persists the
      // session tokens in durable storage (see session-store.ts); the default
      // (unchecked) keeps the strict tab-scoped sessionStorage behavior.
      await login(phone, password, { remember: rememberMe });
      // D-17 (Wave 18.2): ProtectedRoute parked the intended destination in
      // ?next= — resume it after a successful login (guarded to internal paths).
      navigate(safeNextPath(searchParams.get('next')) ?? '/dashboard');
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
                  className="w-full h-12 ps-4 pe-12 rounded-xl border-[1.5px] text-[15px] font-medium outline-none transition-all bg-[var(--cms-surface-2)] text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] border-[var(--c-border-strong)] focus:border-[var(--c-primary-500)] focus:shadow-[var(--shadow-glow-primary)] focus:bg-[var(--cms-surface)]"
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
                  className="w-full h-12 ps-4 pe-12 rounded-xl border-[1.5px] text-[15px] font-medium outline-none transition-all bg-[var(--cms-surface-2)] text-[var(--c-text)] placeholder:text-[var(--c-text-faint)] border-[var(--c-border-strong)] focus:border-[var(--c-primary-500)] focus:shadow-[var(--shadow-glow-primary)] focus:bg-[var(--cms-surface)]"
                  style={{ letterSpacing: '0.1em' }}
                  required
                />
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
            </div>

            {/* Task 2 (Night) — the «تذكّرني» control is back, and this time it
                is REAL: D-06 (Wave 18.2) removed a checkbox that lied (no
                persistence existed behind it). session-store.ts now backs the
                opt-in with durable token storage + restore-on-load; the default
                stays OFF (privacy-safe). */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none" data-testid="login-remember-me">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-[1.5px] border-[var(--c-border-strong)] accent-[var(--c-primary-600)] cursor-pointer"
                />
                <span className="text-[13px] font-semibold text-[var(--c-text-soft)]">تذكّرني</span>
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

        {/* W17.0 — legal footer: the same three admin-managed content pages
            Register already links (terms / privacy / contact), one tap from the
            login surface so legal content is reachable pre-auth. */}
        <p className="mt-5 text-center text-xs text-[var(--c-text-faint)]" data-testid="login-legal-links">
          <Link to="/terms" data-testid="login-legal-terms" className="hover:text-[var(--c-primary-700)] hover:underline">الشروط والأحكام</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/privacy" data-testid="login-legal-privacy" className="hover:text-[var(--c-primary-700)] hover:underline">سياسة الخصوصية</Link>
          <span aria-hidden="true"> · </span>
          <Link to="/contact" data-testid="login-legal-contact" className="hover:text-[var(--c-primary-700)] hover:underline">تواصل معنا</Link>
        </p>
      </motion.div>
    </div>
  );
}
