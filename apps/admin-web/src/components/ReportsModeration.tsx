/**
 * ReportsModeration — admin panel for moderating error reports.
 *
 * Composition:
 *   • Filter bar: status select + assignedTo + search + date range
 *   • Reports table: question, student, reason, status badge, assigned, dates, actions
 *   • Status transition modal: shows valid transitions + resolution notes textarea
 *   • Assign modal: select admin from list
 *   • Pagination (prev/next + page indicator)
 *
 * Data source:
 *   GET  /api/v1/admin/reports?page=&pageSize=&status=&assignedTo=&search=&dateFrom=&dateTo=
 *   PUT  /api/v1/admin/reports/{id}/status  body: { status, assignedTo?, resolutionNotes? }
 *   PUT  /api/v1/admin/reports/{id}/assign   body: { adminId }
 */
import { useEffect, useState } from 'react';
import {
  Search, ChevronLeft, ChevronRight, X, LoaderCircle, ShieldCheck, AlertTriangle, CheckCircle, UserCheck,
} from 'lucide-react';
import { Dialog, Select } from '@cms/ui';
import { ApiError, apiRequest } from '../lib/api';
import { t, localeOf } from '../lib/dictionary';

type Props = {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
};

type Report = {
  id: string;
  questionId: string;
  questionText?: string | null;
  studentId: string;
  studentName?: string | null;
  reasonType: string;
  description?: string | null;
  status: string;
  assignedTo?: string | null;
  assignedToName?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  resolvedBy?: string | null;
  resolvedByName?: string | null;
  resolvedAt?: string | null;
  resolutionNotes?: string | null;
  createdAt: string;
  updatedAt: string;
};

