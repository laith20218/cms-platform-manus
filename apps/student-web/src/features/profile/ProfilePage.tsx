// CMS student profile: clinical account summary with privacy-preserving subscription codes.
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CalendarDays, Camera, CheckCircle2, Clock3, GraduationCap, KeyRound, Loader2, LockKeyhole, LogOut, Mail, Pencil, ShieldCheck, UserRound, X } from 'lucide-react';
import { useAuth } from '@/app/providers/useAuth';
import { authApi } from '@/features/auth/services/auth-api';
import { profileApi } from './services/profile-api';

function dateLabel(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('ar-SY', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
}

function scopeLabel(scope: string) {
  return ({ university: 'جامعة', college: 'كلية', year: 'سنة', semester: 'فصل', subject: 'مادة' } as Record<string, string>)[scope.toLowerCase()] ?? scope;
}

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: 'easeOut' as const },
};

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
  // Avatar upload state — the freshly signed preview URL shows instantly while
  // the profile query refetches (Push 8 avatar fix).
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [freshAvatarUrl, setFreshAvatarUrl] = useState<string | null>(null);
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

  if (profile.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--cms-teal-600)]" />
      </div>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <motion.section
        {...fadeUp}
        className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-8 text-center shadow-sm"
      >
        <h1 className="text-lg font-bold text-[var(--cms-text)]">تعذر تحميل الملف الشخصي</h1>
        <button
          onClick={() => profile.refetch()}
          className="mt-4 rounded-lg bg-[var(--cms-teal-600)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--cms-teal-700)]"
        >
          إعادة المحاولة
        </button>
      </motion.section>
    );
  }

  const data = profile.data;
  const isActive = data.status === 'Active';

  // Avatar upload handler
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    try {
      const result = await profileApi.uploadAvatar(file);
      // Instant feedback: the upload response carries a signed preview URL.
      if (result.previewUrl) setFreshAvatarUrl(result.previewUrl);
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

  const startEmailEdit = () => {
    setEmailValue(data.email || '');
    setEmailEditing(true);
  };

  return (
    <motion.main {...fadeUp} className="mx-auto max-w-5xl space-y-6">
      {/* ===== Profile Header Card — NO colored strip ===== */}
      <section className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6 shadow-sm md:p-8">
        {/* Top row: Edit button (ghost/outline) in the top-right corner */}
        <div className="mb-6 flex">
          <button
            type="button"
            onClick={startEmailEdit}
            disabled={emailEditing}
            aria-label="تعديل البريد الإلكتروني"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cms-line-strong)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--cms-text-soft)] transition-all duration-200 hover:border-[var(--cms-teal-100)] hover:bg-[var(--cms-teal-50)] hover:text-[var(--cms-teal-700)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            تعديل
          </button>
        </div>

        {/* Main row: Avatar on the RIGHT (start in RTL) · Name + phone + status on the LEFT (end in RTL) */}
        <div className="flex items-center justify-between gap-6">
          {/* Avatar with upload camera button */}
          <div className="relative shrink-0">
            {/* Push 8 avatar fix: the backend now presigns avatarUrl in GET /profile.
                freshAvatarUrl covers the instant right after upload (preview URL from
                the upload response) while the profile query refetches. */}
            {(() => {
              const avatarSrc = freshAvatarUrl
                ?? (data.avatarUrl && /^https?:\/\//i.test(data.avatarUrl) ? data.avatarUrl : null);
              return (
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-[var(--cms-line)] bg-[var(--cms-teal-50)] text-2xl font-bold text-[var(--cms-teal-700)]">
                  {avatarSrc ? (
                    <img
                      src={avatarSrc}
                      alt={`الصورة الشخصية — ${data.fullName}`}
                      className="h-full w-full object-cover"
                      onError={(event) => { event.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    data.fullName.charAt(0)
                  )}
                </div>
              );
            })()}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarBusy}
              title="تغيير الصورة الشخصية"
              aria-label="تغيير الصورة الشخصية"
              className="press absolute -bottom-1 -left-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[var(--cms-teal-600)] text-white shadow-md transition-colors hover:bg-[var(--cms-teal-700)] disabled:opacity-50"
            >
              {avatarBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>

          {/* Name + phone + status badge */}
          <div className="min-w-0 flex-1 text-end">
            <h1 className="text-xl font-bold text-[var(--cms-text)]">{data.fullName}</h1>
            <p className="mt-1 text-sm text-[var(--cms-text-muted)]" dir="ltr">{data.phone}</p>
            <div className="mt-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  isActive
                    ? 'bg-[var(--cms-success-50)] text-[var(--cms-success)]'
                    : 'bg-[var(--cms-ivory-200)] text-[var(--cms-text-muted)]'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-[var(--cms-success)]' : 'bg-[var(--cms-text-muted)]'}`}
                />
                {isActive ? 'نشط' : data.status}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 2-column grid: account info + academic path ===== */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Account info */}
        <section className="space-y-5 rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6 shadow-sm md:p-8 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--cms-text)]">
            <UserRound className="h-5 w-5 text-[var(--cms-teal-600)]" />
            معلومات الحساب
          </h2>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-[var(--cms-text-muted)]">رقم الهاتف</dt>
              <dd className="mt-1 font-bold text-[var(--cms-text)]" dir="ltr">{data.phone}</dd>
            </div>
            <div>
              <dt className="text-[var(--cms-text-muted)]">البريد الإلكتروني</dt>
              {emailEditing ? (
                <dd className="mt-1 flex items-center gap-2">
                  <input
                    type="email"
                    value={emailValue}
                    onChange={(e) => setEmailValue(e.target.value)}
                    placeholder="example@email.com"
                    className="h-9 flex-1 rounded-lg border border-[var(--cms-line-strong)] bg-white px-3 text-sm outline-none transition-colors focus:border-[var(--cms-teal-500)]"
                    disabled={emailBusy}
                  />
                  <button
                    type="button"
                    onClick={handleEmailSave}
                    disabled={emailBusy}
                    className="inline-flex h-9 items-center gap-1 rounded-lg bg-[var(--cms-teal-600)] px-3 text-xs font-bold text-white transition-colors hover:bg-[var(--cms-teal-700)] disabled:opacity-50"
                  >
                    {emailBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    حفظ
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEmailEditing(false); setEmailValue(data.email || ''); }}
                    disabled={emailBusy}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--cms-line-strong)] bg-white px-3 text-xs font-medium text-[var(--cms-text-soft)] transition-colors hover:bg-[var(--cms-ivory-100)] disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    إلغاء
                  </button>
                </dd>
              ) : (
                <dd className="mt-1 flex items-center justify-between">
                  <span className="font-bold text-[var(--cms-text)]">{data.email || 'غير مضاف'}</span>
                  <button
                    type="button"
                    onClick={startEmailEdit}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[var(--cms-teal-600)] transition-colors hover:text-[var(--cms-teal-700)] hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {data.email ? 'تعديل' : 'إضافة'}
                  </button>
                </dd>
              )}
            </div>
            <div>
              <dt className="text-[var(--cms-text-muted)]">تاريخ إنشاء الحساب</dt>
              <dd className="mt-1 font-bold text-[var(--cms-text)]">{dateLabel(data.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-[var(--cms-text-muted)]">آخر دخول</dt>
              <dd className="mt-1 font-bold text-[var(--cms-text)]">{dateLabel(data.lastLogin)}</dd>
            </div>
          </dl>
        </section>

        {/* Academic path */}
        <section className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6 shadow-sm md:p-8 lg:col-span-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--cms-text)]">
            <GraduationCap className="h-5 w-5 text-[var(--cms-teal-600)]" />
            المسار الأكاديمي
          </h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[['الجامعة', data.universityName], ['الكلية', data.collegeName], ['السنة', data.academicYearName]].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[var(--cms-line)] bg-[var(--cms-ivory-100)] p-4">
                <p className="text-xs text-[var(--cms-text-muted)]">{label}</p>
                <p className="mt-2 font-bold text-[var(--cms-text)]">{value || 'غير محدد'}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-[var(--cms-success)]" />
            <span className="text-[var(--cms-text-soft)]">
              الحالة: <span className="font-semibold text-[var(--cms-success)]">{isActive ? 'نشط' : data.status}</span>
            </span>
          </div>
        </section>
      </div>

      {/* ===== Account security (password change + logout) ===== */}
      <section className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6 shadow-sm md:p-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[var(--cms-teal-50)] p-2 text-[var(--cms-teal-600)]">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--cms-text)]">حماية الحساب</h2>
              <p className="mt-1 text-sm text-[var(--cms-text-muted)]">غيّر كلمة المرور من قناة مصادق عليها. لا تُعرض كلمات المرور أو الرموز في السجل.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowPasswordForm((value) => !value); setPasswordStatus(null); }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--cms-line-strong)] bg-white px-4 py-2 text-sm font-semibold text-[var(--cms-text-soft)] transition-all duration-200 hover:border-[var(--cms-teal-100)] hover:bg-[var(--cms-teal-50)] hover:text-[var(--cms-teal-700)]"
            >
              <KeyRound className="h-4 w-4" />
              {showPasswordForm ? 'إلغاء' : 'تغيير كلمة المرور'}
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--cms-danger-50)] bg-[var(--cms-danger-50)] px-4 py-2 text-sm font-bold text-[var(--cms-danger)] transition-colors hover:bg-red-100"
            >
              <LogOut className="h-4 w-4" />
              تسجيل الخروج
            </button>
          </div>
        </header>

        {showPasswordForm && (
          <form
            onSubmit={submitPasswordChange}
            className="mt-6 grid gap-4 rounded-xl border border-[var(--cms-line)] bg-[var(--cms-ivory-100)] p-5 sm:grid-cols-3"
          >
            <label className="grid gap-2 text-sm font-semibold text-[var(--cms-text-soft)]">
              كلمة المرور الحالية
              <input
                required
                autoComplete="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="h-11 rounded-lg border border-[var(--cms-line-strong)] bg-white px-3 outline-none transition-colors focus:border-[var(--cms-teal-500)]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--cms-text-soft)]">
              كلمة المرور الجديدة
              <input
                required
                minLength={8}
                autoComplete="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="h-11 rounded-lg border border-[var(--cms-line-strong)] bg-white px-3 outline-none transition-colors focus:border-[var(--cms-teal-500)]"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[var(--cms-text-soft)]">
              تأكيد كلمة المرور
              <input
                required
                minLength={8}
                autoComplete="new-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="h-11 rounded-lg border border-[var(--cms-line-strong)] bg-white px-3 outline-none transition-colors focus:border-[var(--cms-teal-500)]"
              />
            </label>
            {passwordStatus && (
              <p
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm sm:col-span-3 ${
                  passwordStatus.kind === 'success'
                    ? 'bg-[var(--cms-success-50)] text-[var(--cms-success)]'
                    : 'bg-[var(--cms-danger-50)] text-[var(--cms-danger)]'
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                {passwordStatus.text}
              </p>
            )}
            <div className="flex justify-end sm:col-span-3">
              <button
                type="submit"
                disabled={passwordBusy}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[var(--cms-teal-600)] px-5 text-sm font-bold text-white transition-colors hover:bg-[var(--cms-teal-700)] disabled:opacity-60"
              >
                {passwordBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                حفظ كلمة المرور
              </button>
            </div>
          </form>
        )}

        <p className="mt-5 rounded-xl border border-dashed border-[var(--cms-line-strong)] bg-[var(--cms-ivory-100)] p-4 text-sm text-[var(--cms-text-muted)]">
          إدارة الجلسات والأجهزة ستضاف بعد توفير مسار آمن يعرض جلسات الطالب ويتيح إبطالها؛ لا تُعرض هذه العملية كزر شكلي قبل وجود دعم خادمي صريح.
        </p>
      </section>

      {/* ===== Subscriptions & activated codes ===== */}
      <section className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6 shadow-sm md:p-8">
        <header className="flex items-center gap-3">
          <div className="rounded-xl bg-[var(--cms-teal-50)] p-2 text-[var(--cms-teal-600)]">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--cms-text)]">الاشتراكات والأكواد المفعّلة</h2>
            <p className="mt-1 text-sm text-[var(--cms-text-muted)]">تُعرض الرموز مموّهة لحماية حسابك.</p>
          </div>
        </header>

        {data.subscriptions.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-[var(--cms-line-strong)] bg-[var(--cms-ivory-100)] p-8 text-center text-sm text-[var(--cms-text-muted)]">
            لا توجد اشتراكات مفعّلة أو سابقة حتى الآن.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {data.subscriptions.map((subscription) => {
              const active = subscription.status === 'Active' && new Date(subscription.expiresAt) > new Date();
              return (
                <article
                  key={subscription.id}
                  className="flex flex-col gap-4 rounded-xl border border-[var(--cms-line)] bg-white p-4 transition-colors hover:border-[var(--cms-line-strong)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-mono text-sm font-bold tracking-wider text-[var(--cms-text)]">
                      {subscription.maskedCode || 'اشتراك يدوي'}
                    </p>
                    <p className="mt-1 text-sm text-[var(--cms-text-soft)]">
                      نطاق {scopeLabel(subscription.scopeType)} · فُعّل في {dateLabel(subscription.startsAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        active
                          ? 'bg-[var(--cms-success-50)] text-[var(--cms-success)]'
                          : 'bg-[var(--cms-ivory-200)] text-[var(--cms-text-muted)]'
                      }`}
                    >
                      {active ? 'نشط' : 'منتهٍ أو موقوف'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-[var(--cms-text-muted)]">
                      <CalendarDays className="h-3.5 w-3.5" />
                      ينتهي {dateLabel(subscription.expiresAt)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <p className="flex items-center gap-2 text-xs text-[var(--cms-text-muted)]">
        <Clock3 className="h-3.5 w-3.5" />
        تُحدّث حالة الاشتراكات تلقائيًا وفق تاريخ الانتهاء وإدارة المنصة.
      </p>
    </motion.main>
  );
}
