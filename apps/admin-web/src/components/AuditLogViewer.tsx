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
import { t, localeOf, type Locale } from '../lib/dictionary';

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
  { value: '', labelKey: 'audit.viewer.severityAll' },
  { value: 'Critical', labelKey: 'audit.severity.critical' },
  { value: 'Warning', labelKey: 'audit.severity.warning' },
  { value: 'Info', labelKey: 'audit.severity.info' },
];

const EVENT_TYPE_OPTIONS = [
  { value: '', labelKey: 'audit.viewer.eventTypeAll' },
  { value: 'LoginSuccess', labelKey: 'audit.eventTypes.loginSuccess' },
  { value: 'LoginFailed', labelKey: 'audit.eventTypes.loginFailed' },
  { value: 'Logout', labelKey: 'audit.eventTypes.logout' },
  { value: 'SessionCreated', labelKey: 'audit.eventTypes.sessionCreated' },
  { value: 'SessionRevoked', labelKey: 'audit.eventTypes.sessionRevoked' },
  { value: 'DeviceRegistered', labelKey: 'audit.eventTypes.deviceRegistered' },
  { value: 'DeviceChange', labelKey: 'audit.eventTypes.deviceChange' },
  { value: 'BanIssued', labelKey: 'audit.eventTypes.banIssued' },
  { value: 'BanLifted', labelKey: 'audit.eventTypes.banLifted' },
  { value: 'MfaEnabled', labelKey: 'audit.eventTypes.mfaEnabled' },
  { value: 'MfaDisabled', labelKey: 'audit.eventTypes.mfaDisabled' },
  { value: 'PermissionChange', labelKey: 'audit.eventTypes.permissionChange' },
  { value: 'RoleChange', labelKey: 'audit.eventTypes.roleChange' },
  { value: 'SubscriptionActivated', labelKey: 'audit.eventTypes.subscriptionActivated' },
  { value: 'SubscriptionRevoked', labelKey: 'audit.eventTypes.subscriptionRevoked' },
  { value: 'FileAccess', labelKey: 'audit.eventTypes.fileAccess' },
  { value: 'FileAccessDenied', labelKey: 'audit.eventTypes.fileAccessDenied' },
  { value: 'FileScanRejected', labelKey: 'audit.eventTypes.fileScanRejected' },
  { value: 'SecurityAlert', labelKey: 'audit.eventTypes.securityAlert' },
  { value: 'SuspiciousActivity', labelKey: 'audit.eventTypes.suspiciousActivity' },
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

function actorLabel(entry: AuditLogEntry, locale: Locale) {
  if (entry.adminName) return t(locale, 'audit.actor.admin', { name: entry.adminName });
  if (entry.adminId) return t(locale, 'audit.actor.admin', { name: entry.adminId.slice(0, 8) });
  if (entry.studentName) return t(locale, 'audit.actor.student', { name: entry.studentName });
  if (entry.studentId) return t(locale, 'audit.actor.student', { name: entry.studentId.slice(0, 8) });
  return t(locale, 'audit.actor.system');
}

/** Row event-type label: dictionary entry when the wire value is known, else the legacy camelCase-spaced fallback. */
function eventTypeRowLabel(eventType: string, locale: Locale): string {
  const option = EVENT_TYPE_OPTIONS.find(o => o.value === eventType);
  if (option) return t(locale, option.labelKey);
  return eventType.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function exportCsv(entries: AuditLogEntry[], locale: Locale) {
  const headers = ['createdAt', 'eventType', 'severity', 'description', 'actor', 'ipAddress', 'correlationId'];
  const rows = entries.map(e => [
    e.createdAt,
    e.eventType,
    e.severity,
    `"${(e.description || '').replace(/"/g, '""')}"`,
    `"${actorLabel(e, locale).replace(/"/g, '""')}"`,
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
  const locale = localeOf(isArabic);

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
        const msg = err instanceof ApiError ? err.message : t(localeOf(isArabic), 'audit.viewer.loadError');
        onError(msg);
        setData(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, page, debouncedSearch, severity, eventType, dateFrom, dateTo, isArabic, onError]);

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
            <h3 className="font-semibold text-sm" style={{ color: 'var(--cms-text)' }}>{t(locale, 'audit.viewer.title')}</h3>
          </div>
          {items.length > 0 && (
            <button
              onClick={() => exportCsv(items, locale)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all hover:shadow-sm"
              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text-soft)' }}
            >
              <Download size={13} />
              {t(locale, 'audit.viewer.exportCsv')}
            </button>
          )}
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'audit.viewer.desc')}</p>
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
              placeholder={t(locale, 'audit.viewer.search')}
              className="w-full h-9 rounded-lg border text-xs pr-8"
              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)', paddingInlineStart: '30px' }}
            />
          </div>
          {/* Severity */}
          <select
            value={severity}
            onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
            aria-label={t(locale, 'audit.viewer.severity')}
            className="h-9 rounded-lg border text-xs px-2"
            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
          >
            {SEVERITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(locale, o.labelKey)}</option>)}
          </select>
          {/* Event type */}
          <select
            value={eventType}
            onChange={(e) => { setEventType(e.target.value); setPage(1); }}
            aria-label={t(locale, 'audit.viewer.eventType')}
            className="h-9 rounded-lg border text-xs px-2"
            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
          >
            {EVENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(locale, o.labelKey)}</option>)}
          </select>
          {/* Date from */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border text-xs px-2"
            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
            aria-label={t(locale, 'audit.viewer.dateFrom')}
          />
          {/* Date to */}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border text-xs px-2"
            style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text)' }}
            aria-label={t(locale, 'audit.viewer.dateTo')}
          />
          {/* Clear */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border text-xs font-medium"
              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text-soft)' }}
            >
              <X size={13} />
              {t(locale, 'audit.viewer.clear')}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <LoaderCircle size={20} className="animate-spin" style={{ color: 'var(--cms-text-muted)' }} />
            <span className="text-xs ml-2" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'audit.viewer.loading')}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center">
            <ShieldCheck size={28} className="mx-auto mb-2 opacity-40" style={{ color: 'var(--cms-text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'audit.viewer.noData')}</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: 'var(--cms-ivory-100)' }}>
                <th className="text-start py-2 px-3 font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'audit.headings.time')}</th>
                <th className="text-start py-2 px-3 font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'audit.headings.type')}</th>
                <th className="text-start py-2 px-3 font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'audit.severity.heading')}</th>
                <th className="text-start py-2 px-3 font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'audit.viewer.descriptionHeader')}</th>
                <th className="text-start py-2 px-3 font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'audit.headings.actor')}</th>
                <th className="text-start py-2 px-3 font-semibold uppercase tracking-wider" style={{ color: 'var(--cms-text-muted)' }}>{t(locale, 'audit.viewer.ip')}</th>
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
                      {eventTypeRowLabel(entry.eventType, locale)}
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
                      {actorLabel(entry, locale)}
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
            {t(locale, 'audit.viewer.showing')} {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} {t(locale, 'audit.viewer.of')} {total} {t(locale, 'audit.viewer.results')}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium disabled:opacity-40"
              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text-soft)' }}
            >
              {isArabic ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
              {t(locale, 'audit.viewer.prev')}
            </button>
            <span className="text-[11px] font-medium" style={{ color: 'var(--cms-text-soft)' }}>
              {t(locale, 'audit.viewer.page')} {page} {t(locale, 'audit.viewer.of')} {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium disabled:opacity-40"
              style={{ borderColor: 'var(--cms-line)', background: 'var(--cms-surface)', color: 'var(--cms-text-soft)' }}
            >
              {t(locale, 'audit.viewer.next')}
              {isArabic ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
