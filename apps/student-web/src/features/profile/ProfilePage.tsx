// CMS student profile: clinical account summary with privacy-preserving subscription codes.
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Camera, CheckCircle2, Clock3, GraduationCap, KeyRound, Loader2, LockKeyhole, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '@/app/providers/useAuth';
import { authApi } from '@/features/auth/services/auth-api';
import { profileApi } from './services/profile-api';

function dateLabel(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('ar-SY', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
}

function scopeLabel(scope: string) {
  return ({ university: 'جامعة', college: 'كلية', year: 'سنة', semester: 'فصل', subject: 'مادة' } as Record<string, string>)[scope.toLowerCase()] ?? scope;
}

export default function ProfilePage() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['student-profile'], queryFn: profileApi.get });
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  // Avatar upload state
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Email edit state
  const [emailEditing, setEmailEditing] = useState(false);
  const [emailValue, setEmailValue] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  const submitPasswordChange = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordStatus(null);
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ kind: 'error', text: 'كلمتا المرور الجديدتان غير متطابقتين.' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordStatus({ kind: 'error', text: 'يجب أن تتكون كلمة المرور الجديدة من 8 محارف على الأقل.' });
      return;
    }
    setPasswordBusy(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStatus({ kind: 'success', text: 'تم تغيير كلمة المرور بنجاح. احرص على حفظها في مكان آمن.' });
    } catch {
      setPasswordStatus({ kind: 'error', text: 'تعذر تغيير كلمة المرور. تحقق من كلمة المرور الحالية ثم حاول مجدداً.' });
    } finally {
      setPasswordBusy(false);
    }
  };

  if (profile.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[var(--c-primary-700)]" /></div>;
  if (profile.isError || !profile.data) return <section className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center"><h1 className="text-lg font-bold text-[var(--c-text)]">تعذر تحميل الملف الشخصي</h1><button onClick={() => profile.refetch()} className="mt-4 rounded-lg bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white">إعادة المحاولة</button></section>;

  const data = profile.data;

  // Avatar upload handler
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    try {
      await profileApi.uploadAvatar(file);
      await queryClient.invalidateQueries({ queryKey: ['student-profile'] });
    } catch {
      // error — the profile query won't update, avatar stays unchanged
    } finally {
      setAvatarBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Email save handler
  const handleEmailSave = async () => {
    setEmailBusy(true);
    try {
      await profileApi.updateEmail(emailValue.trim() || null);
      await queryClient.invalidateQueries({ queryKey: ['student-profile'] });
      setEmailEditing(false);
    } catch {
      // keep editing open on error
    } finally {
      setEmailBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <section className="overflow-hidden rounded-3xl border border-[var(--c-border-glass)] bg-[var(--c-glass)]" style={{ boxShadow: 'var(--shadow-glass)' }}>
        <div className="h-24" style={{ background: 'var(--grad-primary)' }} />
        <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="-mt-11 flex items-end gap-4">
            {/* Avatar with upload button */}
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl border-4 border-white text-2xl font-extrabold text-white overflow-hidden" style={{ background: 'var(--grad-primary)' }}>
                {data.avatarUrl ? <img src={data.avatarUrl.startsWith('http') ? data.avatarUrl : undefined} alt={data.fullName} className="h-full w-full object-cover" /> : data.fullName.charAt(0)}
              </div>
              <button onClick={() => fileInputRef.current?.click()} disabled={avatarBusy} title="تغيير الصورة الشخصية" className="absolute -bottom-1 -left-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[var(--c-primary-700)] text-white shadow-md hover:bg-[var(--c-primary-600)] transition-colors disabled:opacity-50">
                {avatarBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </button>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarUpload} className="hidden" />
            </div>
            <div className="pb-1"><h1 className="text-2xl font-extrabold text-[var(--c-text)]">{data.fullName}</h1><p className="mt-1 text-sm text-[var(--c-text-muted)]">{data.phone}</p></div>
          </div>
          <button onClick={() => void logout()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 transition-colors hover:bg-red-100"><LogOut className="h-4 w-4" />تسجيل الخروج</button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="space-y-5 rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-[var(--c-text)]"><UserRound className="h-5 w-5 text-[var(--c-primary-700)]" />معلومات الحساب</h2>
          <dl className="space-y-4 text-sm">
            <div><dt className="text-[var(--c-text-muted)]">رقم الهاتف</dt><dd className="mt-1 font-bold text-[var(--c-text)]">{data.phone}</dd></div>
            <div>
              <dt className="text-[var(--c-text-muted)]">البريد الإلكتروني</dt>
              {emailEditing ? (
                <dd className="mt-1 flex items-center gap-2">
                  <input type="email" value={emailValue} onChange={(e) => setEmailValue(e.target.value)} placeholder="example@email.com" className="h-9 flex-1 rounded-lg border border-[var(--c-border-strong)] bg-white px-3 text-sm outline-none focus:border-[var(--c-primary-500)]" disabled={emailBusy} />
                  <button onClick={handleEmailSave} disabled={emailBusy} className="inline-flex h-9 items-center gap-1 rounded-lg bg-[var(--c-primary-700)] px-3 text-xs font-bold text-white disabled:opacity-50">{emailBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}حفظ</button>
                  <button onClick={() => { setEmailEditing(false); setEmailValue(data.email || ''); }} disabled={emailBusy} className="h-9 rounded-lg border border-[var(--c-border-strong)] px-3 text-xs font-medium text-[var(--c-text-soft)] hover:bg-[var(--c-bg)] disabled:opacity-50">إلغاء</button>
                </dd>
              ) : (
                <dd className="mt-1 flex items-center justify-between">
                  <span className="font-bold text-[var(--c-text)]">{data.email || 'غير مضاف'}</span>
                  <button onClick={() => { setEmailValue(data.email || ''); setEmailEditing(true); }} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--c-primary-700)] hover:underline"><Mail className="h-3.5 w-3.5" />{data.email ? 'تعديل' : 'إضافة'}</button>
                </dd>
              )}
            </div>
            <div><dt className="text-[var(--c-text-muted)]">تاريخ إنشاء الحساب</dt><dd className="mt-1 font-bold text-[var(--c-text)]">{dateLabel(data.createdAt)}</dd></div>
            <div><dt className="text-[var(--c-text-muted)]">آخر دخول</dt><dd className="mt-1 font-bold text-[var(--c-text)]">{dateLabel(data.lastLogin)}</dd></div>
          </dl>
        </section>
        <section className="rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 lg:col-span-3"><h2 className="flex items-center gap-2 text-lg font-extrabold text-[var(--c-text)]"><GraduationCap className="h-5 w-5 text-[var(--c-primary-700)]" />المسار الأكاديمي</h2><div className="mt-5 grid gap-3 sm:grid-cols-3">{[['الجامعة', data.universityName], ['الكلية', data.collegeName], ['السنة', data.academicYearName]].map(([label, value]) => <div key={label} className="rounded-2xl bg-[var(--c-bg)] p-4"><p className="text-xs text-[var(--c-text-muted)]">{label}</p><p className="mt-2 font-bold text-[var(--c-text)]">{value || 'غير محدد'}</p></div>)}</div><div className="mt-5 flex items-center gap-2 text-sm text-emerald-700"><ShieldCheck className="h-4 w-4" />الحالة: {data.status === 'Active' ? 'نشط' : data.status}</div></section>
      </div>

      <section className="rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6"><header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="rounded-xl bg-[var(--c-primary-50)] p-2 text-[var(--c-primary-700)]"><LockKeyhole className="h-5 w-5" /></div><div><h2 className="text-lg font-extrabold text-[var(--c-text)]">حماية الحساب</h2><p className="mt-1 text-sm text-[var(--c-text-muted)]">غيّر كلمة المرور من قناة مصادق عليها. لا تُعرض كلمات المرور أو الرموز في السجل.</p></div></div><button onClick={() => { setShowPasswordForm((value) => !value); setPasswordStatus(null); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--c-primary-200)] bg-[var(--c-primary-50)] px-4 py-2 text-sm font-bold text-[var(--c-primary-700)]"><KeyRound className="h-4 w-4" />{showPasswordForm ? 'إلغاء' : 'تغيير كلمة المرور'}</button></header>{showPasswordForm && <form onSubmit={submitPasswordChange} className="mt-6 grid gap-4 rounded-2xl border border-[var(--c-border)] bg-[var(--c-bg)] p-5 sm:grid-cols-3"><label className="grid gap-2 text-sm font-semibold text-[var(--c-text-soft)]">كلمة المرور الحالية<input required autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="h-11 rounded-xl border border-[var(--c-border-strong)] bg-white px-3 outline-none focus:border-[var(--c-primary-500)]" /></label><label className="grid gap-2 text-sm font-semibold text-[var(--c-text-soft)]">كلمة المرور الجديدة<input required minLength={8} autoComplete="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="h-11 rounded-xl border border-[var(--c-border-strong)] bg-white px-3 outline-none focus:border-[var(--c-primary-500)]" /></label><label className="grid gap-2 text-sm font-semibold text-[var(--c-text-soft)]">تأكيد كلمة المرور<input required minLength={8} autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="h-11 rounded-xl border border-[var(--c-border-strong)] bg-white px-3 outline-none focus:border-[var(--c-primary-500)]" /></label>{passwordStatus && <p className={`sm:col-span-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${passwordStatus.kind === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}><CheckCircle2 className="h-4 w-4" />{passwordStatus.text}</p>}<div className="sm:col-span-3 flex justify-end"><button disabled={passwordBusy} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--c-primary-700)] px-5 text-sm font-bold text-white disabled:opacity-60">{passwordBusy && <Loader2 className="h-4 w-4 animate-spin" />}حفظ كلمة المرور</button></div></form>}<p className="mt-5 rounded-2xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-bg)] p-4 text-sm text-[var(--c-text-muted)]">إدارة الجلسات والأجهزة ستضاف بعد توفير مسار آمن يعرض جلسات الطالب ويتيح إبطالها؛ لا تُعرض هذه العملية كزر شكلي قبل وجود دعم خادمي صريح.</p></section>

      <section className="rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6"><header className="flex items-center gap-3"><div className="rounded-xl bg-[var(--c-primary-50)] p-2 text-[var(--c-primary-700)]"><KeyRound className="h-5 w-5" /></div><div><h2 className="text-lg font-extrabold text-[var(--c-text)]">الاشتراكات والأكواد المفعّلة</h2><p className="mt-1 text-sm text-[var(--c-text-muted)]">تُعرض الرموز مموّهة لحماية حسابك.</p></div></header>{data.subscriptions.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-bg)] p-8 text-center text-sm text-[var(--c-text-muted)]">لا توجد اشتراكات مفعّلة أو سابقة حتى الآن.</div> : <div className="mt-6 space-y-3">{data.subscriptions.map((subscription) => { const active = subscription.status === 'Active' && new Date(subscription.expiresAt) > new Date(); return <article key={subscription.id} className="flex flex-col gap-4 rounded-2xl border border-[var(--c-border)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-sm font-extrabold tracking-wider text-[var(--c-text)]">{subscription.maskedCode || 'اشتراك يدوي'}</p><p className="mt-1 text-sm text-[var(--c-text-soft)]">نطاق {scopeLabel(subscription.scopeType)} · فُعّل في {dateLabel(subscription.startsAt)}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-[var(--c-bg)] text-[var(--c-text-muted)]'}`}>{active ? 'نشط' : 'منتهٍ أو موقوف'}</span><span className="inline-flex items-center gap-1 text-xs text-[var(--c-text-muted)]"><CalendarDays className="h-3.5 w-3.5" />ينتهي {dateLabel(subscription.expiresAt)}</span></div></article>; })}</div>}</section>
      <p className="flex items-center gap-2 text-xs text-[var(--c-text-muted)]"><Clock3 className="h-3.5 w-3.5" />تُحدّث حالة الاشتراكات تلقائيًا وفق تاريخ الانتهاء وإدارة المنصة.</p>
    </main>
  );
}
