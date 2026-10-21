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
  Search, ChevronLeft, ChevronRight, X, LoaderCircle, ShieldCheck, AlertTriangle, CheckCircle,
} from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';

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
  { value: '', ar: 'كل الحالات', en: 'All statuses' },
  { value: 'Pending', ar: 'معلّق', en: 'Pending' },
  { value: 'Reviewing', ar: 'قيد المراجعة', en: 'Reviewing' },
  { value: 'Resolved', ar: 'محلول', en: 'Resolved' },
  { value: 'Rejected', ar: 'مرفوض', en: 'Rejected' },
  { value: 'Closed', ar: 'مغلق', en: 'Closed' },
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
        const msg = err instanceof ApiError ? err.message : isArabic ? 'تعذّر تحميل البلاغات' : 'Could not load reports';
        onError(msg);
        setData(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, page, debouncedSearch, status, isArabic, onError]);

  const submitTransition = async () => {
    if (!transitioningReport || !transitionTarget) return;
    setBusy(true);
    try {
      await apiRequest(`/api/v1/admin/reports/${transitioningReport.id}/status`, token, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: transitionTarget, resolutionNotes: transitionNotes || null }),
      });
      onNotice(isArabic ? 'تم تحديث حالة البلاغ' : 'Report status updated');
      setTransitioningReport(null);
      setTransitionTarget('');
      setTransitionNotes('');
      // Refresh data
      setPage(page); // trigger re-fetch
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : isArabic ? 'فشل التحديث' : 'Update failed';
      onError(msg);
    } finally { setBusy(false); }
  };

  const t = isArabic
    ? {
        title: 'إدارة البلاغات', desc: 'مراجعة البلاغات + انتقال الحالة + تعيين المسؤول',
        search: 'بحث في الوصف...', status: 'الحالة', clear: 'إزالة الفلاتر',
        question: 'السؤال', student: 'الطالب', reason: 'السبب', assigned: 'المسؤول',
        created: 'الإنشاء', updated: 'آخر تحديث', actions: 'إجراءات',
        transition: 'تغيير الحالة', notes: 'ملاحظات الحل (مطلوبة للرفض)', save: 'حفظ', cancel: 'إلغاء',
        noTransitions: 'لا توجد انتقالات متاحة', noNotes: 'لا توجد ملاحظات',
        prev: 'السابق', next: 'التالي', page: 'صفحة', of: 'من', showing: 'عرض', results: 'نتائج',
        noData: 'لا توجد بلاغات', loading: 'جارٍ التحميل...', resolvedBy: 'حلّه', reviewedBy: 'راجعه',
      }
    : {
        title: 'Reports Moderation', desc: 'Review reports + transition status + assign',
        search: 'Search description...', status: 'Status', clear: 'Clear filters',
        question: 'Question', student: 'Student', reason: 'Reason', assigned: 'Assigned',
        created: 'Created', updated: 'Updated', actions: 'Actions',
        transition: 'Transition status', notes: 'Resolution notes (required for rejection)', save: 'Save', cancel: 'Cancel',
        noTransitions: 'No transitions available', noNotes: 'No notes',
        prev: 'Previous', next: 'Next', page: 'Page', of: 'of', showing: 'Showing', results: 'results',
        noData: 'No reports found', loading: 'Loading...', resolvedBy: 'Resolved by', reviewedBy: 'Reviewed by',
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
          <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t.title}</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--cms-teal-50)', color: 'var(--cms-teal-700)' }}>{total}</span>
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--cms-text-muted)' }}>{t.desc}</p>
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
              placeholder={t.search}
              className="w-full h-9 rounded-lg border text-xs"
              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)', paddingInlineStart: '30px' }}
            />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border text-xs px-2"
            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{isArabic ? o.ar : o.en}</option>)}
          </select>
          {hasFilters && (
            <button onClick={() => { setSearch(''); setStatus(''); setPage(1); }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 h-9 rounded-lg border text-xs"
              style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}>
              <X size={12} /> {t.clear}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <LoaderCircle size={18} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} />
            <span className="text-xs ml-2" style={{ color: 'var(--cms-text-muted)' }}>{t.loading}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center">
            <AlertTriangle size={24} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--cms-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--cms-text-muted)' }}>{t.noData}</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead><tr style={{ background: 'var(--cms-ivory-100)' }}>
              <th className="text-start py-2 px-3 font-semibold uppercase" style={{ color: 'var(--cms-text-muted)' }}>{t.question}</th>
              <th className="text-start py-2 px-3 font-semibold uppercase" style={{ color: 'var(--cms-text-muted)' }}>{t.student}</th>
              <th className="text-start py-2 px-3 font-semibold uppercase" style={{ color: 'var(--cms-text-muted)' }}>{t.reason}</th>
              <th className="text-start py-2 px-3 font-semibold uppercase" style={{ color: 'var(--cms-text-muted)' }}>{t.status}</th>
              <th className="text-start py-2 px-3 font-semibold uppercase" style={{ color: 'var(--cms-text-muted)' }}>{t.assigned}</th>
              <th className="text-start py-2 px-3 font-semibold uppercase" style={{ color: 'var(--cms-text-muted)' }}>{t.created}</th>
              <th className="text-start py-2 px-3 font-semibold uppercase" style={{ color: 'var(--cms-text-muted)' }}>{t.actions}</th>
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
                      {transitions.length > 0 ? (
                        <button
                          onClick={() => { setTransitioningReport(r); setTransitionTarget(''); setTransitionNotes(r.resolutionNotes ?? ''); }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium"
                          style={{ borderColor: 'var(--cms-teal-100)', color: 'var(--cms-teal-700)', background: 'var(--cms-teal-50)' }}
                        >
                          <ShieldCheck size={11} /> {t.transition}
                        </button>
                      ) : (
                        <span className="text-[10px]" style={{ color: 'var(--cms-text-muted)' }}>{t.noTransitions}</span>
                      )}
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
            {t.showing} {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} {t.of} {total} {t.results}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs disabled:opacity-40"
              style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}>
              {isArabic ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
              {t.prev}
            </button>
            <span className="text-[11px]" style={{ color: 'var(--cms-text-soft)' }}>{t.page} {page} {t.of} {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs disabled:opacity-40"
              style={{ borderColor: 'var(--cms-line)', color: 'var(--cms-text-soft)' }}>
              {t.next}
              {isArabic ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
            </button>
          </div>
        </div>
      )}

      {/* Transition modal */}
      {transitioningReport && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onMouseDown={() => !busy && setTransitioningReport(null)} />
          <div className="relative w-full max-w-md rounded-xl border shadow-2xl" style={{ background: 'var(--cms-surface)', borderColor: 'var(--cms-line)' }}>
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
              <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t.transition}</h3>
              <button onClick={() => !busy && setTransitioningReport(null)} disabled={busy} className="p-1">
                <X size={16} style={{ color: 'var(--cms-text-muted)' }} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs" style={{ color: 'var(--cms-text-muted)' }}>
                {isArabic ? 'الحالة الحالية' : 'Current status'}:
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
                    {trans.needsNotes && <span className="block text-[10px] mt-0.5" style={{ color: 'var(--cms-warning)' }}>⚠ {t.notes}</span>}
                  </button>
                ))}
              </div>
              {/* Resolution notes */}
              {transitionTarget && (
                <div>
                  <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--cms-text-soft)' }}>{t.notes}</label>
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
                {t.cancel}
              </button>
              <button onClick={() => void submitTransition()} disabled={!transitionTarget || busy}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-white disabled:opacity-50"
                style={{ background: 'var(--cms-teal-700)' }}>
                {busy ? <LoaderCircle size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                {t.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
