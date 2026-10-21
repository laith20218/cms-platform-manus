/**
 * AuditLogViewer — full audit log viewer with server-side filters + pagination.
 *
 * Composition:
 *   • Filter bar: search + severity select + event-type select + date range
 *   • Responsive table with timestamp, event type (icon), severity, description, actor, IP, correlationId
 *   • Server-side pagination (prev/next + page indicator)
 *   • CSV export button (respects current filters)
 *   • Loading skeleton + empty state + error state
 *
 * Data source: `GET /api/v1/security/audit-logs?page=&pageSize=&severity=&eventType=&search=&dateFrom=&dateTo=`
 * Returns: { items, total, page, pageSize, totalPages }
 *
 * This component is ADDITIVE — it does not modify the existing critical alerts view.
 * It calls the new audit-logs endpoint which returns ALL severities (unlike /alerts
 * which returns Critical only).
 */
import { useEffect, useState } from 'react';
import {
  Search, ShieldCheck, ChevronLeft, ChevronRight, Download, X, LoaderCircle,
} from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';

type Props = {
  token: string;
  isArabic: boolean;
  onError: (message: string) => void;
};

type AuditLogEntry = {
  id: string;
  eventType: string;
  severity: string;
  description: string;
  ipAddress?: string | null;
  deviceFingerprint?: string | null;
  correlationId?: string | null;
  createdAt: string;
  studentId?: string | null;
  studentName?: string | null;
  adminId?: string | null;
  adminName?: string | null;
};

type AuditLogResponse = {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const PAGE_SIZE = 25;

const SEVERITY_OPTIONS = [
  { value: '', ar: 'كل الخطورة', en: 'All severities' },
  { value: 'Critical', ar: 'حرج', en: 'Critical' },
  { value: 'Warning', ar: 'تحذير', en: 'Warning' },
  { value: 'Info', ar: 'معلومات', en: 'Info' },
];

const EVENT_TYPE_OPTIONS = [
  { value: '', ar: 'كل الأنواع', en: 'All types' },
  { value: 'LoginSuccess', ar: 'نجاح الدخول', en: 'Login Success' },
  { value: 'LoginFailed', ar: 'فشل الدخول', en: 'Login Failed' },
  { value: 'Logout', ar: 'تسجيل الخروج', en: 'Logout' },
  { value: 'SessionCreated', ar: 'إنشاء جلسة', en: 'Session Created' },
  { value: 'SessionRevoked', ar: 'إنهاء جلسة', en: 'Session Revoked' },
  { value: 'DeviceRegistered', ar: 'تسجيل جهاز', en: 'Device Registered' },
  { value: 'DeviceChange', ar: 'تغيير جهاز', en: 'Device Change' },
  { value: 'BanIssued', ar: 'تطبيق حظر', en: 'Ban Issued' },
  { value: 'BanLifted', ar: 'رفع حظر', en: 'Ban Lifted' },
  { value: 'MfaEnabled', ar: 'تفعيل التحقق الثنائي', en: 'MFA Enabled' },
  { value: 'MfaDisabled', ar: 'تعطيل التحقق الثنائي', en: 'MFA Disabled' },
  { value: 'PermissionChange', ar: 'تغيير صلاحية', en: 'Permission Change' },
  { value: 'RoleChange', ar: 'تغيير دور', en: 'Role Change' },
  { value: 'SubscriptionActivated', ar: 'تفعيل اشتراك', en: 'Subscription Activated' },
  { value: 'SubscriptionRevoked', ar: 'إلغاء اشتراك', en: 'Subscription Revoked' },
  { value: 'FileAccess', ar: 'وصول لملف', en: 'File Access' },
  { value: 'FileAccessDenied', ar: 'رفض وصول لملف', en: 'File Access Denied' },
  { value: 'FileScanRejected', ar: 'رفض فحص ملف', en: 'File Scan Rejected' },
  { value: 'SecurityAlert', ar: 'تنبيه أمني', en: 'Security Alert' },
  { value: 'SuspiciousActivity', ar: 'نشاط مشبوه', en: 'Suspicious Activity' },
];

function dateLabel(value: string | null | undefined, isArabic: boolean) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat(isArabic ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return '—';
  }
}