type ReportsResponse = {
  items: Report[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const PAGE_SIZE = 15;

const STATUS_OPTIONS = [
  { value: '', labelKey: 'reports.moderation.statusAll' },
  { value: 'Pending', labelKey: 'reports.moderation.statusPending' },
  { value: 'Reviewing', labelKey: 'reports.moderation.statusReviewing' },
  { value: 'Resolved', labelKey: 'reports.moderation.statusResolved' },
  { value: 'Rejected', labelKey: 'reports.moderation.statusRejected' },
  { value: 'Closed', labelKey: 'reports.moderation.statusClosed' },
];

const VALID_TRANSITIONS: Record<string, Array<{ value: string; ar: string; en: string; needsNotes: boolean }>> = {
  Pending: [
    { value: 'Reviewing', ar: 'بدء المراجعة', en: 'Start review', needsNotes: false },
    { value: 'Resolved', ar: 'حل', en: 'Resolve', needsNotes: false },
    { value: 'Rejected', ar: 'رفض', en: 'Reject', needsNotes: true },
  ],
  Reviewing: [
    { value: 'Resolved', ar: 'حل', en: 'Resolve', needsNotes: false },
    { value: 'Rejected', ar: 'رفض', en: 'Reject', needsNotes: true },
  ],
  Resolved: [{ value: 'Closed', ar: 'إغلاق', en: 'Close', needsNotes: false }],
  Rejected: [{ value: 'Closed', ar: 'إغلاق', en: 'Close', needsNotes: false }],
  Closed: [],
};

function statusBadge(status: string) {
  const s = (status || '').toLowerCase();
  if (s === 'pending') return 'text-amber-700 bg-amber-50 border-amber-200';
  if (s === 'reviewing') return 'text-sky-700 bg-sky-50 border-sky-200';
  if (s === 'resolved') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (s === 'rejected') return 'text-red-700 bg-red-50 border-red-200';
  if (s === 'closed') return 'text-slate-600 bg-slate-50 border-slate-200';
  return 'text-slate-600 bg-slate-50 border-slate-200';
}

function dateLabel(value: string | null | undefined, isArabic: boolean) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch { return value; }
}

export function ReportsModeration({ token, isArabic, onError, onNotice }: Props) {
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [transitioningReport, setTransitioningReport] = useState<Report | null>(null);
  const [transitionTarget, setTransitionTarget] = useState('');
  const [transitionNotes, setTransitionNotes] = useState('');
  const [busy, setBusy] = useState(false);
  // W5 (admin-ui): report assignment (PUT /admin/reports/{id}/assign — existed
  // with no UI, matrix row 16). Non-destructive: direct action, no confirm gate.
  const [assignTarget, setAssignTarget] = useState<Report | null>(null);
  const [assignAdminId, setAssignAdminId] = useState('');
  const [adminsList, setAdminsList] = useState<Array<{ id: string; fullName: string }>>([]);
  const [assignBusy, setAssignBusy] = useState(false);
  const [adminsLoading, setAdminsLoading] = useState(false);
  // W5: refresh driver — setPage(page) is a no-op when already on page 1, so
  // post-action refreshes bump this counter instead.
  const [refreshTick, setRefreshTick] = useState(0);
  const locale = localeOf(isArabic);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (status) params.set('status', status);
    apiRequest<ReportsResponse>(`/api/v1/admin/reports?${params}`, token)
      .then(res => { if (!cancelled) setData(res); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message : t(localeOf(isArabic), 'reports.moderation.loadError');
        onError(msg);
        setData(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, page, debouncedSearch, status, isArabic, onError, refreshTick]);

  const submitTransition = async () => {
    if (!transitioningReport || !transitionTarget) return;
    setBusy(true);
    try {
      await apiRequest(`/api/v1/admin/reports/${transitioningReport.id}/status`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: transitionTarget, resolutionNotes: transitionNotes || null }),
      });
      onNotice(t(locale, 'reports.moderation.statusUpdatedToast'));
      setTransitioningReport(null);
      setTransitionTarget('');
      setTransitionNotes('');
      // Refresh data
      setPage(page); // trigger re-fetch
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : t(locale, 'reports.moderation.updateFailed');
      onError(msg);
    } finally { setBusy(false); }
  };

  // W5: load the administrator directory once when the assign dialog opens.
  // PR-2 (lint closure): isArabic joins the deps — the catch message is
  // localized, so a locale flip while the dialog is open stays consistent.
  // The length guard no-ops the refetch, making the re-run harmless.
  useEffect(() => {
    if (!assignTarget || adminsList.length > 0) return;
    setAdminsLoading(true);
    apiRequest<{ items: Array<{ id: string; fullName: string }> }>('/api/v1/admin/admins?page=1&pageSize=100', token)
      .then(res => setAdminsList(res.items ?? []))
      .catch(() => { onError(t(localeOf(isArabic), 'reports.moderation.adminsLoadError')); setAssignTarget(null); })
      .finally(() => setAdminsLoading(false));
  }, [assignTarget, adminsList.length, token, onError, isArabic]);

  const submitAssign = async () => {
    if (!assignTarget || !assignAdminId || assignBusy) return;
    setAssignBusy(true);
    try {
      await apiRequest(`/api/v1/admin/reports/${assignTarget.id}/assign`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: assignAdminId }),
      });
      onNotice(t(locale, 'reports.moderation.assignOk'));
      setAssignTarget(null);
      setAssignAdminId('');
      // Refresh data (the counter actually re-triggers the effect).
      setRefreshTick(n => n + 1);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : t(locale, 'reports.moderation.assignFail');
      onError(msg);
    } finally { setAssignBusy(false); }
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const hasFilters = debouncedSearch || status;

  return (
    <div className="rounded-xl border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
      {/* Header */}
      <div className="p-5 border-b" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} style={{ color: 'var(--cms-teal-700)' }} />
          <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t(locale, 'reports.moderation.title')}</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>{total}</span>
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.moderation.desc')}</p>
      </div>

      {/* Filter bar */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--cms-line)' }}>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ insetInlineStart: '10px', color: 'var(--cms-text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(locale, 'reports.moderation.search')}
              className="w-full h-9 rounded-lg border text-xs"
              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)', paddingInlineStart: '30px' }}
            />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t(locale, 'reports.moderation.status')}
            className="h-9 rounded-lg border text-xs px-2"
            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(locale, o.labelKey)}</option>)}
          </select>
          {hasFilters && (
            <button onClick={() => { setSearch(''); setStatus(''); setPage(1); }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 h-9 rounded-lg border text-xs"
              style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}>
              <X size={12} /> {t(locale, 'reports.moderation.clear')}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <LoaderCircle size={18} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} />
            <span className="text-xs ml-2" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.moderation.loading')}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center">
            <AlertTriangle size={24} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--cms-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.moderation.noData')}</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead><tr style={{ background: 'var(--cms-ivory-100)' }}>
              <th className="text-start py-2 px-3 font-semibold uppercase" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.moderation.question')}</th>
              <th className="text-start py-2 px-3 font-semibold uppercase" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.moderation.student')}</th>
              <th className="text-start py-2 px-3 font-semibold uppercase" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.moderation.reason')}</th>
              <th className="text-start py-2 px-3 font-semibold uppercase" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.moderation.status')}</th>
              <th className="text-start py-2 px-3 font-semibold uppercase" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.moderation.assigned')}</th>
              <th className="text-start py-2 px-3 font-semibold uppercase" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.moderation.created')}</th>
              <th className="text-start py-2 px-3 font-semibold uppercase" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.moderation.actions')}</th>
            </tr></thead>
            <tbody>
              {items.map(r => {
                const transitions = VALID_TRANSITIONS[r.status] ?? [];
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50/50" style={{ borderColor: 'var(--cms-line)' }}>
                    <td className="py-2 px-3 max-w-[200px]">
                      <span className="block truncate" style={{ color: 'var(--cms-text)' }} title={r.description ?? ''}>
                        {r.questionText || r.questionId.slice(0, 8)}
                      </span>
                      {r.description && <span className="block text-[10px] truncate mt-0.5" style={{ color: 'var(--cms-text-muted)' }}>{r.description}</span>}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span className="text-xs" style={{ color: 'var(--cms-text-soft)' }}>{r.studentName || r.studentId.slice(0, 8)}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'var(--cms-ivory-200)', color: 'var(--cms-text-soft)' }}>{r.reasonType}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusBadge(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <span className="text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>{r.assignedToName || '—'}</span>
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap" style={{ color: 'var(--cms-text-muted)' }}>{dateLabel(r.createdAt, isArabic)}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => { setAssignTarget(r); setAssignAdminId(r.assignedTo ?? ''); }}
                          title={t(locale, 'reports.moderation.assign')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium"
                          style={{ borderColor: 'var(--cms-info-50)', color: 'var(--cms-info)', background: 'var(--cms-ivory-50)' }}
                          data-testid={`report-assign-${r.id}`}
                        >
                          <UserCheck size={11} /> {t(locale, 'reports.moderation.assign')}
                        </button>
                        {transitions.length > 0 ? (
                          <button
                            onClick={() => { setTransitioningReport(r); setTransitionTarget(''); setTransitionNotes(r.resolutionNotes ?? ''); }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium"
                            style={{ borderColor: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)', background: 'var(--cms-teal-50)' }}
                          >
                            <ShieldCheck size={11} /> {t(locale, 'reports.moderation.transition')}
                          </button>
                        ) : (
                          <span className="text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'reports.moderation.noTransitions')}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && items.length > 0 && (
        <div className="p-3 border-t flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
          <span className="text-[11px]" style={{ color: 'var(--cms-text-muted)' }}>
            {t(locale, 'reports.moderation.showing')} {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} {t(locale, 'reports.moderation.of')} {total} {t(locale, 'reports.moderation.results')}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs disabled:opacity-40"
              style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}>
              {isArabic ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
              {t(locale, 'reports.moderation.prev')}
            </button>
            <span className="text-[11px]" style={{ color: 'var(--cms-text-soft)' }}>{t(locale, 'reports.moderation.page')} {page} {t(locale, 'reports.moderation.of')} {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs disabled:opacity-40"
              style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}>
              {t(locale, 'reports.moderation.next')}
              {isArabic ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
            </button>
          </div>
        </div>
      )}

      {/* W5: assign modal — shared Dialog + Select (a11y contract for free). */}
      {assignTarget && (
        <Dialog
          open
          onOpenChange={(next) => { if (!next && !assignBusy) { setAssignTarget(null); setAssignAdminId(''); } }}
          title={t(locale, 'reports.moderation.assignTitle')}
          description={t(locale, 'reports.moderation.assignBody')}
          dir={isArabic ? 'rtl' : 'ltr'}
          size="sm"
          dismissGuard={assignBusy}
          testId="report-assign-dialog"
        >
          <div className="px-5 py-4 space-y-4">
            {adminsLoading ? (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                <LoaderCircle size={14} className="animate-spin" /> {t(locale, 'reports.moderation.loading')}
              </div>
            ) : (
              <Select
                label={t(locale, 'reports.moderation.selectAdmin')}
                value={assignAdminId}
                onChange={(event) => setAssignAdminId(event.target.value)}
                disabled={assignBusy}
                testId="report-assign-admin"
                options={adminsList.map((admin) => ({ value: admin.id, label: admin.fullName }))}
              />
            )}
          </div>
          <div className="flex justify-end gap-2 rounded-b-2xl border-t border-[color:var(--c-border)] bg-[color:var(--c-bg-elevated)] px-5 py-3.5">
            <button
              type="button"
              onClick={() => { setAssignTarget(null); setAssignAdminId(''); }}
              disabled={assignBusy}
              className="px-3 py-1.5 rounded-lg border text-xs"
              style={{ borderColor: 'var(--cms-line-strong)', color: 'var(--cms-text-soft)' }}
            >
              {t(locale, 'reports.moderation.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void submitAssign()}
              disabled={!assignAdminId || assignBusy || adminsLoading}
              data-testid="report-assign-save"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-white disabled:opacity-50"
              style={{ background: 'var(--cms-teal-700)' }}
            >
              {assignBusy ? <LoaderCircle size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              {t(locale, 'reports.moderation.save')}
            </button>
          </div>
        </Dialog>
      )}

      {/* Transition modal */}
      {transitioningReport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onMouseDown={() => !busy && setTransitioningReport(null)} />
          <div className="relative w-full max-w-md rounded-xl border shadow-2xl" style={{ background: 'var(--cms-surface)', borderColor: 'var(--cms-line)' }}>
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t(locale, 'reports.moderation.transition')}</h3>
              <button onClick={() => !busy && setTransitioningReport(null)} disabled={busy} className="p-1">
                <X size={16} style={{ color: 'var(--cms-text-muted)' }} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                {t(locale, 'reports.moderation.currentStatus')}:
                <span className={`ml-1.5 inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusBadge(transitioningReport.status)}`}>
                  {transitioningReport.status}
                </span>
              </div>
              {/* Transition options */}
              <div className="space-y-2">
                {(VALID_TRANSITIONS[transitioningReport.status] ?? []).map(trans => (
                  <button
                    key={trans.value}
                    onClick={() => setTransitionTarget(trans.value)}
                    disabled={busy}
                    className="w-full text-start p-2.5 rounded-lg border text-xs font-medium transition-all disabled:opacity-50"
                    style={transitionTarget === trans.value
                      ? { borderColor: 'var(--cms-teal-500)', background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }
                      : { borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}
                  >
                    {trans.value}
                    {trans.needsNotes && <span className="block text-[10px] mt-0.5" style={{ color: 'var(--cms-warning)' }}>⚠ {t(locale, 'reports.moderation.notes')}</span>}
                  </button>
                ))}
              </div>
              {/* Resolution notes */}
              {transitionTarget && (
                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>{t(locale, 'reports.moderation.notes')}</label>
                  <textarea
                    value={transitionNotes}
                    onChange={(e) => setTransitionNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border text-xs p-2"
                    style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
                    disabled={busy}
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end p-4 border-t" style={{ borderColor: 'var(--cms-line)' }}>
              <button onClick={() => setTransitioningReport(null)} disabled={busy}
                className="px-3 py-1.5 rounded-lg border text-xs" style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}>
                {t(locale, 'reports.moderation.cancel')}
              </button>
              <button onClick={() => void submitTransition()} disabled={!transitionTarget || busy}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-white disabled:opacity-50"
                style={{ background: 'var(--cms-teal-700)' }}>
                {busy ? <LoaderCircle size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                {t(locale, 'reports.moderation.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
