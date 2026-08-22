// CMS student profile: clinical account summary with privacy-preserving subscription codes.
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock3, GraduationCap, KeyRound, Loader2, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '@/app/providers/useAuth';
import { profileApi } from './services/profile-api';

function dateLabel(value?: string | null) {
  return value ? new Date(value).toLocaleDateString('ar-SY', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
}

function scopeLabel(scope: string) {
  return ({ university: 'جامعة', college: 'كلية', year: 'سنة', semester: 'فصل', subject: 'مادة' } as Record<string, string>)[scope.toLowerCase()] ?? scope;
}

export default function ProfilePage() {
  const { logout } = useAuth();
  const profile = useQuery({ queryKey: ['student-profile'], queryFn: profileApi.get });

  if (profile.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-[var(--c-primary-700)]" /></div>;
  if (profile.isError || !profile.data) return <section className="rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 text-center"><h1 className="text-lg font-bold text-[var(--c-text)]">تعذر تحميل الملف الشخصي</h1><button onClick={() => profile.refetch()} className="mt-4 rounded-lg bg-[var(--c-primary-700)] px-4 py-2 text-sm font-semibold text-white">إعادة المحاولة</button></section>;

  const data = profile.data;
  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <section className="overflow-hidden rounded-3xl border border-[var(--c-border-glass)] bg-[var(--c-glass)]" style={{ boxShadow: 'var(--shadow-glass)' }}>
        <div className="h-24" style={{ background: 'var(--grad-primary)' }} />
        <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="-mt-11 flex items-end gap-4"><div className="flex h-20 w-20 items-center justify-center rounded-3xl border-4 border-white text-2xl font-extrabold text-white" style={{ background: 'var(--grad-primary)' }}>{data.fullName.charAt(0)}</div><div className="pb-1"><h1 className="text-2xl font-extrabold text-[var(--c-text)]">{data.fullName}</h1><p className="mt-1 text-sm text-[var(--c-text-muted)]">{data.phone}</p></div></div>
          <button onClick={() => void logout()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-600 transition-colors hover:bg-red-100"><LogOut className="h-4 w-4" />تسجيل الخروج</button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="space-y-5 rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 lg:col-span-2"><h2 className="flex items-center gap-2 text-lg font-extrabold text-[var(--c-text)]"><UserRound className="h-5 w-5 text-[var(--c-primary-700)]" />معلومات الحساب</h2><dl className="space-y-4 text-sm"><div><dt className="text-[var(--c-text-muted)]">رقم الهاتف</dt><dd className="mt-1 font-bold text-[var(--c-text)]">{data.phone}</dd></div><div><dt className="text-[var(--c-text-muted)]">البريد الإلكتروني</dt><dd className="mt-1 font-bold text-[var(--c-text)]">{data.email || 'غير مضاف'}</dd></div><div><dt className="text-[var(--c-text-muted)]">تاريخ إنشاء الحساب</dt><dd className="mt-1 font-bold text-[var(--c-text)]">{dateLabel(data.createdAt)}</dd></div><div><dt className="text-[var(--c-text-muted)]">آخر دخول</dt><dd className="mt-1 font-bold text-[var(--c-text)]">{dateLabel(data.lastLogin)}</dd></div></dl></section>
        <section className="rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6 lg:col-span-3"><h2 className="flex items-center gap-2 text-lg font-extrabold text-[var(--c-text)]"><GraduationCap className="h-5 w-5 text-[var(--c-primary-700)]" />المسار الأكاديمي</h2><div className="mt-5 grid gap-3 sm:grid-cols-3">{[['الجامعة', data.universityName], ['الكلية', data.collegeName], ['السنة', data.academicYearName]].map(([label, value]) => <div key={label} className="rounded-2xl bg-[var(--c-bg)] p-4"><p className="text-xs text-[var(--c-text-muted)]">{label}</p><p className="mt-2 font-bold text-[var(--c-text)]">{value || 'غير محدد'}</p></div>)}</div><div className="mt-5 flex items-center gap-2 text-sm text-emerald-700"><ShieldCheck className="h-4 w-4" />الحالة: {data.status === 'Active' ? 'نشط' : data.status}</div></section>
      </div>

      <section className="rounded-3xl border border-[var(--c-border)] bg-[var(--c-surface)] p-6"><header className="flex items-center gap-3"><div className="rounded-xl bg-[var(--c-primary-50)] p-2 text-[var(--c-primary-700)]"><KeyRound className="h-5 w-5" /></div><div><h2 className="text-lg font-extrabold text-[var(--c-text)]">الاشتراكات والأكواد المفعّلة</h2><p className="mt-1 text-sm text-[var(--c-text-muted)]">تُعرض الرموز مموّهة لحماية حسابك.</p></div></header>{data.subscriptions.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-[var(--c-border-strong)] bg-[var(--c-bg)] p-8 text-center text-sm text-[var(--c-text-muted)]">لا توجد اشتراكات مفعّلة أو سابقة حتى الآن.</div> : <div className="mt-6 space-y-3">{data.subscriptions.map((subscription) => { const active = subscription.status === 'Active' && new Date(subscription.expiresAt) > new Date(); return <article key={subscription.id} className="flex flex-col gap-4 rounded-2xl border border-[var(--c-border)] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-sm font-extrabold tracking-wider text-[var(--c-text)]">{subscription.maskedCode || 'اشتراك يدوي'}</p><p className="mt-1 text-sm text-[var(--c-text-soft)]">نطاق {scopeLabel(subscription.scopeType)} · فُعّل في {dateLabel(subscription.startsAt)}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-[var(--c-bg)] text-[var(--c-text-muted)]'}`}>{active ? 'نشط' : 'منتهٍ أو موقوف'}</span><span className="inline-flex items-center gap-1 text-xs text-[var(--c-text-muted)]"><CalendarDays className="h-3.5 w-3.5" />ينتهي {dateLabel(subscription.expiresAt)}</span></div></article>; })}</div>}</section>
      <p className="flex items-center gap-2 text-xs text-[var(--c-text-muted)]"><Clock3 className="h-3.5 w-3.5" />تُحدّث حالة الاشتراكات تلقائيًا وفق تاريخ الانتهاء وإدارة المنصة.</p>
    </main>
  );
}