function severityBadge(severity: string) {
  const s = (severity || '').toLowerCase();
  if (s === 'critical') return 'text-red-700 bg-red-50 border-red-200';
  if (s === 'warning') return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-sky-700 bg-sky-50 border-sky-200';
}

function severityDot(severity: string) {
  const s = (severity || '').toLowerCase();
  if (s === 'critical') return 'bg-red-500';
  if (s === 'warning') return 'bg-amber-500';
  return 'bg-sky-500';
}

function actorLabel(entry: AuditLogEntry, isArabic: boolean) {
  if (entry.adminName) return isArabic ? `مدير · ${entry.adminName}` : `Admin · ${entry.adminName}`;
  if (entry.adminId) return isArabic ? `مدير · ${entry.adminId.slice(0, 8)}` : `Admin · ${entry.adminId.slice(0, 8)}`;
  if (entry.studentName) return isArabic ? `طالب · ${entry.studentName}` : `Student · ${entry.studentName}`;
  if (entry.studentId) return isArabic ? `طالب · ${entry.studentId.slice(0, 8)}` : `Student · ${entry.studentId.slice(0, 8)}`;
  return isArabic ? 'النظام' : 'System';
}

function exportCsv(entries: AuditLogEntry[], isArabic: boolean) {
  const headers = ['createdAt', 'eventType', 'severity', 'description', 'actor', 'ipAddress', 'correlationId'];
  const rows = entries.map(e => [
    e.createdAt,
    e.eventType,
    e.severity,
    `"${(e.description || '').replace(/"/g, '""')}"`,
    `"${actorLabel(e, isArabic).replace(/"/g, '""')}"`,
    e.ipAddress || '',
    e.correlationId || '',
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AuditLogViewer({ token, isArabic, onError }: Props) {
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('');
  const [eventType, setEventType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input (300ms)
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch on filter/page change
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (severity) params.set('severity', severity);
    if (eventType) params.set('eventType', eventType);
    if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
    if (dateTo) params.set('dateTo', new Date(dateTo + 'T23:59:59').toISOString());

    apiRequest<AuditLogResponse>(`/api/v1/security/audit-logs?${params}`, token)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message : isArabic ? 'تعذّر تحميل السجل' : 'Could not load audit logs';
        onError(msg);
        setData(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, page, debouncedSearch, severity, eventType, dateFrom, dateTo, isArabic, onError]);

  const t = isArabic
    ? {
        title: 'سجل التدقيق الكامل', desc: 'كل الأحداث الأمنية مع فلاتر وترقيم صفحات',
        search: 'بحث في الوصف...', severity: 'الخطورة', eventType: 'النوع',
        dateFrom: 'من تاريخ', dateTo: 'إلى تاريخ', clear: 'إزالة الفلاتر',
        time: 'الوقت', type: 'النوع', sev: 'الخطورة', description: 'الوصصف',
        actor: 'الفاعل', ip: 'IP', correlation: 'معرف الارتباط',
        prev: 'السابق', next: 'التالي', page: 'صفحة', of: 'من',
        export: 'تصدير CSV', noData: 'لا توجد سجلات', loading: 'جارٍ التحميل...',
        results: 'النتائج', showing: 'عرض',
      }
    : {
        title: 'Full Audit Log', desc: 'All security events with filters + pagination',
        search: 'Search description...', severity: 'Severity', eventType: 'Event type',
        dateFrom: 'From date', dateTo: 'To date', clear: 'Clear filters',
        time: 'Time', type: 'Type', sev: 'Severity', description: 'Description',
        actor: 'Actor', ip: 'IP', correlation: 'Correlation ID',
        prev: 'Previous', next: 'Next', page: 'Page', of: 'of',
        export: 'Export CSV', noData: 'No audit log entries', loading: 'Loading...',
        results: 'Results', showing: 'Showing',
      };

  const hasFilters = debouncedSearch || severity || eventType || dateFrom || dateTo;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  const clearFilters = () => {
    setSearch(''); setSeverity(''); setEventType('');
    setDateFrom(''); setDateTo(''); setPage(1);
  };

  return (
    <div className="rounded-xl border" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)' }}>
      {/* Header */}
      <div className="p-5 border-b" style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-ivory-50)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} style={{ color: 'var(--cms-teal-700)' }} />
            <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t.title}</h3>
          </div>
          {items.length > 0 && (
            <button
              onClick={() => exportCsv(items, isArabic)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all hover:shadow-sm"
              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text-soft)' }}
            >
              <Download size={13} />
              {t.export}
            </button>
          )}
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--cms-text-muted)' }}>{t.desc}</p>
      </div>

      {/* Filter bar */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--cms-line)' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ insetInlineStart: '10px', color: 'var(--cms-text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.search}
              className="w-full h-9 rounded-lg border text-xs pr-8"
              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)', paddingInlineStart: '30px' }}
            />
          </div>
          {/* Severity */}
          <select
            value={severity}
            onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border text-xs px-2"
            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
          >
            {SEVERITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{isArabic ? o.ar : o.en}</option>)}
          </select>
          {/* Event type */}
          <select
            value={eventType}
            onChange={(e) => { setEventType(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border text-xs px-2"
            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
          >
            {EVENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{isArabic ? o.ar : o.en}</option>)}
          </select>
          {/* Date from */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border text-xs px-2"
            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
            aria-label={t.dateFrom}
          />
          {/* Date to */}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border text-xs px-2"
            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
            aria-label={t.dateTo}
          />
          {/* Clear */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-medium"
              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text-soft)' }}
            >
              <X size={13} />
              {t.clear}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <LoaderCircle size={20} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} />
            <span className="text-xs ml-2" style={{ color: 'var(--cms-text-muted)' }}>{t.loading}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center">
            <ShieldCheck size={28} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--cms-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--cms-text-muted)' }}>{t.noData}</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--cms-ivory-100)' }}>
                <th className="text-start py-2 px-3 font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>{t.time}</th>
                <th className="text-start py-2 px-3 font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>{t.type}</th>
                <th className="text-start py-2 px-3 font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>{t.sev}</th>
                <th className="text-start py-2 px-3 font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>{t.description}</th>
                <th className="text-start py-2 px-3 font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>{t.actor}</th>
                <th className="text-start py-2 px-3 font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>{t.ip}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0 hover:bg-slate-50/70" style={{ borderColor: 'var(--cms-line)' }}>
                  <td className="py-2 px-3 whitespace-nowrap" style={{ color: 'var(--cms-text-soft)' }}>
                    {dateLabel(entry.createdAt, isArabic)}
                  </td>
                  <td className="py-2 px-3">
                    <span className="font-medium" style={{ color: 'var(--cms-text)' }}>
                      {isArabic
                        ? (EVENT_TYPE_OPTIONS.find(o => o.value === entry.eventType)?.ar ?? entry.eventType.replace(/([a-z])([A-Z])/g, '$1 $2'))
                        : (EVENT_TYPE_OPTIONS.find(o => o.value === entry.eventType)?.en ?? entry.eventType.replace(/([a-z])([A-Z])/g, '$1 $2'))}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${severityBadge(entry.severity)}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${severityDot(entry.severity)}`} />
                      {entry.severity}
                    </span>
                  </td>
                  <td className="py-2 px-3 max-w-xs">
                    <span className="block truncate" style={{ color: 'var(--cms-text-soft)' }} title={entry.description}>
                      {entry.description}
                    </span>
                    {entry.correlationId && (
                      <span className="text-[10px] font-mono opacity-50" style={{ color: 'var(--cms-text-muted)' }}>
                        {entry.correlationId.slice(0, 12)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--cms-ivory-200)', color: 'var(--cms-text-soft)' }}>
                      {actorLabel(entry, isArabic)}
                    </span>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span className="text-[10px] font-mono" style={{ color: 'var(--cms-text-muted)' }}>
                      {entry.ipAddress || '—'}
                    </span>
                  </td>
                </tr>
              ))}
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
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium disabled:opacity-40"
              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text-soft)' }}
            >
              {isArabic ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
              {t.prev}
            </button>
            <span className="text-[11px] font-medium" style={{ color: 'var(--cms-text-soft)' }}>
              {t.page} {page} {t.of} {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium disabled:opacity-40"
              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text-soft)' }}
            >
              {t.next}
              {isArabic ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
