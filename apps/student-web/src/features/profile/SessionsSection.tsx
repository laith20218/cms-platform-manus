import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Globe, Laptop, Loader2, MonitorSmartphone, ShieldCheck, Smartphone, Tablet,
} from 'lucide-react';
import { profileApi, type StudentSession } from './services/profile-api';

/**
 * Sessions & devices (Push 9 Task 3) — Google's account-security pattern:
 * a readable list of active devices with last-activity context, a per-session
 * red revoke action, and a single "log out everywhere else" control. The
 * current device is clearly labeled and never revocable from here (you'd only
 * log yourself out — that's what the logout button is for).
 */

function deviceIcon(session: StudentSession) {
  const type = session.deviceType ?? 'desktop';
  if (type === 'mobile') return Smartphone;
  if (type === 'tablet') return Tablet;
  if (type === 'desktop') return Laptop;
  return MonitorSmartphone;
}

function deviceLabel(session: StudentSession): string {
  const parts = [session.browser, session.os].filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  return session.current ? 'هذا الجهاز' : 'جلسة سابقة';
}

function lastActiveLabel(session: StudentSession): string {
  if (session.current) return 'نشطة الآن';
  const last = new Date(session.lastActivityAt);
  const diffMs = Date.now() - last.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'نشطة الآن';
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.round(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return last.toLocaleDateString('ar-SY', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function SessionsSection() {
  const queryClient = useQueryClient();
  const [confirmingOthers, setConfirmingOthers] = useState(false);

  const sessions = useQuery({
    queryKey: ['my-sessions'],
    queryFn: profileApi.getSessions,
    staleTime: 30_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
  };

  const revokeOne = useMutation({
    mutationFn: profileApi.revokeSession,
    onSuccess: () => {
      toast.success('تم إنهاء الجلسة');
      invalidate();
    },
    onError: () => toast.error('تعذّر إنهاء الجلسة. حاول مجدداً.'),
  });

  const revokeOthers = useMutation({
    mutationFn: profileApi.revokeOtherSessions,
    onSuccess: (result) => {
      const count = result?.revokedCount ?? 0;
      toast.success(count > 0 ? `تم تسجيل الخروج من ${count} جهاز آخر` : 'لا توجد أجهزة أخرى نشطة');
      setConfirmingOthers(false);
      invalidate();
    },
    onError: () => toast.error('تعذّر تنفيذ العملية. حاول مجدداً.'),
  });

  const items = sessions.data ?? [];
  const active = items.filter((s) => s.isActive);
  const others = active.filter((s) => !s.current);

  return (
    <section
      className="rounded-2xl border border-[var(--cms-line)] bg-[var(--cms-surface)] p-6 shadow-sm md:p-8"
      data-testid="sessions-section"
      aria-label="الأجهزة والجلسات"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[var(--cms-teal-50)] p-2 text-[var(--cms-teal-600)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[var(--cms-text)]">الأجهزة والجلسات</h2>
            <p className="mt-1 text-sm text-[var(--cms-text-muted)]">
              كل جهاز دخل إلى حسابك مؤخراً. أنهِ أي جلسة لا تعرفها فوراً.
            </p>
          </div>
        </div>
        {others.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmingOthers((v) => !v)}
            className="press inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--cms-danger)] bg-transparent px-4 py-2 text-sm font-bold text-[var(--cms-danger)] transition-colors hover:bg-[var(--cms-danger-50)]"
            data-testid="revoke-others-toggle"
          >
            تسجيل الخروج من بقية الأجهزة
          </button>
        )}
      </header>

      {confirmingOthers && others.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex flex-col gap-3 rounded-xl border border-[var(--cms-danger)] bg-[var(--cms-danger-50)] p-4 sm:flex-row sm:items-center sm:justify-between"
          data-testid="revoke-others-confirm"
          role="alertdialog"
          aria-label="تأكيد تسجيل الخروج من الأجهزة الأخرى"
        >
          <p className="text-sm font-semibold text-[var(--cms-danger)]">
            سيتم إنهاء {others.length} جلسة أخرى على أجهزة أخرى. هذا الجهاز سيبقى مسجلاً.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => revokeOthers.mutate()}
              disabled={revokeOthers.isPending}
              className="press inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--cms-danger)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              data-testid="revoke-others-confirm-button"
            >
              {revokeOthers.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              نعم، أنهِ الجلسات
            </button>
            <button
              type="button"
              onClick={() => setConfirmingOthers(false)}
              className="press inline-flex min-h-11 items-center rounded-lg border border-[var(--cms-line-strong)] px-4 py-2 text-sm font-semibold text-[var(--cms-text-soft)]"
            >
              إلغاء
            </button>
          </div>
        </motion.div>
      )}

      {sessions.isLoading ? (
        <div className="mt-6 space-y-3" data-testid="sessions-loading">
          {[0, 1].map((row) => (
            <div key={row} className="player-skeleton h-[76px] rounded-xl" />
          ))}
        </div>
      ) : sessions.isError ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--cms-line-strong)] bg-[var(--cms-surface-2)] p-8 text-center" data-testid="sessions-error">
          <p className="text-sm font-semibold text-[var(--cms-text)]">تعذّر تحميل الجلسات</p>
          <p className="mt-1 text-xs text-[var(--cms-text-muted)]">تحقّق من اتصالك ثم أعد المحاولة.</p>
          <button
            type="button"
            onClick={() => sessions.refetch()}
            className="press mt-4 inline-flex min-h-11 items-center rounded-2xl px-6 py-2 text-sm font-bold text-white shadow-md"
            style={{ background: 'var(--cms-teal-700)' }}
          >
            إعادة المحاولة
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[var(--cms-line-strong)] bg-[var(--cms-surface-2)] p-8 text-center" data-testid="sessions-empty">
          <Globe className="mx-auto h-10 w-10 text-[var(--cms-text-muted)]" />
          <p className="mt-3 text-sm font-semibold text-[var(--cms-text)]">لا توجد جلسات لعرضها</p>
          <p className="mt-1 text-xs text-[var(--cms-text-muted)]">ستظهر أجهزتك هنا بعد أول تسجيل دخول.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3" data-testid="sessions-list">
          {items.map((session) => {
            const Icon = deviceIcon(session);
            return (
              <li
                key={session.id}
                className={`flex flex-col gap-3 rounded-xl border p-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                  session.current
                    ? 'border-[var(--cms-teal-100)] bg-[var(--cms-teal-50)]'
                    : session.isActive
                    ? 'border-[var(--cms-line)] bg-[var(--cms-surface-2)]'
                    : 'border-[var(--cms-line)] bg-transparent opacity-70'
                }`}
                data-testid="session-row"
                data-current={session.current || undefined}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    session.isActive ? 'bg-[var(--cms-teal-100)] text-[var(--cms-teal-700)]' : 'bg-[var(--cms-surface-3)] text-[var(--cms-text-muted)]'
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-[var(--cms-text)]" data-testid="session-device">
                        {deviceLabel(session)}
                      </p>
                      {session.current && (
                        <span className="rounded-full bg-[var(--cms-teal-100)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--cms-teal-700)]">
                          هذا الجهاز
                        </span>
                      )}
                      {!session.isActive && (
                        <span className="rounded-full bg-[var(--cms-surface-3)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--cms-text-muted)]">
                          منتهية
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--cms-text-muted)]">
                      <span data-testid="session-last-active">{lastActiveLabel(session)}</span>
                      {session.ipAddress && <span dir="ltr" lang="en">IP: {session.ipAddress}</span>}
                    </p>
                  </div>
                </div>
                {session.isActive && !session.current && (
                  <button
                    type="button"
                    onClick={() => revokeOne.mutate(session.id)}
                    disabled={revokeOne.isPending}
                    className="press inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--cms-danger)] px-4 py-2 text-xs font-bold text-[var(--cms-danger)] transition-colors hover:bg-[var(--cms-danger-50)] disabled:opacity-60"
                    data-testid="session-revoke"
                    aria-label={`إنهاء جلسة ${deviceLabel(session)}`}
                  >
                    {revokeOne.isPending && revokeOne.variables === session.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : null}
                    إنهاء الجلسة
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
