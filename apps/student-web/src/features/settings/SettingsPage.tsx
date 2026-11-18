/**
 * SettingsPage — student account settings (WF-S14).
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Settings as SettingsIcon, Moon, Bell, Lock, Loader2, ShieldCheck, Type } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { getApiErrorMessage } from '@/utils/api-error';
import LeaderboardSharingToggle from '@/features/stats/components/LeaderboardSharingToggle';
// W16.4 — student preferences: font-size (persisted per-account via
// /student/preferences + per-device localStorage boot) and the dynamic
// platform version (GET /system/version, safe fallback "1.0.0").
import { FONT_SIZE_STEPS } from './font-size';
import { useFontSize } from './useFontSize';
import { usePlatformVersion } from './usePlatformVersion';

export default function SettingsPage() {
  // ThemeProvider persists the choice under 'cms-theme' — the key must match exactly
  // or the selection is lost on the next full page load.
  const [theme, setTheme] = useState(localStorage.getItem('cms-theme') || 'light');
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // W16.4 — font-size control (server-persisted preference) + dynamic version.
  const fontSize = useFontSize();
  const { version } = usePlatformVersion();

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('cms-theme', next);
  };

  const passwordMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/auth/change-password', { currentPassword, newPassword });
    },
    onSuccess: () => {
      toast.success('تم تغيير كلمة المرور');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    },
    onError: (error: unknown) => {
      // W16.3 — the fallback was a bare «فشل»; now it says WHAT failed and
      // what to do, while the backend's Arabic `detail` still wins when present.
      toast.error(getApiErrorMessage(error, 'تعذر تغيير كلمة المرور. تحقق من كلمة المرور الحالية ثم حاول مجدداً.'));
    },
  });

  const handlePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error('كلمتا المرور غير متطابقتين'); return; }
    if (newPassword.length < 8) { toast.error('8 أحرف على الأقل'); return; }
    passwordMutation.mutate();
  };

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>
          <SettingsIcon className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--cms-text)]">الإعدادات</h1>
          <p className="text-sm text-[var(--cms-text-muted)]">إدارة تفضيلات حسابك</p>
        </div>
      </div>

      <section className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6">
        <h2 className="text-base font-semibold mb-4 text-[var(--cms-text)] flex items-center gap-2"><Moon className="w-4 h-4" /> المظهر</h2>
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--cms-text-soft)]">الوضع الليلي</span>
          <button onClick={toggleTheme} className="relative w-12 h-6 rounded-full transition-colors" style={{ background: theme === 'dark' ? 'var(--cms-teal-700)' : 'var(--cms-line-strong)' }}>
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: theme === 'dark' ? 'translateX(2px)' : 'translateX(26px)' }} />
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6">
        <h2 className="text-base font-semibold mb-1 text-[var(--cms-text)] flex items-center gap-2"><Type className="w-4 h-4" /> حجم الخط</h2>
        <p className="text-xs text-[var(--cms-text-muted)] mb-4">يُطبّق على الواجهة كاملة ويُحفظ في حسابك لجميع أجهزتك.</p>
        <div role="radiogroup" aria-label="حجم الخط" data-testid="font-size-options" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FONT_SIZE_STEPS.map(({ step, label, px }) => {
            const active = fontSize.step === step;
            return (
              <button
                key={step}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`font-size-${step}`}
                onClick={() => fontSize.choose(step)}
                disabled={fontSize.isSaving}
                className={`press flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-3 py-2 transition-colors disabled:opacity-60 ${
                  active
                    ? 'border-[var(--cms-teal-600)] bg-[var(--cms-teal-50)] text-[var(--cms-teal-700)] font-bold'
                    : 'border-[var(--cms-line)] bg-[var(--cms-surface-2)] text-[var(--cms-text-soft)] hover:border-[var(--cms-teal-100)]'
                }`}
              >
                <span style={{ fontSize: `${px}px`, lineHeight: 1 }} aria-hidden="true">أ</span>
                <span className="text-[11px]">{label}</span>
              </button>
            );
          })}
        </div>
        {fontSize.saveError && (
          <p
            role="alert"
            data-testid="font-size-error"
            className="mt-3 rounded-lg bg-[var(--cms-danger-50)] px-3 py-2 text-sm text-[var(--cms-danger)]"
          >
            {fontSize.saveError}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6">
        <h2 className="text-base font-semibold mb-4 text-[var(--cms-text)] flex items-center gap-2"><Bell className="w-4 h-4" /> الإشعارات</h2>
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--cms-text-soft)]">تلقّي الإشعارات</span>
          <button onClick={() => setNotifEnabled(!notifEnabled)} className="relative w-12 h-6 rounded-full transition-colors" style={{ background: notifEnabled ? 'var(--cms-teal-700)' : 'var(--cms-line-strong)' }}>
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: notifEnabled ? 'translateX(2px)' : 'translateX(26px)' }} />
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6">
        <h2 className="text-base font-semibold mb-4 text-[var(--cms-text)] flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> الخصوصية</h2>
        <LeaderboardSharingToggle />
      </section>

      <section className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6">
        <h2 className="text-base font-semibold mb-4 text-[var(--cms-text)] flex items-center gap-2"><Lock className="w-4 h-4" /> تغيير كلمة المرور</h2>
        <form onSubmit={handlePassword} className="space-y-3">
          <input type="password" placeholder="كلمة المرور الحالية" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required className="w-full h-11 rounded-xl border border-[var(--cms-line)] bg-[var(--cms-ivory-50)] px-4 text-sm focus:outline-none" />
          <input type="password" placeholder="كلمة المرور الجديدة (8 أحرف)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} className="w-full h-11 rounded-xl border border-[var(--cms-line)] bg-[var(--cms-ivory-50)] px-4 text-sm focus:outline-none" />
          <input type="password" placeholder="تأكيد كلمة المرور" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} className="w-full h-11 rounded-xl border border-[var(--cms-line)] bg-[var(--cms-ivory-50)] px-4 text-sm focus:outline-none" />
          <button type="submit" disabled={passwordMutation.isPending} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-[var(--cms-text-inverse)] disabled:opacity-50" style={{ background: 'var(--cms-teal-700)' }}>
            {passwordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} تغيير
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6">
        <h2 className="text-base font-semibold mb-2 text-[var(--cms-text)]">حول</h2>
        <div className="space-y-1 text-sm text-[var(--cms-text-muted)]">
          {/* W16.4 — dynamic version from GET /system/version (fallback "1.0.0"),
              no longer a hardcoded string. */}
          <p data-testid="platform-version">منصة CMS الطبية — الإصدار {version}</p>
          <p>تطبيق ويب تقدمي (PWA)</p>
          <p>© 2026 CMS</p>
        </div>
      </section>
    </div>
  );
}
