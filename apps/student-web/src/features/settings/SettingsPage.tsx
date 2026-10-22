/**
 * SettingsPage — student account settings (WF-S14).
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Settings as SettingsIcon, Moon, Bell, Lock, Loader2 } from 'lucide-react';
import { apiClient } from '@/services/api-client';

export default function SettingsPage() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
  };

  const passwordMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/auth/change-password', { oldPassword, newPassword });
    },
    onSuccess: () => {
      toast.success('تم تغيير كلمة المرور');
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.detail || 'فشل');
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
        <h2 className="text-base font-semibold mb-4 text-[var(--cms-text)] flex items-center gap-2"><Bell className="w-4 h-4" /> الإشعارات</h2>
        <div className="flex items-center justify-between">
          <span className="text-sm text-[var(--cms-text-soft)]">تلقّي الإشعارات</span>
          <button onClick={() => setNotifEnabled(!notifEnabled)} className="relative w-12 h-6 rounded-full transition-colors" style={{ background: notifEnabled ? 'var(--cms-teal-700)' : 'var(--cms-line-strong)' }}>
            <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform" style={{ transform: notifEnabled ? 'translateX(2px)' : 'translateX(26px)' }} />
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6">
        <h2 className="text-base font-semibold mb-4 text-[var(--cms-text)] flex items-center gap-2"><Lock className="w-4 h-4" /> تغيير كلمة المرور</h2>
        <form onSubmit={handlePassword} className="space-y-3">
          <input type="password" placeholder="كلمة المرور الحالية" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required className="w-full h-11 rounded-xl border border-[var(--cms-line)] bg-[var(--cms-ivory-50)] px-4 text-sm focus:outline-none" />
          <input type="password" placeholder="كلمة المرور الجديدة (8 أحرف)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} className="w-full h-11 rounded-xl border border-[var(--cms-line)] bg-[var(--cms-ivory-50)] px-4 text-sm focus:outline-none" />
          <input type="password" placeholder="تأكيد كلمة المرور" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} className="w-full h-11 rounded-xl border border-[var(--cms-line)] bg-[var(--cms-ivory-50)] px-4 text-sm focus:outline-none" />
          <button type="submit" disabled={passwordMutation.isPending} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-white disabled:opacity-50" style={{ background: 'var(--cms-teal-700)' }}>
            {passwordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} تغيير
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6">
        <h2 className="text-base font-semibold mb-2 text-[var(--cms-text)]">حول</h2>
        <div className="space-y-1 text-sm text-[var(--cms-text-muted)]">
          <p>منصة CMS الطبية — الإصدار 1.0.0</p>
          <p>تطبيق ويب تقدمي (PWA)</p>
          <p>© 2026 CMS</p>
        </div>
      </section>
    </div>
  );
}
