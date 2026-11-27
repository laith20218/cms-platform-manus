import { useCallback, useEffect, useState } from 'react';
import { Ban, CloudOff, LoaderCircle, RefreshCw, Search } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { ConfirmDialog } from '@cms/ui';
import { t, localeOf } from '../lib/dictionary';

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
  const locale = localeOf(isArabic);
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
      onError(error instanceof Error ? error.message : t(localeOf(isArabic), 'codes.offline.loadFailed'));
      setRows(null);
    } finally {
      setLoading(false);
    }
    // isArabic rides the deps so the localized fallback message can never go
    // stale after a language toggle (PR-3 lint closure — zero warnings).
  }, [request, studentFilter, onError, isArabic]);

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
      onError(error instanceof Error ? error.message : t(locale, 'codes.offline.revokeFailed'));
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
          <h2 className="text-base font-extrabold">{t(locale, 'codes.offline.title')}</h2>
          <p className="text-xs text-[var(--c-text-muted)]">
            {t(locale, 'codes.offline.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label={t(locale, 'codes.offline.refreshLabel')}
          data-testid="offline-refresh"
          className="inline-flex items-center gap-2 min-h-10 px-4 rounded-xl border border-[var(--c-border)] text-sm font-bold disabled:opacity-50"
        >
          {loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {t(locale, 'codes.offline.refresh')}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-sm font-semibold">
          <Search className="w-4 h-4 text-[var(--c-text-muted)]" />
          {t(locale, 'codes.offline.studentUuid')}
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
          {t(locale, 'codes.offline.filter')}
        </button>
      </div>

      {rows === null ? (
        <div className="p-8 text-center text-sm text-[var(--c-text-muted)]" data-testid="offline-center-error">
          {t(locale, 'codes.offline.listFailed')}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-[var(--c-text-muted)]" data-testid="offline-center-empty">
          {t(locale, 'codes.offline.empty')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--c-border)]" data-testid="offline-center-table">
          <table className="w-full text-sm">
            <thead className="bg-[var(--c-surface-2,var(--c-bg))] text-[var(--c-text-muted)]">
              <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-start [&>th]:text-xs [&>th]:font-bold">
                <th>#</th>
                <th>{t(locale, 'codes.offline.columns.student')}</th>
                <th>{t(locale, 'codes.offline.columns.installation')}</th>
                <th>{t(locale, 'codes.offline.columns.status')}</th>
                <th>{t(locale, 'codes.offline.columns.issued')}</th>
                <th>{t(locale, 'codes.offline.columns.expires')}</th>
                <th>{t(locale, 'codes.offline.columns.action')}</th>
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
                          aria-label={t(locale, 'codes.offline.revokePackageLabel', { id: shortId(row.packageId) })}
                          data-testid={`offline-revoke-${row.packageId}`}
                          className="inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl text-xs font-bold text-[var(--c-danger-500)] border border-[var(--c-danger-500)]/40 hover:bg-[rgba(255,82,82,0.08)] disabled:opacity-50"
                        >
                          {revoking === row.packageId ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
                          {t(locale, 'codes.offline.revoke')}
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

      <ConfirmDialog
        open={confirmTarget !== null}
        onOpenChange={(next) => { if (!next) setConfirmTarget(null); }}
        title={t(locale, 'codes.offline.confirmTitle')}
        description={confirmTarget
          ? t(locale, 'codes.offline.confirmText', { packageId: shortId(confirmTarget.packageId), studentName: confirmTarget.studentName })
          : undefined}
        confirmLabel={t(locale, 'codes.offline.revokePackage')}
        cancelLabel={t(locale, 'codes.offline.cancel')}
        variant="danger"
        dir={isArabic ? 'rtl' : 'ltr'}
        busy={revoking === confirmTarget?.packageId}
        onConfirm={() => { if (confirmTarget) void revoke(confirmTarget); }}
        testId="offline-revoke-confirm"
      />
    </section>
  );
}
