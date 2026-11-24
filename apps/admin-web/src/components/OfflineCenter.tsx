import { useCallback, useEffect, useState } from 'react';
import { Ban, CloudOff, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import { apiRequest } from '../lib/api';

/**
 * Wave 4 (Owner decision 2026-11-23) — Arabic-first admin visibility + revocation
 * for the offline question-package ledger. Lifecycle fields only (the API never
 * returns envelope material). Honest framing: issuance happens from the student
 * app; this center watches and revokes.
 */

type Props = { token: string; isArabic: boolean; onError: (message: string) => void; onNotice: (message: string) => void };

interface AdminOfflinePackage {
  packageId: string;
  studentId: string;
  studentName: string;
  installationId: string;
  contentVersion: number;
  status: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

function shortId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function statusOf(row: AdminOfflinePackage): { key: 'active' | 'revoked' | 'expired'; label: string; className: string } {
  if (row.revokedAt || row.status === 'revoked') {
    return { key: 'revoked', label: 'ملغاة', className: 'text-[var(--c-danger-500)] border-[var(--c-danger-500)]/40 bg-[rgba(255,82,82,0.08)]' };
  }
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    return { key: 'expired', label: 'منتهية الصلاحية', className: 'text-[var(--c-text-muted)] border-[var(--c-border-strong)] bg-[var(--c-surface-2,transparent)]' };
  }
  return { key: 'active', label: 'نشطة', className: 'text-[var(--c-primary-700)] border-[var(--c-primary-700)]/40 bg-[var(--c-primary-50)]' };
}

export function OfflineCenter({ token, isArabic, onError, onNotice }: Props) {
  const [rows, setRows] = useState<AdminOfflinePackage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [studentFilter, setStudentFilter] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<AdminOfflinePackage | null>(null);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit) => apiRequest<T>(path, token, init),
    [token],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ pageSize: '100' });
      if (studentFilter.trim()) params.set('studentId', studentFilter.trim());
      const data = await request<AdminOfflinePackage[]>(`/api/v1/admin/offline/packages?${params.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر تحميل الحزم دون اتصال.');
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [request, studentFilter, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const revoke = async (row: AdminOfflinePackage) => {
    setRevoking(row.packageId);
    setConfirmTarget(null);
    try {
      await request(`/api/v1/admin/offline/packages/${row.packageId}/revoke`, { method: 'POST' });
      onNotice('تم إلغاء الحزمة — تتوقف عند أول اتصال تالٍ للجهاز.');
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'تعذر إلغاء الحزمة.');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <section dir={isArabic ? 'rtl' : 'ltr'} data-testid="offline-center-root" className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--grad-primary)' }}>
          <CloudOff className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-extrabold">{isArabic ? 'الحزم دون اتصال (حزم الأسئلة المشفّرة)' : 'Offline packages'}</h2>
          <p className="text-xs text-[var(--c-text-muted)]">
            {isArabic
              ? 'رؤية وإبطال فقط — الإصدار يتم من تطبيق الطالب عبر القناة المشفّرة المرتبطة بالجهاز.'
              : 'Visibility + revocation only — issuance happens from the student app.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label={isArabic ? 'تحديث قائمة الحزم' : 'Refresh packages'}
          data-testid="offline-refresh"
          className="inline-flex items-center gap-2 min-h-10 px-4 rounded-xl border border-[var(--c-border)] text-sm font-bold disabled:opacity-50"
        >
          {loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {isArabic ? 'تحديث' : 'Refresh'}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-sm font-semibold">
          <Search className="w-4 h-4 text-[var(--c-text-muted)]" />
          {isArabic ? 'معرّف الطالب (UUID، اختياري)' : 'Student UUID (optional)'}
        </label>
        <input
          value={studentFilter}
          onChange={(event) => setStudentFilter(event.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          data-testid="offline-student-filter"
          className="min-h-10 flex-1 min-w-[240px] max-w-md rounded-xl border border-[var(--c-border)] px-3 text-sm font-mono"
        />
        <button
          type="button"
          onClick={() => void refresh()}
          className="min-h-10 px-4 rounded-xl text-sm font-bold text-white"
          style={{ background: 'var(--grad-primary)' }}
        >
          {isArabic ? 'تصفية' : 'Filter'}
        </button>
      </div>

      {rows === null ? (
        <div className="p-8 text-center text-sm text-[var(--c-text-muted)]" data-testid="offline-center-error">
          {isArabic ? 'تعذر تحميل القائمة — حاول التحديث.' : 'Failed to load — try refreshing.'}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-[var(--c-text-muted)]" data-testid="offline-center-empty">
          {isArabic ? 'لا توجد حزم مسجّلة بعد.' : 'No packages recorded yet.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--c-border)]" data-testid="offline-center-table">
          <table className="w-full text-sm">
            <thead className="bg-[var(--c-surface-2,var(--c-bg))] text-[var(--c-text-muted)]">
              <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-start [&>th]:text-xs [&>th]:font-bold">
                <th>#</th>
                <th>{isArabic ? 'الطالب' : 'Student'}</th>
                <th>{isArabic ? 'التثبيت' : 'Installation'}</th>
                <th>{isArabic ? 'الحالة' : 'Status'}</th>
                <th>{isArabic ? 'الإصدار' : 'Issued'}</th>
                <th>{isArabic ? 'انتهاء الصلاحية' : 'Expires'}</th>
                <th>{isArabic ? 'إجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--c-border)]">
              {rows.map((row) => {
                const status = statusOf(row);
                return (
                  <tr key={row.packageId} className="[&>td]:px-3 [&>td]:py-2.5 [&>td]:align-middle" data-testid={`offline-row-${row.packageId}`}>
                    <td className="font-mono text-xs text-[var(--c-text-muted)]">{shortId(row.packageId)}</td>
                    <td className="font-semibold">{row.studentName || shortId(row.studentId)}</td>
                    <td className="font-mono text-xs">{shortId(row.installationId)}</td>
                    <td>
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${status.className}`} data-testid={`offline-status-${status.key}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="text-xs" dir="ltr">{new Date(row.issuedAt).toLocaleString(isArabic ? 'ar' : 'en')}</td>
                    <td className="text-xs" dir="ltr">{new Date(row.expiresAt).toLocaleString(isArabic ? 'ar' : 'en')}</td>
                    <td>
                      {status.key === 'active' ? (
                        <button
                          type="button"
                          onClick={() => setConfirmTarget(row)}
                          disabled={revoking === row.packageId}
                          aria-label={isArabic ? `إلغاء الحزمة ${shortId(row.packageId)}` : `Revoke package`}
                          data-testid={`offline-revoke-${row.packageId}`}
                          className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl text-xs font-bold text-[var(--c-danger-500)] border border-[var(--c-danger-500)]/40 hover:bg-[rgba(255,82,82,0.08)] disabled:opacity-50"
                        >
                          {revoking === row.packageId ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                          {isArabic ? 'إلغاء' : 'Revoke'}
                        </button>
                      ) : (
                        <span className="text-xs text-[var(--c-text-faint)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {confirmTarget && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-6" role="dialog" aria-modal="true" data-testid="offline-revoke-confirm">
          <button type="button" aria-label="إغلاق" className="absolute inset-0 bg-black/40 cursor-default" onClick={() => setConfirmTarget(null)} />
          <div className="relative max-w-sm w-full rounded-2xl border border-[var(--c-border)] bg-[var(--cms-surface,var(--c-bg))] p-6 space-y-3 text-center">
            <p className="text-sm font-extrabold">{isArabic ? 'تأكيد إلغاء الحزمة' : 'Confirm revocation'}</p>
            <p className="text-[13px] leading-relaxed text-[var(--c-text-muted)]">
              {isArabic
                ? `ستتوقف الحزمة ${shortId(confirmTarget.packageId)} للطالب ${confirmTarget.studentName} عند أول اتصال تالٍ — ولا يمكن فتحها أو تسديد إجابات منها بعد ذلك.`
                : `Package ${shortId(confirmTarget.packageId)} stops at the device's next online contact.`}
            </p>
            <div className="flex gap-2 justify-center pt-1">
              <button type="button" onClick={() => setConfirmTarget(null)} className="min-h-10 px-4 rounded-xl border border-[var(--c-border)] text-sm font-bold">
                {isArabic ? 'تراجع' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => void revoke(confirmTarget)}
                className="min-h-10 px-4 rounded-xl text-sm font-bold text-white bg-[var(--c-danger-500)]"
                data-testid="offline-revoke-confirm-go"
              >
                {isArabic ? 'إلغاء الحزمة' : 'Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
